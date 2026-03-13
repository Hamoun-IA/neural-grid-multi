import { Router } from 'express';
import { getServerStates, getServerState } from '../services/poller.js';

const router = Router();

// GET /api/servers — all servers
router.get('/servers', (_req, res) => {
  const states = getServerStates();
  res.json(states);
});

// GET /api/servers/:id — single server
router.get('/servers/:id', (req, res) => {
  const state = getServerState(req.params.id);
  if (!state) {
    res.status(404).json({ error: 'Server not found', id: req.params.id });
    return;
  }
  res.json(state);
});

export default router;
