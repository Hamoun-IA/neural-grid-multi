import { Router } from 'express';
import { getServerStates } from '../services/poller.js';

const router = Router();

router.get('/health', (_req, res) => {
  const states = getServerStates();
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    serversPolled: states.filter((s) => s.status !== 'UNKNOWN').length,
    serversOnline: states.filter((s) => s.status === 'ONLINE').length,
    serversTotal: states.length,
    timestamp: new Date().toISOString(),
  });
});

export default router;
