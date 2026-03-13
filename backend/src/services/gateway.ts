import { exec } from 'child_process';
import { promisify } from 'util';
import type { ServerConfig, ServerState, AgentInfo } from '../types.js';
import { REQUEST_TIMEOUT_MS, SSH_TIMEOUT_S } from '../config.js';

const execAsync = promisify(exec);

// ─── Agent list cache (refreshed every 5 min, not every poll) ─────────────────
const agentListCache = new Map<string, { agents: AgentInfo[]; cachedAt: number }>();
const AGENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── SSH / Local execution ────────────────────────────────────────────────────

/**
 * Run a shell command on a remote server via SSH, or locally if sshUser is null.
 * Returns { stdout, stderr } or throws on timeout/error.
 */
export async function runRemote(
  server: ServerConfig,
  command: string,
  timeoutMs: number = SSH_TIMEOUT_S * 1000,
): Promise<{ stdout: string; stderr: string }> {
  let fullCmd: string;

  if (server.sshUser === null) {
    // Local execution (Homelab)
    fullCmd = command;
  } else {
    // SSH to remote
    const sshOpts = [
      `-o ConnectTimeout=${SSH_TIMEOUT_S}`,
      '-o StrictHostKeyChecking=no',
      '-o BatchMode=yes',
    ].join(' ');
    const escapedCmd = command.replace(/"/g, '\\"');
    fullCmd = `ssh ${sshOpts} ${server.sshUser}@${server.ip} "${escapedCmd}"`;
  }

  return execAsync(fullCmd, { timeout: timeoutMs });
}

// ─── Agent list via SSH ───────────────────────────────────────────────────────

interface RawAgent {
  id: string;
  name?: string;
  model?: string | { primary?: string };
  identity?: { name?: string; emoji?: string };
  [key: string]: unknown;
}

function parseModel(raw: unknown): string {
  if (typeof raw === 'string') {
    // Strip provider prefix: "anthropic/claude-opus-4-6" → "claude-opus-4-6"
    return raw.replace(/^[^/]+\//, '');
  }
  if (raw && typeof raw === 'object' && 'primary' in raw) {
    const obj = raw as { primary?: string };
    return obj.primary ? obj.primary.replace(/^[^/]+\//, '') : 'unknown';
  }
  return 'unknown';
}

function mapModel(raw: string): string {
  if (raw.includes('opus')) return raw;
  if (raw.includes('sonnet')) return raw;
  if (raw.includes('haiku')) return raw;
  return raw;
}

async function fetchAgentList(server: ServerConfig): Promise<AgentInfo[]> {
  const baseCmd = 'openclaw config get agents.list';
  const cmd = server.sshSudo ? `sudo ${baseCmd}` : baseCmd;
  const { stdout } = await runRemote(server, cmd);

  let raw: RawAgent[];
  try {
    raw = JSON.parse(stdout.trim()) as RawAgent[];
  } catch {
    throw new Error(`Failed to parse agents.list JSON: ${stdout.slice(0, 200)}`);
  }

  return raw.map((a): AgentInfo => ({
    id: a.id,
    name: a.identity?.name ?? a.name ?? a.id.charAt(0).toUpperCase() + a.id.slice(1),
    emoji: a.identity?.emoji,
    model: mapModel(parseModel(a.model)),
    status: 'IDLE',
    sessionCount: 0,
  }));
}

// ─── HTTP health check ────────────────────────────────────────────────────────

async function checkHttpHealth(
  server: ServerConfig,
): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const headers: Record<string, string> = {};
    if (server.token) headers['Authorization'] = `Bearer ${server.token}`;

    const res = await fetch(`http://${server.ip}:${server.port}/health`, {
      signal: controller.signal,
      headers,
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    if (!res.ok) return { ok: false, latencyMs };

    const data = (await res.json()) as { ok?: boolean };
    return { ok: data.ok === true, latencyMs };
  } catch {
    return { ok: false, latencyMs: Date.now() - start };
  }
}

// ─── Session activity via openclaw status ─────────────────────────────────────

/**
 * Parse `openclaw status` output to find recently active agents.
 * A session line looks like:
 *   │ agent:painter:main  │ direct │ 23m ago │ claude-sonnet-4-6 │ ...
 * An agent is ACTIVE if its most recent session is < 5 minutes old.
 */
async function fetchSessionActivity(server: ServerConfig): Promise<Map<string, { active: boolean; sessionCount: number; lastAge: string }>> {
  const activity = new Map<string, { active: boolean; sessionCount: number; lastAge: string }>();

  try {
    const baseCmd = 'openclaw status';
    const cmd = server.sshSudo ? `sudo ${baseCmd}` : baseCmd;
    const { stdout } = await runRemote(server, cmd, 15000);

    // Parse session table rows: │ agent:<agentId>:<rest> │ ... │ <age> │ ...
    const lines = stdout.split('\n');
    for (const line of lines) {
      const match = line.match(/│\s*agent:([^:]+):\S+\s*│\s*\w+\s*│\s*([^│]+)│/);
      if (!match) continue;

      const agentId = match[1].trim();
      const ageStr = match[2].trim();

      // Parse age: "23m ago", "1h ago", "2h ago", "just now", "5s ago"
      let isActive = false;
      if (ageStr === 'just now' || ageStr.includes('now')) {
        isActive = true;
      } else {
        const secMatch = ageStr.match(/^(\d+)s\s+ago$/);
        const minMatch = ageStr.match(/^(\d+)m\s+ago$/);
        if (secMatch) {
          isActive = parseInt(secMatch[1]) < 300; // < 5 min
        } else if (minMatch) {
          isActive = parseInt(minMatch[1]) < 5; // < 5 min
        }
        // hours, days → not active
      }

      const existing = activity.get(agentId);
      if (existing) {
        existing.sessionCount++;
        if (isActive) existing.active = true;
      } else {
        activity.set(agentId, { active: isActive, sessionCount: 1, lastAge: ageStr });
      }
    }
  } catch (err) {
    console.warn(`[gateway:${server.id}] Failed to fetch session activity: ${(err as Error).message?.slice(0, 100)}`);
  }

  return activity;
}

// ─── Main poll function ───────────────────────────────────────────────────────

export async function pollServer(server: ServerConfig): Promise<ServerState> {
  const logPrefix = `[gateway:${server.id}]`;
  const start = Date.now();

  // 1. Get agent list (from cache or SSH)
  let agents: AgentInfo[] = [];
  let sshOk = false;

  const cached = agentListCache.get(server.id);
  const cacheValid = cached && (Date.now() - cached.cachedAt) < AGENT_CACHE_TTL_MS;

  try {
    if (cacheValid) {
      // Use cached agent list, just clone to reset statuses
      agents = cached.agents.map(a => ({ ...a, status: 'IDLE' as const, sessionCount: 0 }));
      sshOk = true;
    } else {
      agents = await fetchAgentList(server);
      agentListCache.set(server.id, { agents: agents.map(a => ({ ...a })), cachedAt: Date.now() });
      sshOk = true;
      console.log(`${logPrefix} SSH agent list refreshed — ${agents.length} agents`);
    }
  } catch (sshErr) {
    // If cache exists but expired, still use it
    if (cached) {
      agents = cached.agents.map(a => ({ ...a, status: 'IDLE' as const, sessionCount: 0 }));
      sshOk = true;
      console.warn(`${logPrefix} SSH failed, using stale cache (${agents.length} agents)`);
    } else {
      console.warn(`${logPrefix} SSH failed: ${(sshErr as Error).message?.slice(0, 120)}`);
    }
  }

  const sshLatencyMs = Date.now() - start;

  // 2. If SSH failed, check HTTP health for DEGRADED vs OFFLINE
  if (!sshOk) {
    const health = await checkHttpHealth(server);
    if (health.ok) {
      console.log(`${logPrefix} DEGRADED — SSH down, HTTP up (${health.latencyMs}ms)`);
      return {
        id: server.id,
        name: server.name,
        ip: server.ip,
        status: 'DEGRADED',
        agentCount: 0,
        agents: [],
        latencyMs: health.latencyMs,
        lastSeen: new Date().toISOString(),
      };
    } else {
      console.log(`${logPrefix} OFFLINE — SSH & HTTP both failed`);
      return {
        id: server.id,
        name: server.name,
        ip: server.ip,
        status: 'OFFLINE',
        agentCount: 0,
        agents: [],
        latencyMs: null,
        lastSeen: null,
      };
    }
  }

  // 3. Fetch session activity to determine which agents are ACTIVE
  const activity = await fetchSessionActivity(server);
  let activeCount = 0;
  for (const agent of agents) {
    const info = activity.get(agent.id);
    if (info) {
      agent.sessionCount = info.sessionCount;
      if (info.active) {
        agent.status = 'ACTIVE';
        activeCount++;
      }
    }
  }

  console.log(`${logPrefix} ${agents.length} agents, ${activeCount} active (${Date.now() - start}ms)`);

  // SSH succeeded → ONLINE
  return {
    id: server.id,
    name: server.name,
    ip: server.ip,
    status: 'ONLINE',
    agentCount: agents.length,
    agents,
    latencyMs: sshLatencyMs,
    lastSeen: new Date().toISOString(),
  };
}
