import { Server, Agent, MeshAgent, MeshMessage, MeshThread } from '../types';

// Use relative URLs — Vite proxy handles /api and /ws routing to backend
const API_BASE = '';
const WS_PROTOCOL = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${WS_PROTOCOL}//${typeof window !== 'undefined' ? window.location.host : 'localhost:3100'}/ws`;

// ─── Emoji map for agents by name/id ──────────────────────────────────────
const EMOJI_MAP: Record<string, string> = {
  // Nova agents
  nova: '✨', painter: '🎨', jarvis: '🤖', debug: '🐛', emma: '📚',
  penny: '🪙', brainstorm: '🧠', baboudog: '🐕', memory: '🧠',
  observer: '👀', observateur: '👀', emotional: '💫', émotionnel: '💫',
  // Studio agents
  valentina: '💃', jess: '🌟', lorane: '🌸',
  // Cyberpunk agents
  main: '⚡', supervisor: '🔮', design: '🎨', tech: '⚙️', data: '🧬',
  nexus: '🔮', neon: '🎨', volt: '⚙️', cortex: '🧬',
  // Babounette agents
  pixie: '🧚', sentinelle: '🛡️', flora: '🌺', cocotte: '🐣',
  gribouille: '✏️', courses: '🛒',
  // Homelab
  hub: '🔗',
  // TelenovelaV3
  telenovelav3: '🎭',
  // Generic
  assistant: '🤖',
};

function getEmoji(agentId: string, agentName: string): string {
  const key = agentId.toLowerCase();
  const nameKey = agentName.toLowerCase();
  return EMOJI_MAP[key] ?? EMOJI_MAP[nameKey] ?? '🤖';
}

// ─── Map backend model string to display model ────────────────────────────
function mapModel(model: string): string {
  if (model.includes('opus')) return 'Opus';
  if (model.includes('sonnet')) return 'Sonnet';
  return model;
}

// ─── Map backend agent status to frontend status ─────────────────────────
function mapAgentStatus(status: string): Agent['status'] {
  switch (status?.toUpperCase()) {
    case 'ACTIVE': return 'ACTIVE';
    case 'THINKING': return 'THINKING';
    case 'FINISHED': return 'FINISHED';
    default: return 'IDLE';
  }
}

// ─── Map backend server status to frontend status ─────────────────────────
function mapServerStatus(status: string): Server['status'] {
  switch (status?.toUpperCase()) {
    case 'OFFLINE': return 'OFFLINE';
    case 'BUSY': return 'BUSY';
    default: return 'ONLINE';
  }
}

// ─── Map raw API response to Server type ─────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapApiServer(raw: any): Partial<Server> {
  const agents: Agent[] = (raw.agents ?? []).map((a: any) => ({
    id: a.id,
    name: a.name,
    emoji: a.emoji || getEmoji(a.id, a.name),
    model: a.model ? mapModel(a.model) : 'Sonnet',
    status: mapAgentStatus(a.status),
    sessionCount: a.sessionCount,
    lastActiveAt: a.lastActiveAt,
    // V2 reporter fields
    modelFriendly: a.modelFriendly || (a.model ? mapModel(a.model) : undefined),
    tokensUsed: a.tokensUsed,
    tokensMax: a.tokensMax,
    tokensPct: a.tokensPct,
    role: a.role,
    activeSessions: a.activeSessions,
  }));

  return {
    id: raw.id,
    name: raw.name,
    ip: raw.ip,
    status: mapServerStatus(raw.status),
    agents,
    agentCount: raw.agentCount ?? agents.length,
    latencyMs: raw.latencyMs,
    lastSeen: raw.lastSeen,
    system: raw.system,
  };
}

// ─── Fetch all servers ─────────────────────────────────────────────────────
export async function fetchServers(): Promise<Partial<Server>[]> {
  const res = await fetch(`${API_BASE}/api/servers`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const servers = Array.isArray(data) ? data : (data.servers ?? []);
  return servers.map(mapApiServer);
}

// ─── Fetch a single server ─────────────────────────────────────────────────
export async function fetchServer(id: string): Promise<Partial<Server>> {
  const res = await fetch(`${API_BASE}/api/servers/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return mapApiServer(data);
}

// ─── WebSocket with auto-reconnect ────────────────────────────────────────
let wsInstance: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function connectWebSocket(
  onMessage: (event: any) => void,
  onStatusChange?: (live: boolean) => void,
): () => void {
  let destroyed = false;

  function connect() {
    if (destroyed) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsInstance = ws;

      ws.onopen = () => {
        onStatusChange?.(true);
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          onMessage(data);
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        onStatusChange?.(false);
      };

      ws.onclose = () => {
        onStatusChange?.(false);
        if (!destroyed) {
          wsReconnectTimer = setTimeout(connect, 5000);
        }
      };
    } catch {
      onStatusChange?.(false);
      if (!destroyed) {
        wsReconnectTimer = setTimeout(connect, 5000);
      }
    }
  }

  connect();

  // Return cleanup function
  return () => {
    destroyed = true;
    if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
    if (wsInstance) {
      wsInstance.onclose = null;
      wsInstance.close();
      wsInstance = null;
    }
  };
}

// ─── Mesh API ─────────────────────────────────────────────────────────────

export async function fetchMeshRegistry(): Promise<MeshAgent[]> {
  const res = await fetch(`${API_BASE}/api/mesh/registry`);
  if (!res.ok) throw new Error('Failed to fetch registry');
  return res.json();
}

export async function sendMeshMessage(data: {
  fromAgent: string;
  fromServer: string;
  toAgent: string;
  toServer: string;
  message: string;
}): Promise<MeshMessage> {
  const res = await fetch(`${API_BASE}/api/mesh/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to send message');
  return res.json();
}

export async function fetchMeshHistory(limit = 50): Promise<MeshMessage[]> {
  const res = await fetch(`${API_BASE}/api/mesh/history?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch history');
  return res.json();
}

// ─── Thread API ───────────────────────────────────────────────────────────

export async function createThread(data: {
  fromAgent: string;
  fromServer: string;
  toAgent: string;
  toServer: string;
  message: string;
  maxRounds?: number;
  mode?: 'manual' | 'autonomous';
}): Promise<MeshThread> {
  const res = await fetch(`${API_BASE}/api/mesh/thread`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function sendInThread(threadId: string, message: string): Promise<MeshThread> {
  const res = await fetch(`${API_BASE}/api/mesh/thread/${threadId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchThread(threadId: string): Promise<MeshThread> {
  const res = await fetch(`${API_BASE}/api/mesh/thread/${threadId}`);
  if (!res.ok) throw new Error('Failed to fetch thread');
  return res.json();
}

export async function fetchThreads(status?: string): Promise<MeshThread[]> {
  const qs = status ? `?status=${status}` : '';
  const res = await fetch(`${API_BASE}/api/mesh/threads${qs}`);
  if (!res.ok) throw new Error('Failed to fetch threads');
  return res.json();
}

export async function closeThread(threadId: string): Promise<MeshThread> {
  const res = await fetch(`${API_BASE}/api/mesh/thread/${threadId}/close`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to close thread');
  return res.json();
}
