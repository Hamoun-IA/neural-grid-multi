export interface ThreadMessage {
  id: string;           // uuid
  from: string;         // "agent@server" (e.g. "skillking@HOMELAB")
  to: string;           // "agent@server"
  content: string;      // le message envoyé
  response: string;     // la réponse de l'agent cible
  timestamp: string;    // ISO
  durationMs: number;   // temps de réponse SSH
}

export interface MeshThread {
  id: string;           // uuid
  participants: {
    a: { agent: string; server: string; name?: string; emoji?: string };
    b: { agent: string; server: string; name?: string; emoji?: string };
  };
  messages: ThreadMessage[];
  status: 'active' | 'closed' | 'error';
  mode: 'manual' | 'autonomous';  // manual = user writes each msg, autonomous = agents talk alone
  maxRounds: number;    // défaut 10
  currentRound: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  closeReason?: string; // 'user' | 'max_rounds' | 'timeout' | 'error'
  summary?: string;     // autonomous mode: final summary from agent A
}
