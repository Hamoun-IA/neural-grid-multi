import type { ServerState, WsEvent, SystemMetrics } from '../types.js';
import { SERVERS, POLL_INTERVAL_MS } from '../config.js';
import { pollServer } from './gateway.js';
import type WebSocket from 'ws';
import type { WebSocketServer } from 'ws';

// In-memory store: server ID → last known state
const serverStates = new Map<string, ServerState>();

// In-memory store: server ID → system metrics from reporter v2
const systemMetricsStore = new Map<string, SystemMetrics>();

// WebSocket server reference (set after init)
let wss: WebSocketServer | null = null;

export function setWss(server: WebSocketServer): void {
  wss = server;
}

export function getServerStates(): ServerState[] {
  return Array.from(serverStates.values());
}

export function getServerState(id: string): ServerState | undefined {
  return serverStates.get(id.toUpperCase());
}

/** Alias used by mesh service — returns same cached states */
export function getCachedStates(): ServerState[] {
  return Array.from(serverStates.values());
}

export function getSystemMetrics(id: string): SystemMetrics | undefined {
  return systemMetricsStore.get(id.toUpperCase());
}

/**
 * Broadcast a message to all connected WebSocket clients
 */
function broadcast(event: WsEvent): void {
  if (!wss) return;
  const payload = JSON.stringify(event);
  wss.clients.forEach((client) => {
    if (client.readyState === 1 /* OPEN */) {
      client.send(payload);
    }
  });
}

/** Public broadcast — used by mesh routes */
export function broadcastEvent(event: WsEvent): void {
  broadcast(event);
}

/**
 * Update cached agent activity from a webhook push (no SSH poll needed).
 * Merges agent statuses into the existing server state.
 * Supports both v1 (basic) and v2 (enriched with tokens, model, system metrics) reporters.
 */
export function updateCachedAgentActivity(
  serverId: string,
  serverName: string | undefined,
  agents: import('../types.js').AgentInfo[],
  timestamp: string,
  system?: SystemMetrics,
): void {
  // Store system metrics if provided (reporter v2)
  if (system) {
    systemMetricsStore.set(serverId, system);
  }

  const systemData = systemMetricsStore.get(serverId) ?? null;

  const existing = serverStates.get(serverId);
  if (existing) {
    // Merge: webhook agents override existing agent status, keep other fields
    // v2 enriched fields (model, tokens, role, etc.) are preserved via spread
    const agentMap = new Map(existing.agents.map((a) => [a.id, a]));
    for (const a of agents) {
      agentMap.set(a.id, { ...agentMap.get(a.id), ...a });
    }
    serverStates.set(serverId, {
      ...existing,
      status: 'ONLINE',
      agents: Array.from(agentMap.values()),
      agentCount: agentMap.size,
      lastSeen: timestamp,
      system: systemData,
    });
  } else {
    // Server not yet known — create a minimal entry
    serverStates.set(serverId, {
      id: serverId,
      name: serverName ?? serverId,
      ip: '',
      status: 'ONLINE',
      agents,
      agentCount: agents.length,
      latencyMs: 0,
      lastSeen: timestamp,
      system: systemData,
    });
  }
}

/**
 * Poll all servers (in parallel, independently)
 */
async function pollAll(): Promise<void> {
  console.log(`[poller] Starting poll of ${SERVERS.length} servers...`);
  const promises = SERVERS.map(async (server) => {
    try {
      const state = await pollServer(server);
      serverStates.set(server.id, state);
      broadcast({
        type: 'server_update',
        serverId: state.id,
        status: state.status,
        agents: state.agents,
        latencyMs: state.latencyMs,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[poller] Unexpected error polling ${server.id}:`, err);
      // Mark as offline on unexpected errors
      const offlineState: ServerState = {
        id: server.id,
        name: server.name,
        ip: server.ip,
        status: 'OFFLINE',
        agentCount: 0,
        agents: [],
        latencyMs: null,
        lastSeen: serverStates.get(server.id)?.lastSeen ?? null,
        error: String(err),
      };
      serverStates.set(server.id, offlineState);
      broadcast({
        type: 'server_update',
        serverId: server.id,
        status: 'OFFLINE',
        agents: [],
        latencyMs: null,
        timestamp: new Date().toISOString(),
      });
    }
  });

  await Promise.allSettled(promises);
  console.log(`[poller] Poll complete. Online: ${getServerStates().filter((s) => s.status === 'ONLINE').length}/${SERVERS.length}`);
}

/**
 * Start the heartbeat broadcaster (every 15s)
 */
function startHeartbeat(): void {
  setInterval(() => {
    broadcast({ type: 'heartbeat', timestamp: new Date().toISOString() });
  }, 15_000);
}

/**
 * Initialize the poller: first poll immediately, then every POLL_INTERVAL_MS
 */
export async function startPoller(): Promise<void> {
  // Initialize states as UNKNOWN
  for (const server of SERVERS) {
    serverStates.set(server.id, {
      id: server.id,
      name: server.name,
      ip: server.ip,
      status: 'UNKNOWN',
      agentCount: 0,
      agents: [],
      latencyMs: null,
      lastSeen: null,
    });
  }

  // First poll immediately
  await pollAll();

  // Then poll every 30s
  setInterval(() => {
    pollAll().catch((err) => console.error('[poller] Poll error:', err));
  }, POLL_INTERVAL_MS);

  // Start heartbeat
  startHeartbeat();

  console.log(`[poller] Started. Polling every ${POLL_INTERVAL_MS / 1000}s`);
}
