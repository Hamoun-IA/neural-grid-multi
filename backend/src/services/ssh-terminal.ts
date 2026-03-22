/**
 * SSH Terminal Service — WebSocket ↔ SSH bridge
 * Connects browser xterm.js to remote servers via SSH
 */
import { Client } from 'ssh2';
import type { WebSocket } from 'ws';
import { SERVERS } from '../config.js';

// SSH credentials per server (from TOOLS.md / Debug)
import { readFileSync } from 'fs';

const SSH_CREDS: Record<string, { host: string; username: string; password: string; openclaw_home: string; useKey?: boolean; sshPort?: number }> = {
  NOVA:       { host: '100.118.127.18', username: 'root',   password: '730eciPvx5xvhTNZ', openclaw_home: '/root/.openclaw' },
  STUDIO:     { host: '100.85.162.13',  username: 'root',   password: 'BaIsTa.91325',     openclaw_home: '/root/.openclaw' },
  BABOUNETTE: { host: '100.66.209.98',  username: 'root',   password: 'Babou1325',         openclaw_home: '/home/david/.openclaw' },
  CYBERPUNK:  { host: '100.76.173.17',  username: 'root',   password: 'BaIsTa.91325',     openclaw_home: '/root/.openclaw' },
  BOSS:       { host: '100.119.23.69',  username: 'root',   password: 'BaIsTa.91325',     openclaw_home: '/root/.openclaw', sshPort: 2222 },
  LAB:        { host: '100.65.134.91',  username: 'root',   password: 'BaIsTa.91325',     openclaw_home: '/root/.openclaw' },
  HOMELAB:    { host: '127.0.0.1',      username: 'root',   password: '',                    openclaw_home: '/root/.openclaw', useKey: true },
};

export function getSSHCreds(serverId: string) {
  return SSH_CREDS[serverId.toUpperCase()];
}

function sshConnectOpts(creds: typeof SSH_CREDS[string]) {
  const opts: any = { host: creds.host, port: creds.sshPort ?? 22, username: creds.username, readyTimeout: 10000 };
  if (creds.useKey) {
    try { opts.privateKey = readFileSync('/root/.ssh/id_ed25519'); } catch { /* fallback to password */ }
  }
  if (creds.password) opts.password = creds.password;
  return opts;
}

/**
 * Attach a WebSocket to an SSH shell session
 */
export function attachTerminal(ws: WebSocket, serverId: string): void {
  const creds = SSH_CREDS[serverId.toUpperCase()];
  if (!creds) {
    ws.send(JSON.stringify({ type: 'error', message: `Unknown server: ${serverId}` }));
    ws.close();
    return;
  }

  const conn = new Client();
  let shellStream: any = null;

  conn.on('ready', () => {
    ws.send(JSON.stringify({ type: 'status', message: 'connected' }));

    conn.shell({ term: 'xterm-256color', cols: 120, rows: 30 }, (err, stream) => {
      if (err) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
        ws.close();
        return;
      }
      shellStream = stream;

      // SSH → Browser
      stream.on('data', (data: Buffer) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(data);
        }
      });

      stream.stderr.on('data', (data: Buffer) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(data);
        }
      });

      stream.on('close', () => {
        ws.close();
        conn.end();
      });

      // Browser → SSH
      ws.on('message', (msg: Buffer | string) => {
        const str = msg.toString();
        // Handle resize messages
        try {
          const parsed = JSON.parse(str);
          if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
            stream.setWindow(parsed.rows, parsed.cols, 0, 0);
            return;
          }
        } catch {
          // Not JSON — raw terminal input
        }
        stream.write(msg);
      });
    });
  });

  conn.on('error', (err) => {
    ws.send(JSON.stringify({ type: 'error', message: `SSH error: ${err.message}` }));
    ws.close();
  });

  ws.on('close', () => {
    if (shellStream) shellStream.close();
    conn.end();
  });

  conn.connect(sshConnectOpts(creds));


}

/**
 * List files in a directory on a remote server
 */
export async function listFiles(serverId: string, path: string): Promise<{ name: string; type: 'file' | 'dir'; size: number; modified: string }[]> {
  const creds = SSH_CREDS[serverId.toUpperCase()];
  if (!creds) throw new Error(`Unknown server: ${serverId}`);

  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); return reject(err); }
        sftp.readdir(path, (err, list) => {
          conn.end();
          if (err) return reject(err);
          const items = list
            .filter(f => !f.filename.startsWith('.'))
            .map(f => ({
              name: f.filename,
              type: (f.attrs.isDirectory() ? 'dir' : 'file') as 'file' | 'dir',
              size: f.attrs.size,
              modified: new Date(f.attrs.mtime * 1000).toISOString(),
            }))
            .sort((a, b) => {
              if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
              return a.name.localeCompare(b.name);
            });
          resolve(items);
        });
      });
    });
    conn.on('error', (err) => reject(err));
    conn.connect(sshConnectOpts(creds));
  });
}

/**
 * Read a file from a remote server
 */
export async function readFile(serverId: string, filePath: string): Promise<string> {
  const creds = SSH_CREDS[serverId.toUpperCase()];
  if (!creds) throw new Error(`Unknown server: ${serverId}`);

  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); return reject(err); }
        let content = '';
        const stream = sftp.createReadStream(filePath, { encoding: 'utf8' });
        stream.on('data', (chunk: string) => { content += chunk; });
        stream.on('end', () => { conn.end(); resolve(content); });
        stream.on('error', (err: Error) => { conn.end(); reject(err); });
      });
    });
    conn.on('error', (err) => reject(err));
    conn.connect(sshConnectOpts(creds));
  });
}

/**
 * Write a file to a remote server
 */
export async function writeFile(serverId: string, filePath: string, content: string): Promise<void> {
  const creds = SSH_CREDS[serverId.toUpperCase()];
  if (!creds) throw new Error(`Unknown server: ${serverId}`);

  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) { conn.end(); return reject(err); }
        const stream = sftp.createWriteStream(filePath);
        stream.on('close', () => { conn.end(); resolve(); });
        stream.on('error', (err: Error) => { conn.end(); reject(err); });
        stream.end(content);
      });
    });
    conn.on('error', (err) => reject(err));
    conn.connect(sshConnectOpts(creds));
  });
}
