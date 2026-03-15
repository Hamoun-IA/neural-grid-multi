import { Router } from 'express';
import { broadcastEvent, updateCachedAgentActivity, getServerState } from '../services/poller.js';
import type { AgentInfo, SystemMetrics } from '../types.js';

const router = Router();

/**
 * POST /api/webhook/activity
 * Called by the Activity Reporter script running on each server.
 *
 * v1 body: {
 *   serverId: "NOVA", serverName: "Nova",
 *   agents: [{ id, name, status, sessionKey }],
 *   timestamp: "..."
 * }
 *
 * v2 body: {
 *   serverId: "NOVA", serverName: "Nova",
 *   agents: [{ id, status, lastAge, model, modelFriendly, tokensUsed, tokensMax, tokensPct, role, emoji, sessionCount, activeSessions }],
 *   system: { cpu, memUsedMB, memTotalMB, memPct, diskPct, uptimeHuman, load1, ... },
 *   reporterVersion: 2,
 *   timestamp: "..."
 * }
 */
router.post('/activity', (req, res) => {
  const { serverId, serverName, agents, timestamp, system, reporterVersion } = req.body;

  if (!serverId || !agents) {
    return res.status(400).json({ error: 'Missing serverId or agents' });
  }

  // Filter out empty/invalid agents from reporter
  const rawAgents: any[] = agents.filter((a: any) => a.id && a.id.trim() !== '');
  const activeCount = rawAgents.filter((a: any) => a.status === 'ACTIVE').length;
  const version = reporterVersion || 1;
  console.log(`[webhook] Activity v${version} from ${serverId}: ${activeCount} active / ${rawAgents.length} total agents`);

  // Normalize agents to AgentInfo shape (backward-compatible with v1 and v2)
  const validAgents: AgentInfo[] = rawAgents.map((a: any) => ({
    id: a.id,
    name: a.name || a.id,
    emoji: a.emoji || '🤖',
    model: a.model || 'unknown',
    modelFriendly: a.modelFriendly || a.model || 'Unknown',
    status: (a.status === 'ACTIVE' ? 'ACTIVE' : 'IDLE') as AgentInfo['status'],
    sessionCount: a.sessionCount ?? 0,
    activeSessions: a.activeSessions ?? 0,
    lastActiveAt: a.lastActiveAt,
    lastAge: a.lastAge,
    // v2 token fields
    tokensUsed: a.tokensUsed ?? 0,
    tokensMax: a.tokensMax ?? 0,
    tokensPct: a.tokensPct ?? 0,
    tokensTotalUsed: a.tokensTotalUsed ?? 0,
    tokensAllTime: a.tokensAllTime ?? 0,
    role: a.role || '',
  }));

  const ts = timestamp || new Date().toISOString();
  const systemMetrics: SystemMetrics | undefined = system || undefined;

  // Update the cached state FIRST (merges with existing agents from poller)
  updateCachedAgentActivity(
    serverId.toUpperCase(),
    serverName,
    validAgents,
    ts,
    systemMetrics,
  );

  // Broadcast the MERGED agent list (not just the reporter's partial list)
  const merged = getServerState(serverId.toUpperCase());
  broadcastEvent({
    type: 'server_update',
    serverId: serverId.toUpperCase(),
    status: 'ONLINE',
    agents: merged?.agents ?? validAgents,
    latencyMs: merged?.latencyMs ?? 0,
    timestamp: ts,
    system: systemMetrics || merged?.system || null,
    reporterVersion: version,
  });

  res.json({ ok: true, received: agents.length });
});

export default router;
