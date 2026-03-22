/**
 * File Explorer API routes
 */
import { Router } from 'express';
import { listFiles, readFile, writeFile, getSSHCreds } from '../services/ssh-terminal.js';

const router = Router();

// GET /api/files/:serverId/list?path=/root/.openclaw
router.get('/:serverId/list', async (req, res) => {
  const { serverId } = req.params;
  const dirPath = (req.query.path as string) || getSSHCreds(serverId)?.openclaw_home || '/root/.openclaw';
  try {
    const files = await listFiles(serverId, dirPath);
    res.json({ path: dirPath, files });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/files/:serverId/read?path=/root/.openclaw/SOUL.md
router.get('/:serverId/read', async (req, res) => {
  const { serverId } = req.params;
  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: 'Missing path query param' });
  try {
    const content = await readFile(serverId, filePath);
    res.json({ path: filePath, content });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/files/:serverId/write  body: { path, content }
router.post('/:serverId/write', async (req, res) => {
  const { serverId } = req.params;
  const { path: filePath, content } = req.body;
  if (!filePath || content === undefined) return res.status(400).json({ error: 'Missing path or content' });
  try {
    await writeFile(serverId, filePath, content);
    res.json({ ok: true, path: filePath });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
