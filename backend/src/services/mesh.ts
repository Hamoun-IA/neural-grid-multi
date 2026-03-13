import { exec } from 'child_process';
import { promisify } from 'util';
import { SERVERS } from '../config.js';

const execAsync = promisify(exec);

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

// In-memory history (last 100 messages)
const messageHistory: MeshMessage[] = [];

/**
 * Send a message from one agent to another across servers.
 * Uses SSH + `openclaw agent` CLI to deliver the message.
 */
export async function sendMeshMessage(
  fromAgent: string,
  fromServer: string,
  toAgent: string,
  toServer: string,
  message: string
): Promise<MeshMessage> {
  // 1. Find target server config
  const target = SERVERS.find(s => s.id === toServer.toUpperCase());
  if (!target) throw new Error(`Unknown server: ${toServer}`);

  // 2. Build SSH command to deliver message via openclaw agent CLI
  const prefixedMessage = `[MESH from ${fromAgent}@${fromServer}] ${message}`;
  const escapedMsg = prefixedMessage.replace(/'/g, "'\\''");

  let cmd: string;
  if (target.sshUser === null) {
    // Local (Homelab)
    cmd = `openclaw agent --agent ${toAgent} --message '${escapedMsg}' --json --timeout 60`;
  } else {
    const sshOpts = '-o ConnectTimeout=10 -o StrictHostKeyChecking=no -o BatchMode=yes';
    const sudoPrefix = target.sshSudo ? 'sudo ' : '';
    cmd = `ssh ${sshOpts} ${target.sshUser}@${target.ip} "${sudoPrefix}openclaw agent --agent ${toAgent} --message '${escapedMsg}' --json --timeout 60"`;
  }

  const msg: MeshMessage = {
    id: `mesh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    from: { agent: fromAgent, server: fromServer },
    to: { agent: toAgent, server: toServer },
    message,
    timestamp: new Date().toISOString(),
    status: 'pending',
  };

  try {
    const { stdout } = await execAsync(cmd, { timeout: 90000 });
    // Parse JSON response from openclaw agent
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      msg.response = result.payloads?.[0]?.text || 'No response';
      msg.status = 'delivered';
    } else {
      msg.response = stdout.trim().slice(0, 500);
      msg.status = 'delivered';
    }
  } catch (err) {
    msg.status = 'failed';
    msg.error = (err as Error).message?.slice(0, 200);
  }

  // Store in history
  messageHistory.unshift(msg);
  if (messageHistory.length > 100) messageHistory.pop();

  return msg;
}

export function getMessageHistory(limit = 50): MeshMessage[] {
  return messageHistory.slice(0, limit);
}

export function getRegistryFromServers(serversState: any[]): any[] {
  // Build a flat registry of all agents with their server
  const registry: any[] = [];
  for (const srv of serversState) {
    for (const agent of (srv.agents || [])) {
      registry.push({
        agent: agent.id,
        agentName: agent.name,
        emoji: agent.emoji,
        model: agent.model,
        server: srv.id,
        serverName: srv.name,
        ip: srv.ip,
        status: agent.status,
      });
    }
  }
  return registry;
}
