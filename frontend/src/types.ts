export interface Agent {
  id: string;
  name: string;
  emoji: string;
  model: 'Opus' | 'Sonnet' | string;
  status: 'IDLE' | 'THINKING' | 'FINISHED' | 'ACTIVE';
  sessionCount?: number;
  lastActiveAt?: string;
  lastAge?: string;
  // V2 fields
  modelFriendly?: string;
  tokensUsed?: number;
  tokensMax?: number;
  tokensPct?: number;
  tokensTotalUsed?: number;
  role?: string;
  activeSessions?: number;
}

export interface Server {
  id: string;
  name: string;
  color: string;
  ip: string;
  port: number;
  role: string;
  status: 'ONLINE' | 'BUSY' | 'OFFLINE';
  agents: Agent[];
  agentCount?: number;
  latencyMs?: number;
  lastSeen?: string;
  system?: {
    cpu?: number;
    memUsedMB?: number;
    memTotalMB?: number;
    memPct?: number;
    diskPct?: number;
    uptimeHuman?: string;
    load1?: number;
  };
}

/** Server with 3D layout position — used by the scene and ServerPanel */
export interface ServerLayoutItem extends Server {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
}

export interface MeshAgent {
  agent: string;
  agentName: string;
  emoji: string;
  model: string;
  server: string;
  serverName: string;
  ip: string;
  status: string;
}

// ─── Thread types ─────────────────────────────────────────────────────────
export interface ThreadMessage {
  id: string;
  from: string;         // "agent@SERVER"
  to: string;
  content: string;
  response: string;
  timestamp: string;
  durationMs: number;
}

export interface MeshThread {
  id: string;
  participants: {
    a: { agent: string; server: string; name?: string; emoji?: string };
    b: { agent: string; server: string; name?: string; emoji?: string };
  };
  messages: ThreadMessage[];
  status: 'active' | 'closed' | 'error';
  mode: 'manual' | 'autonomous';
  maxRounds: number;
  currentRound: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  closeReason?: string;
  summary?: string;
}

export interface MeshMessage {
  id: string;
  from: { agent: string; server: string };
  to: { agent: string; server: string };
  message: string;
  timestamp: string;
  status: 'pending' | 'delivered' | 'failed';
  response?: string;
  error?: string;
}
