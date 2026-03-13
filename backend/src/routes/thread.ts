import { Router } from 'express';
import {
  createThread,
  sendInThread,
  getThread,
  listThreads,
  closeThread,
} from '../services/thread.js';
import { broadcastEvent } from '../services/poller.js';

const router = Router();

// POST /api/mesh/thread — create a new thread
router.post('/thread', async (req, res) => {
  const { fromAgent, fromServer, toAgent, toServer, message, maxRounds, mode } = req.body;

  if (!fromAgent || !fromServer || !toAgent || !toServer || !message) {
    return res.status(400).json({
      error: 'Missing fields: fromAgent, fromServer, toAgent, toServer, message',
    });
  }

  try {
    console.log(`[thread] Creating thread ${fromAgent}@${fromServer} → ${toAgent}@${toServer}`);
    const threadMode = mode === 'autonomous' ? 'autonomous' : 'manual';
    console.log(`[thread] Mode: ${threadMode}`);
    const thread = await createThread(
      { agent: fromAgent, server: fromServer },
      { agent: toAgent, server: toServer },
      message,
      maxRounds ?? 10,
      threadMode,
    );

    // Broadcast thread created
    broadcastEvent({
      type: 'mesh_thread',
      threadId: thread.id,
      event: 'created',
      message: thread.messages[0] ?? null,
      thread,
    } as any);

    res.json(thread);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/mesh/threads — list threads (optional ?status=active)
router.get('/threads', (req, res) => {
  const status = req.query.status as string | undefined;
  const result = listThreads(status);
  res.json(result);
});

// GET /api/mesh/thread/:id — get a specific thread
router.get('/thread/:id', (req, res) => {
  const thread = getThread(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  res.json(thread);
});

// POST /api/mesh/thread/:id/send — send a message in thread
router.post('/thread/:id/send', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Missing field: message' });

  try {
    console.log(`[thread] Sending in thread ${req.params.id}: ${message.slice(0, 80)}...`);
    const { thread, message: msg } = await sendInThread(req.params.id, message);

    // Broadcast message event
    broadcastEvent({
      type: 'mesh_thread',
      threadId: thread.id,
      event: 'message',
      message: msg,
      thread,
    } as any);

    // Also broadcast closed event if thread was auto-closed
    if (thread.status !== 'active') {
      broadcastEvent({
        type: 'mesh_thread',
        threadId: thread.id,
        event: 'closed',
        message: null,
        thread,
      } as any);
    }

    res.json({ thread, message: msg });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/mesh/thread/:id/close — close a thread
router.post('/thread/:id/close', (req, res) => {
  try {
    const thread = closeThread(req.params.id, 'user');

    // Broadcast closed event
    broadcastEvent({
      type: 'mesh_thread',
      threadId: thread.id,
      event: 'closed',
      message: null,
      thread,
    } as any);

    res.json(thread);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
