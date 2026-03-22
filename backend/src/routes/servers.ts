import { Router } from 'express';
import { getServerStates, getServerState, getSystemMetrics } from '../services/poller.js';
import { metricsBuffer } from '../services/ringBuffer.js';

const router = Router();

// GET /api/servers — all servers (enriched with v2 system metrics and agent fields)
router.get('/servers', (_req, res) => {
  const states = getServerStates();
  const enriched = states.map((server) => {
    const system = getSystemMetrics(server.id) ?? server.system ?? null;
    return {
      ...server,
      system,
      agents: server.agents.map((a) => ({
        ...a,
        model: a.model || 'unknown',
        modelFriendly: a.modelFriendly || a.model || 'Unknown',
        tokensUsed: a.tokensUsed ?? 0,
        tokensMax: a.tokensMax ?? 0,
        tokensPct: a.tokensPct ?? 0,
        role: a.role || '',
        emoji: a.emoji || '🤖',
        sessionCount: a.sessionCount ?? 0,
        activeSessions: a.activeSessions ?? 0,
      })),
    };
  });
  res.json(enriched);
});

// GET /api/servers/:id — single server (enriched)
router.get('/servers/:id', (req, res) => {
  const state = getServerState(req.params.id);
  if (!state) {
    res.status(404).json({ error: 'Server not found', id: req.params.id });
    return;
  }
  const system = getSystemMetrics(state.id) ?? state.system ?? null;
  res.json({
    ...state,
    system,
    agents: state.agents.map((a) => ({
      ...a,
      model: a.model || 'unknown',
      modelFriendly: a.modelFriendly || a.model || 'Unknown',
      tokensUsed: a.tokensUsed ?? 0,
      tokensMax: a.tokensMax ?? 0,
      tokensPct: a.tokensPct ?? 0,
      role: a.role || '',
      emoji: a.emoji || '🤖',
      sessionCount: a.sessionCount ?? 0,
      activeSessions: a.activeSessions ?? 0,
    })),
  });
});

// GET /api/servers/:id/system — system metrics for one server (from reporter v2)
router.get('/servers/:id/system', (req, res) => {
  const metrics = getSystemMetrics(req.params.id);
  if (!metrics) return res.json({});
  res.json(metrics);
});

// GET /api/servers/:id/sparkline?minutes=60 — ring buffer data for sparklines
router.get('/servers/:id/sparkline', (req, res) => {
  const serverId = req.params.id.toUpperCase();
  const minutes = Math.max(1, Math.min(1440, parseInt(String(req.query['minutes'] ?? '60'), 10) || 60));
  const since = Math.floor(Date.now() / 1000) - minutes * 60;
  const points = metricsBuffer.get(serverId, since);
  res.json({ serverId, points });
});

export default router;
