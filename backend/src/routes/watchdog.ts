/**
 * Watchdog Bridge — reads from shared JSON cache file
 * Debug updates /opt/watchdog/cache/watchdog-data.json every 30s
 * Zero HTTP requests to Watchdog Express = zero saturation
 */
import { Router } from 'express';
import { readFileSync, existsSync, statSync } from 'fs';

const router = Router();

const CACHE_FILE = '/opt/watchdog/cache/watchdog-data.json';

interface WatchdogCache {
  updatedAt: string;
  status: Record<string, unknown>;
  fullBackups: unknown[];
  nasStatus: Record<string, unknown>;
  incidents: unknown[];
  versions: Record<string, unknown>;
  sessionsSummary: Record<string, unknown>;
}

let cachedData: WatchdogCache | null = null;
let cachedMtime = 0;

function readCache(): WatchdogCache | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const mtime = statSync(CACHE_FILE).mtimeMs;
    // Only re-read if file changed
    if (cachedData && mtime === cachedMtime) return cachedData;
    const raw = readFileSync(CACHE_FILE, 'utf-8');
    cachedData = JSON.parse(raw);
    cachedMtime = mtime;
    return cachedData;
  } catch {
    return null;
  }
}

// Health check — is the cache file fresh?
router.get('/_health', (_req, res) => {
  const data = readCache();
  if (!data) {
    return res.json({ connected: false, error: 'Cache file not found' });
  }
  const ageMs = Date.now() - new Date(data.updatedAt).getTime();
  res.json({
    connected: true,
    latencyMs: 0,
    cacheAge: Math.round(ageMs / 1000),
    stale: ageMs > 120_000, // stale if >2min old
  });
});

// Individual data endpoints (for backward compat with MonitorView/InteriorView)
router.get('/status', (_req, res) => {
  const data = readCache();
  if (!data) return res.status(502).json({ error: 'Watchdog cache unavailable' });
  res.json(data.status);
});

router.get('/full-backups', (_req, res) => {
  const data = readCache();
  if (!data) return res.status(502).json({ error: 'Watchdog cache unavailable' });
  res.json(data.fullBackups);
});

router.get('/nas-status', (_req, res) => {
  const data = readCache();
  if (!data) return res.status(502).json({ error: 'Watchdog cache unavailable' });
  res.json(data.nasStatus);
});

router.get('/incidents', (_req, res) => {
  const data = readCache();
  if (!data) return res.status(502).json({ error: 'Watchdog cache unavailable' });
  res.json(data.incidents);
});

router.get('/versions', (_req, res) => {
  const data = readCache();
  if (!data) return res.status(502).json({ error: 'Watchdog cache unavailable' });
  res.json(data.versions);
});

router.get('/sessions-summary', (_req, res) => {
  const data = readCache();
  if (!data) return res.status(502).json({ error: 'Watchdog cache unavailable' });
  res.json(data.sessionsSummary);
});

// Chart data — not in cache, return empty (our sparklines use our own pipeline)
router.get('/chart/:server', (_req, res) => {
  res.json({ labels: [], disk: [], ram: [] });
});

// POST actions — these still need to go through Watchdog HTTP (rare, user-initiated)
const WATCHDOG_BASE = 'http://localhost:3003/api';
const WATCHDOG_AUTH = Buffer.from('david:Debug2026!').toString('base64');

router.post('/*', async (req: any, res: any) => {
  const path = req.params[0] || '';
  const url = `${WATCHDOG_BASE}/${path}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${WATCHDOG_AUTH}`,
        'Content-Type': 'application/json',
      },
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
