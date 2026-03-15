import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { MeshThread, ThreadMessage } from '../models/thread.js';
import { SERVERS } from '../config.js';
import { runRemote } from './gateway.js';
import { broadcastEvent } from './poller.js';

const execAsync = promisify(exec);

// ─── Persistence ──────────────────────────────────────────────────────────────

const DATA_DIR = join(__dirname, '../../data');
const THREADS_FILE = join(DATA_DIR, 'threads.json');
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// In-memory map
const threads = new Map<string, MeshThread>();

function loadFromDisk(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const raw = readFileSync(THREADS_FILE, 'utf-8');
    const arr: MeshThread[] = JSON.parse(raw);
    for (const t of arr) {
      threads.set(t.id, t);
    }
    console.log(`[thread] Loaded ${threads.size} threads from disk`);
  } catch {
    // File doesn't exist yet — that's fine
  }
}

function saveToDisk(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const arr = Array.from(threads.values());
    writeFileSync(THREADS_FILE, JSON.stringify(arr, null, 2), 'utf-8');
  } catch (err) {
    console.error('[thread] Failed to save threads:', (err as Error).message);
  }
}

// Load on module init
loadFromDisk();

// ─── SSH helper ───────────────────────────────────────────────────────────────

async function sendToAgent(
  agentId: string,
  serverId: string,
  threadId: string,
  message: string,
): Promise<string> {
  const server = SERVERS.find(s => s.id === serverId.toUpperCase());
  if (!server) throw new Error(`Unknown server: ${serverId}`);

  // Base64-encode to avoid ALL shell escaping issues (quotes, $, backticks, emojis…)
  // Base64 only contains [A-Za-z0-9+/=] — safe in any shell context
  const b64 = Buffer.from(message, 'utf-8').toString('base64');
  const tmpFile = `/tmp/mesh-msg-${threadId.slice(0, 8)}.txt`;
  const sudoPrefix = server.sshSudo ? 'sudo ' : '';

  // Build the remote script: decode b64 → temp file → openclaw reads it → cleanup
  const remoteScript = `echo '${b64}' | base64 -d > ${tmpFile} && ${sudoPrefix}openclaw agent --agent ${agentId} --session-id "mesh-${threadId}" --message "$(cat ${tmpFile})" --timeout 300; rm -f ${tmpFile}`;

  let fullCmd: string;
  if (server.sshUser === null) {
    // Local execution (Homelab)
    fullCmd = remoteScript;
  } else {
    // SSH with SINGLE quotes — prevents any local shell expansion
    // Base64 + single quotes = bulletproof
    const sshOpts = '-o ConnectTimeout=10 -o StrictHostKeyChecking=no -o BatchMode=yes';
    fullCmd = `ssh ${sshOpts} ${server.sshUser}@${server.ip} '${remoteScript}'`;
  }

  const { stdout } = await execAsync(fullCmd, { timeout: 320_000, maxBuffer: 5 * 1024 * 1024 });

  // Without --json, stdout is just the agent's text response
  return stdout.trim();
}

// ─── Inactivity check ─────────────────────────────────────────────────────────

function checkInactivity(thread: MeshThread): boolean {
  const lastActivity = new Date(thread.updatedAt).getTime();
  return Date.now() - lastActivity > INACTIVITY_TIMEOUT_MS;
}

// ─── Duplicate check ─────────────────────────────────────────────────────────

function findActiveThreadBetween(
  agentA: string, serverA: string,
  agentB: string, serverB: string,
): MeshThread | undefined {
  const keyAB = `${agentA}@${serverA.toUpperCase()}|${agentB}@${serverB.toUpperCase()}`;
  const keyBA = `${agentB}@${serverB.toUpperCase()}|${agentA}@${serverA.toUpperCase()}`;

  for (const t of threads.values()) {
    if (t.status !== 'active') continue;
    const tKey = `${t.participants.a.agent}@${t.participants.a.server}|${t.participants.b.agent}@${t.participants.b.server}`;
    if (tKey === keyAB || tKey === keyBA) return t;
  }
  return undefined;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type ParticipantInput = {
  agent: string;
  server: string;
  name?: string;
  emoji?: string;
};

// ─── Autonomous mode helpers ──────────────────────────────────────────────────

const AUTONOMOUS_PROMPT_A = (agentAName: string, agentBName: string, serverB: string, userInstruction: string) =>
`[MESH CONVERSATION — MODE AUTONOME]
David te demande d'avoir une conversation avec ${agentBName} (serveur ${serverB}) via le réseau mesh.

Instruction de David : "${userInstruction}"

COMMENT ÇA MARCHE :
- Le mesh relay s'occupe de la livraison. Tu n'as PAS besoin de chercher, contacter, ou localiser ${agentBName}.
- Tu écris ton message ici, et ${agentBName} le recevra automatiquement sur son serveur.
- ${agentBName} te répondra par le même canal mesh. Tu verras ses réponses apparaître.

RÈGLES :
- Parle DIRECTEMENT à ${agentBName}. Écris ton message comme si tu lui parlais face à face.
- NE PAS chercher ${agentBName} dans tes sessions, nodes, ou outils. Le mesh fait tout.
- NE PAS narrer tes pensées. Parle directement.
- Quand la discussion est terminée, écris [MESH_DONE] suivi d'un résumé pour David.

Commence maintenant — envoie ton premier message à ${agentBName} :`;

const AUTONOMOUS_RELAY_TO_A = (agentBName: string, response: string) =>
`[MESSAGE DE ${agentBName}]
${response}

Réponds directement à ${agentBName} (il ne voit que ce que tu écris). Quand tu as terminé, écris [MESH_DONE] suivi d'un résumé pour David.`;

const AUTONOMOUS_RELAY_TO_B = (agentAName: string, message: string) =>
`[MESH CONVERSATION — Tu reçois un message cross-serveur via le réseau mesh de David]
${agentAName} te contacte depuis un autre serveur du réseau. Ta réponse sera AUTOMATIQUEMENT relayée vers ${agentAName} — tu n'as PAS besoin de le chercher, de le contacter, ni d'utiliser un outil. Écris simplement ta réponse ici.

RÈGLES :
- Réponds DIRECTEMENT à ${agentAName}. Il lira exactement ce que tu écris.
- NE cherche PAS à contacter ${agentAName} par d'autres moyens (sessions, nodes, etc.)
- Le relay mesh s'occupe de tout. Tu parles, il reçoit.
- Quand tu as fini la discussion, écris [MESH_DONE] suivi d'un résumé.

[MESSAGE DE ${agentAName}]
${message}`;

const MESH_DONE_SIGNAL = '[MESH_DONE]';

async function runAutonomousLoop(thread: MeshThread): Promise<void> {
  const { a: pA, b: pB } = thread.participants;
  const aName = pA.name ?? pA.agent;
  const bName = pB.name ?? pB.agent;
  const fromA = `${pA.agent}@${pA.server}`;
  const fromB = `${pB.agent}@${pB.server}`;

  // The initial message was already sent to A and A responded.
  // A's response is the first message to send to B.
  // Then we relay B's response back to A, and so on.

  let lastAMessage = thread.messages[0]?.response;
  if (!lastAMessage) return;

  while (thread.status === 'active' && thread.currentRound < thread.maxRounds) {
    // ── Step 1: Send A's message to B ────────────────────────────────────
    const msgToB = AUTONOMOUS_RELAY_TO_B(aName, lastAMessage);
    const startB = Date.now();
    let bResponse = '';

    try {
      bResponse = await sendToAgent(pB.agent, pB.server, thread.id, msgToB);
    } catch (err) {
      bResponse = `Error: ${(err as Error).message?.slice(0, 300)}`;
      thread.status = 'error';
      thread.closeReason = 'error';
    }

    const msgAtoB: ThreadMessage = {
      id: randomUUID(),
      from: fromA,
      to: fromB,
      content: lastAMessage,
      response: bResponse,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startB,
    };

    thread.messages.push(msgAtoB);
    thread.updatedAt = new Date().toISOString();
    saveToDisk();

    // Broadcast this exchange in real-time
    broadcastEvent({
      type: 'mesh_thread',
      threadId: thread.id,
      event: 'message',
      message: msgAtoB,
      thread,
    } as any);

    if (thread.status !== 'active') break;

    // ── Step 2: Relay B's response back to A ─────────────────────────────
    const msgToA = AUTONOMOUS_RELAY_TO_A(bName, bResponse);
    const startA = Date.now();
    let aResponse = '';

    try {
      aResponse = await sendToAgent(pA.agent, pA.server, thread.id, msgToA);
    } catch (err) {
      aResponse = `Error: ${(err as Error).message?.slice(0, 300)}`;
      thread.status = 'error';
      thread.closeReason = 'error';
    }

    const msgBtoA: ThreadMessage = {
      id: randomUUID(),
      from: fromB,
      to: fromA,
      content: bResponse,
      response: aResponse,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startA,
    };

    thread.messages.push(msgBtoA);
    thread.currentRound += 1;  // 1 round = A→B + B→A complete exchange
    thread.updatedAt = new Date().toISOString();
    saveToDisk();

    // Broadcast
    broadcastEvent({
      type: 'mesh_thread',
      threadId: thread.id,
      event: 'message',
      message: msgBtoA,
      thread,
    } as any);

    if (thread.status !== 'active') break;

    // ── Check if A signaled DONE ──────────────────────────────────────────
    if (aResponse.includes(MESH_DONE_SIGNAL)) {
      const summaryIdx = aResponse.indexOf(MESH_DONE_SIGNAL) + MESH_DONE_SIGNAL.length;
      thread.summary = aResponse.slice(summaryIdx).trim();
      thread.status = 'closed';
      thread.closedAt = new Date().toISOString();
      thread.closeReason = 'completed';
      saveToDisk();
      break;
    }

    if (thread.currentRound >= thread.maxRounds) {
      thread.status = 'closed';
      thread.closedAt = new Date().toISOString();
      thread.closeReason = 'max_rounds';
      thread.summary = `Conversation terminée après ${thread.maxRounds} rounds (limite atteinte).`;
      saveToDisk();
      break;
    }

    // A's response is the next message to send to B
    lastAMessage = aResponse;
  }

  // ── Notify David via the source agent (participant A) on Telegram ─────
  const summaryText = thread.summary ?? `Conversation entre ${aName} et ${bName} terminée (${thread.currentRound} rounds, raison: ${thread.closeReason}).`;

  // Helper: send a message to an agent
  const sendAgentMsg = async (agentId: string, server: typeof SERVERS[0], msg: string, extraFlags = '') => {
    const b64n = Buffer.from(msg, 'utf-8').toString('base64');
    const tmpN = `/tmp/mesh-notify-${thread.id.slice(0,8)}-${Date.now()}.txt`;
    const sudoN = server.sshSudo ? 'sudo ' : '';
    const script = `echo '${b64n}' | base64 -d > ${tmpN} && ${sudoN}openclaw agent --agent ${agentId} --message "$(cat ${tmpN})" --timeout 300 ${extraFlags}; rm -f ${tmpN}`;
    if (server.sshUser === null) {
      await execAsync(script, { timeout: 320_000, maxBuffer: 10 * 1024 * 1024 });
    } else {
      await execAsync(`ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no -o BatchMode=yes ${server.sshUser}@${server.ip} '${script}'`, { timeout: 320_000, maxBuffer: 10 * 1024 * 1024 });
    }
  };

  // ── Notify David directly on Telegram via participant A's server ─────
  try {
    const sourceServer = SERVERS.find(s => s.id === pA.server.toUpperCase());
    if (sourceServer) {
      const notifyMsg = `Envoie ce message à David sur Telegram (chat ID 1555054582) avec le message tool :\n\n🔗 Mesh Thread Terminé\n\n${aName} ⇄ ${bName} (${thread.currentRound} rounds)\n\n${summaryText}`;
      await sendAgentMsg(pA.agent, sourceServer, notifyMsg);
      console.log(`[thread] ${pA.agent} notified David about thread: ${thread.id}`);
    }
  } catch (err) {
    console.error(`[thread] Failed to notify David via ${pA.agent}:`, (err as Error).message);
  }

  // Hub notification removed — the WebSocket broadcast below handles dashboard display.
  // Sending to Hub agent caused duplicate Telegram notifications to David.

  // Broadcast final state
  broadcastEvent({
    type: 'mesh_thread',
    threadId: thread.id,
    event: 'closed',
    message: null,
    thread,
  } as any);
}

export async function createThread(
  participantA: ParticipantInput,
  participantB: ParticipantInput,
  initialMessage: string,
  maxRounds: number = 10,
  mode: 'manual' | 'autonomous' = 'manual',
): Promise<MeshThread> {
  // Check for existing active thread between the same agents
  const existing = findActiveThreadBetween(
    participantA.agent, participantA.server,
    participantB.agent, participantB.server,
  );
  if (existing) {
    throw new Error(
      `An active thread already exists between ${participantA.agent}@${participantA.server} and ${participantB.agent}@${participantB.server} (id: ${existing.id})`,
    );
  }

  const threadId = randomUUID();
  const now = new Date().toISOString();

  const thread: MeshThread = {
    id: threadId,
    participants: {
      a: { ...participantA, server: participantA.server.toUpperCase() },
      b: { ...participantB, server: participantB.server.toUpperCase() },
    },
    messages: [],
    status: 'active',
    mode,
    maxRounds,
    currentRound: 0,
    createdAt: now,
    updatedAt: now,
  };

  threads.set(threadId, thread);
  saveToDisk();

  if (mode === 'autonomous') {
    // ── Autonomous mode: send instruction to A first, then loop ────────
    const aName = participantA.name ?? participantA.agent;
    const bName = participantB.name ?? participantB.agent;
    const promptForA = AUTONOMOUS_PROMPT_A(aName, bName, participantB.server, initialMessage);

    const fromUser = 'david@MESH';
    const toA = `${participantA.agent}@${participantA.server.toUpperCase()}`;
    const start = Date.now();

    let aResponse = '';
    try {
      aResponse = await sendToAgent(participantA.agent, participantA.server, threadId, promptForA);
    } catch (err) {
      aResponse = `Error: ${(err as Error).message?.slice(0, 300)}`;
      thread.status = 'error';
      thread.closeReason = 'error';
    }

    const initMsg: ThreadMessage = {
      id: randomUUID(),
      from: fromUser,
      to: toA,
      content: initialMessage,
      response: aResponse,
      timestamp: now,
      durationMs: Date.now() - start,
    };

    thread.messages.push(initMsg);
    thread.currentRound = 1;
    thread.updatedAt = new Date().toISOString();
    saveToDisk();

    // Broadcast the initial exchange
    broadcastEvent({
      type: 'mesh_thread',
      threadId: thread.id,
      event: 'created',
      message: initMsg,
      thread,
    } as any);

    // Start the autonomous loop in background (don't await — return immediately)
    if (thread.status === 'active') {
      runAutonomousLoop(thread).catch(err => {
        console.error(`[thread] Autonomous loop error:`, err);
        thread.status = 'error';
        thread.closeReason = 'error';
        saveToDisk();
      });
    }

    return thread;
  }

  // ── Manual mode (original behavior) ──────────────────────────────────
  const start = Date.now();
  const fromStr = `${participantA.agent}@${participantA.server.toUpperCase()}`;
  const toStr = `${participantB.agent}@${participantB.server.toUpperCase()}`;

  let response = '';
  let msgStatus: MeshThread['status'] = 'active';

  try {
    response = await sendToAgent(
      participantB.agent,
      participantB.server,
      threadId,
      initialMessage,
    );
  } catch (err) {
    response = `Error: ${(err as Error).message?.slice(0, 300)}`;
    msgStatus = 'error';
  }

  const msg: ThreadMessage = {
    id: randomUUID(),
    from: fromStr,
    to: toStr,
    content: initialMessage,
    response,
    timestamp: now,
    durationMs: Date.now() - start,
  };

  thread.messages.push(msg);
  thread.currentRound = 1;
  thread.updatedAt = new Date().toISOString();
  if (msgStatus === 'error') {
    thread.status = 'error';
    thread.closeReason = 'error';
  }

  if (thread.currentRound >= thread.maxRounds) {
    thread.status = 'closed';
    thread.closedAt = new Date().toISOString();
    thread.closeReason = 'max_rounds';
  }

  saveToDisk();
  return thread;
}

export async function sendInThread(
  threadId: string,
  message: string,
): Promise<{ thread: MeshThread; message: ThreadMessage }> {
  const thread = threads.get(threadId);
  if (!thread) throw new Error(`Thread not found: ${threadId}`);

  // Check inactivity
  if (thread.status === 'active' && checkInactivity(thread)) {
    thread.status = 'closed';
    thread.closedAt = new Date().toISOString();
    thread.closeReason = 'timeout';
    saveToDisk();
    throw new Error(`Thread ${threadId} closed due to inactivity`);
  }

  if (thread.status !== 'active') {
    throw new Error(`Thread ${threadId} is not active (status: ${thread.status})`);
  }

  // Always A sends to B (the dashboard user writes "as A")
  const fromStr = `${thread.participants.a.agent}@${thread.participants.a.server}`;
  const toStr = `${thread.participants.b.agent}@${thread.participants.b.server}`;

  const now = new Date().toISOString();
  const start = Date.now();

  let response = '';
  let msgStatus: MeshThread['status'] = 'active';

  try {
    response = await sendToAgent(
      thread.participants.b.agent,
      thread.participants.b.server,
      threadId,
      message,
    );
  } catch (err) {
    response = `Error: ${(err as Error).message?.slice(0, 300)}`;
    msgStatus = 'error';
  }

  const msg: ThreadMessage = {
    id: randomUUID(),
    from: fromStr,
    to: toStr,
    content: message,
    response,
    timestamp: now,
    durationMs: Date.now() - start,
  };

  thread.messages.push(msg);
  thread.currentRound += 1;
  thread.updatedAt = new Date().toISOString();

  if (msgStatus === 'error') {
    thread.status = 'error';
    thread.closeReason = 'error';
  } else if (thread.currentRound >= thread.maxRounds) {
    thread.status = 'closed';
    thread.closedAt = new Date().toISOString();
    thread.closeReason = 'max_rounds';
  }

  saveToDisk();
  return { thread, message: msg };
}

export function getThread(threadId: string): MeshThread | undefined {
  return threads.get(threadId);
}

export function listThreads(status?: string): MeshThread[] {
  const all = Array.from(threads.values());
  if (!status) return all;
  return all.filter(t => t.status === status);
}

export function closeThread(threadId: string, reason: string = 'user'): MeshThread {
  const thread = threads.get(threadId);
  if (!thread) throw new Error(`Thread not found: ${threadId}`);

  thread.status = 'closed';
  thread.closedAt = new Date().toISOString();
  thread.closeReason = reason;
  thread.updatedAt = thread.closedAt;

  saveToDisk();
  return thread;
}
