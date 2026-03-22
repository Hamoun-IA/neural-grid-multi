/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building } from './components/Building';
import InteriorView from './components/InteriorView';
import { MeshPanel } from './components/MeshPanel';
import { mockServers } from './data/mockServers';
import { Agent, Server, ServerLayoutItem } from './types';
import { fetchServers, connectWebSocket } from './services/api';

const GRID_SIZE = 1000;
const CELL_SIZE = 40;
const NUM_CELLS = GRID_SIZE / CELL_SIZE;

// ─── Static position data per server ─────────────────────────────────────
const SERVER_POSITIONS: Record<string, { x: number; y: number; w: number; d: number; h: number }> = {
  NOVA:          { x: 14 * CELL_SIZE, y: 14 * CELL_SIZE, w: CELL_SIZE * 2,   d: CELL_SIZE * 2,   h: 320 },
  BABOUNETTE:    { x:  8 * CELL_SIZE, y:  6 * CELL_SIZE, w: CELL_SIZE * 2,   d: CELL_SIZE * 2,   h: 250 },
  CYBERPUNK:     { x: 18 * CELL_SIZE, y:  8 * CELL_SIZE, w: CELL_SIZE * 1.5, d: CELL_SIZE * 1.5, h: 200 },
  STUDIO:        { x: 10 * CELL_SIZE, y: 12 * CELL_SIZE, w: CELL_SIZE * 1.5, d: CELL_SIZE * 1.5, h: 180 },
  HOMELAB:       { x:  6 * CELL_SIZE, y: 16 * CELL_SIZE, w: CELL_SIZE * 2,   d: CELL_SIZE * 2,   h: 140 },
  BOSS:            { x: 20 * CELL_SIZE, y: 16 * CELL_SIZE, w: CELL_SIZE * 1.5, d: CELL_SIZE * 1.5, h: 160 },
  LAB:           { x:  4 * CELL_SIZE, y: 10 * CELL_SIZE, w: CELL_SIZE * 1.2, d: CELL_SIZE * 1.2, h: 120 },
};

// Static color & role meta (visual identity — not from API)
const SERVER_META: Record<string, { color: string; port: number; role: string }> = {
  NOVA:       { color: '#00f0ff', port: 18789, role: 'Production principale' },
  STUDIO:     { color: '#ff00ff', port: 18789, role: 'Boss' },
  CYBERPUNK:  { color: '#00ff00', port: 18789, role: 'Main + Nexus' },
  BABOUNETTE: { color: '#ffea00', port: 18789, role: 'Pixie + assistants' },
  HOMELAB:       { color: '#b000ff', port: 18789, role: 'Monitoring + Mesh' },
  BOSS:            { color: '#ff4444', port: 18789, role: 'Boss' },
  LAB:           { color: '#44ffcc', port: 18789, role: 'Test Lab' },
};

// Build layout entry from a Server object
function buildLayout(srv: Server) {
  const pos = SERVER_POSITIONS[srv.id] ?? SERVER_POSITIONS.NOVA;
  const meta = SERVER_META[srv.id] ?? { color: '#00f0ff', port: 18789, role: '' };
  return { ...srv, ...pos, color: meta.color, port: meta.port, role: meta.role };
}

type LayoutServer = ServerLayoutItem & { port: number };

// Merge API data into mock servers (keeping visual fields from mock)
function mergeWithMock(apiData: Partial<Server>[]): Server[] {
  const merged = mockServers.map((mock) => {
    const live = apiData.find((s) => s.id === mock.id);
    if (!live) return mock;
    return {
      ...mock,
      ...live,
      // Always keep mock visual fields
      color: mock.color,
      port: mock.port,
      role: mock.role,
      // Merge agents: keep mock emojis for known agents, use API data otherwise
      agents: (live.agents && live.agents.length > 0) ? live.agents.map((apiAgent) => {
        const mockAgent = mock.agents.find((a) => a.id === apiAgent.id);
        return mockAgent ? { ...mockAgent, ...apiAgent, emoji: mockAgent.emoji } : apiAgent;
      }) : mock.agents,
    } as Server;
  });
  // Include any API servers not in mockServers (new servers added to backend)
  for (const live of apiData) {
    if (live.id && !merged.find((s) => s.id === live.id)) {
      const meta = SERVER_META[live.id] ?? { color: '#00f0ff', port: 18789, role: '' };
      merged.push({
        id: live.id, name: live.name ?? live.id,
        color: meta.color, ip: live.ip ?? '', port: meta.port, role: meta.role,
        status: live.status ?? 'ONLINE',
        agents: (live.agents ?? []) as Agent[],
        agentCount: live.agentCount ?? (live.agents ?? []).length,
      } as Server);
    }
  }
  return merged;
}

// ─── Cross-server log messages ────────────────────────────────────────────
// No fake logs — only real events from the API

// Format lastSeen to a short relative string
function formatLastSeen(iso?: string): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function App() {
  const [time, setTime] = useState(
    new Date().toLocaleTimeString('en-US', { hour12: false }),
  );
  const [logs, setLogs] = useState<
    { id: number; time: string; agent: string; msg: string; color: string }[]
  >([]);
  // Live server data (merged API + mock fallback)
  const [servers, setServers] = useState<Server[]>(mockServers);
  const [apiLive, setApiLive] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [lastWsMessage, setLastWsMessage] = useState<number>(Date.now());
  const [selectedServer, setSelectedServer] = useState<LayoutServer | null>(null);
  const [interiorView, setInteriorView] = useState(false);
  const [meshOpen, setMeshOpen] = useState(false);

  // Derived layout (servers with 3D positions)
  const serverLayout = useMemo<LayoutServer[]>(
    () => servers.map(buildLayout),
    [servers],
  );

  // serverStates only tracks OFFLINE/ONLINE from real API data (no simulation)
  const [serverStates, setServerStates] = useState<
    Record<string, 'ONLINE' | 'BUSY' | 'OFFLINE'>
  >(Object.fromEntries(mockServers.map((s) => [s.id, 'ONLINE'])));

  const [connections, setConnections] = useState<
    { id: string; from: LayoutServer; to: LayoutServer; color: string }[]
  >([]);

  // Track previous server statuses to detect changes
  const prevServersRef = useRef<Record<string, Server>>({});

  // ── Navigation State ──────────────────────────────────────────────────────
  const [rotation, setRotation] = useState({ x: 60, z: -45 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(() => window.innerWidth < 768 ? 0.4 : 1);
  const [lastPinchDistance, setLastPinchDistance] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'rotate' | 'pan' | null>(null);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const dragDistanceRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) setDragMode('rotate');
    else if (e.button === 1 || e.button === 2) setDragMode('pan');
    setIsDragging(true);
    dragDistanceRef.current = 0;
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragMode) return;
    const deltaX = e.clientX - lastMousePos.x;
    const deltaY = e.clientY - lastMousePos.y;
    dragDistanceRef.current += Math.abs(deltaX) + Math.abs(deltaY);
    if (dragMode === 'rotate') {
      setRotation((prev) => ({
        x: Math.max(0, Math.min(90, prev.x - deltaY * 0.5)),
        z: prev.z - deltaX * 0.5,
      }));
    } else {
      setPan((prev) => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
    }
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragMode(null);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setDragMode('rotate');
      setIsDragging(true);
      dragDistanceRef.current = 0;
      setLastPinchDistance(null);
      setLastMousePos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    } else if (e.touches.length === 2) {
      setDragMode('pan');
      setIsDragging(true);
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      setLastPinchDistance(Math.sqrt(dx * dx + dy * dy));
      setLastMousePos({
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && dragMode === 'rotate') {
      const deltaX = e.touches[0].clientX - lastMousePos.x;
      const deltaY = e.touches[0].clientY - lastMousePos.y;
      dragDistanceRef.current += Math.abs(deltaX) + Math.abs(deltaY);
      setRotation((prev) => ({
        x: Math.max(0, Math.min(90, prev.x - deltaY * 0.5)),
        z: prev.z - deltaX * 0.5,
      }));
      setLastMousePos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (lastPinchDistance !== null) {
        const scale = distance / lastPinchDistance;
        setZoom((prev) => Math.max(0.2, Math.min(5, prev * scale)));
      }
      setLastPinchDistance(distance);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const deltaX = midX - lastMousePos.x;
      const deltaY = midY - lastMousePos.y;
      setPan((prev) => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
      setLastMousePos({ x: midX, y: midY });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setDragMode(null);
    setLastPinchDistance(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    setZoom((prev) => Math.max(0.2, Math.min(5, prev - e.deltaY * 0.002)));
  };

  // ── Background buildings & vehicles (deterministic) ───────────────────────
  const { bgBuildings, vehicles } = useMemo(() => {
    const buildings: {
      id: number; x: number; y: number; w: number; d: number; h: number; color: string;
    }[] = [];
    let id = 0;
    const colors = ['#003366', '#004488', '#0055aa', '#0066cc'];

    for (let i = 1; i < NUM_CELLS; i += 2) {
      for (let j = 1; j < NUM_CELLS; j += 2) {
        const wCells = Math.floor(Math.random() * 2) + 1;
        const dCells = Math.floor(Math.random() * 2) + 1;

        let isStreet = false;
        for (let cx = i; cx < i + wCells; cx++)
          for (let cy = j; cy < j + dCells; cy++)
            if (cx % 5 === 0 || cy % 5 === 0) isStreet = true;
        if (isStreet) continue;

        const isNearServer = Object.values(SERVER_POSITIONS).some(
          (s) =>
            Math.abs(s.x / CELL_SIZE - i) < 3 &&
            Math.abs(s.y / CELL_SIZE - j) < 3,
        );
        if (!isNearServer && Math.random() > 0.1) {
          buildings.push({
            id: id++,
            x: i * CELL_SIZE,
            y: j * CELL_SIZE,
            w: wCells * CELL_SIZE,
            d: dCells * CELL_SIZE,
            h: Math.floor(Math.random() * 250) + 40,
            color: colors[Math.floor(Math.random() * colors.length)],
          });
        }
      }
    }

    const v = [];
    for (let i = 0; i < 60; i++) {
      const isHorizontal = Math.random() > 0.5;
      const streetIndex = Math.floor(Math.random() * (NUM_CELLS / 5)) * 5;
      const direction = Math.random() > 0.5 ? 1 : -1;
      const speed = Math.random() * 3 + 2;
      const laneOffset = (direction === 1 ? 1 : -1) * (CELL_SIZE / 4);
      v.push({
        id: i,
        x: isHorizontal
          ? direction === 1 ? -CELL_SIZE : GRID_SIZE + CELL_SIZE
          : streetIndex * CELL_SIZE + CELL_SIZE / 2 + laneOffset,
        y: isHorizontal
          ? streetIndex * CELL_SIZE + CELL_SIZE / 2 + laneOffset
          : direction === 1 ? -CELL_SIZE : GRID_SIZE + CELL_SIZE,
        targetX: isHorizontal
          ? direction === 1 ? GRID_SIZE + CELL_SIZE : -CELL_SIZE
          : streetIndex * CELL_SIZE + CELL_SIZE / 2 + laneOffset,
        targetY: isHorizontal
          ? streetIndex * CELL_SIZE + CELL_SIZE / 2 + laneOffset
          : direction === 1 ? GRID_SIZE + CELL_SIZE : -CELL_SIZE,
        duration: (GRID_SIZE / speed) / 20,
        color: direction === 1 ? '#0ff' : '#f00',
      });
    }
    return { bgBuildings: buildings, vehicles: v };
  }, []);

  // ── Clock + staleness ticker ──────────────────────────────────────────────
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Helper: add a log entry ────────────────────────────────────────────────
  const addLog = (agent: string, msg: string, color: string) => {
    setLogs((prev) => {
      const entry = {
        id: Date.now() + Math.random(),
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        agent,
        msg,
        color,
      };
      return [entry, ...prev].slice(0, 20);
    });
  };

  // ── API: initial load + WebSocket ─────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    // Initial fetch
    fetchServers()
      .then((apiData) => {
        if (!isMounted) return;
        const merged = mergeWithMock(apiData);
        setServers(merged);
        setApiLive(true);
        // Sync serverStates
        const newStates: Record<string, 'ONLINE' | 'BUSY' | 'OFFLINE'> = {};
        merged.forEach((s) => { newStates[s.id] = s.status === 'OFFLINE' ? 'OFFLINE' : 'ONLINE'; });
        setServerStates(newStates);
        // Init prevServers ref
        prevServersRef.current = Object.fromEntries(merged.map((s) => [s.id, s]));
        addLog('SYS', `API connected — ${merged.length} server(s) loaded`, '#00f0ff');
      })
      .catch(() => {
        if (!isMounted) return;
        addLog('SYS', 'API offline — using mock data', '#ff4444');
        addLog('SYS', '5 server(s) online · Tailscale mesh UP', '#555');
      });

    // WebSocket for real-time updates
    const cleanup = connectWebSocket(
      (event) => {
        if (!isMounted) return;

        setLastWsMessage(Date.now());

        if (event.type === 'heartbeat') {
          // Silently update server states from heartbeat if it includes servers
          if (event.servers) {
            setServers((prev) => {
              const merged = mergeWithMock(event.servers);
              return merged.length > 0 ? merged : prev;
            });
          }
          return;
        }

        if (event.type === 'server_update') {
          const raw = event.server ?? event.data ?? event;
          // Backend sends serverId, normalize to id
          if (raw.serverId && !raw.id) raw.id = raw.serverId;
          if (!raw?.id) return;

          setServers((prev) => {
            const idx = prev.findIndex((s) => s.id === raw.id);
            if (idx === -1) return prev;

            const oldServer = prev[idx];
            const meta = SERVER_META[raw.id] ?? { color: '#00f0ff', port: 18789, role: '' };

            // Build updated server
            const updated: Server = {
              ...oldServer,
              status: raw.status === 'OFFLINE' ? 'OFFLINE'
                : raw.status === 'BUSY' ? 'BUSY' : 'ONLINE',
              latencyMs: raw.latencyMs ?? oldServer.latencyMs,
              lastSeen: raw.lastSeen ?? oldServer.lastSeen,
              agentCount: raw.agentCount ?? oldServer.agentCount,
              agents: raw.agents ? raw.agents.map((a: any) => {
                const mockAgent = oldServer.agents.find((ma: any) => ma.id === a.id);
                return {
                  id: a.id,
                  name: a.name,
                  emoji: a.emoji || mockAgent?.emoji || '🤖',
                  model: a.model || mockAgent?.model || 'Sonnet',
                  status: (a.status?.toUpperCase() === 'ACTIVE' ? 'ACTIVE' : a.status?.toUpperCase() === 'THINKING' ? 'THINKING' : 'IDLE') as 'IDLE' | 'THINKING' | 'FINISHED' | 'ACTIVE',
                  sessionCount: a.sessionCount,
                  lastActiveAt: a.lastActiveAt,
                  // V2 fields
                  lastAge: a.lastAge,
                  modelFriendly: a.modelFriendly,
                  tokensUsed: a.tokensUsed,
                  tokensMax: a.tokensMax,
                  tokensPct: a.tokensPct,
                  tokensTotalUsed: a.tokensTotalUsed,
                  tokensAllTime: a.tokensAllTime,
                  role: a.role,
                  activeSessions: a.activeSessions,
                };
              }) : oldServer.agents,
              system: raw.system ?? oldServer.system,
            };

            // Generate logs from status changes
            const oldStatus = prevServersRef.current[raw.id]?.status;
            if (oldStatus && oldStatus !== updated.status) {
              if (updated.status === 'ONLINE') {
                addLog(raw.id, `↑ ONLINE`, meta.color);
              } else if (updated.status === 'OFFLINE') {
                addLog(raw.id, `↓ OFFLINE`, '#ff4444');
              }
            }

            // Log active agents
            updated.agents.forEach((agent) => {
              const oldAgent = (prevServersRef.current[raw.id]?.agents ?? []).find((a) => a.id === agent.id);
              if (agent.status === 'ACTIVE' && oldAgent?.status !== 'ACTIVE') {
                addLog(raw.id, `${agent.emoji} ${agent.name} — active`, meta.color);
              }
            });

            // Update prev ref
            const newPrev = { ...prevServersRef.current };
            newPrev[raw.id] = updated;
            prevServersRef.current = newPrev;

            // Update serverStates from real API data only
            setServerStates((prev) => ({
              ...prev,
              [raw.id]: updated.status === 'OFFLINE' ? 'OFFLINE' : 'ONLINE',
            }));

            const next = [...prev];
            next[idx] = updated;
            return next;
          });

          addLog('WS', `${raw.id} updated`, '#888');
        }
      },
      (live) => {
        if (!isMounted) return;
        setApiLive(live);
        setWsConnected(live);
        if (live) {
          setLastWsMessage(Date.now());
          addLog('SYS', 'WebSocket connected', '#00f0ff');
        } else {
          addLog('SYS', 'WebSocket disconnected — reconnecting…', '#ff8800');
        }
      },
    );

    return () => {
      isMounted = false;
      cleanup();
    };
  }, []);

  // Heartbeat logs removed — only real events shown

  // ── Inter-server connections (triggered by real mesh events via WebSocket) ──
  // Helper to trigger a particle connection between two servers
  const triggerConnection = useCallback((fromServerId: string, toServerId: string) => {
    const from = serverLayout.find((s) => s.id === fromServerId.toUpperCase());
    const to = serverLayout.find((s) => s.id === toServerId.toUpperCase());
    if (!from || !to || from.id === to.id) return;

    const connId = `${from.id}-${to.id}-${Date.now()}`;
    setConnections((curr) => [...curr, { id: connId, from, to, color: from.color }]);
    setTimeout(() => {
      setConnections((curr) => curr.filter((c) => c.id !== connId));
    }, 2500);
  }, [serverLayout]);

  // Listen to WebSocket for mesh events → trigger particles
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let ws: WebSocket | null = null;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      ws = new WebSocket(wsUrl);
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);

          // One-shot mesh message: particles from → to
          if (data.type === 'mesh_message' && data.from?.server && data.to?.server) {
            triggerConnection(data.from.server, data.to.server);
          }

          // Thread message: particles between participants
          if (data.type === 'mesh_thread' && data.message) {
            const msg = data.message;
            if (msg.from && msg.to) {
              // Extract server from "agent@SERVER" format
              const fromServer = msg.from.split('@')[1];
              const toServer = msg.to.split('@')[1];
              if (fromServer && toServer) {
                triggerConnection(fromServer, toServer);
              }
            }
          }

          // Particles only for real mesh communications (mesh_message, mesh_thread)
          // NOT for server_update/webhook — those are just status polling, not real traffic
        } catch { /* ignore */ }
      };
      ws.onclose = () => { if (!destroyed) setTimeout(connect, 5000); };
    }
    connect();

    return () => { destroyed = true; ws?.close(); };
  }, [triggerConnection]);

  return (
    <div className="w-screen h-screen bg-[#050505] text-white overflow-hidden font-mono relative selection:bg-cyan-900">
      {/* ── 3D Scene ─────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 flex items-center justify-center perspective-[1500px]"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          cursor: dragMode === 'rotate' ? 'grabbing' : dragMode === 'pan' ? 'move' : 'grab',
        }}
      >
        <motion.div
          className="relative transform-style-3d"
          style={{
            width: GRID_SIZE,
            height: GRID_SIZE,
            transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
          }}
        >
          <div
            className="absolute inset-0 transform-style-3d"
            style={{ transform: `rotateX(${rotation.x}deg) rotateZ(${rotation.z}deg)` }}
          >
            {/* Grid Floor */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `linear-gradient(rgba(0, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px)`,
                backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
                boxShadow: 'inset 0 0 200px #050505',
              }}
            />

            {/* Background Buildings */}
            {bgBuildings.map((b) => (
              <Building key={`bg-${b.id}`} {...b} color={b.color} opacity={0.15} />
            ))}

            {/* Vehicles */}
            {vehicles.map((v) => (
              <motion.div
                key={`v-${v.id}`}
                className="absolute rounded-full"
                style={{
                  width: 4,
                  height: 4,
                  backgroundColor: v.color,
                  boxShadow: `0 0 10px 2px ${v.color}`,
                  transformStyle: 'preserve-3d',
                  transform: 'translateZ(2px)',
                }}
                initial={{ left: v.x, top: v.y }}
                animate={{ left: v.targetX, top: v.targetY }}
                transition={{
                  duration: v.duration,
                  repeat: Infinity,
                  ease: 'linear',
                  delay: Math.random() * v.duration,
                }}
              />
            ))}

            {/* Server Buildings — active/glowing ONLY if at least one agent is ACTIVE */}
            {serverLayout.map((srv) => {
              const hasActiveAgent = srv.agents.some((a) => a.status === 'ACTIVE');
              return (
                <div
                  key={srv.id}
                  onClick={(e) => { e.stopPropagation(); if (dragDistanceRef.current < 5) { setSelectedServer(srv); setInteriorView(true); } }}
                  style={{ cursor: 'pointer', position: 'absolute', left: srv.x, top: srv.y, width: srv.w, height: srv.d, transformStyle: 'preserve-3d' }}
                >
                  <Building
                    x={0}
                    y={0}
                    w={srv.w}
                    d={srv.d}
                    h={srv.h}
                    color={srv.color}
                    active={hasActiveAgent}
                    glowing={hasActiveAgent}
                    label={srv.id}
                    role={srv.role}
                    agentCount={srv.agentCount ?? srv.agents.length}
                    status={serverStates[srv.id]}
                    rotation={rotation}
                  />
                </div>
              );
            })}

            {/* Inter-server Connections / Particle Flows */}
            {connections.map((conn) => (
              <React.Fragment key={conn.id}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <motion.div
                    key={`${conn.id}-${i}`}
                    className="absolute top-0 left-0 rounded-full"
                    style={{
                      width: 6,
                      height: 6,
                      backgroundColor: conn.color,
                      boxShadow: `0 0 15px 3px ${conn.color}`,
                      transformStyle: 'preserve-3d',
                    }}
                    initial={{
                      x: conn.from.x + conn.from.w / 2,
                      y: conn.from.y + conn.from.d / 2,
                      z: conn.from.h + 20,
                    }}
                    animate={{
                      x: [conn.from.x + conn.from.w / 2, conn.to.x + conn.to.w / 2],
                      y: [conn.from.y + conn.from.d / 2, conn.to.y + conn.to.d / 2],
                      z: [
                        conn.from.h + 20,
                        Math.max(conn.from.h, conn.to.h) + 250,
                        conn.to.h + 20,
                      ],
                    }}
                    transition={{
                      x: { duration: 1.2, repeat: Infinity, delay: i * 0.1, ease: 'linear' },
                      y: { duration: 1.2, repeat: Infinity, delay: i * 0.1, ease: 'linear' },
                      z: {
                        duration: 1.2,
                        repeat: Infinity,
                        delay: i * 0.1,
                        times: [0, 0.5, 1],
                        ease: ['easeOut', 'easeIn'],
                      },
                    }}
                  />
                ))}
              </React.Fragment>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ── UI Overlay ───────────────────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6">
        {/* Top Bar */}
        <div className="flex justify-between items-start">
          <div>
            <div
              className="text-2xl md:text-4xl font-bold text-cyan-400 tracking-wider mb-1"
              style={{ textShadow: '0 0 10px rgba(0,240,255,0.5)' }}
            >
              {time}
            </div>
            <div className="text-[8px] md:text-xs text-cyan-600 tracking-widest uppercase mb-2">
              OPENCLAW // NEURAL GRID
            </div>
            <button
              onClick={() => setMeshOpen(true)}
              className="pointer-events-auto flex items-center gap-1.5 px-2 py-1 text-[10px] tracking-widest font-bold transition-all duration-150"
              style={{
                border: '1px solid rgba(0,240,255,0.4)',
                color: '#00f0ff',
                background: 'rgba(0,240,255,0.05)',
                textShadow: '0 0 6px rgba(0,240,255,0.4)',
                boxShadow: '0 0 8px rgba(0,240,255,0.1)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 16px rgba(0,240,255,0.35)';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,240,255,0.12)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 8px rgba(0,240,255,0.1)';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,240,255,0.05)';
              }}
            >
              <span>📡</span>
              <span>MESH COM</span>
            </button>
          </div>
          {/* API Live indicator */}
          <div
            className="flex items-center space-x-2 bg-black/50 px-3 py-1 border rounded-full backdrop-blur-md"
            style={{ borderColor: apiLive ? '#22c55e33' : '#ff444433' }}
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: apiLive ? '#22c55e' : '#ff4444',
                boxShadow: apiLive ? '0 0 8px #00ff00' : '0 0 8px #ff4444',
                animation: apiLive ? 'pulse 2s infinite' : 'none',
              }}
            />
            <span
              className="text-xs font-bold tracking-widest"
              style={{ color: apiLive ? '#22c55e' : '#ff4444' }}
            >
              {apiLive ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>

        {/* Bottom Server Panel */}
        <div className="flex md:justify-center space-x-3 mb-4 z-10 md:flex-wrap md:gap-y-2 overflow-x-auto md:overflow-x-visible flex-nowrap md:flex-wrap px-2 md:px-0 pb-1 md:pb-0">
          {serverLayout.map((srv) => {
            const isOffline = (serverStates[srv.id] ?? srv.status) === 'OFFLINE';
            const activeAgents = srv.agents.filter((a) => a.status === 'ACTIVE');
            const hasActiveAgent = activeAgents.length > 0;
            return (
              <div
                key={srv.id}
                className="w-[120px] md:w-44 shrink-0 md:shrink bg-[#050508]/90 backdrop-blur-md p-3 relative pointer-events-auto transition-all duration-300 flex flex-col justify-start"
                onClick={() => { setSelectedServer(srv); setInteriorView(true); }}
                style={{
                  border: `1px solid ${srv.color}40`,
                  boxShadow: hasActiveAgent ? `0 0 20px ${srv.color}20` : isOffline ? '0 0 10px #ff000020' : 'none',
                  opacity: isOffline ? 0.6 : hasActiveAgent ? 1 : 0.5,
                  cursor: 'pointer',
                }}
              >
                {/* Corner Accents */}
                {(['top-0 left-0 border-t-2 border-l-2', 'top-0 right-0 border-t-2 border-r-2', 'bottom-0 left-0 border-b-2 border-l-2', 'bottom-0 right-0 border-b-2 border-r-2'] as const).map(
                  (cls, ci) => (
                    <div
                      key={ci}
                      className={`absolute w-2 h-2 ${cls}`}
                      style={{ borderColor: isOffline ? '#ff4444' : srv.color }}
                    />
                  ),
                )}

                {/* Server Name */}
                <div
                  className="font-bold text-base tracking-wider mb-0.5"
                  style={{
                    color: '#fff',
                    textShadow: isOffline
                      ? '0 0 5px #ff4444'
                      : hasActiveAgent
                        ? `0 0 5px ${srv.color}, 0 0 10px ${srv.color}, 0 0 20px ${srv.color}`
                        : 'none',
                  }}
                >
                  {srv.name}
                </div>

                {/* Role */}
                <div className="text-[9px] tracking-wider mb-1" style={{ color: isOffline ? '#ff6666' : srv.color }}>
                  {srv.role}
                </div>

                {/* IP — hidden on mobile */}
                <div className="hidden md:block text-[9px] text-gray-500 font-mono mb-1">
                  {srv.ip}
                </div>

                {/* Agent count + Status */}
                <div className="text-[9px] text-gray-300 font-mono tracking-widest mb-1 flex items-center justify-between">
                  <span style={{ color: srv.color }}>
                    {srv.agentCount ?? srv.agents.length} agents
                    {hasActiveAgent && (
                      <span className="ml-1" style={{ color: '#ffea00' }}>
                        ({activeAgents.length} active)
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: isOffline ? '#ff4444' : hasActiveAgent ? srv.color : '#22c55e',
                        boxShadow: isOffline ? '0 0 6px #ff4444' : hasActiveAgent ? `0 0 6px ${srv.color}` : '0 0 6px #22c55e',
                      }}
                    />
                    {isOffline ? 'OFFLINE' : hasActiveAgent ? 'ACTIVE' : 'ONLINE'}
                    {hasActiveAgent && (
                      <motion.span
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        style={{ color: srv.color }}
                      >
                        _
                      </motion.span>
                    )}
                  </span>
                </div>

                {/* Latency */}
                {srv.latencyMs !== undefined && (
                  <div className="text-[9px] text-gray-500 font-mono mb-1">
                    latency: <span style={{ color: srv.latencyMs < 100 ? '#22c55e' : srv.latencyMs < 300 ? '#ffea00' : '#ff4444' }}>{srv.latencyMs}ms</span>
                  </div>
                )}

                {/* Last seen */}
                {srv.lastSeen && (
                  <div className="text-[9px] text-gray-600 font-mono mb-2">
                    {formatLastSeen(srv.lastSeen)}
                  </div>
                )}

                {/* Activity indicator */}
                <div className="relative h-[2px] w-8 bg-gray-800 overflow-hidden">
                  {hasActiveAgent ? (
                    <motion.div
                      className="absolute top-0 left-0 h-full"
                      style={{ backgroundColor: srv.color, boxShadow: `0 0 5px ${srv.color}` }}
                      initial={{ width: '0%', x: '-100%' }}
                      animate={{ width: '100%', x: '100%' }}
                      transition={{ duration: 1.5, ease: 'linear', repeat: Infinity }}
                    />
                  ) : (
                    <div
                      className="absolute top-0 left-0 h-full w-2"
                      style={{ backgroundColor: `${srv.color}40` }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right Log Panel — hidden on mobile ───────────────────────────── */}
      <div className="hidden md:flex absolute right-6 top-24 bottom-24 w-80 pointer-events-none flex-col justify-end">
        <div className="space-y-2 overflow-hidden flex flex-col-reverse">
          {logs.map((log) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-xs flex space-x-2 font-mono"
            >
              <span className="text-gray-500 shrink-0">{log.time}</span>
              <span className="font-bold shrink-0" style={{ color: log.color }}>
                {log.agent}
              </span>
              <span className="text-gray-300 truncate">{log.msg}</span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Interior View (replaces ServerPanel) ─────────────────────────── */}
      <AnimatePresence>
        {selectedServer && interiorView && (
          <InteriorView
            server={selectedServer}
            onClose={() => { setInteriorView(false); setSelectedServer(null); }}
          />
        )}
      </AnimatePresence>

      {/* ── Mesh Comlink Panel ────────────────────────────────────────────── */}
      {meshOpen && <MeshPanel onClose={() => setMeshOpen(false)} />}

      {/* ── WS Staleness Badge ───────────────────────────────────────────── */}
      {(() => {
        const secondsAgo = Math.floor((now - lastWsMessage) / 1000);
        const isStale = wsConnected && secondsAgo > 30;
        const badgeColor = !wsConnected ? '#ff4444' : isStale ? '#ffea00' : '#22c55e';
        const badgeBg = !wsConnected ? 'rgba(255,68,68,0.15)' : isStale ? 'rgba(255,234,0,0.15)' : 'rgba(34,197,94,0.12)';
        const badgeBorder = !wsConnected ? 'rgba(255,68,68,0.4)' : isStale ? 'rgba(255,234,0,0.4)' : 'rgba(34,197,94,0.3)';
        const label = !wsConnected
          ? '⚠ OFFLINE'
          : isStale
          ? `⚠ STALE (${secondsAgo}s ago)`
          : '● LIVE';
        return (
          <motion.div
            key={!wsConnected ? 'offline' : isStale ? 'stale' : 'live'}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="fixed top-4 right-4 z-50 font-mono text-xs px-3 py-1 rounded-full backdrop-blur-md select-none"
            style={{
              color: badgeColor,
              background: badgeBg,
              border: `1px solid ${badgeBorder}`,
              textShadow: `0 0 6px ${badgeColor}80`,
              boxShadow: `0 0 10px ${badgeColor}20`,
            }}
          >
            {label}
          </motion.div>
        );
      })()}
    </div>
  );
}
