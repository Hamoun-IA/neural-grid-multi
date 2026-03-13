# Neural Grid 🏙️

Cyberpunk 3D dashboard for monitoring OpenClaw agent infrastructure across Tailscale-meshed servers.

![Neural Grid](frontend/neural-grid-icon.jpg)

## Features

- 🏗️ **3D Isometric City** — 5 buildings representing 5 servers, with dynamic illumination
- 📊 **Real-time monitoring** — 31 agents across 5 servers, push-based updates (~3s)
- 📡 **Mesh Communication** — Send messages between any agents across servers
- 🔗 **Autonomous Threads** — Agents can have full conversations autonomously
- 📱 **Mobile PWA** — Installable, responsive, touch controls
- 🌐 **Tailscale mesh** — Secure private network, no internet exposure

## Architecture

```
Reporters (5 servers)          Backend (3101)              Frontend (3100)
  activity-reporter.sh  ──POST──→  /api/webhook   ──WS──→  3D Dashboard
  poll 3s, push on change         + SSH 60s backup          React + Three.js
```

## Quick Start

### Frontend
```bash
cd frontend
npm install
npm run dev -- --port 3100 --host 0.0.0.0
```

### Backend
```bash
cd backend
npm install
cp .env.example .env  # Fill in your tokens
npm run dev
```

### Activity Reporter (per server)
```bash
sudo cp scripts/activity-reporter.sh /opt/neural-grid/
sudo cp scripts/activity-reporter.service /etc/systemd/system/
sudo systemctl enable --now activity-reporter
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS 4, Framer Motion
- **Backend**: Node.js, Express, TypeScript, WebSocket (ws)
- **Infrastructure**: Tailscale mesh, SSH polling, systemd services
- **AI**: OpenClaw agents (Anthropic Claude Opus/Sonnet)

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Backend health check |
| `/api/servers` | GET | All servers with agents |
| `/api/mesh/registry` | GET | Flat agent list (31 agents) |
| `/api/mesh/send` | POST | One-shot message between agents |
| `/api/mesh/thread` | POST | Create conversation thread |
| `/api/mesh/threads` | GET | List threads |
| `/api/webhook/activity` | POST | Activity reporter webhook |
| `/ws` | WS | Real-time events |

## License

MIT
