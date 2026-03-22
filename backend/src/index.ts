import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { PORT } from './config.js';
import healthRouter from './routes/health.js';
import serversRouter from './routes/servers.js';
import meshRouter from './routes/mesh.js';
import threadRouter from './routes/thread.js';
import webhookRouter from './routes/webhook.js';
import { startPoller, setWss } from './services/poller.js';
import filesRouter from './routes/files.js';
import { attachTerminal } from './services/ssh-terminal.js';

const app = express();

// CORS — allow frontend on port 3100
app.use(cors({
  origin: [
    'http://localhost:3100',
    'http://127.0.0.1:3100',
    /^http:\/\/100\.\d+\.\d+\.\d+:\d+$/,  // Tailscale IPs
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Routes
app.use('/api', healthRouter);
app.use('/api', serversRouter);
app.use('/api/mesh', meshRouter);
app.use('/api/mesh', threadRouter);
app.use('/api/webhook', webhookRouter);
app.use('/api/files', filesRouter);

// 404 fallback (skip WebSocket upgrade paths)
app.use((req, _res, next) => {
  if (req.headers.upgrade === 'websocket') return; // Let WS server handle it
  next();
}, (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// HTTP server
const httpServer = createServer(app);

// WebSocket servers (noServer mode to avoid Express interference)
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
const terminalWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

// Manual upgrade handling — prevents Express from writing 400 on WS connections
httpServer.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url ?? '', `http://localhost:${PORT}`).pathname;

  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else if (pathname.startsWith('/ws/terminal')) {
    terminalWss.handleUpgrade(request, socket, head, (ws) => {
      terminalWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});
terminalWss.on('connection', (ws, req) => {
  // Extract serverId from URL: /ws/terminal?server=NOVA
  const url = new URL(req.url ?? '', `http://localhost:${PORT}`);
  const serverId = url.searchParams.get('server') ?? '';
  console.log(`[terminal] New SSH session for ${serverId}`);
  attachTerminal(ws, serverId);
});

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress ?? 'unknown';
  console.log(`[ws] Client connected from ${ip} (total: ${wss.clients.size})`);

  ws.on('close', () => {
    console.log(`[ws] Client disconnected (total: ${wss.clients.size})`);
  });

  ws.on('error', (err) => {
    console.error(`[ws] Client error:`, err.message);
  });
});

setWss(wss);

// Start server
httpServer.listen(PORT, () => {
  console.log(`\n🔗 Neural Grid Backend running on port ${PORT}`);
  console.log(`   REST: http://localhost:${PORT}/api/health`);
  console.log(`   REST: http://localhost:${PORT}/api/servers`);
  console.log(`   WS:   ws://localhost:${PORT}/ws\n`);
});

// Start polling gateways
startPoller().catch((err) => {
  console.error('[startup] Poller failed to start:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[shutdown] Shutting down gracefully...');
  wss.close(() => {
    httpServer.close(() => {
      console.log('[shutdown] Done.');
      process.exit(0);
    });
  });
});
