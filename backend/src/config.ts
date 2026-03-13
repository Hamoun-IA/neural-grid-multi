import dotenv from 'dotenv';
import path from 'path';
import type { ServerConfig } from './types.js';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function getToken(key: string): string {
  const val = process.env[key];
  if (!val) {
    console.warn(`[config] Warning: token ${key} not found in environment`);
    return '';
  }
  return val;
}

export const SERVERS: ServerConfig[] = [
  {
    id: 'NOVA',
    name: 'Nova',
    ip: '100.118.127.18',
    port: 18789,
    token: getToken('TOKEN_NOVA'),
    sshUser: 'hamoun',
    sshSudo: true, // hamoun is not root, needs sudo
  },
  {
    id: 'STUDIO',
    name: 'Studio',
    ip: '100.85.162.13',
    port: 18789,
    token: getToken('TOKEN_STUDIO'),
    sshUser: 'root',
  },
  {
    id: 'BABOUNETTE',
    name: 'Babounette',
    ip: '100.66.209.98',
    port: 18789,
    token: getToken('TOKEN_BABOUNETTE'),
    sshUser: 'david',
  },
  {
    id: 'CYBERPUNK',
    name: 'Cyberpunk',
    ip: '100.76.173.17',
    port: 18789,
    token: getToken('TOKEN_CYBERPUNK'),
    sshUser: 'root',
  },
  {
    id: 'HOMELAB',
    name: 'Homelab',
    ip: '127.0.0.1',
    port: 18789,
    token: getToken('TOKEN_HOMELAB'),
    sshUser: null, // local — run commands directly
  },
  {
    id: 'TELENOVELAV3',
    name: 'TelenovelaV3',
    ip: '100.119.23.69',
    port: 18789,
    token: getToken('TOKEN_TELENOVELAV3'),
    sshUser: 'root',
    sshSudo: false,
  },
];

export const PORT = parseInt(process.env.PORT ?? '3101', 10);
export const POLL_INTERVAL_MS = 60_000; // 60s backup poll (webhooks handle real-time)
export const REQUEST_TIMEOUT_MS = 5_000;
export const SSH_TIMEOUT_S = 10;
