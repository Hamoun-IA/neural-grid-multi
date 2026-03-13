/**
 * InteriorView V6 — Rotatable 3D Tower
 * Real CSS 3D cubes stacked vertically (Y axis), drag-to-rotate, scroll-to-zoom.
 * Each floor = 6-face cube. Click a floor for agent details in side panel.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ServerLayoutItem, Agent } from '../types';

// ─── Dimensions ───────────────────────────────────────────────────────────────
const CUBE_W = 300;    // width  (X axis)
const CUBE_H = 48;     // height (Y axis) per floor
const CUBE_D = 200;    // depth  (Z axis)
const GAP = 6;         // gap between floors

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hexToRgb(hex: string): string {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? `${parseInt(r[1], 16)}, ${parseInt(r[2], 16)}, ${parseInt(r[3], 16)}` : '0,255,255';
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

// ─── Cube Face (shared styles) ────────────────────────────────────────────────
const faceBase: React.CSSProperties = {
  position: 'absolute',
  top: '50%', left: '50%',
  backfaceVisibility: 'hidden',
};

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
  const yPos = -(index * (CUBE_H + GAP));

  const borderCol = isSelected
    ? `rgba(${rgb}, 0.85)`
    : isActive ? `rgba(${rgb}, 0.4)` : 'rgba(80, 80, 120, 0.18)';
  const activeBg = `rgba(${rgb}, 0.08)`;
  const idleBg = 'rgba(8, 8, 18, 0.75)';
  const bg = isActive ? activeBg : idleBg;
  const topBg = isActive ? `rgba(${rgb}, 0.12)` : 'rgba(12, 12, 24, 0.6)';
  const sideBg = isActive ? `rgba(${rgb}, 0.06)` : 'rgba(10, 10, 20, 0.6)';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        position: 'absolute',
        transformStyle: 'preserve-3d',
        transform: `translateY(${yPos}px)`,
        width: 0, height: 0, // anchor point at center
        cursor: 'pointer',
      }}
    >
      {/* ── FRONT face ── */}
      <div style={{
        ...faceBase,
        width: CUBE_W, height: CUBE_H,
        marginLeft: -CUBE_W / 2, marginTop: -CUBE_H / 2,
        transform: `translateZ(${CUBE_D / 2}px)`,
        background: bg,
        border: `1px solid ${borderCol}`,
        boxShadow: isSelected
          ? `0 0 25px rgba(${rgb}, 0.3), inset 0 0 20px rgba(${rgb}, 0.08)`
          : isActive ? `inset 0 0 15px rgba(${rgb}, 0.06)` : 'none',
        display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10,
        overflow: 'hidden',
      }}>
        {/* Neon left bar */}
        {isActive && (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
            background: color, boxShadow: `0 0 8px ${color}, 0 0 16px ${color}`,
          }} />
        )}
        {/* Floor number */}
        <span style={{
          fontSize: 8, color: isActive ? color : '#444', fontWeight: 600,
          letterSpacing: '0.1em', minWidth: 26, textAlign: 'center',
          textShadow: isActive ? `0 0 5px rgba(${rgb}, 0.5)` : 'none',
        }}>
          FL.{index + 1}
        </span>
        {/* Agent info */}
        <span style={{ fontSize: 16 }}>{agent.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: '#fff',
            letterSpacing: '0.06em', textTransform: 'uppercase',
            textShadow: isActive ? `0 0 5px rgba(${rgb}, 0.4)` : 'none',
          }}>
            {agent.name}
          </div>
          <div style={{ fontSize: 8, color: isActive ? color : '#555', marginTop: 1, letterSpacing: '0.06em' }}>
            {agent.model}
          </div>
        </div>
        {/* Status dots */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[0, 1, 2].map(d => (
            <motion.div
              key={d}
              animate={isActive ? { opacity: [0.3, 1, 0.3] } : {}}
              transition={isActive ? { duration: 1.5, delay: d * 0.3, repeat: Infinity } : {}}
              style={{
                width: 5, height: 5, borderRadius: '50%',
                backgroundColor: isActive ? color : '#333',
                boxShadow: isActive ? `0 0 4px ${color}` : 'none',
              }}
            />
          ))}
        </div>
        {/* Scanlines */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.06,
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.04) 2px, rgba(255,255,255,0.04) 3px)',
        }} />
      </div>

      {/* ── BACK face ── */}
      <div style={{
        ...faceBase,
        width: CUBE_W, height: CUBE_H,
        marginLeft: -CUBE_W / 2, marginTop: -CUBE_H / 2,
        transform: `translateZ(${-CUBE_D / 2}px) rotateY(180deg)`,
        background: isActive ? `rgba(${rgb}, 0.04)` : 'rgba(6, 6, 14, 0.6)',
        border: `1px solid ${borderCol}`,
      }} />

      {/* ── RIGHT face ── */}
      <div style={{
        ...faceBase,
        width: CUBE_D, height: CUBE_H,
        marginLeft: -CUBE_D / 2, marginTop: -CUBE_H / 2,
        transform: `rotateY(90deg) translateZ(${CUBE_W / 2}px)`,
        background: sideBg,
        border: `1px solid ${borderCol}`,
      }}>
        <div style={{
          position: 'absolute', inset: 0, opacity: isActive ? 0.12 : 0.04,
          backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent 6px, rgba(${rgb}, 0.4) 6px, rgba(${rgb}, 0.4) 7px)`,
        }} />
      </div>

      {/* ── LEFT face ── */}
      <div style={{
        ...faceBase,
        width: CUBE_D, height: CUBE_H,
        marginLeft: -CUBE_D / 2, marginTop: -CUBE_H / 2,
        transform: `rotateY(-90deg) translateZ(${CUBE_W / 2}px)`,
        background: sideBg,
        border: `1px solid ${borderCol}`,
      }}>
        <div style={{
          position: 'absolute', inset: 0, opacity: isActive ? 0.12 : 0.04,
          backgroundImage: `radial-gradient(rgba(${rgb}, 0.5) 1px, transparent 1px)`,
          backgroundSize: '6px 6px',
        }} />
      </div>

      {/* ── TOP face ── */}
      <div style={{
        ...faceBase,
        width: CUBE_W, height: CUBE_D,
        marginLeft: -CUBE_W / 2, marginTop: -CUBE_D / 2,
        transform: `rotateX(90deg) translateZ(${CUBE_H / 2}px)`,
        background: topBg,
        border: `1px solid ${borderCol}`,
        boxShadow: isActive ? `0 0 20px rgba(${rgb}, 0.15)` : 'none',
      }}>
        <div style={{
          position: 'absolute', inset: 0, opacity: isActive ? 0.2 : 0.05,
          backgroundImage: `radial-gradient(rgba(${rgb}, 0.6) 1px, transparent 1px)`,
          backgroundSize: '8px 8px',
        }} />
        {/* Agent name on top face */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 14 }}>{agent.emoji}</span>
          <span style={{
            fontSize: 9, fontWeight: 600, color: isActive ? '#fff' : '#555',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            textShadow: isActive ? `0 0 6px rgba(${rgb}, 0.5)` : 'none',
          }}>
            {agent.name}
          </span>
        </div>
      </div>

      {/* ── BOTTOM face ── */}
      <div style={{
        ...faceBase,
        width: CUBE_W, height: CUBE_D,
        marginLeft: -CUBE_W / 2, marginTop: -CUBE_D / 2,
        transform: `rotateX(-90deg) translateZ(${CUBE_H / 2}px)`,
        background: 'rgba(5, 5, 12, 0.5)',
        border: `1px solid rgba(60, 60, 80, 0.08)`,
      }} />

      {/* Glow effect for active */}
      {isActive && (
        <motion.div
          animate={{ opacity: [0.1, 0.25, 0.1] }}
          transition={{ duration: 2.5, repeat: Infinity }}
          style={{
            ...faceBase,
            width: CUBE_W + 10, height: CUBE_D + 10,
            marginLeft: -(CUBE_W + 10) / 2, marginTop: -(CUBE_D + 10) / 2,
            transform: `rotateX(90deg) translateZ(${CUBE_H / 2 + 1}px)`,
            background: `radial-gradient(ellipse, rgba(${rgb}, 0.2), transparent 70%)`,
            pointerEvents: 'none', border: 'none',
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
  serverIp: string;
  isMobile: boolean;
}

const DetailPanel: React.FC<DetailPanelProps> = ({
  agent, floorIndex, total, color, rgb, serverName, serverIp, isMobile,
}) => {
  const bars = useMemo(() => {
    if (!agent) return [];
    let seed = 0;
    for (let i = 0; i < agent.id.length; i++) seed += agent.id.charCodeAt(i);
    return Array.from({ length: 24 }, (_, i) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return agent.status === 'ACTIVE' && i >= 20 ? 60 + (seed % 40) : 5 + (seed % 50);
    });
  }, [agent]);

  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '40%',
        background: 'rgba(5, 5, 10, 0.97)', borderTop: `1px solid rgba(${rgb}, 0.3)`,
        backdropFilter: 'blur(12px)', overflowY: 'auto', zIndex: 20,
      }
    : {
        width: 300, height: '100%', flexShrink: 0,
        background: 'rgba(5, 5, 10, 0.97)', borderLeft: `1px solid rgba(${rgb}, 0.25)`,
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
        <div key={i} style={{ position: 'absolute', width: 10, height: 10, ...s, zIndex: 5 }} />
      ))}

      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.3,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 4px)',
      }} />

      {!agent ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', gap: 8,
        }}>
          <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.2em' }}>SELECT A FLOOR</div>
          <div style={{ fontSize: 9, color: '#333' }}>TO INSPECT AGENT</div>
        </div>
      ) : (
        <div style={{ padding: 20, position: 'relative', zIndex: 2 }}>
          {/* Agent header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
            <span style={{
              fontSize: 40, lineHeight: 1,
              filter: agent.status === 'ACTIVE' ? `drop-shadow(0 0 8px rgba(${rgb}, 0.4))` : 'none',
            }}>
              {agent.emoji}
            </span>
            <div>
              <div style={{
                fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '0.08em',
                textShadow: `0 0 8px rgba(${rgb}, 0.3)`,
              }}>
                {agent.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <motion.span
                  animate={agent.status === 'ACTIVE' ? { scale: [1, 1.3, 1] } : {}}
                  transition={agent.status === 'ACTIVE' ? { duration: 2, repeat: Infinity } : {}}
                  style={{
                    width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                    backgroundColor: agent.status === 'ACTIVE' ? '#22c55e' : '#555',
                    boxShadow: agent.status === 'ACTIVE' ? '0 0 8px #22c55e' : 'none',
                  }}
                />
                <span style={{
                  fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase',
                  color: agent.status === 'ACTIVE' ? '#22c55e' : '#666',
                }}>
                  {agent.status}
                </span>
              </div>
            </div>
          </div>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
            {[
              { label: 'MODEL', value: agent.model },
              { label: 'FLOOR', value: `${floorIndex + 1} / ${total}` },
            ].map(({ label, value }) => (
              <div key={label} style={{
                background: 'rgba(12, 12, 22, 0.8)', border: '1px solid #1a1a2e',
                padding: '10px 12px', borderRadius: 3,
              }}>
                <div style={{ fontSize: 8, color: '#555', letterSpacing: '0.15em', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Activity bar */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.12em', marginBottom: 8 }}>⚡ ACTIVITY</div>
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 2, height: 36,
              background: 'rgba(8, 8, 16, 0.6)', padding: '3px 4px',
              border: '1px solid #1a1a2e', borderRadius: 2,
            }}>
              {bars.map((h, i) => (
                <div key={i} style={{
                  flex: 1, height: `${h}%`, borderRadius: 1,
                  backgroundColor: color,
                  opacity: i >= 20 && agent.status === 'ACTIVE' ? 0.8 : 0.2,
                  boxShadow: i >= 20 && agent.status === 'ACTIVE' ? `0 0 3px ${color}` : 'none',
                }} />
              ))}
            </div>
          </div>

          {/* Info */}
          <div>
            <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.12em', marginBottom: 8 }}>📋 AGENT INFO</div>
            {[
              ['Status', agent.status],
              ['Model', agent.model],
              ['Sessions', String(agent.sessionCount ?? 0)],
              ['Last Active', formatTime(agent.lastActiveAt) || '—'],
              ['Server', serverName],
              ['IP', serverIp],
            ].map(([k, v]) => (
              <div key={k} style={{
                display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 11,
              }}>
                <span style={{ color: '#555' }}>{k}</span>
                <span style={{ color: '#ddd' }}>{v}</span>
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
  const [rotX, setRotX] = useState(60);   // same starting angle as main dashboard
  const [rotY, setRotY] = useState(0);
  const [rotZ, setRotZ] = useState(-45);  // match isometric view
  const [zoom, setZoom] = useState(0.75);
  const [dragging, setDragging] = useState(false);
  const [dragMode, setDragMode] = useState<'rotate' | 'none'>('none');
  const lastPos = useRef({ x: 0, y: 0 });
  const dragDist = useRef(0);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!server) return null;

  const color = server.color;
  const rgb = hexToRgb(color);

  // Sort: ACTIVE at top
  const sortedAgents = [...server.agents].sort((a, b) => {
    const order: Record<string, number> = { ACTIVE: 3, THINKING: 2, FINISHED: 1, IDLE: 0 };
    return (order[a.status] ?? 0) - (order[b.status] ?? 0);
  });

  const selectedAgent = selectedIdx !== null ? sortedAgents[selectedIdx] : null;
  const statusColor = server.status === 'ONLINE' ? '#22c55e' : server.status === 'OFFLINE' ? '#ff4444' : '#ffaa00';
  const towerTotalH = sortedAgents.length * (CUBE_H + GAP);

  // ── Mouse/Touch handlers (same as main dashboard) ──
  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setDragMode('rotate');
    lastPos.current = { x: e.clientX, y: e.clientY };
    dragDist.current = 0;
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    dragDist.current += Math.abs(dx) + Math.abs(dy);
    setRotX(prev => Math.max(20, Math.min(80, prev - dy * 0.3)));
    setRotZ(prev => prev - dx * 0.3);
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseUp = () => { setDragging(false); setDragMode('none'); };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    dragDist.current = 0;
    setDragging(true);
    setDragMode('rotate');
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - lastPos.current.x;
    const dy = e.touches[0].clientY - lastPos.current.y;
    dragDist.current += Math.abs(dx) + Math.abs(dy);
    setRotX(prev => Math.max(20, Math.min(80, prev - dy * 0.3)));
    setRotZ(prev => prev - dx * 0.3);
    lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = () => { setDragging(false); setDragMode('none'); };

  const handleWheel = (e: React.WheelEvent) => {
    setZoom(prev => Math.max(0.3, Math.min(2, prev + e.deltaY * -0.001)));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: '#050508',
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
      }}
    >
      {/* ── Header ── */}
      <div style={{ position: 'absolute', top: 16, left: 20, zIndex: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(${rgb}, 0.3)`,
              color: '#fff', fontSize: 16, cursor: 'pointer', padding: '6px 12px',
              borderRadius: 3, transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.borderColor = color;
              (e.target as HTMLElement).style.boxShadow = `0 0 10px rgba(${rgb}, 0.3)`;
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.borderColor = `rgba(${rgb}, 0.3)`;
              (e.target as HTMLElement).style.boxShadow = 'none';
            }}
          >
            ←
          </button>
          <div>
            <div style={{
              fontSize: 13, fontWeight: 700, letterSpacing: '0.25em',
              textTransform: 'uppercase', color: '#fff',
              textShadow: `0 0 8px rgba(${rgb}, 0.25)`,
            }}>
              SERVER TOWER — {server.name.toUpperCase()}
            </div>
            <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.08em', marginTop: 3 }}>
              {server.role} │ Drag to rotate │ Scroll to zoom
            </div>
          </div>
        </div>
      </div>

      {/* ── Status (top-right) ── */}
      <div style={{
        position: 'absolute', top: 16, right: isMobile ? 16 : 320, zIndex: 30,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          backgroundColor: statusColor, boxShadow: `0 0 6px ${statusColor}`,
        }} />
        <span style={{ fontSize: 10, color: statusColor, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          {server.status}
        </span>
        <span style={{ fontSize: 9, color: '#444' }}>{server.agents.length} AGENTS</span>
      </div>

      {/* ── 3D Tower Area ── */}
      <div
        style={{
          flex: 1, position: 'relative', overflow: 'hidden',
          perspective: '1500px',
          cursor: dragMode === 'rotate' ? 'grabbing' : 'grab',
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
        {/* Grid background */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none',
          backgroundImage: `linear-gradient(rgba(${rgb}, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(${rgb}, 0.5) 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
        }} />

        {/* 3D Scene — same transform style as main dashboard */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            style={{
              transformStyle: 'preserve-3d',
              transform: `scale(${zoom}) rotateX(${rotX}deg) rotateZ(${rotZ}deg)`,
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
              transformStyle: 'preserve-3d',
              transform: `translateY(${CUBE_H / 2 + 10}px)`,
            }}>
              {/* Platform top face */}
              <div style={{
                ...faceBase,
                width: CUBE_W + 40, height: CUBE_D + 40,
                marginLeft: -(CUBE_W + 40) / 2, marginTop: -(CUBE_D + 40) / 2,
                transform: `rotateX(90deg) translateZ(0px)`,
                background: '#0a0a18',
                border: `1px solid rgba(${rgb}, 0.2)`,
                boxShadow: `0 0 30px rgba(${rgb}, 0.06)`,
              }}>
                <div style={{
                  position: 'absolute', inset: 0, opacity: 0.1,
                  backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent 4px, rgba(${rgb}, 0.3) 4px, rgba(${rgb}, 0.3) 5px), repeating-linear-gradient(0deg, transparent 0, transparent 4px, rgba(${rgb}, 0.3) 4px, rgba(${rgb}, 0.3) 5px)`,
                }} />
                {/* Server info on platform */}
                <div style={{
                  position: 'absolute', bottom: 8, left: 0, right: 0,
                  display: 'flex', justifyContent: 'center', gap: 16,
                  fontSize: 8, color: '#444', letterSpacing: '0.08em',
                }}>
                  <span>{server.ip}</span>
                  <span>PORT {server.port}</span>
                </div>
              </div>
            </div>

            {/* Beacon on top */}
            <div style={{
              position: 'absolute',
              transformStyle: 'preserve-3d',
              transform: `translateY(${-(towerTotalH + 20)}px)`,
            }}>
              <motion.div
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                style={{
                  ...faceBase,
                  width: 10, height: 10, borderRadius: '50%',
                  marginLeft: -5, marginTop: -5,
                  backgroundColor: color, boxShadow: `0 0 15px ${color}, 0 0 30px ${color}`,
                }}
              />
            </div>
          </motion.div>
        </div>
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
            serverIp={server.ip}
            isMobile={isMobile}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
