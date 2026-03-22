/**
 * InteriorView — CSS 3D Tower (based on David's Css3dApp.tsx)
 * Pure CSS 3D transforms with preserve-3d, no Three.js canvas.
 * Real HTML on each face for crisp text + progress bars.
 * Mobile responsive: smaller racks, bottom sheet panel, pinch-to-zoom.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Server, Network, X, ChevronDown, Terminal, FolderOpen, Info, Activity, Shield } from 'lucide-react';
import WebTerminal from './WebTerminal';
import FileExplorer from './FileExplorer';
import { ServerLayoutItem, Agent } from '../types';

// ─── Responsive hook ──────────────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return isMobile;
}

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

function formatTotalTokens(total?: number): string {
  if (!total) return '0';
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M`;
  if (total >= 1000) return `${Math.round(total / 1000)}k`;
  return String(total);
}

function friendlyModel(agent: Agent): string {
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

function agentDisplayName(agent: Agent): string {
  if (agent.name === agent.id && agent.role) return agent.role;
  return agent.name || agent.role || agent.id;
}

function agentSubtitle(agent: Agent): string {
  if (agent.role) return agent.role;
  return friendlyModel(agent);
}

const NODE_SPACING_DEFAULT = 120;

// ─── Color Palette ────────────────────────────────────────────────────────────
const RACK_PALETTE = [
  '#00f0ff', '#ff00ff', '#00ff88', '#ff6600', '#aa66ff', '#ffea00',
  '#ff3366', '#00ccaa', '#6688ff', '#ff9944', '#44ffaa', '#ff44aa',
];

function getRackColor(index: number, serverColor: string): string {
  if (index === 0) return serverColor;
  return RACK_PALETTE[(index - 1) % RACK_PALETTE.length];
}

// ─── CSS 3D Server Node ──────────────────────────────────────────────────────
interface ServerNodeProps {
  agent: Agent;
  index: number;
  total: number;
  rackColor: string;
  isSelected: boolean;
  spacing: number;
  isMobile: boolean;
  onClick: () => void;
}

const ServerNode: React.FC<ServerNodeProps> = ({ agent, index, total, rackColor, isSelected, spacing, isMobile, onClick }) => {
  const isActive = agent.status === 'ACTIVE' || agent.status === 'THINKING';
  const progress = agent.tokensPct ?? 0;

  const nodeW = isMobile ? 240 : 400;
  const nodeH = isMobile ? 56 : 80;
  const nodeD = isMobile ? 180 : 300;

  const statusColor = isActive ? '#22c55e' : agent.status === 'IDLE' ? '#eab308' : '#4b5563';
  const statusGlow = isActive ? '0 0 8px #22c55e' : '';

  const yPos = (total - 1 - index) * spacing;
  const zPos = isSelected ? (isMobile ? 40 : 80) : 0;

  return (
    <div
      className="absolute cursor-pointer transition-transform duration-500 ease-out"
      style={{
        left: '50%', top: '50%',
        width: nodeW, height: nodeH,
        marginLeft: -nodeW / 2, marginTop: -nodeH / 2,
        transformStyle: 'preserve-3d',
        transform: `translateY(${yPos - (total * spacing) / 2 + 60}px) translateZ(${zPos}px)`,
      }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* Front Face */}
      <div
        className="absolute border-2 bg-[#05050a]/90 backdrop-blur-md flex flex-col justify-between transition-all duration-500"
        style={{
          left: '50%', top: '50%',
          width: nodeW, height: nodeH,
          marginLeft: -nodeW / 2, marginTop: -nodeH / 2,
          padding: isMobile ? '8px 12px' : '16px',
          borderColor: isSelected ? rackColor : `${rackColor}40`,
          transform: `translateZ(${nodeD / 2}px)`,
          boxShadow: isSelected ? `0 0 30px ${rackColor}60, 0 0 15px ${rackColor}40 inset` : 'none',
        }}
      >
        <div style={{ color: rackColor }} className={`font-mono tracking-[0.2em] font-medium ${isMobile ? 'text-sm' : 'text-xl'}`}>
          {agent.name}
        </div>
        <div className="flex justify-between items-end">
          <div className="flex gap-2">
            <div className={isActive ? 'animate-pulse' : ''} style={{ width: isMobile ? 6 : 8, height: isMobile ? 6 : 8, borderRadius: '50%', backgroundColor: statusColor, boxShadow: statusGlow }} />
            <div style={{ width: isMobile ? 6 : 8, height: isMobile ? 6 : 8, borderRadius: '50%', backgroundColor: rackColor, opacity: 0.4 }} />
            <div style={{ width: isMobile ? 6 : 8, height: isMobile ? 6 : 8, borderRadius: '50%', backgroundColor: rackColor, opacity: 0.15 }} />
          </div>
          <div className={`${isMobile ? 'w-24 h-1' : 'w-48 h-1.5'} bg-white/10 rounded-full overflow-hidden`}>
            <div className="h-full transition-all duration-500 relative" style={{ width: `${progress}%`, backgroundColor: rackColor, boxShadow: `0 0 10px ${rackColor}` }}>
              <div className="absolute inset-0 bg-white/30" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)', backgroundSize: '200% 100%', animation: 'shimmer 2s infinite linear' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Back Face */}
      <div className="absolute border bg-[#020205]/90 transition-all duration-500" style={{ left: '50%', top: '50%', width: nodeW, height: nodeH, marginLeft: -nodeW / 2, marginTop: -nodeH / 2, transform: `translateZ(${-nodeD / 2}px) rotateY(180deg)`, borderColor: isSelected ? rackColor : 'rgba(255,255,255,0.1)' }} />

      {/* Top Face */}
      <div className="absolute border bg-[#020205]/80 flex items-center justify-center overflow-hidden transition-all duration-500" style={{ left: '50%', top: '50%', width: nodeW, height: nodeD, marginLeft: -nodeW / 2, marginTop: -nodeD / 2, transform: `translateY(${-nodeH / 2}px) rotateX(90deg)`, borderColor: isSelected ? rackColor : 'rgba(255,255,255,0.1)', boxShadow: isSelected ? `0 0 40px ${rackColor}20 inset` : 'none' }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
        <span className={`font-mono font-bold tracking-widest transform -rotate-45 transition-colors duration-500 ${isMobile ? 'text-3xl' : 'text-6xl'}`} style={{ color: isSelected ? rackColor : 'rgba(255,255,255,0.2)' }}>
          {agent.id.toUpperCase()}
        </span>
      </div>

      {/* Bottom Face */}
      <div className="absolute border bg-[#020205]/90 transition-all duration-500" style={{ left: '50%', top: '50%', width: nodeW, height: nodeD, marginLeft: -nodeW / 2, marginTop: -nodeD / 2, transform: `translateY(${nodeH / 2}px) rotateX(-90deg)`, borderColor: isSelected ? rackColor : 'rgba(255,255,255,0.1)' }} />

      {/* Left Face */}
      <div className="absolute border bg-[#030308]/90 transition-all duration-500" style={{ left: '50%', top: '50%', width: nodeD, height: nodeH, marginLeft: -nodeD / 2, marginTop: -nodeH / 2, transform: `translateX(${-nodeW / 2}px) rotateY(-90deg)`, borderColor: isSelected ? rackColor : 'rgba(255,255,255,0.1)' }} />

      {/* Right Face */}
      <div className="absolute border bg-[#030308]/90 transition-all duration-500" style={{ left: '50%', top: '50%', width: nodeD, height: nodeH, marginLeft: -nodeD / 2, marginTop: -nodeH / 2, transform: `translateX(${nodeW / 2}px) rotateY(90deg)`, borderColor: isSelected ? rackColor : 'rgba(255,255,255,0.1)' }} />
    </div>
  );
};

// ─── Wireframe Rack ──────────────────────────────────────────────────────────
const RackTower: React.FC<{ count: number; hexColor: string; spacing: number; isMobile: boolean }> = ({ count, hexColor, spacing, isMobile }) => {
  const nodeW = isMobile ? 240 : 400;
  const nodeD = isMobile ? 180 : 300;
  const rackW = nodeW + 40;
  const rackD = nodeD + 40;
  const rackH = count * spacing + 40;

  return (
    <div className="absolute pointer-events-none" style={{ left: '50%', top: '50%', width: rackW, height: rackH, marginLeft: -rackW / 2, marginTop: -rackH / 2, transformStyle: 'preserve-3d' }}>
      <div className="absolute inset-0 border-2" style={{ borderColor: `${hexColor}33`, transform: `translateZ(${rackD / 2}px)` }} />
      <div className="absolute inset-0 border-2" style={{ borderColor: `${hexColor}33`, transform: `translateZ(${-rackD / 2}px)` }} />
      <div className="absolute top-0 border-2" style={{ left: '50%', width: rackD, height: rackH, marginLeft: -rackD / 2, borderColor: `${hexColor}33`, transform: `translateX(${-rackW / 2}px) rotateY(90deg)` }} />
      <div className="absolute top-0 border-2" style={{ left: '50%', width: rackD, height: rackH, marginLeft: -rackD / 2, borderColor: `${hexColor}33`, transform: `translateX(${rackW / 2}px) rotateY(90deg)` }} />
      {Array.from({ length: count }).map((_, i) => {
        const serverY = (count - 1 - i) * spacing - (count * spacing) / 2 + 60;
        const nodeH = isMobile ? 56 : 80;
        const shelfY = serverY + nodeH / 2 + 5;
        return (
          <div key={i} className="absolute border backdrop-blur-sm" style={{ left: '50%', top: '50%', width: rackW - 4, height: rackD - 4, marginLeft: -(rackW - 4) / 2, marginTop: -(rackD - 4) / 2, borderColor: `${hexColor}4d`, backgroundColor: 'rgba(15, 23, 42, 0.4)', transform: `translateY(${shelfY}px) rotateX(90deg)` }} />
        );
      })}
    </div>
  );
};

// ─── Detail Panel ─────────────────────────────────────────────────────────────
interface DetailPanelProps {
  agent: Agent | null;
  hexColor: string;
  serverName: string;
  serverId: string;
  isMobile: boolean;
  onClose: () => void;
}

type PanelTab = 'info' | 'terminal' | 'files' | 'health' | 'backup';

// ─── Watchdog Types ───────────────────────────────────────────────────────────
interface WatchdogCheck {
  status: string;
  details?: string;
}

interface WatchdogServer {
  status: string;
  checks: Record<string, WatchdogCheck>;
  last_seen_at?: string;
}

interface WatchdogStatus {
  [server: string]: WatchdogServer;
}

interface BackupEntry {
  server: string;
  status: string;
  size_bytes: number;
  duration_sec: number;
  started_at: string;
  backup_path?: string;
}

// ─── Health Tab ───────────────────────────────────────────────────────────────
const HealthTab: React.FC<{ serverId: string; hexColor: string }> = ({ serverId, hexColor }) => {
  const [data, setData] = useState<WatchdogStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    fetch('/api/watchdog/status', { signal: ctrl.signal })
      .then(r => r.json())
      .then((d: WatchdogStatus) => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); })
      .finally(() => clearTimeout(timer));
    return () => { ctrl.abort(); clearTimeout(timer); };
  }, [serverId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-white/40 font-mono text-sm animate-pulse">Loading...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-white/40 font-mono text-sm">📡 Watchdog unavailable</div>
      </div>
    );
  }

  const serverKey = serverId.toLowerCase();
  const serverData = data[serverKey];

  if (!serverData) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-white/40 font-mono text-sm">📡 No data for {serverId}</div>
      </div>
    );
  }

  const statusColor = (s: string) => {
    if (s === 'ok') return '#22c55e';
    if (s === 'warning') return '#eab308';
    return '#ef4444';
  };

  const globalStatusColor = statusColor(serverData.status);

  const formatLastSeen = (iso?: string) => {
    if (!iso) return '—';
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
      {/* Global Status */}
      <div className="bg-white/5 rounded-lg p-3 border border-white/10 font-mono">
        <div className="flex items-center justify-between mb-1">
          <span className="text-white/40 text-[10px] tracking-wider">STATUT GLOBAL</span>
          <span className="text-[10px]" style={{ color: hexColor }}>Last seen: {formatLastSeen(serverData.last_seen_at)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: globalStatusColor, boxShadow: `0 0 6px ${globalStatusColor}` }} />
          <span className="text-sm font-bold" style={{ color: globalStatusColor }}>{serverData.status.toUpperCase()}</span>
        </div>
      </div>

      {/* Checks */}
      <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
        <div className="px-3 py-2 border-b border-white/5">
          <span className="text-white/40 text-[10px] font-mono tracking-wider">CHECKS</span>
        </div>
        {Object.entries(serverData.checks).map(([name, check]) => {
          const dotColor = statusColor(check.status);
          return (
            <div key={name} className="flex items-center gap-3 px-3 py-2 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor, boxShadow: `0 0 4px ${dotColor}` }} />
              <span className="font-mono text-xs text-white/70 w-20 flex-shrink-0">{name}</span>
              <span className="font-mono text-xs flex-shrink-0" style={{ color: dotColor }}>{check.status}</span>
              {check.details && (
                <span className="font-mono text-xs text-white/40 truncate">{check.details}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Backup Tab ───────────────────────────────────────────────────────────────
const BackupTab: React.FC<{ serverId: string; hexColor: string }> = ({ serverId, hexColor }) => {
  const [data, setData] = useState<BackupEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    fetch('/api/watchdog/full-backups', { signal: ctrl.signal })
      .then(r => r.json())
      .then((d: BackupEntry[]) => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); })
      .finally(() => clearTimeout(timer));
    return () => { ctrl.abort(); clearTimeout(timer); };
  }, [serverId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-white/40 font-mono text-sm animate-pulse">Loading...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-white/40 font-mono text-sm">📡 Watchdog unavailable</div>
      </div>
    );
  }

  const serverBackups = data
    .filter(b => b.server.toLowerCase() === serverId.toLowerCase())
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  if (serverBackups.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-white/40 font-mono text-sm">Aucun backup trouvé</div>
      </div>
    );
  }

  const latest = serverBackups[0];
  const recent = serverBackups.slice(0, 5);

  const formatSize = (bytes: number) => {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  const formatDateShort = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  const statusEmoji = (s: string) => s === 'success' ? '✅' : s === 'running' ? '🔄' : '❌';
  const statusColor = (s: string) => s === 'success' ? '#22c55e' : s === 'running' ? '#eab308' : '#ef4444';

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
      {/* Layers summary */}
      <div className="bg-white/5 rounded-lg p-3 border border-white/10">
        <div className="text-white/40 text-[10px] font-mono tracking-wider mb-2">COUCHES DE BACKUP</div>
        <div className="flex gap-3">
          <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1.5 rounded border border-white/10">
            <span className="text-[10px] font-mono text-white/40">Git</span>
            <span className="text-white/30 text-xs">—</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border" style={{ backgroundColor: `${hexColor}15`, borderColor: `${hexColor}40` }}>
            <span className="text-[10px] font-mono" style={{ color: hexColor }}>NAS</span>
            <span className="text-xs" style={{ color: hexColor }}>✓</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1.5 rounded border border-white/10">
            <span className="text-[10px] font-mono text-white/40">Snapshot</span>
            <span className="text-white/30 text-xs">—</span>
          </div>
        </div>
      </div>

      {/* Latest backup */}
      <div className="bg-white/5 rounded-lg p-3 border border-white/10 font-mono">
        <div className="text-white/40 text-[10px] tracking-wider mb-3">DERNIER BACKUP</div>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-white/50 text-xs">Date</span>
            <span className="text-xs text-white">{formatDate(latest.started_at)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white/50 text-xs">Status</span>
            <span className="text-xs font-bold" style={{ color: statusColor(latest.status) }}>
              {statusEmoji(latest.status)} {latest.status}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white/50 text-xs">Taille</span>
            <span className="text-xs text-white">{formatSize(latest.size_bytes)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white/50 text-xs">Durée</span>
            <span className="text-xs text-white">{latest.duration_sec}s</span>
          </div>
        </div>
      </div>

      {/* Recent history */}
      {recent.length > 1 && (
        <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
          <div className="px-3 py-2 border-b border-white/5">
            <span className="text-white/40 text-[10px] font-mono tracking-wider">HISTORIQUE (5 derniers)</span>
          </div>
          {recent.map((b, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors font-mono text-xs">
              <span className="text-white/40 w-28 flex-shrink-0">{formatDateShort(b.started_at)}</span>
              <span className="flex-shrink-0" style={{ color: statusColor(b.status) }}>{statusEmoji(b.status)}</span>
              <span className="text-white/60 flex-1 text-right">{formatSize(b.size_bytes)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const DetailPanel: React.FC<DetailPanelProps> = ({ agent, hexColor, serverName, serverId, isMobile, onClose }) => {
  const [activeTab, setActiveTab] = useState<PanelTab>('info');
  const isActive = agent?.status === 'ACTIVE' || agent?.status === 'THINKING';
  const statusDot = isActive ? 'bg-green-500 shadow-[0_0_8px_#22c55e]'
    : agent?.status === 'IDLE' ? 'bg-yellow-500' : 'bg-gray-500';

  const tabs: { id: PanelTab; label: string; icon: React.ReactNode }[] = [
    { id: 'info', label: 'Info', icon: <Info className="w-3.5 h-3.5" /> },
    { id: 'terminal', label: 'Terminal', icon: <Terminal className="w-3.5 h-3.5" /> },
    { id: 'files', label: 'Files', icon: <FolderOpen className="w-3.5 h-3.5" /> },
    { id: 'health', label: 'Health', icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'backup', label: 'Backup', icon: <Shield className="w-3.5 h-3.5" /> },
  ];

  if (isMobile) {
    const isFullscreen = activeTab === 'terminal' || activeTab === 'files' || activeTab === 'health' || activeTab === 'backup';
    // ── Bottom Sheet (fullscreen for terminal/files) ──
    return (
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={`absolute ${isFullscreen ? 'inset-0' : 'bottom-0 left-0 right-0 rounded-t-2xl'} bg-[#050508]/95 backdrop-blur-2xl border-t border-white/10 z-30 flex flex-col`}
        style={isFullscreen ? {} : { maxHeight: '60vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tab Bar */}
        <div className="flex items-center border-b border-white/10 px-3 pt-2 gap-1 flex-shrink-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-mono tracking-wider rounded-t transition-colors ${
                activeTab === tab.id ? 'bg-white/10 text-white border-b-2' : 'text-white/40'
              }`}
              style={activeTab === tab.id ? { borderBottomColor: hexColor } : {}}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={() => { setActiveTab('info'); onClose(); }} className="text-white/40 p-1">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        {/* Terminal Tab (fullscreen) */}
        {activeTab === 'terminal' && (
          <div className="flex-1 overflow-hidden">
            <WebTerminal serverId={serverId} serverColor={hexColor} />
          </div>
        )}

        {/* Files Tab (fullscreen) */}
        {activeTab === 'files' && (
          <div className="flex-1 overflow-hidden">
            <FileExplorer serverId={serverId} serverColor={hexColor} />
          </div>
        )}

        {/* Health Tab */}
        {activeTab === 'health' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <HealthTab serverId={serverId} hexColor={hexColor} />
          </div>
        )}

        {/* Backup Tab */}
        {activeTab === 'backup' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <BackupTab serverId={serverId} hexColor={hexColor} />
          </div>
        )}

        {/* Info Tab */}
        {activeTab === 'info' && !agent ? (
          <div className="px-6 pb-6 pt-4 text-center">
            <div className="text-[10px] text-white/30 tracking-[0.2em] font-mono">APPUIE SUR UN RACK</div>
          </div>
        ) : activeTab === 'info' && agent ? (
          <div className="px-5 pb-6 pt-2 overflow-y-auto flex-1">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg border flex items-center justify-center text-xl" style={{ borderColor: `${hexColor}4d`, backgroundColor: `${hexColor}1a` }}>
                {agent.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold tracking-wider truncate">{agentDisplayName(agent)}</h2>
                <div className="text-xs font-mono" style={{ color: hexColor }}>{agentSubtitle(agent)}</div>
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/5 mb-3">
              <span className="text-white/40 text-[10px] font-mono tracking-wider">STATUT</span>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className={`w-2 h-2 rounded-full ${statusDot}`} />
                {agent.status}
              </div>
            </div>

            {/* 2×3 grid */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                ['MODÈLE', friendlyModel(agent)],
                ['UPTIME', formatTime(agent.lastActiveAt, agent.lastAge)],
                ['ACTIVITÉ', formatTime(agent.lastActiveAt, agent.lastAge)],
                ['SESSION', formatTokens(agent.tokensUsed, agent.tokensMax)],
                ['TOTAL', formatTotalTokens(agent.tokensAllTime || agent.tokensTotalUsed)],
                ['MESSAGES', String(agent.sessionCount ?? 0)],
              ].map(([label, val]) => (
                <div key={label} className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                  <div className="text-white/40 text-[9px] mb-0.5 font-mono tracking-wider">{label}</div>
                  <div className="text-xs font-medium truncate">{val}</div>
                </div>
              ))}
            </div>

            {/* Mesh */}
            <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
              <div className="text-white/40 text-[9px] mb-1 font-mono tracking-wider flex items-center gap-1">
                <Network className="w-3 h-3" /> MESH
              </div>
              <span className="px-2 py-0.5 bg-white/5 border rounded text-xs font-mono" style={{ borderColor: `${hexColor}4d`, color: hexColor }}>{serverName}</span>
            </div>
          </div>
        ) : null}
      </motion.div>
    );
  }

  // ── Desktop Side Panel ──
  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className={`${activeTab === 'info' ? 'w-96' : 'w-[600px]'} bg-[#050508]/90 backdrop-blur-2xl border-l border-white/10 flex flex-col shadow-2xl transition-[width] duration-300`}
      style={{ position: 'relative', zIndex: 30, height: '100%', flexShrink: 0 }}
    >
      {/* Tab Bar */}
      <div className="flex items-center border-b border-white/10 px-4 pt-3 pb-0 gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono tracking-wider rounded-t transition-colors ${
              activeTab === tab.id ? 'bg-white/10 text-white border-b-2' : 'text-white/40 hover:text-white/60'
            }`}
            style={activeTab === tab.id ? { borderBottomColor: hexColor } : {}}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Terminal Tab */}
      {activeTab === 'terminal' && (
        <div className="flex-1 overflow-hidden">
          <WebTerminal serverId={serverId} serverColor={hexColor} />
        </div>
      )}

      {/* Files Tab */}
      {activeTab === 'files' && (
        <div className="flex-1 overflow-hidden">
          <FileExplorer serverId={serverId} serverColor={hexColor} />
        </div>
      )}

      {/* Health Tab */}
      {activeTab === 'health' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <HealthTab serverId={serverId} hexColor={hexColor} />
        </div>
      )}

      {/* Backup Tab */}
      {activeTab === 'backup' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <BackupTab serverId={serverId} hexColor={hexColor} />
        </div>
      )}

      {/* Info Tab */}
      {activeTab === 'info' && !agent ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8">
          <div className="text-[10px] text-white/30 tracking-[0.2em] font-mono">SELECT A SERVER UNIT</div>
          <div className="text-[9px] text-white/20 font-mono">TO INSPECT AGENT</div>
        </div>
      ) : activeTab === 'info' && agent ? (
        <div className="p-8 flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center gap-4 mb-6 mt-2">
            <div className="w-14 h-14 rounded-xl border flex items-center justify-center text-3xl" style={{ borderColor: `${hexColor}4d`, backgroundColor: `${hexColor}1a` }}>
              {agent.emoji}
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-wider">{agentDisplayName(agent)}</h2>
              <div className="text-sm font-mono mt-1" style={{ color: hexColor }}>{agentSubtitle(agent)}</div>
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
              {[
                ['MODÈLE', friendlyModel(agent)],
                ['UPTIME', formatTime(agent.lastActiveAt, agent.lastAge)],
                ['DERNIÈRE ACTIVITÉ', formatTime(agent.lastActiveAt, agent.lastAge)],
                ['LATENCE (MOY)', '—'],
                ['TOKENS (SESSION)', formatTokens(agent.tokensUsed, agent.tokensMax)],
                ['TOKENS (ALL-TIME)', formatTotalTokens(agent.tokensAllTime || agent.tokensTotalUsed)],
                ['MESSAGES TRAITÉS', String(agent.sessionCount ?? 0)],
              ].map(([label, val]) => (
                <div key={label} className="bg-white/5 rounded-lg p-3 border border-white/5">
                  <div className="text-white/40 text-[10px] mb-1 font-mono tracking-wider">{label}</div>
                  <div className="text-sm font-medium">{val}</div>
                </div>
              ))}
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
                <span className="px-2 py-1 bg-white/5 border rounded text-xs font-mono" style={{ borderColor: `${hexColor}4d`, color: hexColor }}>{serverName}</span>
                {!isActive && <span className="text-xs text-white/30 font-mono italic">Aucune connexion active</span>}
              </div>
            </div>
          </div>
        </div>
      ) : null}
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
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [rotation, setRotation] = useState({ x: -15, y: -30 });
  const agentCount = server?.agents?.length ?? 6;
  const nodeSpacing = isMobile
    ? (agentCount > 8 ? 65 : 75)
    : (agentCount > 8 ? 100 : NODE_SPACING_DEFAULT);
  const defaultZoom = isMobile
    ? (agentCount > 10 ? 0.25 : agentCount > 7 ? 0.35 : 0.5)
    : (agentCount > 10 ? 0.3 : agentCount > 7 ? 0.4 : 0.6);
  const [zoom, setZoom] = useState(defaultZoom);
  const [isDragging, setIsDragging] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });

  // Pinch-to-zoom
  const lastPinchDist = useRef(0);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Browser back button / swipe back closes InteriorView
  useEffect(() => {
    window.history.pushState({ interiorView: true }, '');
    const onPopState = () => { onClose(); };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [onClose]);

  if (!server) return null;

  const hexColor = server.color;
  const agents = useMemo(() => [...server.agents].reverse(), [server.agents]);
  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;

  // ── Mouse drag ──
  const handleMouseDown = (e: React.MouseEvent) => { setIsDragging(true); setLastPos({ x: e.clientX, y: e.clientY }); };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setRotation(prev => ({ x: Math.max(-80, Math.min(80, prev.x - (e.clientY - lastPos.y) * 0.5)), y: prev.y + (e.clientX - lastPos.x) * 0.5 }));
    setLastPos({ x: e.clientX, y: e.clientY });
  };
  const handleMouseUp = () => setIsDragging(false);

  // ── Touch: 1-finger rotate, 2-finger pinch zoom ──
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist.current = Math.hypot(dx, dy);
    } else if (e.touches.length === 1) {
      setIsDragging(true);
      setLastPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    }
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (lastPinchDist.current > 0) {
        const delta = (dist - lastPinchDist.current) * 0.005;
        setZoom(prev => Math.max(0.15, Math.min(2, prev + delta)));
      }
      lastPinchDist.current = dist;
      return;
    }
    if (!isDragging || e.touches.length !== 1) return;
    const dx2 = e.touches[0].clientX - lastPos.x;
    const dy2 = e.touches[0].clientY - lastPos.y;
    setRotation(prev => ({ x: Math.max(-80, Math.min(80, prev.x - dy2 * 0.5)), y: prev.y + dx2 * 0.5 }));
    setLastPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  };
  const handleTouchEnd = () => { setIsDragging(false); lastPinchDist.current = 0; };

  // ── Scroll zoom (non-passive listener to allow preventDefault) ──
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(prev => Math.max(0.15, Math.min(2, prev + e.deltaY * -0.001)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="w-screen h-screen bg-[#030305] text-white flex overflow-hidden font-sans"
      style={{ position: 'fixed', inset: 0, zIndex: 100, perspective: isMobile ? '800px' : '1200px', flexDirection: isMobile ? 'column' : 'row' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd} ref={containerRef}
    >
      {/* ── CSS 3D Scene ── */}
      <div className="flex-1 relative cursor-move w-full h-full flex items-center justify-center" style={{ transformStyle: 'preserve-3d' }}>
        <div className="transition-transform duration-100 ease-linear" style={{ transform: `scale(${zoom}) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`, transformStyle: 'preserve-3d' }}>
          {/* Floor Grid */}
          <div className="absolute border" style={{
            left: '50%', top: '50%',
            width: isMobile ? 600 : 1000, height: isMobile ? 600 : 1000,
            marginLeft: isMobile ? -300 : -500, marginTop: isMobile ? -300 : -500,
            transform: `translateY(${agents.length * nodeSpacing / 2 + 40}px) rotateX(90deg)`,
            backgroundImage: `linear-gradient(${hexColor}33 1px, transparent 1px), linear-gradient(90deg, ${hexColor}33 1px, transparent 1px)`,
            backgroundSize: isMobile ? '40px 40px' : '50px 50px',
            backgroundColor: '#020617', borderColor: `${hexColor}20`,
          }} />

          <RackTower count={agents.length} hexColor={hexColor} spacing={nodeSpacing} isMobile={isMobile} />

          {agents.map((agent, i) => (
            <ServerNode
              key={agent.id}
              agent={agent}
              index={i}
              total={agents.length}
              rackColor={getRackColor(i, hexColor)}
              isSelected={selectedAgentId === agent.id}
              spacing={nodeSpacing}
              isMobile={isMobile}
              onClick={() => setSelectedAgentId(prev => prev === agent.id ? null : agent.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Header ── */}
      <div className={`absolute z-20 ${isMobile ? 'top-4 left-4 right-4 flex items-start justify-between' : 'top-8 left-8'}`}>
        <button
          className={`font-mono tracking-[0.15em] text-white/80 flex items-center gap-2 bg-black/60 rounded-lg backdrop-blur-md border border-white/10 cursor-pointer active:scale-95 transition-transform ${isMobile ? 'text-xs px-3 py-2.5' : 'text-sm p-3'}`}
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          <span className={isMobile ? 'text-lg' : 'text-lg'}>←</span>
          <Server className={isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4'} style={{ color: hexColor }} />
          {isMobile ? server.name.toUpperCase() : <>SERVER TOWER <span style={{ color: hexColor }}>—</span> {server.name.toUpperCase()}</>}
        </button>
        {!isMobile && <p className="text-xs text-white/40 mt-2 font-mono ml-1">Click + Drag to Rotate │ Scroll to Zoom</p>}
      </div>

      {/* ── Detail Panel (side on desktop, bottom sheet on mobile) ── */}
      <AnimatePresence>
        {(selectedAgent || !isMobile) && (
          <DetailPanel
            agent={selectedAgent}
            hexColor={selectedAgent ? getRackColor(agents.indexOf(selectedAgent), hexColor) : hexColor}
            serverName={server.name}
            serverId={server.id}
            isMobile={isMobile}
            onClose={() => setSelectedAgentId(null)}
          />
        )}
      </AnimatePresence>

      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </motion.div>
  );
}
