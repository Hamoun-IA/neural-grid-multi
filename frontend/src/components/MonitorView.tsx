import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Sparkline from './Sparkline';
import { Server } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WatchdogCheck {
  status: 'ok' | 'warning' | 'critical' | 'unknown';
  message?: string;
}

interface WatchdogStatus {
  status: 'ok' | 'warning' | 'critical' | 'offline';
  checks: Record<string, WatchdogCheck | string>;
  last_seen_at?: string;
}

interface WatchdogIncident {
  server_id: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  resolved: boolean;
  created_at: string;
}

interface WatchdogSessionAgent {
  id: string;
  size_bytes: number;
}

interface WatchdogSessionsSummary {
  total_size: number;
  agent_count: number;
  agents: WatchdogSessionAgent[];
}

interface WatchdogFullBackup {
  server: string;
  status: 'success' | 'failed' | 'running';
  size_bytes: number;
  duration_sec: number;
  started_at: string;
  backup_path: string;
}

interface WatchdogNasStatus {
  total: number;
  used: number;
  free: number;
  pct: number;
  details?: unknown[];
}

interface WatchdogLive {
  cpu?: number;
  ram?: number;
  disk?: number;
  uptime?: string;
  load?: number;
  load1?: number;
  load5?: number;
  load15?: number;
}

interface WatchdogChart {
  labels: string[];
  disk: number[];
  ram: number[];
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MonitorViewProps {
  servers: Server[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(iso?: string): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatGb(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatTb(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024 / 1024).toFixed(1)} TB`;
}

function statusColor(s: string | undefined): string {
  switch (s) {
    case 'ok': return '#22c55e';
    case 'warning': return '#eab308';
    case 'critical': return '#ef4444';
    case 'offline': return '#6b7280';
    default: return '#6b7280';
  }
}

function backupAge(backups: WatchdogFullBackup[], serverId: string): 'ok' | 'warning' | 'critical' | 'unknown' {
  const serverBackups = backups.filter((b) => b.server.toLowerCase() === serverId.toLowerCase() && b.status === 'success');
  if (!serverBackups.length) return 'unknown';
  const latest = serverBackups.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0];
  const hours = (Date.now() - new Date(latest.started_at).getTime()) / 3600_000;
  if (hours < 24) return 'ok';
  if (hours < 48) return 'warning';
  return 'critical';
}

function backupDotColor(age: 'ok' | 'warning' | 'critical' | 'unknown'): string {
  switch (age) {
    case 'ok': return '#22c55e';
    case 'warning': return '#eab308';
    case 'critical': return '#ef4444';
    default: return '#6b7280';
  }
}

const SERVER_IDS = ['nova', 'studio', 'babounette', 'cyberpunk', 'homelab', 'boss', 'lab'];

function resolveServerId(serverId: string): string {
  return serverId.toLowerCase();
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-xl p-4 animate-pulse">
      <div className="h-4 bg-white/10 rounded w-2/3 mb-3" />
      <div className="h-2 bg-white/10 rounded w-full mb-2" />
      <div className="h-2 bg-white/10 rounded w-full mb-2" />
      <div className="h-2 bg-white/10 rounded w-full mb-4" />
      <div className="h-3 bg-white/10 rounded w-1/2" />
    </div>
  );
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, color, label }: { value: number; color?: string; label: string }) {
  const pct = Math.min(100, Math.max(0, value));
  const barColor = color ?? (pct > 90 ? '#ef4444' : pct > 75 ? '#eab308' : '#22c55e');
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-[10px] text-white/40 font-sans w-8 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: barColor, boxShadow: `0 0 6px ${barColor}80` }}
        />
      </div>
      <span className="text-[10px] font-mono w-8 text-right" style={{ color: barColor }}>
        {Math.round(pct)}%
      </span>
    </div>
  );
}

// ─── CheckDot ─────────────────────────────────────────────────────────────────

function CheckDot({ status, label }: { status: string; label: string }) {
  const color = statusColor(status);
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}` }} />
      <span className="text-[10px] text-white/60 font-sans truncate">{label}</span>
    </div>
  );
}

// ─── ActionButton ─────────────────────────────────────────────────────────────

function ActionButton({
  label,
  icon,
  color = '#00f0ff',
  onClick,
  loading,
  confirm,
}: {
  label: string;
  icon: string;
  color?: string;
  onClick: () => void;
  loading?: boolean;
  confirm?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  const handleClick = () => {
    if (confirm && !confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    setConfirming(false);
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all disabled:opacity-50"
      style={{
        border: `1px solid ${color}40`,
        color: confirming ? '#ef4444' : color,
        background: confirming ? 'rgba(239,68,68,0.1)' : `${color}10`,
      }}
    >
      <span>{icon}</span>
      <span>{confirming ? `Confirm ${confirm}?` : loading ? 'Running…' : label}</span>
    </button>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  serverId,
  serverName,
  serverColor,
  watchdogStatus,
  incidents,
  sessions,
  onClose,
}: {
  serverId: string;
  serverName: string;
  serverColor: string;
  watchdogStatus?: WatchdogStatus;
  incidents: WatchdogIncident[];
  sessions?: WatchdogSessionsSummary;
  onClose: () => void;
}) {
  const [chart, setChart] = useState<WatchdogChart | null>(null);
  const [live, setLive] = useState<WatchdogLive | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const isMobile = window.innerWidth < 768;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [chartRes, liveRes] = await Promise.all([
          fetch(`/api/watchdog/chart/${serverId}`),
          fetch(`/api/watchdog/live/${serverId}`),
        ]);
        if (chartRes.ok) setChart(await chartRes.json());
        if (liveRes.ok) setLive(await liveRes.json());
      } catch { /* ignore */ }
    };
    fetchData();
  }, [serverId]);

  const runAction = async (type: 'healthcheck' | 'backup' | 'full-backup' | 'action', extra?: Record<string, string>) => {
    setActionLoading(type);
    setActionResult(null);
    try {
      let url = `/api/watchdog/${type}/${serverId}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: extra ? JSON.stringify(extra) : undefined,
      });
      const text = await res.text();
      setActionResult(res.ok ? '✓ Done' : `✗ ${text.slice(0, 80)}`);
    } catch (e: unknown) {
      setActionResult(`✗ ${e instanceof Error ? e.message : 'Error'}`);
    } finally {
      setActionLoading(null);
    }
  };

  const checks = watchdogStatus?.checks ?? {};
  const serverIncidents = incidents
    .filter((i) => i.server_id.toLowerCase() === serverId.toLowerCase())
    .slice(0, 7)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const checkLabels: Record<string, string> = {
    memory: 'Memory',
    disk: 'Disk',
    gateway: 'Gateway',
    cpu: 'CPU',
    load: 'Load',
    swap: 'Swap',
    network: 'Network',
    dns: 'DNS',
    docker: 'Docker',
    openclaw: 'OpenClaw',
    backup: 'Backup',
    uptime: 'Uptime',
    redis: 'Redis',
    database: 'Database',
    internet: 'Internet',
  };

  const checkEntries = Object.entries(checks).slice(0, 11);

  const panelContent = (
    <div className="flex flex-col gap-4 overflow-y-auto flex-1 min-h-0 pr-1">
      {/* Live Metrics */}
      {live && (
        <div>
          <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2 font-sans">Live Metrics</div>
          <div className="grid grid-cols-2 gap-2">
            {live.cpu !== undefined && (
              <div className="bg-white/5 rounded-lg p-2">
                <div className="text-[10px] text-white/40 font-sans">CPU</div>
                <div className="text-xl font-mono" style={{ color: serverColor }}>{Math.round(live.cpu)}%</div>
              </div>
            )}
            {live.ram !== undefined && (
              <div className="bg-white/5 rounded-lg p-2">
                <div className="text-[10px] text-white/40 font-sans">RAM</div>
                <div className="text-xl font-mono" style={{ color: '#ff6600' }}>{Math.round(live.ram)}%</div>
              </div>
            )}
            {live.disk !== undefined && (
              <div className="bg-white/5 rounded-lg p-2">
                <div className="text-[10px] text-white/40 font-sans">Disk</div>
                <div className="text-xl font-mono" style={{ color: '#a855f7' }}>{Math.round(live.disk)}%</div>
              </div>
            )}
            {live.uptime && (
              <div className="bg-white/5 rounded-lg p-2">
                <div className="text-[10px] text-white/40 font-sans">Uptime</div>
                <div className="text-sm font-mono text-white/80">{live.uptime}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Health Checks */}
      {checkEntries.length > 0 && (
        <div>
          <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2 font-sans">Health Checks</div>
          <div className="grid grid-cols-2 gap-1">
            {checkEntries.map(([key, val]) => {
              const status = typeof val === 'string' ? val : (val as WatchdogCheck).status;
              return (
                <CheckDot key={key} status={status} label={checkLabels[key] ?? key} />
              );
            })}
          </div>
        </div>
      )}

      {/* Sparklines */}
      {chart && (chart.disk.length > 1 || chart.ram.length > 1) && (
        <div>
          <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2 font-sans">History (24h)</div>
          <div className="flex gap-3">
            {chart.disk.length > 1 && (
              <div className="flex-1">
                <Sparkline data={chart.disk} color="#a855f7" width={160} height={40} label="DISK" />
              </div>
            )}
            {chart.ram.length > 1 && (
              <div className="flex-1">
                <Sparkline data={chart.ram} color="#ff6600" width={160} height={40} label="RAM" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sessions */}
      {sessions && sessions.agents && sessions.agents.length > 0 && (
        <div>
          <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2 font-sans">
            Sessions — {sessions.agent_count} agents · {formatBytes(sessions.total_size)}
          </div>
          <div className="space-y-1.5">
            {sessions.agents
              .sort((a, b) => b.size_bytes - a.size_bytes)
              .slice(0, 8)
              .map((agent) => {
                const pct = sessions.total_size > 0 ? (agent.size_bytes / sessions.total_size) * 100 : 0;
                return (
                  <div key={agent.id} className="flex items-center gap-2">
                    <span className="text-[10px] text-white/50 font-mono w-24 truncate shrink-0">{agent.id}</span>
                    <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: serverColor }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-white/40 w-14 text-right shrink-0">
                      {formatBytes(agent.size_bytes)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Recent Incidents */}
      {serverIncidents.length > 0 && (
        <div>
          <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2 font-sans">Recent Incidents</div>
          <div className="space-y-1.5">
            {serverIncidents.map((inc, i) => (
              <div key={i} className="flex items-start gap-2">
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0 mt-1"
                  style={{ backgroundColor: inc.severity === 'critical' ? '#ef4444' : inc.severity === 'warning' ? '#eab308' : '#3b82f6' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-white/70 leading-tight">{inc.description}</p>
                  <p className="text-[9px] text-white/30">{formatRelative(inc.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div>
        <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2 font-sans">Actions</div>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label="Health Check"
            icon="🔍"
            color="#00f0ff"
            loading={actionLoading === 'healthcheck'}
            onClick={() => runAction('healthcheck')}
          />
          <ActionButton
            label="Backup Snapshot"
            icon="📸"
            color="#22c55e"
            loading={actionLoading === 'backup'}
            confirm="backup"
            onClick={() => runAction('backup')}
          />
          <ActionButton
            label="Full Backup NAS"
            icon="💾"
            color="#a855f7"
            loading={actionLoading === 'full-backup'}
            confirm="full backup"
            onClick={() => runAction('full-backup')}
          />
          <ActionButton
            label="Restart Gateway"
            icon="🔄"
            color="#ef4444"
            loading={actionLoading === 'action'}
            confirm="restart"
            onClick={() => runAction('action', { action: 'restart-gateway' })}
          />
        </div>
        {actionResult && (
          <p className="text-[11px] mt-2 font-mono" style={{ color: actionResult.startsWith('✓') ? '#22c55e' : '#ef4444' }}>
            {actionResult}
          </p>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    // Inline expand on mobile
    return (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden"
      >
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mt-2">
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-sm" style={{ color: serverColor }}>{serverName}</span>
            <button onClick={onClose} className="text-white/40 hover:text-white text-lg leading-none">×</button>
          </div>
          {panelContent}
        </div>
      </motion.div>
    );
  }

  // Modal on desktop
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ duration: 0.2 }}
        className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col"
        style={{ boxShadow: `0 0 40px ${serverColor}20` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusColor(watchdogStatus?.status), boxShadow: `0 0 8px ${statusColor(watchdogStatus?.status)}` }} />
            <h2 className="text-lg font-bold tracking-wider" style={{ color: serverColor }}>{serverName}</h2>
            <span className="text-xs text-white/30 font-mono">{watchdogStatus?.status ?? 'unknown'}</span>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white text-2xl leading-none transition-colors">×</button>
        </div>
        {panelContent}
      </motion.div>
    </motion.div>
  );
}

// ─── Server Card ──────────────────────────────────────────────────────────────

function ServerCard({
  server,
  watchdogStatus,
  liveData,
  version,
  fullBackups,
  incidents,
  sessions,
  expanded,
  onToggle,
}: {
  server: Server;
  watchdogStatus?: WatchdogStatus;
  liveData?: WatchdogLive;
  version?: string;
  fullBackups: WatchdogFullBackup[];
  incidents: WatchdogIncident[];
  sessions?: WatchdogSessionsSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isMobile = window.innerWidth < 768;

  const wdStatus = watchdogStatus?.status ?? 'offline';
  const dotColor = statusColor(wdStatus);

  const cpu = liveData?.cpu ?? server.system?.cpu ?? 0;
  const ram = liveData?.ram ?? server.system?.memPct ?? 0;
  const disk = liveData?.disk ?? server.system?.diskPct ?? 0;

  const nasAge = backupAge(fullBackups, server.id);
  // We use the same backup status for all 3 dots (git/nas/snapshot) since we only have full-backups data
  const backupDot = backupDotColor(nasAge);

  const activeAgents = server.agents.filter((a) => a.status === 'ACTIVE' || a.status === 'THINKING').length;
  const totalAgents = server.agentCount ?? server.agents.length;

  return (
    <div>
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onToggle}
        className="bg-white/5 border border-white/10 backdrop-blur-md rounded-xl p-4 cursor-pointer transition-all duration-200 relative overflow-hidden"
        style={{
          boxShadow: expanded ? `0 0 20px ${server.color}30` : 'none',
          borderColor: expanded ? `${server.color}40` : 'rgba(255,255,255,0.1)',
        }}
      >
        {/* Glow line top */}
        {expanded && (
          <div className="absolute top-0 left-0 right-0 h-[1px]" style={{ background: `linear-gradient(90deg, transparent, ${server.color}, transparent)` }} />
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}` }}
            />
            <span className="font-bold text-sm tracking-wider text-white">{server.name}</span>
          </div>
          {version && (
            <span className="text-[9px] font-mono text-white/30">{version}</span>
          )}
        </div>

        {/* Bars */}
        <div className="mb-3">
          <ProgressBar value={cpu} label="CPU" />
          <ProgressBar value={ram} label="RAM" color="#ff6600" />
          <ProgressBar value={disk} label="DSK" color="#a855f7" />
        </div>

        {/* Footer row */}
        <div className="flex items-center justify-between">
          {/* Agents */}
          <span className="text-[10px] text-white/40 font-sans">
            <span style={{ color: server.color }}>{activeAgents}</span>
            <span className="text-white/20"> / </span>
            <span>{totalAgents}</span>
            <span className="text-white/20"> agents</span>
          </span>

          {/* Last seen */}
          <span className="text-[9px] text-white/30 font-mono">
            {formatRelative(watchdogStatus?.last_seen_at ?? server.lastSeen)}
          </span>
        </div>

        {/* Backup dots */}
        <div className="flex items-center gap-1.5 mt-2">
          {(['Git', 'NAS', 'Snap'] as const).map((label) => (
            <div key={label} className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: backupDot, boxShadow: `0 0 4px ${backupDot}` }} />
              <span className="text-[8px] text-white/30">{label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Mobile inline expand */}
      {isMobile && (
        <AnimatePresence>
          {expanded && (
            <DetailPanel
              serverId={resolveServerId(server.id)}
              serverName={server.name}
              serverColor={server.color}
              watchdogStatus={watchdogStatus}
              incidents={incidents}
              sessions={sessions}
              onClose={onToggle}
            />
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MonitorView({ servers }: MonitorViewProps) {
  const [statusData, setStatusData] = useState<Record<string, WatchdogStatus>>({});
  const [incidents, setIncidents] = useState<WatchdogIncident[]>([]);
  const [nasStatus, setNasStatus] = useState<WatchdogNasStatus | null>(null);
  const [fullBackups, setFullBackups] = useState<WatchdogFullBackup[]>([]);
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [liveData, setLiveData] = useState<Record<string, WatchdogLive>>({});
  const [sessions, setSessions] = useState<Record<string, WatchdogSessionsSummary>>({});
  const [loading, setLoading] = useState(true);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [showAllIncidents, setShowAllIncidents] = useState(false);
  const isMobile = window.innerWidth < 768;

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, incRes, nasRes, backupRes, versRes, sessionsRes] = await Promise.allSettled([
        fetch('/api/watchdog/status'),
        fetch('/api/watchdog/incidents'),
        fetch('/api/watchdog/nas-status'),
        fetch('/api/watchdog/full-backups'),
        fetch('/api/watchdog/versions'),
        fetch('/api/watchdog/sessions-summary'),
      ]);

      if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
        const data = await statusRes.value.json();
        setStatusData(data);
      }
      if (incRes.status === 'fulfilled' && incRes.value.ok) {
        const data = await incRes.value.json();
        setIncidents(Array.isArray(data) ? data : []);
      }
      if (nasRes.status === 'fulfilled' && nasRes.value.ok) {
        const data = await nasRes.value.json();
        setNasStatus(data);
      }
      if (backupRes.status === 'fulfilled' && backupRes.value.ok) {
        const data = await backupRes.value.json();
        setFullBackups(Array.isArray(data) ? data : []);
      }
      if (versRes.status === 'fulfilled' && versRes.value.ok) {
        const data = await versRes.value.json();
        setVersions(data);
      }
      if (sessionsRes.status === 'fulfilled' && sessionsRes.value.ok) {
        const data = await sessionsRes.value.json();
        setSessions(data);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  // Fetch live data per server (non-blocking)
  const fetchLive = useCallback(async () => {
    const serverIds = servers.map((s) => resolveServerId(s.id));
    const results = await Promise.allSettled(
      serverIds.map((id) => fetch(`/api/watchdog/live/${id}`).then((r) => r.ok ? r.json() : null).catch(() => null))
    );
    const newLive: Record<string, WatchdogLive> = {};
    serverIds.forEach((id, i) => {
      const r = results[i];
      if (r.status === 'fulfilled' && r.value) newLive[id] = r.value;
    });
    setLiveData(newLive);
  }, [servers]);

  useEffect(() => {
    fetchAll();
    fetchLive();
    const interval = setInterval(() => { fetchAll(); fetchLive(); }, 30_000);
    return () => clearInterval(interval);
  }, [fetchAll, fetchLive]);

  const handleToggle = (serverId: string) => {
    setExpandedServer((prev) => (prev === serverId ? null : serverId));
  };

  const displayedIncidents = incidents
    .filter((i) => !i.resolved)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const visibleIncidents = showAllIncidents ? displayedIncidents : displayedIncidents.slice(0, 10);

  const nasBarColor = nasStatus
    ? nasStatus.pct >= 80 ? '#ef4444'
    : nasStatus.pct >= 50 ? '#eab308'
    : '#22c55e'
    : '#6b7280';

  return (
    <div className="absolute inset-0 overflow-y-auto" style={{ background: '#050505' }}>
      <div className="min-h-full p-4 md:p-6 pb-8">

        {/* Server Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4 mb-6">
          {loading
            ? SERVER_IDS.map((id) => <SkeletonCard key={id} />)
            : servers.map((server) => {
                const sid = resolveServerId(server.id);
                const wdStatus = statusData[sid];
                const live = liveData[sid];
                const ver = versions[sid] ?? versions[server.id.toLowerCase()];
                const sess = sessions[sid] ?? sessions[server.id.toLowerCase()];

                return (
                  <ServerCard
                    key={server.id}
                    server={server}
                    watchdogStatus={wdStatus}
                    liveData={live}
                    version={ver}
                    fullBackups={fullBackups}
                    incidents={incidents}
                    sessions={sess}
                    expanded={expandedServer === server.id}
                    onToggle={() => handleToggle(server.id)}
                  />
                );
              })}
        </div>

        {/* Incidents */}
        <div className="mb-6">
          <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-mono tracking-widest text-white/40 uppercase">Incidents</h3>
              {displayedIncidents.length > 10 && (
                <button
                  onClick={() => setShowAllIncidents((v) => !v)}
                  className="text-[10px] text-white/30 hover:text-white/60 font-mono transition-colors"
                >
                  {showAllIncidents ? 'Voir moins' : `Voir tout (${displayedIncidents.length})`}
                </button>
              )}
            </div>
            {visibleIncidents.length === 0 ? (
              <p className="text-[11px] text-white/20 font-sans">Aucun incident actif</p>
            ) : (
              <div className="space-y-2">
                {visibleIncidents.map((inc, i) => {
                  const color = inc.severity === 'critical' ? '#ef4444' : inc.severity === 'warning' ? '#eab308' : '#3b82f6';
                  return (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}` }} />
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] text-white/60 font-mono">{inc.server_id}</span>
                        <span className="text-white/20 mx-1.5">—</span>
                        <span className="text-[11px] text-white/80">{inc.description}</span>
                      </div>
                      <span className="text-[9px] text-white/30 font-mono shrink-0">{formatRelative(inc.created_at)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* NAS Bar */}
        {nasStatus && (
          <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">NAS Storage</span>
              <span className="text-[11px] font-mono" style={{ color: nasBarColor }}>
                {formatGb(nasStatus.used)} / {formatTb(nasStatus.total)} — {Math.round(nasStatus.pct)}%
              </span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, nasStatus.pct)}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{ backgroundColor: nasBarColor, boxShadow: `0 0 8px ${nasBarColor}80` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-white/20 font-mono">0</span>
              <span className="text-[9px] text-white/20 font-mono">{formatTb(nasStatus.total)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Desktop Detail Modal */}
      {!isMobile && (
        <AnimatePresence>
          {expandedServer && (() => {
            const server = servers.find((s) => s.id === expandedServer);
            if (!server) return null;
            const sid = resolveServerId(server.id);
            return (
              <DetailPanel
                key={expandedServer}
                serverId={sid}
                serverName={server.name}
                serverColor={server.color}
                watchdogStatus={statusData[sid]}
                incidents={incidents}
                sessions={sessions[sid] ?? sessions[server.id.toLowerCase()]}
                onClose={() => setExpandedServer(null)}
              />
            );
          })()}
        </AnimatePresence>
      )}
    </div>
  );
}
