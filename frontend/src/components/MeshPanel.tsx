/**
 * MeshPanel — cyberpunk inter-agent messaging interface with Thread support
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MeshAgent, MeshMessage, MeshThread } from '../types';
import {
  fetchMeshRegistry, sendMeshMessage, fetchMeshHistory,
  createThread, sendInThread, fetchThreads, closeThread,
} from '../services/api';

// Server color map (matches App.tsx SERVER_META)
const SERVER_COLORS: Record<string, string> = {
  NOVA: '#00f0ff',
  STUDIO: '#ff00ff',
  CYBERPUNK: '#00ff00',
  BABOUNETTE: '#ffea00',
  HOMELAB: '#b000ff',
};

function serverColor(serverName: string): string {
  const key = serverName.toUpperCase();
  return SERVER_COLORS[key] ?? '#00f0ff';
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '??:??';
  }
}

function CornerAccents({ color }: { color: string }) {
  return (
    <>
      <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2" style={{ borderColor: color }} />
      <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2" style={{ borderColor: color }} />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2" style={{ borderColor: color }} />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2" style={{ borderColor: color }} />
    </>
  );
}

type Tab = 'message' | 'threads';

interface MeshPanelProps {
  onClose: () => void;
}

export function MeshPanel({ onClose }: MeshPanelProps) {
  const [tab, setTab] = useState<Tab>('message');
  const [agents, setAgents] = useState<MeshAgent[]>([]);
  const [loadingRegistry, setLoadingRegistry] = useState(true);

  // ── Message tab state ───────────────────────────────────────────────────
  const [history, setHistory] = useState<MeshMessage[]>([]);
  const [fromAgent, setFromAgent] = useState('');
  const [toAgent, setToAgent] = useState('');
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null);

  // ── Thread tab state ────────────────────────────────────────────────────
  const [threads, setThreads] = useState<MeshThread[]>([]);
  const [activeThread, setActiveThread] = useState<MeshThread | null>(null);
  const [threadMsg, setThreadMsg] = useState('');
  const [threadSending, setThreadSending] = useState(false);
  const [creatingThread, setCreatingThread] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadRegistry = useCallback(async () => {
    try {
      const data = await fetchMeshRegistry();
      setAgents(data);
      if (data.length > 0 && !fromAgent) {
        const hub = data.find((a) => a.agent === 'hub' || a.server === 'HOMELAB');
        setFromAgent(hub ? `${hub.agent}@${hub.server}` : `${data[0].agent}@${data[0].server}`);
      }
    } catch { /* offline */ } finally {
      setLoadingRegistry(false);
    }
  }, [fromAgent]);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await fetchMeshHistory(50));
    } catch { /* offline */ }
  }, []);

  const loadThreads = useCallback(async () => {
    try {
      setThreads(await fetchThreads());
    } catch { /* offline */ }
  }, []);

  useEffect(() => {
    loadRegistry();
    loadHistory();
    loadThreads();
  }, []);

  // Auto-scroll thread chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread?.messages]);

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeThread) setActiveThread(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, activeThread]);

  // Group agents by server
  const agentsByServer: Record<string, MeshAgent[]> = {};
  for (const agent of agents) {
    if (!agentsByServer[agent.server]) agentsByServer[agent.server] = [];
    agentsByServer[agent.server].push(agent);
  }

  const resolveAgent = (key: string): MeshAgent | undefined => {
    const [agentId, serverId] = key.split('@');
    return agents.find((a) => a.agent === agentId && a.server === serverId);
  };

  // ── Send one-shot message ───────────────────────────────────────────────
  const handleSend = async () => {
    if (!fromAgent || !toAgent || !messageText.trim()) return;
    const [fa, fs] = fromAgent.split('@');
    const [ta, ts] = toAgent.split('@');
    setSending(true);
    setSendResult(null);
    try {
      const result = await sendMeshMessage({ fromAgent: fa, fromServer: fs, toAgent: ta, toServer: ts, message: messageText.trim() });
      setSendResult({
        ok: result.status !== 'failed',
        text: result.status === 'delivered'
          ? `✅ Delivered${result.response ? ` — "${result.response.slice(0, 80)}"` : ''}`
          : result.status === 'failed' ? `❌ Failed${result.error ? `: ${result.error}` : ''}` : `⏳ Pending`,
      });
      setMessageText('');
      await loadHistory();
    } catch (err) {
      setSendResult({ ok: false, text: `❌ ${err instanceof Error ? err.message : 'Unknown error'}` });
    } finally {
      setSending(false);
      setTimeout(() => setSendResult(null), 5000);
    }
  };

  // ── Create thread (manual or autonomous) ────────────────────────────
  const handleCreateThread = async (mode: 'manual' | 'autonomous' = 'manual') => {
    if (!fromAgent || !toAgent || !messageText.trim()) return;
    const [fa, fs] = fromAgent.split('@');
    const [ta, ts] = toAgent.split('@');
    setCreatingThread(true);
    try {
      const thread = await createThread({
        fromAgent: fa, fromServer: fs, toAgent: ta, toServer: ts,
        message: messageText.trim(), mode,
      });
      setActiveThread(thread);
      setMessageText('');
      setTab('threads');
      await loadThreads();
    } catch (err) {
      setSendResult({ ok: false, text: `❌ ${err instanceof Error ? err.message : 'Failed'}` });
      setTimeout(() => setSendResult(null), 5000);
    } finally {
      setCreatingThread(false);
    }
  };

  // ── WebSocket: listen for thread updates ───────────────────────────
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
          if (data.type === 'mesh_thread' && data.thread) {
            const t = data.thread as MeshThread;
            // Update active thread if it matches
            setActiveThread(prev => prev?.id === t.id ? t : prev);
            // Update threads list
            setThreads(prev => {
              const idx = prev.findIndex(x => x.id === t.id);
              if (idx >= 0) { const next = [...prev]; next[idx] = t; return next; }
              return [t, ...prev];
            });
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { if (!destroyed) setTimeout(connect, 3000); };
    }
    connect();
    return () => { destroyed = true; ws?.close(); };
  }, []);

  // ── Send in thread ─────────────────────────────────────────────────────
  const handleThreadSend = async () => {
    if (!activeThread || !threadMsg.trim()) return;
    setThreadSending(true);
    try {
      const updated = await sendInThread(activeThread.id, threadMsg.trim());
      setActiveThread(updated);
      setThreadMsg('');
      await loadThreads();
    } catch (err) {
      // show error inline
      console.error('Thread send error:', err);
    } finally {
      setThreadSending(false);
    }
  };

  // ── Close thread ───────────────────────────────────────────────────────
  const handleCloseThread = async (id: string) => {
    try {
      const closed = await closeThread(id);
      if (activeThread?.id === id) setActiveThread(closed);
      await loadThreads();
    } catch { /* ignore */ }
  };

  const activeThreads = threads.filter(t => t.status === 'active');

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      >
        <motion.div
          className="relative flex flex-col font-mono overflow-hidden"
          initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 'min(720px, calc(100vw - 32px))',
            maxHeight: 'calc(100vh - 48px)',
            background: 'rgba(5, 5, 10, 0.97)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            boxShadow: '0 0 40px rgba(0,240,255,0.08), inset 0 0 80px rgba(0,240,255,0.02)',
          }}
        >
          {/* Scanlines */}
          <div className="absolute inset-0 pointer-events-none z-10"
            style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,240,255,0.015) 2px, rgba(0,240,255,0.015) 4px)' }} />
          <CornerAccents color="rgba(0,240,255,0.6)" />

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(0,240,255,0.15)' }}>
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 text-lg">📡</span>
              <span className="text-sm font-bold tracking-widest text-cyan-300" style={{ textShadow: '0 0 10px rgba(0,240,255,0.5)' }}>
                MESH COMLINK
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full tracking-widest" style={{ border: '1px solid rgba(0,240,255,0.3)', color: '#00f0ff' }}>
                {loadingRegistry ? 'LOADING...' : `${agents.length} AGENTS`}
              </span>
            </div>
            <button onClick={onClose}
              className="text-cyan-600 hover:text-cyan-300 transition-colors text-xl leading-none w-8 h-8 flex items-center justify-center"
              style={{ border: '1px solid rgba(0,240,255,0.2)' }}>✕</button>
          </div>

          {/* Tabs */}
          <div className="flex shrink-0" style={{ borderBottom: '1px solid rgba(0,240,255,0.1)' }}>
            {(['message', 'threads'] as Tab[]).map((t) => (
              <button key={t} onClick={() => { setTab(t); if (t === 'threads') loadThreads(); }}
                className="flex-1 py-2 text-[10px] tracking-widest font-bold transition-all relative"
                style={{
                  color: tab === t ? '#00f0ff' : '#336',
                  background: tab === t ? 'rgba(0,240,255,0.05)' : 'transparent',
                  borderBottom: tab === t ? '2px solid #00f0ff' : '2px solid transparent',
                }}>
                {t === 'message' ? '💬 MESSAGE' : `🔗 THREADS${activeThreads.length > 0 ? ` (${activeThreads.length})` : ''}`}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,240,255,0.2) transparent' }}>

            {/* ═══ MESSAGE TAB ═══ */}
            {tab === 'message' && (
              <>
                <div className="px-5 py-4 space-y-3" style={{ borderBottom: '1px solid rgba(0,240,255,0.1)' }}>
                  {/* FROM */}
                  <AgentSelect label="FROM" value={fromAgent} onChange={setFromAgent} agentsByServer={agentsByServer} />
                  {/* TO */}
                  <AgentSelect label="TO" value={toAgent} onChange={setToAgent} agentsByServer={agentsByServer} />

                  {/* Route preview */}
                  {fromAgent && toAgent && (
                    <div className="text-[10px] text-cyan-700 tracking-wide flex items-center gap-2">
                      {(() => {
                        const fa = resolveAgent(fromAgent), ta = resolveAgent(toAgent);
                        return (<>
                          <span style={{ color: serverColor(fromAgent.split('@')[1]) }}>{fa?.emoji ?? '?'} {fa?.agentName ?? fromAgent}</span>
                          <span className="text-cyan-600">→</span>
                          <span style={{ color: serverColor(toAgent.split('@')[1]) }}>{ta?.emoji ?? '?'} {ta?.agentName ?? toAgent}</span>
                        </>);
                      })()}
                    </div>
                  )}

                  {/* Textarea */}
                  <div className="flex flex-col md:flex-row md:items-start gap-2">
                    <label className="text-[10px] tracking-widest text-cyan-600 w-12 shrink-0 pt-2">MSG</label>
                    <textarea value={messageText} onChange={(e) => setMessageText(e.target.value)}
                      placeholder="Entrez votre message..." rows={3}
                      className="flex-1 text-xs py-2 px-3 outline-none resize-y"
                      style={{ background: 'rgba(0,5,15,0.9)', border: '1px solid rgba(0,240,255,0.25)', color: '#e0f8ff', fontFamily: 'JetBrains Mono, monospace', minHeight: '80px' }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend(); }} />
                  </div>

                  {/* Buttons */}
                  <div className="flex flex-col md:flex-row md:items-center gap-2 md:pl-14">
                    <CyberButton onClick={handleSend} disabled={sending || !fromAgent || !toAgent || !messageText.trim()} loading={sending}>
                      {sending ? 'ENVOI…' : 'ENVOYER ▶'}
                    </CyberButton>
                    <CyberButton onClick={() => handleCreateThread('manual')} disabled={creatingThread || !fromAgent || !toAgent || !messageText.trim()} loading={creatingThread}
                      accent="#b000ff">
                      {creatingThread ? 'CRÉATION…' : '🔗 THREAD'}
                    </CyberButton>
                    <CyberButton onClick={() => handleCreateThread('autonomous')} disabled={creatingThread || !fromAgent || !toAgent || !messageText.trim()} loading={creatingThread}
                      accent="#ff6600">
                      {creatingThread ? 'LANCEMENT…' : '🤖 AUTONOME'}
                    </CyberButton>
                    {sendResult && (
                      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                        className="text-[11px] font-mono max-w-xs truncate"
                        style={{ color: sendResult.ok ? '#22c55e' : '#ff4444' }}>{sendResult.text}</motion.div>
                    )}
                    <span className="text-[9px] text-cyan-800 hidden md:block ml-auto">Ctrl+Enter = send · Thread = conversation</span>
                  </div>
                </div>

                {/* History */}
                <div className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] tracking-widest text-cyan-600 font-bold">HISTORIQUE</span>
                    <span className="text-[9px] text-cyan-800">({history.length})</span>
                    <button onClick={loadHistory} className="text-[9px] text-cyan-700 hover:text-cyan-400 transition-colors tracking-widest ml-auto">↺ RAFRAÎCHIR</button>
                  </div>
                  {history.length === 0 ? (
                    <div className="text-[10px] text-cyan-800 text-center py-6 tracking-widest">— AUCUN MESSAGE —</div>
                  ) : (
                    <div className="space-y-2">
                      {history.map((msg) => {
                        const fromInfo = agents.find((a) => a.agent === msg.from.agent && a.server === msg.from.server);
                        const toInfo = agents.find((a) => a.agent === msg.to.agent && a.server === msg.to.server);
                        const isExpanded = expandedMsgId === msg.id;
                        const isLong = msg.message.length > 100;
                        return (
                          <div key={msg.id} className="relative px-3 py-2 text-[11px]"
                            style={{ background: 'rgba(0,240,255,0.02)', border: '1px solid rgba(0,240,255,0.1)' }}>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-cyan-800 shrink-0">{formatTime(msg.timestamp)}</span>
                              <span style={{ color: serverColor(msg.from.server) }}>{fromInfo?.emoji ?? '?'} {msg.from.agent}@{msg.from.server}</span>
                              <span className="text-cyan-700">→</span>
                              <span style={{ color: serverColor(msg.to.server) }}>{toInfo?.emoji ?? '?'} {msg.to.agent}@{msg.to.server}</span>
                            </div>
                            <div className="text-gray-300 mb-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                              {isLong && !isExpanded ? `"${msg.message.slice(0, 100)}…"` : `"${msg.message}"`}
                              {isLong && <button onClick={() => setExpandedMsgId(isExpanded ? null : msg.id)} className="ml-2 text-cyan-700 hover:text-cyan-400 text-[9px] tracking-widest">{isExpanded ? '[moins]' : '[plus]'}</button>}
                            </div>
                            <div className="flex items-start gap-2 flex-wrap">
                              <span className="text-[10px] tracking-widest" style={{ color: msg.status === 'delivered' ? '#22c55e' : msg.status === 'failed' ? '#ff4444' : '#ffea00' }}>
                                {msg.status === 'delivered' ? '✅' : msg.status === 'failed' ? '❌' : '⏳'} {msg.status}
                              </span>
                              {msg.response && <span className="text-[10px] max-w-xs" style={{ color: '#00f0ff' }}>— {msg.response.length > 80 ? `${msg.response.slice(0, 80)}…` : msg.response}</span>}
                              {msg.error && <span className="text-[10px]" style={{ color: '#ff6666' }}>{msg.error}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ═══ THREADS TAB ═══ */}
            {tab === 'threads' && !activeThread && (
              <div className="px-5 py-4">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] tracking-widest text-cyan-600 font-bold">CONVERSATIONS</span>
                  <span className="text-[9px] text-cyan-800">({threads.length})</span>
                  <button onClick={loadThreads} className="text-[9px] text-cyan-700 hover:text-cyan-400 transition-colors tracking-widest ml-auto">↺ RAFRAÎCHIR</button>
                </div>

                {threads.length === 0 ? (
                  <div className="text-center py-10 space-y-3">
                    <div className="text-[10px] text-cyan-800 tracking-widest">— AUCUN THREAD —</div>
                    <div className="text-[9px] text-cyan-900">Utilise le bouton 🔗 THREAD dans l'onglet Message pour démarrer une conversation</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {threads.map((t) => {
                      const pa = t.participants.a, pb = t.participants.b;
                      const lastMsg = t.messages[t.messages.length - 1];
                      const isActive = t.status === 'active';
                      return (
                        <motion.div key={t.id}
                          className="relative px-4 py-3 cursor-pointer transition-all hover:brightness-110"
                          onClick={() => setActiveThread(t)}
                          style={{
                            background: isActive ? 'rgba(0,240,255,0.04)' : 'rgba(255,255,255,0.01)',
                            border: `1px solid ${isActive ? 'rgba(0,240,255,0.25)' : 'rgba(255,255,255,0.05)'}`,
                          }}
                          whileHover={{ x: 4 }}>
                          {/* Header */}
                          <div className="flex items-center gap-2 mb-2">
                            <span style={{ color: serverColor(pa.server) }}>{pa.emoji ?? '?'} {pa.name ?? pa.agent}</span>
                            <span className="text-cyan-600 text-[10px]">⇄</span>
                            <span style={{ color: serverColor(pb.server) }}>{pb.emoji ?? '?'} {pb.name ?? pb.agent}</span>
                            {t.mode === 'autonomous' && (
                              <span className="text-[9px] px-1.5 py-0.5" style={{ color: '#ff6600', border: '1px solid rgba(255,102,0,0.3)' }}>🤖</span>
                            )}
                            <span className="ml-auto text-[9px] tracking-widest px-2 py-0.5"
                              style={{
                                color: isActive ? '#22c55e' : '#666',
                                border: `1px solid ${isActive ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`,
                              }}>
                              {isActive ? (t.mode === 'autonomous' ? '● RUNNING…' : '● ACTIVE') : 'CLOSED'}
                            </span>
                          </div>
                          {/* Last message preview */}
                          <div className="text-[10px] text-gray-500 truncate">
                            Round {t.currentRound}/{t.maxRounds} · {lastMsg ? `"${lastMsg.content.slice(0, 60)}…"` : '—'}
                          </div>
                          <div className="text-[9px] text-cyan-900 mt-1">{formatTime(t.updatedAt)}</div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ═══ THREAD DETAIL (chat view) ═══ */}
            {tab === 'threads' && activeThread && (
              <div className="flex flex-col h-full">
                {/* Thread header */}
                <div className="px-5 py-3 flex items-center gap-2 shrink-0" style={{ borderBottom: '1px solid rgba(0,240,255,0.1)' }}>
                  <button onClick={() => setActiveThread(null)} className="text-cyan-600 hover:text-cyan-300 text-xs">← RETOUR</button>
                  <span className="text-[10px] text-cyan-400 tracking-widest ml-2">
                    {activeThread.participants.a.emoji} {activeThread.participants.a.name ?? activeThread.participants.a.agent}
                    <span className="text-cyan-600 mx-1">⇄</span>
                    {activeThread.participants.b.emoji} {activeThread.participants.b.name ?? activeThread.participants.b.agent}
                  </span>
                  <span className="text-[9px] text-cyan-800 ml-2">
                    R{activeThread.currentRound}/{activeThread.maxRounds}
                  </span>
                  {activeThread.mode === 'autonomous' && (
                    <span className="text-[9px] px-2 py-0.5 tracking-widest ml-1" style={{ color: '#ff6600', border: '1px solid rgba(255,102,0,0.3)' }}>
                      {activeThread.status === 'active' ? '🤖 EN COURS…' : '🤖 AUTONOME'}
                    </span>
                  )}
                  {activeThread.status === 'active' && (
                    <button onClick={() => handleCloseThread(activeThread.id)}
                      className="ml-auto text-[9px] tracking-widest text-red-500 hover:text-red-300 px-2 py-1"
                      style={{ border: '1px solid rgba(255,0,0,0.3)' }}>
                      FERMER
                    </button>
                  )}
                </div>

                {/* Chat messages */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0"
                  style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,240,255,0.2) transparent' }}>
                  {activeThread.messages.map((m, i) => {
                    const isFromA = m.from === `${activeThread.participants.a.agent}@${activeThread.participants.a.server}`;
                    const senderP = isFromA ? activeThread.participants.a : activeThread.participants.b;
                    const receiverP = isFromA ? activeThread.participants.b : activeThread.participants.a;
                    const senderColor = serverColor(senderP.server);
                    const receiverColor = serverColor(receiverP.server);

                    return (
                      <div key={m.id ?? i} className="space-y-2">
                        {/* Sent message (right-aligned) */}
                        <div className="flex justify-end">
                          <div className="max-w-[80%] px-3 py-2 text-[11px]" style={{
                            background: 'rgba(0,240,255,0.06)',
                            borderLeft: `3px solid ${senderColor}`,
                            borderTop: '1px solid rgba(0,240,255,0.15)',
                            borderRight: '1px solid rgba(0,240,255,0.08)',
                            borderBottom: '1px solid rgba(0,240,255,0.08)',
                          }}>
                            <div className="text-[9px] mb-1 flex items-center gap-1" style={{ color: senderColor }}>
                              {senderP.emoji} {senderP.name ?? senderP.agent}
                              <span className="text-cyan-800 ml-2">{formatTime(m.timestamp)}</span>
                            </div>
                            <div className="text-gray-300 whitespace-pre-wrap" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{m.content}</div>
                          </div>
                        </div>
                        {/* Response (left-aligned) */}
                        {m.response && (
                          <div className="flex justify-start">
                            <div className="max-w-[80%] px-3 py-2 text-[11px]" style={{
                              background: 'rgba(176,0,255,0.04)',
                              borderLeft: `3px solid ${receiverColor}`,
                              borderTop: '1px solid rgba(176,0,255,0.15)',
                              borderRight: '1px solid rgba(176,0,255,0.08)',
                              borderBottom: '1px solid rgba(176,0,255,0.08)',
                            }}>
                              <div className="text-[9px] mb-1 flex items-center gap-1" style={{ color: receiverColor }}>
                                {receiverP.emoji} {receiverP.name ?? receiverP.agent}
                                {m.durationMs > 0 && <span className="text-cyan-800 ml-2">{(m.durationMs / 1000).toFixed(1)}s</span>}
                              </div>
                              <div className="text-gray-300 whitespace-pre-wrap" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{m.response}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>

                {/* Thread input */}
                {activeThread.status === 'active' && (
                  <div className="px-5 py-3 flex items-center gap-2 shrink-0" style={{ borderTop: '1px solid rgba(0,240,255,0.1)' }}>
                    <input type="text" value={threadMsg} onChange={(e) => setThreadMsg(e.target.value)}
                      placeholder="Continuer la conversation..."
                      className="flex-1 text-xs py-2 px-3 outline-none"
                      style={{ background: 'rgba(0,5,15,0.9)', border: '1px solid rgba(0,240,255,0.25)', color: '#e0f8ff', fontFamily: 'JetBrains Mono, monospace' }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleThreadSend(); } }}
                      disabled={threadSending} />
                    <CyberButton onClick={handleThreadSend} disabled={threadSending || !threadMsg.trim()} loading={threadSending} small>
                      {threadSending ? '◌' : '▶'}
                    </CyberButton>
                  </div>
                )}
                {activeThread.status !== 'active' && (
                  <div className="px-5 py-3 space-y-2" style={{ borderTop: '1px solid rgba(0,240,255,0.1)' }}>
                    <div className="text-center text-[10px] text-cyan-800 tracking-widest">
                      CONVERSATION TERMINÉE — {activeThread.closeReason ?? 'closed'}
                    </div>
                    {activeThread.summary && (
                      <div className="px-3 py-2 text-[11px]" style={{ background: 'rgba(255,102,0,0.05)', border: '1px solid rgba(255,102,0,0.2)' }}>
                        <div className="text-[9px] tracking-widest mb-1" style={{ color: '#ff6600' }}>📋 RÉSUMÉ</div>
                        <div className="text-gray-300 whitespace-pre-wrap" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{activeThread.summary}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Shared components ────────────────────────────────────────────────────

function AgentSelect({ label, value, onChange, agentsByServer }: {
  label: string; value: string; onChange: (v: string) => void;
  agentsByServer: Record<string, MeshAgent[]>;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-2">
      <label className="text-[10px] tracking-widest text-cyan-600 w-12 shrink-0">{label}</label>
      <div className="flex-1 relative">
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full text-xs py-2 px-3 outline-none appearance-none"
          style={{ background: 'rgba(0,5,15,0.9)', border: '1px solid rgba(0,240,255,0.25)', color: '#00f0ff', fontFamily: 'JetBrains Mono, monospace' }}>
          <option value="">— choisir {label.toLowerCase()} —</option>
          {Object.entries(agentsByServer).map(([server, serverAgents]) => (
            <optgroup key={server} label={`── ${server} ──`} style={{ color: serverColor(server) }}>
              {serverAgents.map((a) => (
                <option key={`${a.agent}@${a.server}`} value={`${a.agent}@${a.server}`}>
                  {a.emoji} {a.agentName} ({a.model})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-cyan-600 pointer-events-none text-xs">▼</div>
      </div>
    </div>
  );
}

function CyberButton({ onClick, disabled, loading, children, accent, small }: {
  onClick: () => void; disabled?: boolean; loading?: boolean; children: React.ReactNode;
  accent?: string; small?: boolean;
}) {
  const c = accent ?? '#00f0ff';
  return (
    <button onClick={onClick} disabled={disabled}
      className={`${small ? 'text-xs px-3 py-2' : 'text-xs px-4 py-2'} font-bold tracking-widest transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2`}
      style={{
        background: loading ? `rgba(0,240,255,0.05)` : `rgba(${accent ? '176,0,255' : '0,240,255'},0.08)`,
        border: `1px solid ${c}66`,
        color: c,
        boxShadow: loading ? 'none' : `0 0 12px ${c}26`,
        textShadow: `0 0 8px ${c}80`,
      }}>
      {loading && <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} className="inline-block">◌</motion.span>}
      {children}
    </button>
  );
}
