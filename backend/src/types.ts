export type ServerStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'UNKNOWN';
export type AgentStatus = 'IDLE' | 'ACTIVE' | 'BUSY';

export interface AgentInfo {
  id: string;
  name: string;
  emoji?: string;
  model: string;
  modelFriendly?: string;
  status: AgentStatus;
  sessionCount: number;
  activeSessions?: number;
  lastActiveAt?: string;
  lastAge?: string;
  // Reporter v2 enriched fields
  tokensUsed?: number;
  tokensMax?: number;
  tokensPct?: number;
  tokensTotalUsed?: number;
  tokensAllTime?: number;
  role?: string;
}

// System metrics from reporter v2
export interface SystemMetrics {
  cpu?: number;
  memUsedMB?: number;
  memTotalMB?: number;
  memPct?: number;
  diskUsedGB?: number;
  diskTotalGB?: number;
  diskPct?: number;
  uptimeHuman?: string;
  load1?: number;
  load5?: number;
  load15?: number;
}

// Agent data shape from reporter v2 webhook payload
export interface AgentReport {
  id: string;
  status: 'ACTIVE' | 'IDLE';
  lastAge: string;
  model?: string;
  modelFriendly?: string;
  tokensUsed?: number;
  tokensMax?: number;
  tokensPct?: number;
  tokensTotalUsed?: number;
  tokensAllTime?: number;
  role?: string;
  emoji?: string;
  sessionCount?: number;
  activeSessions?: number;
}

// Full report payload from reporter v2
export interface ActivityReport {
  serverId: string;
  agents: AgentReport[];
  agentCount?: number;
  activeCount?: number;
  system?: SystemMetrics;
  reporterVersion?: number;
  timestamp?: string;
}

export interface ServerState {
  id: string;
  name: string;
  ip: string;
  status: ServerStatus;
  agentCount: number;
  agents: AgentInfo[];
  latencyMs: number | null;
  lastSeen: string | null;
  error?: string;
  system?: SystemMetrics | null;
}

export interface ServerConfig {
  id: string;
  name: string;
  ip: string;
  port: number;
  token: string;
  sshUser: string | null; // null = local (no SSH)
  sshSudo?: boolean;       // whether to run commands with sudo
}

// OpenClaw gateway API response types
export interface GatewayHealthResponse {
  ok: boolean;
  status: string;
}

export interface GatewaySession {
  key: string;
  kind: string;
  channel: string;
  displayName: string;
  updatedAt: number;
  sessionId: string;
  model: string;
  contextTokens?: number;
  totalTokens?: number;
  label?: string;
}

export interface GatewaySessionsResult {
  count: number;
  sessions: GatewaySession[];
}

export interface GatewayToolsInvokeResponse {
  ok: boolean;
  result?: {
    content?: Array<{ type: string; text: string }>;
    details?: GatewaySessionsResult;
  };
  error?: { type: string; message: string };
}

// WebSocket events
export interface WsServerUpdateEvent {
  type: 'server_update';
  serverId: string;
  status: ServerStatus;
  agents: AgentInfo[];
  latencyMs: number | null;
  timestamp: string;
  system?: SystemMetrics | null;
  reporterVersion?: number;
}

export interface WsHeartbeatEvent {
  type: 'heartbeat';
  timestamp: string;
}

export interface WsMeshEvent {
  type: 'mesh_message';
  id: string;
  from: { agent: string; server: string };
  to: { agent: string; server: string };
  status: 'pending' | 'delivered' | 'failed';
  timestamp: string;
}

export type WsEvent = WsServerUpdateEvent | WsHeartbeatEvent | WsMeshEvent;
