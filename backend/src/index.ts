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
import { startPoller, setWss, getServerState } from './services/poller.js';
import { SERVERS } from './config.js';
import { checkReporterDown } from './services/alerting.js';
import filesRouter from './routes/files.js';
import { attachTerminal } from './services/ssh-terminal.js';
import { hmacAuth } from './middleware/hmacAuth.js';
import { runMaintenance } from './db/queries.js';

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

// Webhook route: raw body capture → HMAC verify → re-parse JSON for handler
// Must be registered BEFORE global express.json() so body arrives as Buffer
app.use(
  '/api/webhook/activity',
  express.raw({ type: 'application/json' }),
  hmacAuth,
  (req, _res, next) => {
    // Re-parse raw Buffer into object so downstream handlers get req.body as JSON
    if (Buffer.isBuffer(req.body)) {
      try {
        req.body = JSON.parse(req.body.toString('utf8'));
      } catch {
        req.body = {};
      }
    }
    next();
  },
);

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

// Dead Man's Snitch — vérifie chaque minute si les reporters sont silencieux
const REPORTER_DOWN_THRESHOLD_MS = 5 * 60 * 1000; // 5 min
setInterval(() => {
  const now = Date.now();
  for (const server of SERVERS) {
    const state = getServerState(server.id);
    if (!state || !state.lastSeen) continue; // jamais vu → pas encore d'alerte
    const lastSeenMs = new Date(state.lastSeen).getTime();
    if (isNaN(lastSeenMs)) continue;
    const silenceMs = now - lastSeenMs;
    if (silenceMs >= REPORTER_DOWN_THRESHOLD_MS) {
      checkReporterDown(server.id, silenceMs);
    }
  }
}, 60 * 1000);

// SQLite maintenance: run once at startup + every 5 minutes
if (process.env.SQLITE_ENABLED !== 'false') {
  runMaintenance();
  setInterval(() => runMaintenance(), 5 * 60 * 1000);
}

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
