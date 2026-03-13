import { Router } from 'express';
import { broadcastEvent, updateCachedAgentActivity } from '../services/poller.js';

const router = Router();

/**
 * POST /api/webhook/activity
 * Called by the Activity Reporter script running on each server.
 * Body: {
 *   serverId: "NOVA",
 *   serverName: "Nova",
 *   agents: [
 *     { id: "main", name: "Nova", status: "ACTIVE", sessionKey: "agent:main:..." },
 *     { id: "painter", name: "Painter", status: "IDLE" }
 *   ],
 *   timestamp: "2026-03-12T10:45:00Z"
 * }
 */
router.post('/activity', (req, res) => {
  const { serverId, serverName, agents, timestamp } = req.body;

  if (!serverId || !agents) {
    return res.status(400).json({ error: 'Missing serverId or agents' });
  }

  // Filter out empty/invalid agents from reporter
  const validAgents = agents.filter((a: any) => a.id && a.id.trim() !== '');
  const activeCount = validAgents.filter((a: any) => a.status === 'ACTIVE').length;
  console.log(`[webhook] Activity from ${serverId}: ${activeCount} active agents`);

  const ts = timestamp || new Date().toISOString();

  // Broadcast immediately via WebSocket
  broadcastEvent({
    type: 'server_update',
    serverId: serverId.toUpperCase(),
    status: 'ONLINE',
    agents: validAgents,
    latencyMs: 0,
    timestamp: ts,
  });

  // Update the cached state in the poller (no SSH round-trip needed)
  updateCachedAgentActivity(serverId.toUpperCase(), serverName, validAgents, ts);

  res.json({ ok: true, received: agents.length });
});

export default router;
