import { Router } from 'express';
import { getServerStates, getServerState, getSystemMetrics } from '../services/poller.js';
import { metricsBuffer } from '../services/ringBuffer.js';
import { getMetricsRaw, getMetricsHourly } from '../db/queries.js';
import { getCpuHighSince } from '../services/alerting.js';

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

// GET /api/servers/:id/history?hours=24 — historical metrics from SQLite
router.get('/servers/:id/history', (req, res) => {
  const serverId = req.params.id.toUpperCase();
  const hours = Math.max(1, Math.min(8760, parseInt(String(req.query['hours'] ?? '24'), 10) || 24));
  const sinceTs = Math.floor(Date.now() / 1000) - hours * 3600;

  if (hours <= 24) {
    const raw = getMetricsRaw(serverId, sinceTs);
    res.json({
      serverId,
      points: raw.map((p) => ({
        ts: p.ts,
        cpu: p.cpu,
        ram: p.ram,
        disk: p.disk,
        load1: p.load1,
        agentCount: p.agentCount,
        agentUp: p.agentUp,
      })),
      granularity: 'raw' as const,
    });
  } else {
    const hourly = getMetricsHourly(serverId, sinceTs);
    res.json({
      serverId,
      points: hourly.map((p) => ({
        ts: p.ts,
        cpu: p.cpu,
        ram: p.ram,
        disk: p.disk,
        load1: p.load1,
        agentCount: p.agentCount,
        agentUp: null,
      })),
      granularity: 'hourly' as const,
    });
  }
});

// GET /api/servers/:id/health — aura santé d'un serveur
router.get('/servers/:id/health', (req, res) => {
  const serverId = req.params.id.toUpperCase();
  const state = getServerState(serverId);
  if (!state) {
    res.status(404).json({ error: 'Server not found', id: req.params.id });
    return;
  }

  const system = getSystemMetrics(serverId) ?? state.system ?? null;
  const cpu = system?.cpu ?? 0;
  const ram = system?.memPct ?? 0;

  // Calcul de l'âge du dernier report en secondes
  let lastReportAge = 0;
  if (state.lastSeen) {
    const lastSeenMs = new Date(state.lastSeen).getTime();
    if (!isNaN(lastSeenMs)) {
      lastReportAge = Math.round((Date.now() - lastSeenMs) / 1000);
    }
  }

  // CPU critique depuis 5 min ?
  const cpuHighSince = getCpuHighSince(serverId);
  const cpuHighDurationMs = cpuHighSince !== null ? Date.now() - cpuHighSince : 0;
  const cpuCritical = cpuHighDurationMs >= 5 * 60 * 1000 && cpu > 90;

  const alerts: string[] = [];
  if (cpu > 90) alerts.push('cpu_high');
  if (ram > 95) alerts.push('ram_critical');
  else if (ram > 90) alerts.push('ram_high');
  if (lastReportAge > 5 * 60) alerts.push('reporter_down');
  else if (lastReportAge > 2 * 60) alerts.push('reporter_slow');

  // Détermination du statut
  let status: 'healthy' | 'warning' | 'critical';
  if (lastReportAge > 5 * 60 || ram > 95 || cpuCritical) {
    status = 'critical';
  } else if (cpu > 80 || ram > 90 || lastReportAge > 2 * 60) {
    status = 'warning';
  } else {
    status = 'healthy';
  }

  res.json({
    serverId,
    status,
    cpu,
    ram,
    lastReportAge,
    alerts,
  });
});

export default router;
