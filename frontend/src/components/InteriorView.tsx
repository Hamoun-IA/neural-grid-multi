/**
 * InteriorView V8 — Three.js / react-three-fiber tower view
 * Based on David's V8 prototype (neural-grid-internal/src/App.tsx)
 * Adapted: real server/agent data, server.color, framer-motion
 */

import React, { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Server as ServerIcon, X } from 'lucide-react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Edges, Html } from '@react-three/drei';
import * as THREE from 'three';
import { ServerLayoutItem, Agent } from '../types';

// ─── Dimensions (same as David's V8) ─────────────────────────────────────────
const W = 4.5;
const H = 0.9;
const D = 3.5;
const GAP = 0.5;
const SPACING = H + GAP;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(iso?: string): string {
  if (!iso) return '—';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function formatTokens(used?: number, max?: number): string {
  if (!used) return '—';
  const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
  return max ? `${fmt(used)} / ${fmt(max)}` : fmt(used);
}

// ─── 3D Server Node ───────────────────────────────────────────────────────────
interface ServerNodeProps {
  agent: Agent;
  index: number;
  total: number;
  hexColor: string;
  isSelected: boolean;
  onClick: () => void;
}

const ServerNode: React.FC<ServerNodeProps> = ({ agent, index, total, hexColor, isSelected, onClick }) => {
  const groupRef = useRef<THREE.Group>(null!);
  const isActive = agent.status === 'ACTIVE' || agent.status === 'THINKING';

  // Stack from top to bottom (index 0 is highest)
  const baseY = (total - 1 - index) * SPACING + H / 2 + 0.5;
  const progress = agent.tokensPct ?? 0;
  const modelLabel = agent.modelFriendly || agent.model;

  useFrame(() => {
    if (!groupRef.current) return;
    // Smoothly pull out selected server
    const targetZ = isSelected ? 0.8 : 0;
    groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, targetZ, 0.1);
    // Subtle vibration if active/thinking
    if (isActive) {
      groupRef.current.position.x = (Math.random() - 0.5) * 0.02;
    } else {
      groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, 0, 0.1);
    }
  });

  return (
    <group
      ref={groupRef}
      position={[0, baseY, 0]}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* Main Server Chassis */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[W, H, D]} />
        <meshStandardMaterial
          color="#05050a"
          metalness={0.6}
          roughness={0.4}
          emissive={hexColor}
          emissiveIntensity={isSelected ? 0.15 : 0.02}
        />
        <Edges scale={1.001} threshold={15} color={hexColor} opacity={isSelected ? 1 : 0.5} transparent />

        {/* Front Panel UI */}
        <Html
          transform
          position={[0, 0, D / 2 + 0.001]}
          scale={0.01}
          zIndexRange={[100, 0]}
        >
          <div
            className="flex flex-col justify-between p-6 box-border cursor-pointer transition-colors duration-300"
            style={{
              width: `${W * 100}px`,
              height: `${H * 100}px`,
              backgroundColor: isSelected ? 'rgba(2, 6, 23, 0.95)' : 'rgba(2, 6, 23, 0.8)',
              borderTop: `2px solid ${hexColor}`,
              backdropFilter: 'blur(8px)',
            }}
          >
            <div style={{ color: hexColor }} className="font-mono text-xl tracking-[0.2em] font-medium flex items-center gap-2">
              <span style={{ fontSize: '1.2rem' }}>{agent.emoji}</span>
              <span>{agent.name.toUpperCase()}</span>
            </div>
            <div className="flex justify-between items-end">
              <div className="flex gap-2.5">
                {/* Status dots: ACTIVE = pulsing color, IDLE = gray */}
                {[0, 1, 2].map((d) => (
                  <div
                    key={d}
                    className={isActive ? 'animate-pulse' : ''}
                    style={{
                      width: 12, height: 12, borderRadius: '50%',
                      backgroundColor: isActive ? hexColor : '#444',
                      boxShadow: isActive ? `0 0 12px ${hexColor}` : 'none',
                      opacity: d === 0 ? 1 : d === 1 ? 0.4 : 0.15,
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <div style={{ fontSize: 10, color: hexColor, fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                  {modelLabel}
                </div>
                {/* Progress bar = tokensPct */}
                <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-500"
                    style={{
                      width: `${progress}%`,
                      backgroundColor: hexColor,
                      boxShadow: `0 0 10px ${hexColor}`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </Html>

        {/* Top Face Graphic */}
        <Html
          transform
          position={[0, H / 2 + 0.001, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={0.01}
          zIndexRange={[0, 0]}
        >
          <div
            className="flex items-center justify-center opacity-10 pointer-events-none"
            style={{
              width: `${W * 100}px`,
              height: `${D * 100}px`,
              backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          >
            <span className="font-mono text-6xl font-bold tracking-widest text-white transform -rotate-45">
              {agent.emoji}
            </span>
          </div>
        </Html>
      </mesh>
    </group>
  );
};

// ─── Wireframe Rack Structure ─────────────────────────────────────────────────
interface RackTowerProps {
  count: number;
  hexColor: string;
}

const RackTower: React.FC<RackTowerProps> = ({ count, hexColor }) => {
  const rackHeight = count * SPACING + 0.5;
  const rackY = rackHeight / 2 + 0.25;

  return (
    <group>
      {/* Outer Wireframe Bounding Box */}
      <mesh position={[0, rackY, 0]}>
        <boxGeometry args={[W + 0.4, rackHeight, D + 0.4]} />
        <meshBasicMaterial visible={false} />
        <Edges color={hexColor} opacity={0.3} transparent />
      </mesh>

      {/* Inner Shelves */}
      {Array.from({ length: count }).map((_, i) => {
        const y = (count - 1 - i) * SPACING + 0.5 - GAP / 2;
        return (
          <mesh key={i} position={[0, y, 0]}>
            <boxGeometry args={[W + 0.3, 0.05, D + 0.3]} />
            <meshStandardMaterial color="#0f172a" />
            <Edges color={hexColor} opacity={0.2} transparent />
          </mesh>
        );
      })}
    </group>
  );
};

// ─── Detail Panel ─────────────────────────────────────────────────────────────
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
  // Generate deterministic activity bars from agent id
  const bars = useMemo(() => {
    if (!agent) return [];
    let seed = 0;
    for (let i = 0; i < agent.id.length; i++) seed += agent.id.charCodeAt(i);
    const isActive = agent.status === 'ACTIVE';
    return Array.from({ length: 24 }, (_, i) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return isActive && i >= 20 ? 60 + (seed % 40) : 5 + (seed % 50);
    });
  }, [agent]);

  const isActive = agent?.status === 'ACTIVE' || agent?.status === 'THINKING';
  const statusColor = isActive ? '#22c55e' : '#555';
  const hasTokens = agent?.tokensUsed !== undefined || agent?.tokensPct !== undefined;

  // Stat cards: tokens if available, else sessions + floor
  const statCards = agent
    ? hasTokens
      ? [
          { label: 'MODEL', value: agent.modelFriendly || agent.model },
          { label: 'TOKENS', value: formatTokens(agent.tokensUsed, agent.tokensMax) },
        ]
      : [
          { label: 'SESSIONS', value: String(agent.sessionCount ?? 0) },
          { label: 'FLOOR', value: `${floorIndex + 1} / ${total}` },
        ]
    : [];

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      style={{
        width: 384,
        background: 'rgba(5, 5, 8, 0.92)',
        backdropFilter: 'blur(20px)',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        position: 'absolute',
        right: 0, top: 0, bottom: 0,
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        padding: 32,
        overflowY: 'auto',
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 24, right: 24,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.4)',
        }}
      >
        <X size={20} />
      </button>

      {!agent ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.2em', fontFamily: 'monospace' }}>
            SELECT A SERVER UNIT
          </div>
          <div style={{ fontSize: 9, color: '#333', fontFamily: 'monospace' }}>TO INSPECT AGENT</div>
        </div>
      ) : (
        <>
          {/* Agent Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32, marginTop: 8 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 8,
              border: `1px solid ${hexColor}4d`,
              background: `${hexColor}1a`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24,
            }}>
              {agent.emoji}
            </div>
            <div>
              <div style={{
                fontSize: 18, fontWeight: 700, letterSpacing: '0.08em', color: '#fff',
              }}>
                {agent.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <motion.span
                  animate={isActive ? { scale: [1, 1.3, 1] } : {}}
                  transition={isActive ? { duration: 2, repeat: Infinity } : {}}
                  style={{
                    width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                    backgroundColor: statusColor,
                    boxShadow: isActive ? `0 0 8px ${statusColor}` : 'none',
                  }}
                />
                <span style={{
                  fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
                  color: statusColor, fontFamily: 'monospace',
                }}>
                  {agent.status}
                </span>
              </div>
            </div>
          </div>

          {/* Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {statCards.map(({ label, value }) => (
              <div key={label} style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                padding: '12px 14px',
                borderRadius: 6,
              }}>
                <div style={{
                  fontSize: 9, color: 'rgba(255,255,255,0.35)',
                  letterSpacing: '0.15em', marginBottom: 6,
                  fontFamily: 'monospace',
                }}>
                  {label}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Activity Graph */}
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 6,
            padding: 16,
            height: 100,
            marginBottom: 20,
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              fontSize: 9, color: 'rgba(255,255,255,0.35)',
              letterSpacing: '0.15em', marginBottom: 8,
              fontFamily: 'monospace',
            }}>
              ⚡ ACTIVITY
            </div>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'flex-end', gap: 2,
            }}>
              {bars.map((h, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${h}%`,
                    borderRadius: 1,
                    backgroundColor: hexColor,
                    opacity: i >= 20 && isActive ? 0.8 : 0.25,
                    boxShadow: i >= 20 && isActive ? `0 0 3px ${hexColor}` : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Agent Info */}
          <div>
            <div style={{
              fontSize: 9, color: 'rgba(255,255,255,0.35)',
              letterSpacing: '0.15em', marginBottom: 10,
              fontFamily: 'monospace',
            }}>
              📋 AGENT INFO
            </div>
            {[
              ['Status', agent.status],
              ['Model', agent.modelFriendly || agent.model],
              ['Role', agent.role || '—'],
              ['Sessions', String(agent.sessionCount ?? agent.activeSessions ?? 0)],
              ['Last Active', formatTime(agent.lastActiveAt)],
              ['Server', serverName],
            ].map(([k, v]) => (
              <div key={k} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '7px 0',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                fontSize: 12,
              }}>
                <span style={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>{k}</span>
                <span style={{ color: '#ddd' }}>{v}</span>
              </div>
            ))}
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

  // Escape key to close
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!server) return null;

  const hexColor = server.color;
  const agents = server.agents;
  const towerHeight = agents.length * SPACING;

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;
  const selectedFloorIndex = selectedAgent ? agents.indexOf(selectedAgent) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: '#030305',
        display: 'flex', overflow: 'hidden',
        fontFamily: 'sans-serif', color: '#fff',
      }}
    >
      {/* ── 3D Canvas (fullscreen) ── */}
      <div style={{ flex: 1, position: 'relative', cursor: 'crosshair' }}>
        <Canvas
          shadows={{ type: THREE.PCFShadowMap }}
          camera={{ position: [10, towerHeight / 2 + 2, 12], fov: 45 }}
        >
          <color attach="background" args={['#030305']} />
          <fog attach="fog" args={['#030305', 15, 40]} />

          <ambientLight intensity={0.3} />
          <pointLight position={[0, towerHeight + 2, 5]} intensity={1.5} color="#ffffff" />
          <spotLight
            position={[8, towerHeight, 8]}
            angle={0.4}
            penumbra={1}
            intensity={2}
            color={hexColor}
            castShadow
          />
          <spotLight
            position={[-8, towerHeight, 8]}
            angle={0.4}
            penumbra={1}
            intensity={1.5}
            color={hexColor}
            castShadow
          />

          {/* Floor */}
          <gridHelper args={[100, 100, '#1e293b', '#020617']} position={[0, 0, 0]} />
          <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[100, 100]} />
            <meshStandardMaterial color="#020617" roughness={0.8} />
          </mesh>

          {/* Rack Tower */}
          <RackTower count={agents.length} hexColor={hexColor} />

          {/* Server Nodes */}
          {agents.map((agent, i) => (
            <ServerNode
              key={agent.id}
              agent={agent}
              index={i}
              total={agents.length}
              hexColor={hexColor}
              isSelected={selectedAgentId === agent.id}
              onClick={() => setSelectedAgentId((prev) => prev === agent.id ? null : agent.id)}
            />
          ))}

          <OrbitControls
            makeDefault
            target={[0, towerHeight / 2, 0]}
            minPolarAngle={0}
            maxPolarAngle={Math.PI / 2 - 0.05}
            minDistance={5}
            maxDistance={30}
            enableDamping
            dampingFactor={0.05}
          />
        </Canvas>

        {/* Header Overlay */}
        <div style={{
          position: 'absolute', top: 32, left: 32, zIndex: 20, pointerEvents: 'none',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, padding: '10px 16px',
            backdropFilter: 'blur(12px)',
            pointerEvents: 'auto',
          }}>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', color: '#fff',
                cursor: 'pointer', fontSize: 18, padding: '0 8px',
                opacity: 0.7, pointerEvents: 'auto',
              }}
            >
              ←
            </button>
            <ServerIcon size={16} color={hexColor} />
            <span style={{
              fontSize: 13, fontWeight: 700, letterSpacing: '0.2em',
              textTransform: 'uppercase', color: '#fff', fontFamily: 'monospace',
            }}>
              SERVER TOWER — {server.name.toUpperCase()}
            </span>
          </div>
          <p style={{
            fontSize: 10, color: 'rgba(255,255,255,0.3)',
            marginTop: 8, marginLeft: 4, fontFamily: 'monospace',
          }}>
            Left Click + Drag to Rotate │ Scroll to Zoom
          </p>
        </div>
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
    </motion.div>
  );
}
