/**
 * Watchdog Bridge — fetches from Debug's cache endpoint
 * GET http://localhost:3003/api/cache — no auth, instant (<5ms), refreshed every 30s
 */
import { Router } from 'express';

const router = Router();
const CACHE_URL = 'http://localhost:3003/api/cache';
const WATCHDOG_BASE = 'http://localhost:3003/api';
const WATCHDOG_AUTH = Buffer.from('david:Debug2026!').toString('base64');

// In-memory cache with TTL
let cache: any = null;
let cacheTs = 0;
const CACHE_TTL = 5_000; // re-fetch from cache endpoint max every 5s

async function getCache(): Promise<any> {
  const now = Date.now();
  if (cache && (now - cacheTs) < CACHE_TTL) return cache;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3_000);
    const res = await fetch(CACHE_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      cache = await res.json();
      cacheTs = now;
    }
  } catch { /* keep stale cache */ }
  return cache;
}

// Health check
router.get('/_health', async (_req, res) => {
  const data = await getCache();
  if (!data) return res.json({ connected: false });
  const ageMs = Date.now() - new Date(data.updatedAt).getTime();
  res.json({ connected: true, latencyMs: 0, cacheAge: Math.round(ageMs / 1000), stale: ageMs > 120_000 });
});

// Status — the cache key is "status" (not "servers")
router.get('/status', async (_req, res) => {
  const data = await getCache();
  if (!data) return res.status(502).json({ error: 'Watchdog cache unavailable' });
  res.json(data.status || {});
});

router.get('/full-backups', async (_req, res) => {
  const data = await getCache();
  if (!data) return res.status(502).json({ error: 'Watchdog cache unavailable' });
  res.json(data.fullBackups || []);
});

router.get('/nas-status', async (_req, res) => {
  const data = await getCache();
  if (!data) return res.status(502).json({ error: 'Watchdog cache unavailable' });
  const nas = data.nasStatus || {};
  // Normalize: convert bytes to GB and add pct if missing
  const total = nas.total_bytes || nas.total || 0;
  const used = nas.used_bytes || nas.used || 0;
  const free = nas.available_bytes || nas.free || 0;
  const pct = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
  res.json({ total, used, free, pct, ...nas });
});

router.get('/incidents', async (_req, res) => {
  const data = await getCache();
  if (!data) return res.status(502).json({ error: 'Watchdog cache unavailable' });
  res.json(data.incidents || []);
});

router.get('/versions', async (_req, res) => {
  const data = await getCache();
  if (!data) return res.status(502).json({ error: 'Watchdog cache unavailable' });
  // Convert array [{server_id, details}] to object {nova: "2026.3.13", ...}
  if (Array.isArray(data.versions)) {
    const obj: Record<string, string> = {};
    for (const v of data.versions) {
      const id = v.server_id || v.server || v.id || 'unknown';
      obj[id] = v.details || v.version || '?';
    }
    return res.json(obj);
  }
  res.json(data.versions || {});
});

router.get('/sessions-summary', async (_req, res) => {
  const data = await getCache();
  if (!data) return res.status(502).json({ error: 'Watchdog cache unavailable' });
  res.json(data.sessionsSummary || {});
});

// Chart — not in cache, return empty
router.get('/chart/:server', (_req, res) => {
  res.json({ labels: [], disk: [], ram: [] });
});

// POST actions — go through Watchdog HTTP (rare, user-initiated)
router.post('/*', async (req: any, res: any) => {
  const path = req.params[0] || '';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(`${WATCHDOG_BASE}/${path}`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${WATCHDOG_AUTH}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Watchdog unavailable', detail: (err as Error).message });
  }
});

export default router;
