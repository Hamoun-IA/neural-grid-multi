/**
 * WebTerminal — xterm.js SSH terminal in the browser
 */
import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface WebTerminalProps {
  serverId: string;
  serverColor: string;
}

export default function WebTerminal({ serverId, serverColor }: WebTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Fira Code, monospace',
      theme: {
        background: '#0a0a0f',
        foreground: '#e0e0e0',
        cursor: serverColor,
        selectionBackground: `${serverColor}40`,
      },
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);

    // Fit after a small delay for layout
    setTimeout(() => fitAddon.fit(), 100);

    term.writeln(`\x1b[36m⚡ Connecting to ${serverId}...\x1b[0m`);

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal?server=${serverId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.binaryType = 'arraybuffer';

    ws.onmessage = (ev) => {
      const data = ev.data;
      if (typeof data === 'string') {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'status' && msg.message === 'connected') {
            term.writeln(`\x1b[32m✓ Connected to ${serverId}\x1b[0m\r\n`);
            // Send initial resize
            ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
            return;
          }
          if (msg.type === 'error') {
            term.writeln(`\x1b[31m✗ ${msg.message}\x1b[0m`);
            return;
          }
        } catch {
          // Plain text data from SSH
          term.write(data);
        }
      } else {
        term.write(new Uint8Array(data));
      }
    };

    ws.onerror = () => {
      term.writeln('\x1b[31m✗ Connection error\x1b[0m');
    };

    ws.onclose = () => {
      term.writeln('\r\n\x1b[33m⚠ Disconnected\x1b[0m');
    };

    // Terminal input → WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    });
    resizeObserver.observe(containerRef.current);

    termRef.current = term;

    return () => {
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
    };
  }, [serverId, serverColor]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[300px]"
      style={{ backgroundColor: '#0a0a0f' }}
    />
  );
}
