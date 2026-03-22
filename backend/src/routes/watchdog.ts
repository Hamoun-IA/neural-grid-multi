import { Router } from 'express';

const router = Router();

const WATCHDOG_BASE = 'http://localhost:3003/api';
const WATCHDOG_AUTH = Buffer.from('david:Debug2026!').toString('base64');
const TIMEOUT_MS = 5_000; // Keep short to avoid saturating Watchdog (execSync blocks its event loop)

// Health check — ping Watchdog and measure latency
router.get('/_health', async (_req, res) => {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(`${WATCHDOG_BASE}/ping`, {
      headers: { 'Authorization': `Basic ${WATCHDOG_AUTH}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    if (response.ok) {
      res.json({ connected: true, latencyMs });
    } else {
      res.json({ connected: false, latencyMs, status: response.status });
    }
  } catch (err) {
    res.json({ connected: false, latencyMs: Date.now() - start, error: (err as Error).message });
  }
});

// Proxy GET requests
router.get('/*', async (req, res) => {
  const path = (req.params as Record<string, string>)[0] || '';
  const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
  const url = `${WATCHDOG_BASE}/${path}${queryString ? '?' + queryString : ''}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(url, {
      headers: { 'Authorization': `Basic ${WATCHDOG_AUTH}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Watchdog unavailable', detail: (err as Error).message });
  }
});

// Proxy POST requests
router.post('/*', async (req, res) => {
  const path = (req.params as Record<string, string>)[0] || '';
  const url = `${WATCHDOG_BASE}/${path}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
