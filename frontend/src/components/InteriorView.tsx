/**
 * InteriorView — CSS 3D Tower (based on David's Css3dApp.tsx)
 * Pure CSS 3D transforms with preserve-3d, no Three.js canvas.
 * Real HTML on each face for crisp text + progress bars.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Server, Network, X } from 'lucide-react';
import { ServerLayoutItem, Agent } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(iso?: string, lastAge?: string): string {
  if (lastAge) return lastAge;
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function formatTokens(used?: number, max?: number): string {
  const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
  if (used !== undefined || max !== undefined) return `${fmt(used || 0)} / ${fmt(max || 0)}`;
  return '—';
}

/** Format raw model string to friendly name (handles both mapped & unmapped) */
function friendlyModel(agent: Agent): string {
  // Try modelFriendly first (if it's not "Unknown")
  if (agent.modelFriendly && agent.modelFriendly !== 'Unknown' && agent.modelFriendly !== '—') {
    return agent.modelFriendly;
  }
  const m = (agent.model || '').toLowerCase();
  if (m.includes('opus')) return 'Claude Opus';
  if (m.includes('sonnet')) return 'Claude Sonnet';
  if (m.includes('haiku')) return 'Claude Haiku';
  if (m === 'unknown' || m === '—' || !m) return '—';
  return agent.model;
}

/** Get display name for agent */
function agentDisplayName(agent: Agent): string {
  // If name is same as id (e.g. "main"), prefer role
  if (agent.name === agent.id && agent.role) return agent.role;
  return agent.name || agent.role || agent.id;
}

/** Get subtitle (role or model) */
function agentSubtitle(agent: Agent): string {
  if (agent.role) return agent.role;
  return friendlyModel(agent);
}

// ─── CSS 3D Server Node ──────────────────────────────────────────────────────
interface ServerNodeProps {
  agent: Agent;
  index: number;
  total: number;
  hexColor: string;
  isSelected: boolean;
  spacing: number;
  onClick: () => void;
}

const NODE_W = 400;  // px
const NODE_H = 80;   // px
const NODE_D = 300;  // px (depth)
const NODE_SPACING_DEFAULT = 120; // px between floors

const ServerNode: React.FC<ServerNodeProps> = ({ agent, index, total, hexColor, isSelected, spacing, onClick }) => {
  const isActive = agent.status === 'ACTIVE' || agent.status === 'THINKING';
  const progress = agent.tokensPct ?? 0;

  const statusColor = isActive ? '#22c55e'
    : agent.status === 'IDLE' ? '#eab308'
    : '#4b5563';
  const statusGlow = isActive ? `0 0 8px #22c55e`
    : agent.status === 'IDLE' ? '' 
    : '';

  const yPos = (total - 1 - index) * spacing;
  const zPos = isSelected ? 80 : 0;

  return (
    <div
      className="absolute cursor-pointer transition-transform duration-500 ease-out"
      style={{
        left: '50%',
        top: '50%',
        width: NODE_W,
        height: NODE_H,
        marginLeft: -NODE_W / 2,
        marginTop: -NODE_H / 2,
        transformStyle: 'preserve-3d',
        transform: `translateY(${yPos - (total * spacing) / 2 + 60}px) translateZ(${zPos}px)`,
      }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* Front Face */}
      <div
        className="absolute border-2 bg-[#05050a]/90 backdrop-blur-md flex flex-col justify-between p-4 transition-all duration-500"
        style={{
          left: '50%',
          top: '50%',
          width: NODE_W,
          height: NODE_H,
          marginLeft: -NODE_W / 2,
          marginTop: -NODE_H / 2,
          borderColor: isSelected ? hexColor : `${hexColor}40`,
          transform: `translateZ(${NODE_D / 2}px)`,
          boxShadow: isSelected ? `0 0 30px ${hexColor}60, 0 0 15px ${hexColor}40 inset` : 'none',
        }}
      >
        <div style={{ color: hexColor }} className="font-mono text-xl tracking-[0.2em] font-medium">
          {agent.name}
        </div>
        <div className="flex justify-between items-end">
          <div className="flex gap-2.5">
            <div
              className={isActive ? 'animate-pulse' : ''}
              style={{
                width: 8, height: 8, borderRadius: '50%',
                backgroundColor: statusColor,
                boxShadow: statusGlow,
              }}
            />
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: hexColor, opacity: 0.4 }} />
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: hexColor, opacity: 0.15 }} />
          </div>
          <div className="w-48 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full transition-all duration-500 relative"
              style={{
                width: `${progress}%`,
                backgroundColor: hexColor,
                boxShadow: `0 0 10px ${hexColor}`,
              }}
            >
              <div
                className="absolute inset-0 bg-white/30"
                style={{
                  backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2s infinite linear',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Back Face */}
      <div
        className="absolute border bg-[#020205]/90 transition-all duration-500"
        style={{
          left: '50%', top: '50%',
          width: NODE_W, height: NODE_H,
          marginLeft: -NODE_W / 2, marginTop: -NODE_H / 2,
          transform: `translateZ(${-NODE_D / 2}px) rotateY(180deg)`,
          borderColor: isSelected ? hexColor : 'rgba(255,255,255,0.1)',
          boxShadow: isSelected ? `0 0 20px ${hexColor}20 inset` : 'none',
        }}
      />

      {/* Top Face */}
      <div
        className="absolute border bg-[#020205]/80 flex items-center justify-center overflow-hidden transition-all duration-500"
        style={{
          left: '50%', top: '50%',
          width: NODE_W, height: NODE_D,
          marginLeft: -NODE_W / 2, marginTop: -NODE_D / 2,
          transform: `translateY(${-NODE_H / 2}px) rotateX(90deg)`,
          borderColor: isSelected ? hexColor : 'rgba(255,255,255,0.1)',
          boxShadow: isSelected ? `0 0 40px ${hexColor}20 inset` : 'none',
        }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        <span
          className="font-mono text-6xl font-bold tracking-widest transform -rotate-45 transition-colors duration-500"
          style={{ color: isSelected ? hexColor : 'rgba(255,255,255,0.2)' }}
        >
          {agent.id.toUpperCase()}
        </span>
      </div>

      {/* Bottom Face */}
      <div
        className="absolute border bg-[#020205]/90 transition-all duration-500"
        style={{
          left: '50%', top: '50%',
          width: NODE_W, height: NODE_D,
          marginLeft: -NODE_W / 2, marginTop: -NODE_D / 2,
          transform: `translateY(${NODE_H / 2}px) rotateX(-90deg)`,
          borderColor: isSelected ? hexColor : 'rgba(255,255,255,0.1)',
          boxShadow: isSelected ? `0 0 40px ${hexColor}20 inset` : 'none',
        }}
      />

      {/* Left Face */}
      <div
        className="absolute border bg-[#030308]/90 transition-all duration-500"
        style={{
          left: '50%', top: '50%',
          width: NODE_D, height: NODE_H,
          marginLeft: -NODE_D / 2, marginTop: -NODE_H / 2,
          transform: `translateX(${-NODE_W / 2}px) rotateY(-90deg)`,
          borderColor: isSelected ? hexColor : 'rgba(255,255,255,0.1)',
          boxShadow: isSelected ? `0 0 20px ${hexColor}20 inset` : 'none',
        }}
      />

      {/* Right Face */}
      <div
        className="absolute border bg-[#030308]/90 transition-all duration-500"
        style={{
          left: '50%', top: '50%',
          width: NODE_D, height: NODE_H,
          marginLeft: -NODE_D / 2, marginTop: -NODE_H / 2,
          transform: `translateX(${NODE_W / 2}px) rotateY(90deg)`,
          borderColor: isSelected ? hexColor : 'rgba(255,255,255,0.1)',
          boxShadow: isSelected ? `0 0 20px ${hexColor}20 inset` : 'none',
        }}
      />
    </div>
  );
};

// ─── Wireframe Rack ──────────────────────────────────────────────────────────
const RackTower: React.FC<{ count: number; hexColor: string; spacing: number }> = ({ count, hexColor, spacing }) => {
  const rackW = NODE_W + 40;
  const rackD = NODE_D + 40;
  const rackH = count * spacing + 40;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: '50%', top: '50%',
        width: rackW, height: rackH,
        marginLeft: -rackW / 2, marginTop: -rackH / 2,
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Front Frame */}
      <div className="absolute inset-0 border-2" style={{ borderColor: `${hexColor}33`, transform: `translateZ(${rackD / 2}px)` }} />
      {/* Back Frame */}
      <div className="absolute inset-0 border-2" style={{ borderColor: `${hexColor}33`, transform: `translateZ(${-rackD / 2}px)` }} />
      {/* Left Frame */}
      <div className="absolute top-0 border-2" style={{
        left: '50%', width: rackD, height: rackH,
        marginLeft: -rackD / 2,
        borderColor: `${hexColor}33`,
        transform: `translateX(${-rackW / 2}px) rotateY(90deg)`,
      }} />
      {/* Right Frame */}
      <div className="absolute top-0 border-2" style={{
        left: '50%', width: rackD, height: rackH,
        marginLeft: -rackD / 2,
        borderColor: `${hexColor}33`,
        transform: `translateX(${rackW / 2}px) rotateY(90deg)`,
      }} />

      {/* Shelves */}
      {Array.from({ length: count }).map((_, i) => {
        const serverY = (count - 1 - i) * spacing - (count * spacing) / 2 + 60;
        const shelfY = serverY + 45;
        return (
          <div
            key={i}
            className="absolute border backdrop-blur-sm"
            style={{
              left: '50%', top: '50%',
              width: rackW - 4, height: rackD - 4,
              marginLeft: -(rackW - 4) / 2, marginTop: -(rackD - 4) / 2,
              borderColor: `${hexColor}4d`,
              backgroundColor: 'rgba(15, 23, 42, 0.4)',
              transform: `translateY(${shelfY}px) rotateX(90deg)`,
            }}
          />
        );
      })}
    </div>
  );
};

// ─── Detail Panel (from Css3dApp) ─────────────────────────────────────────────
interface DetailPanelProps {
  agent: Agent | null;
  floorIndex: number;
  total: number;
  hexColor: string;
  serverName: string;
  onClose: () => void;
}

const DetailPanel: React.FC<DetailPanelProps> = ({
  agent, floorIndex, total, hexColor, serverName, onClose,
}) => {
  const isActive = agent?.status === 'ACTIVE' || agent?.status === 'THINKING';
  const statusDot = isActive ? 'bg-green-500 shadow-[0_0_8px_#22c55e]'
    : agent?.status === 'IDLE' ? 'bg-yellow-500'
    : 'bg-gray-500';

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="w-96 bg-[#050508]/90 backdrop-blur-2xl border-l border-white/10 p-8 flex flex-col shadow-2xl"
      style={{ position: 'relative', zIndex: 30, height: '100%', flexShrink: 0 }}
    >
      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>

      {!agent ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <div className="text-[10px] text-white/30 tracking-[0.2em] font-mono">SELECT A SERVER UNIT</div>
          <div className="text-[9px] text-white/20 font-mono">TO INSPECT AGENT</div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4 mb-6 mt-2">
            <div
              className="w-14 h-14 rounded-xl border flex items-center justify-center text-3xl"
              style={{ borderColor: `${hexColor}4d`, backgroundColor: `${hexColor}1a` }}
            >
              {agent.emoji}
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-wider">{agentDisplayName(agent)}</h2>
              <div className="text-sm font-mono mt-1" style={{ color: hexColor }}>
                {agentSubtitle(agent)}
              </div>
            </div>
          </div>

          <div className="space-y-4 flex-1 flex flex-col overflow-y-auto pr-2 pb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
            <div className="flex items-center justify-between bg-white/5 p-4 rounded-lg border border-white/5">
              <span className="text-white/40 text-[10px] font-mono tracking-wider">STATUT</span>
              <div className="flex items-center gap-2 text-sm font-mono">
                <span className={`w-2.5 h-2.5 rounded-full ${statusDot}`} />
                {agent.status}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                <div className="text-white/40 text-[10px] mb-1 font-mono tracking-wider">MODÈLE</div>
                <div className="text-sm font-medium">{friendlyModel(agent)}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                <div className="text-white/40 text-[10px] mb-1 font-mono tracking-wider">UPTIME</div>
                <div className="text-sm font-medium">{formatTime(agent.lastActiveAt, agent.lastAge)}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                <div className="text-white/40 text-[10px] mb-1 font-mono tracking-wider">DERNIÈRE ACTIVITÉ</div>
                <div className="text-sm font-medium">{formatTime(agent.lastActiveAt, agent.lastAge)}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                <div className="text-white/40 text-[10px] mb-1 font-mono tracking-wider">LATENCE (MOY)</div>
                <div className="text-sm font-medium">—</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                <div className="text-white/40 text-[10px] mb-1 font-mono tracking-wider">TOKENS (IN/OUT)</div>
                <div className="text-sm font-medium">{formatTokens(agent.tokensUsed, agent.tokensMax)}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                <div className="text-white/40 text-[10px] mb-1 font-mono tracking-wider">MESSAGES TRAITÉS</div>
                <div className="text-sm font-medium">{agent.sessionCount ?? 0}</div>
              </div>
            </div>

            <div className="bg-white/5 rounded-lg p-3 border border-white/5">
              <div className="text-white/40 text-[10px] mb-1 font-mono tracking-wider">SESSION ACTIVE</div>
              <div className="text-sm">{isActive ? `Agent ${agent.id}` : 'Aucune'}</div>
            </div>

            <div className="bg-white/5 rounded-lg p-3 border border-white/5">
              <div className="text-white/40 text-[10px] mb-1 font-mono tracking-wider">TÂCHE EN COURS</div>
              <div className="text-sm text-white/80 leading-relaxed">
                {isActive ? `${agent.name} est en cours de traitement...` : 'En attente de nouvelles instructions.'}
              </div>
            </div>

            <div className="bg-white/5 rounded-lg p-3 border border-white/5">
              <div className="text-white/40 text-[10px] mb-2 font-mono tracking-wider flex items-center gap-2">
                <Network className="w-3 h-3" /> CONNEXIONS MESH
              </div>
              <div className="flex flex-wrap gap-2">
                <span
                  className="px-2 py-1 bg-white/5 border rounded text-xs font-mono"
                  style={{ borderColor: `${hexColor}4d`, color: hexColor }}
                >
                  {serverName}
                </span>
                {!isActive && (
                  <span className="text-xs text-white/30 font-mono italic">Aucune connexion active</span>
                )}
              </div>
            </div>
          </div>
        </>
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
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [rotation, setRotation] = useState({ x: -15, y: -30 });
  // Auto-scale zoom based on agent count so all racks fit
  const agentCount = server?.agents?.length ?? 6;
  const nodeSpacing = agentCount > 8 ? 100 : NODE_SPACING_DEFAULT;
  const defaultZoom = agentCount > 10 ? 0.3 : agentCount > 7 ? 0.4 : 0.6;
  const [zoom, setZoom] = useState(defaultZoom);
  const [isDragging, setIsDragging] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!server) return null;

  const hexColor = server.color;
  // Reverse so "main" (first from API) is at the top of the tower
  const agents = useMemo(() => [...server.agents].reverse(), [server.agents]);
  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;
  const selectedFloorIndex = selectedAgent ? agents.indexOf(selectedAgent) : 0;

  // ── Mouse drag to rotate ──
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastPos({ x: e.clientX, y: e.clientY });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastPos.x;
    const dy = e.clientY - lastPos.y;
    setRotation(prev => ({
      x: Math.max(-80, Math.min(80, prev.x - dy * 0.5)),
      y: prev.y + dx * 0.5,
    }));
    setLastPos({ x: e.clientX, y: e.clientY });
  };
  const handleMouseUp = () => setIsDragging(false);

  // ── Touch handlers ──
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    setIsDragging(true);
    setLastPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - lastPos.x;
    const dy = e.touches[0].clientY - lastPos.y;
    setRotation(prev => ({
      x: Math.max(-80, Math.min(80, prev.x - dy * 0.5)),
      y: prev.y + dx * 0.5,
    }));
    setLastPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  };
  const handleTouchEnd = () => setIsDragging(false);

  // ── Scroll zoom ──
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(prev => Math.max(0.2, Math.min(2, prev + e.deltaY * -0.001)));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="w-screen h-screen bg-[#030305] text-white flex overflow-hidden font-sans"
      style={{ position: 'fixed', inset: 0, zIndex: 100, perspective: '1200px' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      {/* ── CSS 3D Scene ── */}
      <div className="flex-1 relative cursor-move w-full h-full flex items-center justify-center"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div
          className="transition-transform duration-100 ease-linear"
          style={{
            transform: `scale(${zoom}) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Floor Grid */}
          <div
            className="absolute border"
            style={{
              left: '50%', top: '50%',
              width: 1000, height: 1000,
              marginLeft: -500, marginTop: -500,
              transform: `translateY(${agents.length * nodeSpacing / 2 + 40}px) rotateX(90deg)`,
              backgroundImage: `linear-gradient(${hexColor}33 1px, transparent 1px), linear-gradient(90deg, ${hexColor}33 1px, transparent 1px)`,
              backgroundSize: '50px 50px',
              backgroundColor: '#020617',
              borderColor: `${hexColor}20`,
            }}
          />

          {/* Rack Tower wireframe */}
          <RackTower count={agents.length} hexColor={hexColor} spacing={nodeSpacing} />

          {/* Server Nodes */}
          {agents.map((agent, i) => (
            <ServerNode
              key={agent.id}
              agent={agent}
              index={i}
              total={agents.length}
              hexColor={hexColor}
              isSelected={selectedAgentId === agent.id}
              spacing={nodeSpacing}
              onClick={() => setSelectedAgentId(prev => prev === agent.id ? null : agent.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Header Overlay ── */}
      <div className="absolute top-8 left-8 z-20 pointer-events-none">
        <div
          className="text-sm font-mono tracking-[0.2em] text-white/80 flex items-center gap-3 bg-black/50 p-3 rounded-lg backdrop-blur-md border border-white/10 pointer-events-auto cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          <span className="text-lg">←</span>
          <Server className="w-4 h-4" style={{ color: hexColor }} />
          SERVER TOWER <span style={{ color: hexColor }}>—</span> {server.name.toUpperCase()}
        </div>
        <p className="text-xs text-white/40 mt-2 font-mono ml-1">Click + Drag to Rotate │ Scroll to Zoom</p>
      </div>

      {/* ── Detail Panel ── */}
      <AnimatePresence>
        {(selectedAgent || true) && (
          <DetailPanel
            agent={selectedAgent}
            floorIndex={selectedFloorIndex}
            total={agents.length}
            hexColor={hexColor}
            serverName={server.name}
            onClose={() => setSelectedAgentId(null)}
          />
        )}
      </AnimatePresence>

      {/* Shimmer animation */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </motion.div>
  );
}
