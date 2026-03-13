/**
 * InteriorView V5 — Isometric Server Tower
 * 2.5D stacked boxes with front/top/side faces.
 * Matches the reference: vertical tower, wireframe neon, agent details panel.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ServerLayoutItem, Agent } from '../types';

// ─── Dimensions ───────────────────────────────────────────────────────────────
const FLOOR_W = 320;   // front face width
const FLOOR_H = 56;    // front face height (each floor)
const DEPTH = 32;      // isometric depth (top + side face size)
const FLOOR_GAP = 4;   // gap between floors

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

// ─── Floor Box (isometric 2.5D) ──────────────────────────────────────────────
interface FloorBoxProps {
  agent: Agent;
  index: number;
  total: number;
  color: string;
  rgb: string;
  isSelected: boolean;
  onClick: () => void;
}

const FloorBox: React.FC<FloorBoxProps> = ({ agent, index, total, color, rgb, isSelected, onClick }) => {
  const isActive = agent.status === 'ACTIVE' || agent.status === 'THINKING';

  const frontBg = isActive
    ? `linear-gradient(135deg, rgba(${rgb}, 0.18) 0%, rgba(${rgb}, 0.06) 100%)`
    : 'linear-gradient(135deg, rgba(12, 12, 25, 0.9) 0%, rgba(8, 8, 18, 0.9) 100%)';
  const topBg = isActive
    ? `rgba(${rgb}, 0.12)`
    : 'rgba(15, 15, 28, 0.7)';
  const sideBg = isActive
    ? `rgba(${rgb}, 0.08)`
    : 'rgba(10, 10, 22, 0.7)';

  const borderColor = isSelected
    ? `rgba(${rgb}, 0.9)`
    : isActive
      ? `rgba(${rgb}, 0.5)`
      : 'rgba(80, 80, 120, 0.2)';

  const glowStyle = isActive ? `0 0 20px rgba(${rgb}, 0.15), inset 0 0 20px rgba(${rgb}, 0.05)` : 'none';
  const selectedGlow = isSelected ? `0 0 30px rgba(${rgb}, 0.3), inset 0 0 25px rgba(${rgb}, 0.1)` : glowStyle;

  return (
    <motion.div
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: (total - 1 - index) * 0.05, duration: 0.35 }}
      style={{
        position: 'relative',
        width: FLOOR_W + DEPTH,
        height: FLOOR_H + DEPTH,
        marginBottom: FLOOR_GAP,
        cursor: 'pointer',
        filter: isSelected ? `drop-shadow(0 0 12px rgba(${rgb}, 0.3))` : 'none',
      }}
      onClick={onClick}
      whileHover={{ x: 4 }}
    >
      {/* ── TOP face (parallelogram) ── */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: FLOOR_W,
        height: DEPTH,
        background: topBg,
        borderTop: `1px solid ${borderColor}`,
        borderLeft: `1px solid ${borderColor}`,
        borderRight: `1px solid ${borderColor}`,
        transform: 'skewX(-45deg)',
        transformOrigin: 'bottom left',
      }}>
        {/* Grid pattern on top */}
        <div style={{
          position: 'absolute', inset: 0, opacity: isActive ? 0.2 : 0.05,
          backgroundImage: `radial-gradient(rgba(${rgb}, 0.8) 1px, transparent 1px)`,
          backgroundSize: '8px 8px',
        }} />
      </div>

      {/* ── FRONT face (main rectangle) ── */}
      <div style={{
        position: 'absolute',
        top: DEPTH,
        left: 0,
        width: FLOOR_W,
        height: FLOOR_H,
        background: frontBg,
        borderLeft: `1px solid ${borderColor}`,
        borderBottom: `1px solid ${borderColor}`,
        borderRight: `1px solid ${borderColor}`,
        boxShadow: selectedGlow,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
        overflow: 'hidden',
      }}>
        {/* Neon bar on left */}
        {isActive && (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: 3, background: color,
            boxShadow: `0 0 8px ${color}, 0 0 16px ${color}`,
          }} />
        )}

        {/* Floor number */}
        <div style={{
          fontSize: 9, color: isActive ? color : '#444',
          fontWeight: 600, letterSpacing: '0.1em',
          minWidth: 28, textAlign: 'center',
          textShadow: isActive ? `0 0 6px rgba(${rgb}, 0.5)` : 'none',
        }}>
          FL.{index + 1}
        </div>

        {/* Agent info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <span style={{ fontSize: 18 }}>{agent.emoji}</span>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 600, color: '#fff',
              textShadow: isActive ? `0 0 6px rgba(${rgb}, 0.4)` : 'none',
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>
              {agent.name}
            </div>
            <div style={{
              fontSize: 8, color: isActive ? color : '#555',
              letterSpacing: '0.08em', marginTop: 2,
            }}>
              {agent.model}
            </div>
          </div>
        </div>

        {/* Status indicators (dots + bar) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Status dots */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[0, 1, 2].map((d) => (
              <motion.div
                key={d}
                animate={isActive ? { opacity: [0.4, 1, 0.4] } : {}}
                transition={isActive ? { duration: 1.5, delay: d * 0.3, repeat: Infinity } : {}}
                style={{
                  width: 5, height: 5, borderRadius: '50%',
                  backgroundColor: isActive ? color : '#333',
                  boxShadow: isActive ? `0 0 4px ${color}` : 'none',
                }}
              />
            ))}
          </div>

          {/* Activity bar */}
          {isActive && (
            <motion.div
              animate={{ width: ['30%', '85%', '60%', '90%', '30%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                width: 50, height: 4, borderRadius: 2,
                background: `linear-gradient(90deg, ${color}, rgba(${rgb}, 0.3))`,
                boxShadow: `0 0 6px ${color}`,
              }}
            />
          )}
        </div>

        {/* Scanlines overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.08,
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 3px)',
        }} />
      </div>

      {/* ── RIGHT SIDE face (parallelogram) ── */}
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: DEPTH,
        height: FLOOR_H,
        background: sideBg,
        borderTop: `1px solid ${borderColor}`,
        borderRight: `1px solid ${borderColor}`,
        borderBottom: `1px solid ${borderColor}`,
        transform: 'skewY(-45deg)',
        transformOrigin: 'top left',
      }}>
        {/* Vertical lines pattern */}
        <div style={{
          position: 'absolute', inset: 0, opacity: isActive ? 0.15 : 0.05,
          backgroundImage: `repeating-linear-gradient(90deg, transparent 0px, transparent 5px, rgba(${rgb}, 0.5) 5px, rgba(${rgb}, 0.5) 6px)`,
        }} />
      </div>

      {/* Glow particles for active floors */}
      {isActive && (
        <>
          {[0, 1, 2].map((p) => (
            <motion.div
              key={p}
              animate={{
                x: [FLOOR_W * 0.3 + p * 60, FLOOR_W * 0.4 + p * 50, FLOOR_W * 0.3 + p * 60],
                y: [DEPTH + 10 + p * 8, DEPTH + FLOOR_H - 15, DEPTH + 10 + p * 8],
                opacity: [0, 0.6, 0],
              }}
              transition={{ duration: 2 + p * 0.5, repeat: Infinity, delay: p * 0.7 }}
              style={{
                position: 'absolute',
                width: 3, height: 3, borderRadius: '50%',
                backgroundColor: color,
                boxShadow: `0 0 6px ${color}`,
                pointerEvents: 'none',
              }}
            />
          ))}
        </>
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
        position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '45%',
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

      {/* Scanlines */}
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
          <div style={{ fontSize: 9, color: '#333', letterSpacing: '0.1em' }}>TO INSPECT AGENT</div>
        </div>
      ) : (
        <div style={{ padding: 20, position: 'relative', zIndex: 2 }}>
          {/* Agent header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
            <div style={{
              fontSize: 40, lineHeight: 1,
              filter: agent.status === 'ACTIVE' ? `drop-shadow(0 0 8px rgba(${rgb}, 0.4))` : 'none',
            }}>
              {agent.emoji}
            </div>
            <div>
              <div style={{
                fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '0.08em',
                textShadow: `0 0 8px rgba(${rgb}, 0.3)`,
              }}>
                {agent.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <motion.span
                  animate={agent.status === 'ACTIVE' ? { scale: [1, 1.3, 1], opacity: [1, 0.6, 1] } : {}}
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
                  transition: 'all 0.3s',
                }} />
              ))}
            </div>
          </div>

          {/* Agent info */}
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

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!server) return null;

  const color = server.color;
  const rgb = hexToRgb(color);

  // Sort: ACTIVE at top (last in array = rendered last = top of tower)
  const sortedAgents = [...server.agents].sort((a, b) => {
    const order: Record<string, number> = { ACTIVE: 3, THINKING: 2, FINISHED: 1, IDLE: 0 };
    return (order[a.status] ?? 0) - (order[b.status] ?? 0);
  });

  const selectedAgent = selectedIdx !== null ? sortedAgents[selectedIdx] : null;
  const statusColor = server.status === 'ONLINE' ? '#22c55e' : server.status === 'OFFLINE' ? '#ff4444' : '#ffaa00';

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
      {/* ── Header (absolute, top-left) ── */}
      <div style={{
        position: 'absolute', top: 16, left: 20, zIndex: 30,
      }}>
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
              {server.role} │ CROSS-SECTION VIEW
            </div>
          </div>
        </div>
      </div>

      {/* ── Status (top-right, offset for panel) ── */}
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
        {server.latencyMs !== undefined && (
          <span style={{ fontSize: 9, color: '#555' }}>{server.latencyMs}ms</span>
        )}
        <span style={{ fontSize: 9, color: '#444' }}>{server.agents.length} AGENTS</span>
      </div>

      {/* ── Tower Area ── */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'auto', position: 'relative', padding: '80px 20px 20px',
      }}>
        {/* Grid background */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none',
          backgroundImage: `linear-gradient(rgba(${rgb}, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(${rgb}, 0.5) 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
        }} />

        {/* Tower stack — rendered bottom to top */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          style={{
            display: 'flex', flexDirection: 'column-reverse',
            alignItems: 'flex-start',
          }}
        >
          {/* Base platform */}
          <div style={{
            position: 'relative',
            width: FLOOR_W + DEPTH,
            marginTop: 2,
          }}>
            {/* Platform front */}
            <div style={{
              width: FLOOR_W, height: 20,
              background: '#0a0a18',
              borderLeft: `1px solid rgba(${rgb}, 0.25)`,
              borderBottom: `1px solid rgba(${rgb}, 0.25)`,
              borderRight: `1px solid rgba(${rgb}, 0.25)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20,
              fontSize: 8, color: '#444', letterSpacing: '0.1em',
            }}>
              <span>{server.ip}</span>
              <span>PORT {server.port}</span>
              <span>{server.agents.length} AGENTS</span>
            </div>
            {/* Platform top */}
            <div style={{
              position: 'absolute', top: -DEPTH, left: 0,
              width: FLOOR_W, height: DEPTH,
              background: 'rgba(8, 8, 20, 0.5)',
              borderTop: `1px solid rgba(${rgb}, 0.15)`,
              borderLeft: `1px solid rgba(${rgb}, 0.15)`,
              transform: 'skewX(-45deg)', transformOrigin: 'bottom left',
            }}>
              <div style={{
                position: 'absolute', inset: 0, opacity: 0.08,
                backgroundImage: `repeating-linear-gradient(90deg, transparent 0px, transparent 4px, rgba(${rgb}, 0.4) 4px, rgba(${rgb}, 0.4) 5px)`,
              }} />
            </div>
            {/* Platform side */}
            <div style={{
              position: 'absolute', top: -DEPTH, right: 0,
              width: DEPTH, height: 20,
              background: 'rgba(6, 6, 16, 0.6)',
              borderTop: `1px solid rgba(${rgb}, 0.15)`,
              borderRight: `1px solid rgba(${rgb}, 0.15)`,
              transform: 'skewY(-45deg)', transformOrigin: 'top left',
            }} />
          </div>

          {/* Floor boxes */}
          {sortedAgents.map((agent, i) => (
            <FloorBox
              key={agent.id}
              agent={agent}
              index={i}
              total={sortedAgents.length}
              color={color}
              rgb={rgb}
              isSelected={selectedIdx === i}
              onClick={() => setSelectedIdx(prev => prev === i ? null : i)}
            />
          ))}

          {/* Antenna on top */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: sortedAgents.length * 0.05 + 0.3 }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              marginBottom: 4, marginLeft: FLOOR_W / 2,
            }}
          >
            <motion.div
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              style={{
                width: 8, height: 8, borderRadius: '50%',
                backgroundColor: color, boxShadow: `0 0 12px ${color}, 0 0 24px ${color}`,
              }}
            />
            <div style={{ width: 2, height: 24, background: `rgba(${rgb}, 0.3)` }} />
          </motion.div>
        </motion.div>
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
