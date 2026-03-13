/**
 * ServerPanel — cyberpunk side-drawer showing server details.
 * Opens from the right when a server building or card is clicked.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ServerLayoutItem, Agent } from '../types';

// ─── Mobile detection hook ────────────────────────────────────────────────────
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

// ─── Pixel-art 8×8 icons (mirrors Building.tsx — kept in sync manually) ──────
const ICONS: Record<string, number[][]> = {
  NOVA: [
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,1,0,1,1,0,1,0],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [0,1,0,1,1,0,1,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,1,0,0,0],
  ],
  STUDIO: [
    [0,1,1,0,0,1,1,0],
    [1,0,0,1,1,0,0,1],
    [1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,1],
    [1,0,1,1,1,1,0,1],
    [1,0,1,1,1,1,0,1],
    [1,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1],
  ],
  CYBERPUNK: [
    [0,1,0,1,1,0,1,0],
    [1,1,1,1,1,1,1,1],
    [0,1,1,0,0,1,1,0],
    [1,1,0,1,1,0,1,1],
    [1,1,0,1,1,0,1,1],
    [0,1,1,0,0,1,1,0],
    [1,1,1,1,1,1,1,1],
    [0,1,0,1,1,0,1,0],
  ],
  BABOUNETTE: [
    [0,1,1,0,0,1,1,0],
    [1,1,1,0,1,1,1,0],
    [0,0,0,1,0,0,0,0],
    [0,0,1,1,1,0,0,0],
    [0,1,1,1,1,1,0,0],
    [1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,0,0],
    [0,0,0,0,0,0,0,0],
  ],
  HOMELAB: [
    [0,0,0,1,1,0,0,0],
    [0,0,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1],
    [0,1,1,0,0,1,1,0],
    [0,1,1,0,0,1,1,0],
    [0,1,0,1,1,0,1,0],
    [0,1,1,1,1,1,1,0],
  ],
};

const DEFAULT_ICON: number[][] = [
  [0,1,0,1,1,0,1,0],
  [1,1,1,1,1,1,1,1],
  [0,1,0,0,0,0,1,0],
  [1,1,0,1,1,0,1,1],
  [1,1,0,1,1,0,1,1],
  [0,1,0,0,0,0,1,0],
  [1,1,1,1,1,1,1,1],
  [0,1,0,1,1,0,1,0],
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatLastSeen(iso?: string): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function latencyColor(ms?: number): string {
  if (ms === undefined) return '#888';
  if (ms < 100) return '#22c55e';
  if (ms < 300) return '#ffea00';
  return '#ff4444';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const PixelIcon = ({ serverId, color, size = 40 }: { serverId: string; color: string; size?: number }) => {
  const icon = ICONS[serverId] ?? DEFAULT_ICON;
  const pxSize = size / 8;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(8, ${pxSize}px)`,
        width: size,
        height: size,
        filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 12px ${color})`,
        flexShrink: 0,
      }}
    >
      {icon.map((row, y) =>
        row.map((cell, x) => (
          <div
            key={`${x}-${y}`}
            style={{
              width: pxSize,
              height: pxSize,
              backgroundColor: cell ? color : 'transparent',
            }}
          />
        )),
      )}
    </div>
  );
};

const StatusDot = ({ active, pulse }: { active: boolean; pulse?: boolean }) => (
  <span
    style={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      backgroundColor: active ? '#22c55e' : '#444',
      boxShadow: active ? '0 0 8px #22c55e, 0 0 16px #22c55e' : 'none',
      animation: active && pulse ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
      flexShrink: 0,
    }}
  />
);

const AgentRow: React.FC<{ agent: Agent; color: string; compact?: boolean }> = ({ agent, color, compact }) => {
  const isActive = agent.status === 'ACTIVE' || agent.status === 'THINKING';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 6 : 10,
        padding: compact ? '6px 10px' : '8px 12px',
        background: 'rgba(0,0,0,0.25)',
        borderLeft: `2px solid ${isActive ? color : '#222'}`,
        transition: 'background 0.2s',
        cursor: 'default',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.25)'; }}
    >
      {/* Pulse dot */}
      <StatusDot active={isActive} pulse={isActive} />

      {/* Emoji */}
      <span style={{ fontSize: 16, lineHeight: 1 }}>{agent.emoji}</span>

      {/* Name + model */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: compact ? 10 : 11,
            fontFamily: 'JetBrains Mono, monospace',
            color: isActive ? '#fff' : '#aaa',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textShadow: isActive ? `0 0 8px ${color}` : 'none',
          }}
        >
          {agent.name}
        </div>
        <div
          style={{
            fontSize: 9,
            fontFamily: 'JetBrains Mono, monospace',
            color: '#555',
            marginTop: 2,
          }}
        >
          {agent.model}
        </div>
      </div>

      {/* Status badge */}
      <span
        style={{
          fontSize: 9,
          fontFamily: 'JetBrains Mono, monospace',
          padding: '2px 6px',
          border: `1px solid ${isActive ? color + '60' : '#333'}`,
          color: isActive ? color : '#444',
          letterSpacing: '0.1em',
          flexShrink: 0,
        }}
      >
        {agent.status}
      </span>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface ServerPanelProps {
  server: ServerLayoutItem | null;
  onClose: () => void;
}

type Tab = 'overview' | 'sessions';

export const ServerPanel: React.FC<ServerPanelProps> = ({ server, onClose }) => {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Reset tab when a new server is selected
  useEffect(() => {
    if (server) setActiveTab('overview');
  }, [server?.id]);

  // Escape key closes the panel
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const isOpen = server !== null;
  const color = server?.color ?? '#00f0ff';
  const isOffline = server?.status === 'OFFLINE';

  const statusLabel = isOffline ? 'OFFLINE' : server?.status === 'BUSY' ? 'BUSY' : 'ONLINE';
  const statusColor = isOffline ? '#ff4444' : server?.status === 'BUSY' ? '#ffea00' : '#22c55e';

  const sessionsAgents = (server?.agents ?? []).filter((a) => (a.sessionCount ?? 0) > 0);

  return (
    <>
      {/* ── Global keyframe for pulsing dot ── */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
        .server-panel-scroll::-webkit-scrollbar { width: 4px; }
        .server-panel-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); }
        .server-panel-scroll::-webkit-scrollbar-thumb { background: ${color}40; border-radius: 2px; }
      `}</style>

      {/* ── Overlay ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 40,
              pointerEvents: 'auto',
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Panel ── */}
      <AnimatePresence>
        {isOpen && server && (
          <motion.div
            key="panel"
            initial={isMobile ? { y: '100%', opacity: 0.5 } : { x: '100%', opacity: 0.5 }}
            animate={isMobile ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
            exit={isMobile ? { y: '100%', opacity: 0 } : { x: '100%', opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={isMobile ? {
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              height: '80vh',
              width: '100%',
              zIndex: 50,
              background: 'rgba(5, 5, 10, 0.97)',
              backdropFilter: 'blur(30px)',
              borderTop: `1px solid ${color}40`,
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'JetBrains Mono, monospace',
              pointerEvents: 'auto',
              overflow: 'hidden',
            } : {
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: 460,
              zIndex: 50,
              background: 'rgba(5, 5, 10, 0.97)',
              backdropFilter: 'blur(30px)',
              borderLeft: `1px solid ${color}40`,
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'JetBrains Mono, monospace',
              pointerEvents: 'auto',
              overflow: 'hidden',
            }}
          >
            {/* Mobile drag handle */}
            {isMobile && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  padding: '10px 0 4px',
                  flexShrink: 0,
                  position: 'relative',
                  zIndex: 10,
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 4,
                    borderRadius: 2,
                    background: `${color}60`,
                  }}
                />
              </div>
            )}

            {/* Scanlines overlay */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.15) 3px, rgba(0,0,0,0.15) 4px)`,
                pointerEvents: 'none',
                zIndex: 0,
              }}
            />

            {/* Corner accents — desktop only */}
            {!isMobile && [
              { top: 0, left: 0, borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` },
              { top: 0, right: 0, borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` },
              { bottom: 0, left: 0, borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` },
              { bottom: 0, right: 0, borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` },
            ].map((style, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  width: 12,
                  height: 12,
                  ...style,
                  zIndex: 10,
                  boxShadow: `0 0 8px ${color}`,
                }}
              />
            ))}

            {/* ── Header ── */}
            <div
              style={{
                position: 'relative',
                zIndex: 5,
                padding: '20px 20px 0',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
                {/* Pixel icon */}
                <div style={{ paddingTop: 4 }}>
                  <PixelIcon serverId={server.id} color={color} size={44} />
                </div>

                {/* Server info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      letterSpacing: '0.15em',
                      color: '#fff',
                      textShadow: `0 0 8px ${color}, 0 0 20px ${color}`,
                      marginBottom: 4,
                    }}
                  >
                    {server.name}
                  </div>
                  <div style={{ fontSize: 10, color: color, letterSpacing: '0.12em', marginBottom: 3 }}>
                    {server.role}
                  </div>
                  <div style={{ fontSize: 10, color: '#555', letterSpacing: '0.08em', marginBottom: 3 }}>
                    {server.ip}
                  </div>
                  <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.08em' }}>
                    {server.agentCount ?? server.agents.length} agents
                  </div>
                </div>

                {/* Close button */}
                <button
                  onClick={onClose}
                  style={{
                    background: 'none',
                    border: `1px solid ${color}40`,
                    color: '#888',
                    width: 32,
                    height: 32,
                    cursor: 'pointer',
                    fontSize: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'all 0.2s',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                  onMouseEnter={(e) => {
                    const btn = e.currentTarget;
                    btn.style.color = color;
                    btn.style.borderColor = color;
                    btn.style.boxShadow = `0 0 12px ${color}`;
                  }}
                  onMouseLeave={(e) => {
                    const btn = e.currentTarget;
                    btn.style.color = '#888';
                    btn.style.borderColor = `${color}40`;
                    btn.style.boxShadow = 'none';
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: `${color}30`, marginBottom: 0 }} />

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 0 }}>
                {(['overview', 'sessions'] as Tab[]).map((tab) => {
                  const isActive = activeTab === tab;
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        background: 'none',
                        border: 'none',
                        borderBottom: isActive ? `2px solid ${color}` : '2px solid transparent',
                        color: isActive ? color : '#555',
                        padding: '10px 16px',
                        cursor: 'pointer',
                        fontSize: 10,
                        letterSpacing: '0.15em',
                        textTransform: 'uppercase',
                        fontFamily: 'JetBrains Mono, monospace',
                        transition: 'all 0.2s',
                        textShadow: isActive ? `0 0 8px ${color}` : 'none',
                      }}
                    >
                      {tab === 'overview' ? 'Vue d\'ensemble' : 'Sessions'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Content ── */}
            <div
              className="server-panel-scroll"
              style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                position: 'relative',
                zIndex: 5,
              }}
            >
              {/* ── TAB: Overview ── */}
              {activeTab === 'overview' && (
                <div style={{ padding: '16px 20px' }}>
                  {/* Server status summary */}
                  <div
                    style={{
                      background: 'rgba(0,0,0,0.3)',
                      border: `1px solid ${color}20`,
                      padding: '14px 16px',
                      marginBottom: 16,
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 12,
                    }}
                  >
                    {/* Status */}
                    <div>
                      <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.1em', marginBottom: 4 }}>
                        STATUS
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: statusColor,
                            boxShadow: `0 0 8px ${statusColor}`,
                          }}
                        />
                        <span style={{ fontSize: 12, color: statusColor, letterSpacing: '0.1em', fontWeight: 700 }}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>

                    {/* Latency */}
                    <div>
                      <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.1em', marginBottom: 4 }}>
                        LATENCE
                      </div>
                      <div style={{ fontSize: 12, color: latencyColor(server.latencyMs), fontWeight: 700 }}>
                        {server.latencyMs !== undefined ? `${server.latencyMs}ms` : '—'}
                      </div>
                    </div>

                    {/* Last seen */}
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.1em', marginBottom: 4 }}>
                        DERNIÈRE ACTIVITÉ
                      </div>
                      <div style={{ fontSize: 11, color: '#777' }}>
                        {formatLastSeen(server.lastSeen)}
                      </div>
                    </div>
                  </div>

                  {/* Agent list header */}
                  <div
                    style={{
                      fontSize: 9,
                      color: '#444',
                      letterSpacing: '0.15em',
                      marginBottom: 8,
                      textTransform: 'uppercase',
                    }}
                  >
                    Agents ({server.agents.length})
                  </div>

                  {/* Agent rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {server.agents.length === 0 ? (
                      <div style={{ fontSize: 11, color: '#444', padding: '12px 0', textAlign: 'center' }}>
                        Aucun agent enregistré
                      </div>
                    ) : (
                      server.agents.map((agent) => (
                        <AgentRow key={agent.id} agent={agent} color={color} compact={isMobile} />
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* ── TAB: Sessions ── */}
              {activeTab === 'sessions' && (
                <div style={{ padding: '16px 20px' }}>
                  <div
                    style={{
                      fontSize: 9,
                      color: '#444',
                      letterSpacing: '0.15em',
                      marginBottom: 8,
                      textTransform: 'uppercase',
                    }}
                  >
                    Sessions actives ({sessionsAgents.length})
                  </div>

                  {sessionsAgents.length === 0 ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: '#444',
                        padding: '32px 0',
                        textAlign: 'center',
                        border: `1px solid #1a1a1a`,
                      }}
                    >
                      Aucune session active
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {sessionsAgents.map((agent) => (
                        <div
                          key={agent.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '10px 12px',
                            background: 'rgba(0,0,0,0.25)',
                            borderLeft: `2px solid ${color}`,
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.25)'; }}
                        >
                          <span style={{ fontSize: 16, lineHeight: 1 }}>{agent.emoji}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, color: '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {agent.name}
                            </div>
                            <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>
                              {agent.model}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                            <span
                              style={{
                                fontSize: 9,
                                color: color,
                                border: `1px solid ${color}40`,
                                padding: '2px 6px',
                                letterSpacing: '0.1em',
                              }}
                            >
                              {agent.sessionCount} session{(agent.sessionCount ?? 0) > 1 ? 's' : ''}
                            </span>
                            {agent.lastActiveAt && (
                              <span style={{ fontSize: 9, color: '#444' }}>
                                {formatLastSeen(agent.lastActiveAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
