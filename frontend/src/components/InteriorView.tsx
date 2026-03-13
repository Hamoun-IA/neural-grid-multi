/**
 * InteriorView V4 — 3D Tower with stacked cubes
 * Each floor = 1 agent rendered as a CSS 3D cube.
 * Drag to rotate, scroll to zoom, click a floor for details.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ServerLayoutItem, Agent } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────
const FLOOR_W = 260;
const FLOOR_D = 180;
const FLOOR_H = 44;
const GAP = 6;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hexToRgb(hex: string): string {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? `${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}` : '0, 255, 255';
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function useIsMobile(): boolean {
  const [m, setM] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return m;
}

// ─── Floor Cube ───────────────────────────────────────────────────────────────
interface FloorCubeProps {
  agent: Agent;
  index: number;
  total: number;
  color: string;
  rgb: string;
  isSelected: boolean;
  onClick: () => void;
}

const FloorCube: React.FC<FloorCubeProps> = ({ agent, index, total, color, rgb, isSelected, onClick }) => {
  const isActive = agent.status === 'ACTIVE' || agent.status === 'THINKING';
  const z = index * (FLOOR_H + GAP);

  const baseBorder = isSelected
    ? `1.5px solid rgba(${rgb}, 0.9)`
    : isActive
      ? `1px solid rgba(${rgb}, 0.45)`
      : '1px solid rgba(100, 100, 140, 0.15)';

  const activeBg = `rgba(${rgb}, 0.1)`;
  const idleBg = 'rgba(8, 8, 18, 0.35)';
  const bg = isActive ? activeBg : idleBg;
  const topBg = isActive ? `rgba(${rgb}, 0.18)` : 'rgba(10, 10, 20, 0.25)';

  const glowShadow = isActive
    ? `0 0 25px rgba(${rgb}, 0.25), inset 0 0 20px rgba(${rgb}, 0.1)`
    : 'none';
  const selectedShadow = isSelected
    ? `0 0 40px rgba(${rgb}, 0.4), inset 0 0 25px rgba(${rgb}, 0.15)`
    : glowShadow;

  return (
    <motion.div
      initial={{ opacity: 0, z: z - 40 }}
      animate={{ opacity: 1, z }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: 'easeOut' }}
      style={{
        position: 'absolute',
        width: FLOOR_W,
        height: FLOOR_D,
        left: -FLOOR_W / 2,
        top: -FLOOR_D / 2,
        transform: `translateZ(${z}px)`,
        transformStyle: 'preserve-3d',
        cursor: 'pointer',
      }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* TOP face */}
      <div
        style={{
          position: 'absolute',
          width: FLOOR_W,
          height: FLOOR_D,
          transform: `translateZ(${FLOOR_H}px)`,
          background: topBg,
          border: baseBorder,
          boxShadow: selectedShadow,
          backfaceVisibility: 'hidden',
        }}
      >
        {/* Dot-grid pattern on top */}
        <div style={{
          position: 'absolute', inset: 0, opacity: isActive ? 0.3 : 0.08,
          backgroundImage: `radial-gradient(${color} 1px, transparent 1px)`,
          backgroundSize: '6px 6px',
        }} />
        {/* Agent label on top face */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 6, pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 16 }}>{agent.emoji}</span>
          <span style={{
            fontSize: 10, fontWeight: 'bold', color: '#fff',
            textShadow: isActive ? `0 0 8px rgba(${rgb}, 0.6)` : 'none',
            letterSpacing: '0.05em',
          }}>
            {agent.name}
          </span>
          {isActive && (
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              backgroundColor: '#22c55e',
              boxShadow: '0 0 6px #22c55e',
              animation: 'pulse 2s infinite',
            }} />
          )}
        </div>
      </div>

      {/* BOTTOM face */}
      <div style={{
        position: 'absolute', width: FLOOR_W, height: FLOOR_D,
        background: 'rgba(5, 5, 12, 0.5)',
        border: '1px solid rgba(60, 60, 80, 0.08)',
        backfaceVisibility: 'hidden',
        transform: 'rotateY(180deg)',
      }} />

      {/* FRONT face */}
      <div style={{
        position: 'absolute', width: FLOOR_W, height: FLOOR_H,
        transformOrigin: 'bottom',
        transform: `rotateX(-90deg) translateZ(${FLOOR_D}px)`,
        background: bg,
        border: baseBorder,
        boxShadow: isActive ? `inset 0 0 15px rgba(${rgb}, 0.08)` : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        backfaceVisibility: 'hidden',
      }}>
        <span style={{ fontSize: 13 }}>{agent.emoji}</span>
        <span style={{
          fontSize: 9, color: isActive ? '#fff' : '#666',
          fontWeight: isActive ? 600 : 400,
          textShadow: isActive ? `0 0 6px rgba(${rgb}, 0.5)` : 'none',
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          {agent.name}
        </span>
        <span style={{
          fontSize: 7, color: isActive ? color : '#444',
          padding: '1px 4px',
          border: `1px solid ${isActive ? color + '40' : '#333'}`,
          borderRadius: 2,
        }}>
          {agent.model}
        </span>
      </div>

      {/* BACK face */}
      <div style={{
        position: 'absolute', width: FLOOR_W, height: FLOOR_H,
        transformOrigin: 'bottom', transform: 'rotateX(-90deg)',
        background: isActive ? `rgba(${rgb}, 0.06)` : 'rgba(8, 8, 18, 0.25)',
        border: baseBorder,
        backfaceVisibility: 'hidden',
      }} />

      {/* LEFT face */}
      <div style={{
        position: 'absolute', width: FLOOR_D, height: FLOOR_H,
        transformOrigin: 'bottom left',
        transform: 'rotateY(90deg) rotateX(-90deg)',
        background: isActive ? `rgba(${rgb}, 0.06)` : 'rgba(8, 8, 18, 0.25)',
        border: baseBorder,
        backfaceVisibility: 'hidden',
      }}>
        {/* Floor number */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 8, color: isActive ? color : '#444',
          letterSpacing: '0.1em', fontWeight: 600,
          textShadow: isActive ? `0 0 6px rgba(${rgb}, 0.4)` : 'none',
        }}>
          FL.{index + 1}
        </div>
      </div>

      {/* RIGHT face */}
      <div style={{
        position: 'absolute', width: FLOOR_D, height: FLOOR_H,
        transformOrigin: 'bottom left',
        transform: `rotateY(90deg) rotateX(-90deg) translateZ(${FLOOR_W}px)`,
        background: isActive ? `rgba(${rgb}, 0.06)` : 'rgba(8, 8, 18, 0.25)',
        border: baseBorder,
        backfaceVisibility: 'hidden',
      }} />

      {/* Glow beam for active floors */}
      {isActive && (
        <motion.div
          animate={{ opacity: [0.15, 0.3, 0.15] }}
          transition={{ duration: 2, repeat: Infinity }}
          style={{
            position: 'absolute',
            width: FLOOR_W - 20, height: FLOOR_D - 20,
            left: 10, top: 10,
            transform: `translateZ(${FLOOR_H + 1}px)`,
            background: `radial-gradient(ellipse, rgba(${rgb}, 0.2), transparent 70%)`,
            pointerEvents: 'none',
          }}
        />
      )}
    </motion.div>
  );
};

// ─── Detail Panel ─────────────────────────────────────────────────────────────
interface DetailPanelProps {
  agent: Agent | null;
  floorIndex: number;
  total: number;
  color: string;
  rgb: string;
  serverName: string;
  isMobile: boolean;
}

const DetailPanel: React.FC<DetailPanelProps> = ({ agent, floorIndex, total, color, rgb, serverName, isMobile }) => {
  // Activity bar mock data (seeded by agent name for consistency)
  const bars = useMemo(() => {
    if (!agent) return [];
    let seed = 0;
    for (let i = 0; i < agent.id.length; i++) seed += agent.id.charCodeAt(i);
    return Array.from({ length: 24 }, (_, i) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return agent.status === 'ACTIVE' && i >= 20 ? 60 + (seed % 40) : seed % 80;
    });
  }, [agent]);

  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '38%',
        background: 'rgba(5, 5, 10, 0.97)', borderTop: `1px solid rgba(${rgb}, 0.3)`,
        backdropFilter: 'blur(12px)', overflowY: 'auto', zIndex: 20,
      }
    : {
        width: 320, height: '100%', flexShrink: 0,
        background: 'rgba(5, 5, 10, 0.97)', borderLeft: `1px solid rgba(${rgb}, 0.3)`,
        backdropFilter: 'blur(12px)', overflowY: 'auto', position: 'relative',
      };

  return (
    <motion.div
      initial={isMobile ? { y: 200, opacity: 0 } : { x: 300, opacity: 0 }}
      animate={isMobile ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
      exit={isMobile ? { y: 200, opacity: 0 } : { x: 300, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={panelStyle}
    >
      {/* Corner accents */}
      {[
        { top: 0, left: 0, borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` },
        { top: 0, right: 0, borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` },
        { bottom: 0, left: 0, borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` },
        { bottom: 0, right: 0, borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` },
      ].map((s, i) => (
        <div key={i} style={{ position: 'absolute', width: 12, height: 12, ...s, zIndex: 5 }} />
      ))}

      {/* Scanlines */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.4,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.15) 3px, rgba(0,0,0,0.15) 4px)',
      }} />

      {!agent ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100%', color: '#555', fontSize: 12, letterSpacing: '0.1em',
        }}>
          CLICK A FLOOR TO INSPECT
        </div>
      ) : (
        <div style={{ padding: 20, position: 'relative', zIndex: 2 }}>
          {/* Agent header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <span style={{ fontSize: 36 }}>{agent.emoji}</span>
            <div>
              <div style={{
                fontSize: 18, fontWeight: 700, color: '#fff',
                textShadow: `0 0 10px rgba(${rgb}, 0.4)`,
                letterSpacing: '0.05em',
              }}>
                {agent.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  backgroundColor: agent.status === 'ACTIVE' ? '#22c55e' : '#555',
                  boxShadow: agent.status === 'ACTIVE' ? '0 0 8px #22c55e' : 'none',
                  animation: agent.status === 'ACTIVE' ? 'pulse 2s infinite' : 'none',
                }} />
                <span style={{
                  fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
                  color: agent.status === 'ACTIVE' ? '#22c55e' : '#888',
                }}>
                  {agent.status}
                </span>
              </div>
            </div>
          </div>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            <div style={{
              background: 'rgba(15, 15, 25, 0.8)', border: '1px solid #222',
              padding: 12, borderRadius: 4,
            }}>
              <div style={{ fontSize: 9, color: '#666', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4 }}>
                MODEL
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                {agent.model}
              </div>
            </div>
            <div style={{
              background: 'rgba(15, 15, 25, 0.8)', border: '1px solid #222',
              padding: 12, borderRadius: 4,
            }}>
              <div style={{ fontSize: 9, color: '#666', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4 }}>
                FLOOR
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                {floorIndex + 1} / {total}
              </div>
            </div>
          </div>

          {/* Activity bar */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 8 }}>
              ⚡ ACTIVITY
            </div>
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 2, height: 40,
              background: 'rgba(10, 10, 20, 0.5)', padding: '4px 6px',
              border: '1px solid #1a1a2e', borderRadius: 2,
            }}>
              {bars.map((h, i) => (
                <div key={i} style={{
                  flex: 1, height: `${h}%`,
                  backgroundColor: color,
                  opacity: i >= 20 && agent.status === 'ACTIVE' ? 0.9 : 0.3,
                  borderRadius: 1,
                  boxShadow: i >= 20 && agent.status === 'ACTIVE' ? `0 0 4px ${color}` : 'none',
                }} />
              ))}
            </div>
          </div>

          {/* Agent info */}
          <div>
            <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.12em', marginBottom: 10 }}>
              📋 AGENT INFO
            </div>
            {[
              ['Status', agent.status],
              ['Model', agent.model],
              ['Sessions', String(agent.sessionCount ?? 0)],
              ['Last Active', formatTime(agent.lastActiveAt) || 'N/A'],
              ['Server', serverName],
            ].map(([k, v]) => (
              <div key={k} style={{
                display: 'flex', justifyContent: 'space-between', padding: '5px 0',
                borderBottom: '1px solid #111', fontSize: 11,
              }}>
                <span style={{ color: '#555' }}>{k}</span>
                <span style={{ color: '#fff' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
interface InteriorViewProps {
  server: ServerLayoutItem | null;
  onClose: () => void;
}

export default function InteriorView({ server, onClose }: InteriorViewProps) {
  const isMobile = useIsMobile();
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [rotX, setRotX] = useState(-25);
  const [rotY, setRotY] = useState(-35);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const dragDist = useRef(0);

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!server) return null;

  const color = server.color;
  const rgb = hexToRgb(color);

  // Sort agents: ACTIVE on top (highest floor)
  const sortedAgents = [...server.agents].sort((a, b) => {
    const order = { ACTIVE: 0, THINKING: 1, FINISHED: 2, IDLE: 3 };
    return (order[b.status] ?? 3) - (order[a.status] ?? 3);
  });

  const selectedAgent = selectedIdx !== null ? sortedAgents[selectedIdx] : null;
  const towerH = sortedAgents.length * (FLOOR_H + GAP);

  // Mouse handlers for rotation
  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
    dragDist.current = 0;
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    dragDist.current += Math.abs(dx) + Math.abs(dy);
    setRotY(prev => prev + dx * 0.4);
    setRotX(prev => Math.max(-60, Math.min(10, prev - dy * 0.3)));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseUp = () => setDragging(false);

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    dragDist.current = 0;
    setDragging(true);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - lastPos.current.x;
    const dy = e.touches[0].clientY - lastPos.current.y;
    dragDist.current += Math.abs(dx) + Math.abs(dy);
    setRotY(prev => prev + dx * 0.4);
    setRotX(prev => Math.max(-60, Math.min(10, prev - dy * 0.3)));
    lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = () => setDragging(false);

  // Scroll zoom
  const handleWheel = (e: React.WheelEvent) => {
    setZoom(prev => Math.max(0.4, Math.min(2.2, prev + e.deltaY * -0.001)));
  };

  const statusColor = server.status === 'ONLINE' ? '#22c55e' : server.status === 'OFFLINE' ? '#ff4444' : '#ffaa00';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: '#050505',
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
      }}
    >
      {/* Inject CSS animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      {/* ── Header overlay ── */}
      <div style={{
        position: 'absolute', top: 16, left: 20, zIndex: 30,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: `1px solid rgba(${rgb}, 0.3)`,
              color: '#fff', fontSize: 18, cursor: 'pointer',
              padding: '4px 10px', borderRadius: 4,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.boxShadow = `0 0 12px rgba(${rgb}, 0.4)`;
              (e.target as HTMLElement).style.borderColor = color;
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.boxShadow = 'none';
              (e.target as HTMLElement).style.borderColor = `rgba(${rgb}, 0.3)`;
            }}
          >
            ←
          </button>
          <div>
            <div style={{
              fontSize: 14, fontWeight: 700, letterSpacing: '0.3em',
              textTransform: 'uppercase', color: '#fff',
              textShadow: `0 0 10px rgba(${rgb}, 0.3)`,
            }}>
              SERVER FACILITY — {server.name}
            </div>
            <div style={{ fontSize: 10, color: '#555', letterSpacing: '0.1em', marginTop: 2 }}>
              {server.role}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.08em', marginLeft: 52 }}>
          {isMobile ? 'Touch + Drag to Rotate' : 'Left Click + Drag to Rotate'} │ {isMobile ? 'Pinch to Zoom' : 'Scroll to Zoom'}
        </div>
      </div>

      {/* ── Status badge (top right) ── */}
      <div style={{
        position: 'absolute', top: 20, right: isMobile ? 16 : 340, zIndex: 30,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            backgroundColor: statusColor,
            boxShadow: `0 0 8px ${statusColor}`,
          }} />
          <span style={{ fontSize: 10, color: statusColor, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            {server.status}
          </span>
        </div>
        {server.latencyMs !== undefined && (
          <span style={{ fontSize: 9, color: '#555' }}>{server.latencyMs}ms</span>
        )}
        <span style={{ fontSize: 9, color: '#444' }}>{server.agents.length} agents</span>
      </div>

      {/* ── 3D Tower Area ── */}
      <div
        style={{
          flex: 1, position: 'relative', overflow: 'hidden',
          perspective: '1200px',
          cursor: dragging ? 'grabbing' : 'grab',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Center container */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: `translate(-50%, -50%)`,
        }}>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: zoom, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            style={{
              transformStyle: 'preserve-3d',
              transform: `scale(${zoom}) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
            }}
          >
            {/* Floor cubes */}
            {sortedAgents.map((agent, i) => (
              <FloorCube
                key={agent.id}
                agent={agent}
                index={i}
                total={sortedAgents.length}
                color={color}
                rgb={rgb}
                isSelected={selectedIdx === i}
                onClick={() => {
                  if (dragDist.current < 8) setSelectedIdx(prev => prev === i ? null : i);
                }}
              />
            ))}

            {/* Base platform */}
            <div style={{
              position: 'absolute',
              width: FLOOR_W + 40,
              height: FLOOR_D + 40,
              left: -(FLOOR_W + 40) / 2,
              top: -(FLOOR_D + 40) / 2,
              transform: 'translateZ(-12px)',
              transformStyle: 'preserve-3d',
            }}>
              {/* Platform top */}
              <div style={{
                position: 'absolute', inset: 0,
                background: '#0a0a18',
                border: `1px solid rgba(${rgb}, 0.2)`,
                boxShadow: `0 0 20px rgba(${rgb}, 0.08)`,
              }}>
                <div style={{
                  position: 'absolute', inset: 0, opacity: 0.15,
                  backgroundImage: `repeating-linear-gradient(90deg, transparent 0px, transparent 4px, rgba(${rgb}, 0.3) 4px, rgba(${rgb}, 0.3) 5px)`,
                }} />
                <div style={{
                  position: 'absolute', bottom: 6, left: 0, right: 0,
                  display: 'flex', justifyContent: 'center', gap: 20,
                  fontSize: 8, color: '#555', letterSpacing: '0.1em',
                }}>
                  <span>{server.ip}</span>
                  <span>PORT {server.port}</span>
                </div>
              </div>
            </div>

            {/* Beacon antenna on top of highest floor */}
            <div style={{
              position: 'absolute',
              left: 0, top: 0,
              transform: `translateZ(${towerH + 8}px)`,
              transformStyle: 'preserve-3d',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                backgroundColor: color, boxShadow: `0 0 12px ${color}`,
                animation: 'pulse 1.5s infinite',
              }} />
              <div style={{
                width: 2, height: 30, backgroundColor: `rgba(${rgb}, 0.4)`,
              }} />
            </div>
          </motion.div>
        </div>

        {/* Grid lines on background */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.04, pointerEvents: 'none',
          backgroundImage: `linear-gradient(rgba(${rgb}, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(${rgb}, 0.5) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }} />
      </div>

      {/* ── Detail Panel ── */}
      <AnimatePresence>
        {(selectedIdx !== null || !isMobile) && (
          <DetailPanel
            agent={selectedAgent}
            floorIndex={selectedIdx ?? 0}
            total={sortedAgents.length}
            color={color}
            rgb={rgb}
            serverName={server.name}
            isMobile={isMobile}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
