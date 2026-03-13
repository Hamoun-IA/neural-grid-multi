import { Router } from 'express';
import { sendMeshMessage, getMessageHistory, getRegistryFromServers } from '../services/mesh.js';
import { getCachedStates, broadcastEvent } from '../services/poller.js';

const router = Router();

// GET /api/mesh/registry — flat list of all agents across all servers
router.get('/registry', (_req, res) => {
  const states = getCachedStates();
  const registry = getRegistryFromServers(states);
  res.json(registry);
});

// POST /api/mesh/send — send a message from agent A to agent B
router.post('/send', async (req, res) => {
  const { fromAgent, fromServer, toAgent, toServer, message } = req.body;

  if (!fromAgent || !fromServer || !toAgent || !toServer || !message) {
    return res.status(400).json({ error: 'Missing fields: fromAgent, fromServer, toAgent, toServer, message' });
  }

  try {
    console.log(`[mesh] ${fromAgent}@${fromServer} → ${toAgent}@${toServer}: ${message.slice(0, 80)}...`);
    const result = await sendMeshMessage(fromAgent, fromServer, toAgent, toServer, message);

    // Broadcast mesh event via WebSocket
    broadcastEvent({
      type: 'mesh_message',
      id: result.id,
      from: result.from,
      to: result.to,
      status: result.status,
      timestamp: result.timestamp,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/mesh/history — recent mesh messages
router.get('/history', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json(getMessageHistory(limit));
});

export default router;
