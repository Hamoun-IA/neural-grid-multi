/**
 * InteriorView V8 — Three.js / react-three-fiber tower view
 * Based on David's V8 prototype (neural-grid-internal/src/App.tsx)
 * Adapted: real server/agent data, server.color, framer-motion
 */

import React, { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Server as ServerIcon, Cpu, Network, Database, X } from 'lucide-react';
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

// ─── Detail Panel (matches David's Css3dApp design exactly) ──────────────────
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
      {/* Close button */}
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
          {/* Agent Header — emoji box + name + role */}
          <div className="flex items-center gap-4 mb-6 mt-2">
            <div
              className="w-14 h-14 rounded-xl border flex items-center justify-center text-3xl"
              style={{
                borderColor: `${hexColor}4d`,
                backgroundColor: `${hexColor}1a`,
              }}
            >
              {agent.emoji}
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-wider">{agent.name}</h2>
              <div className="text-sm font-mono mt-1" style={{ color: hexColor }}>
                {agent.role || agent.modelFriendly || agent.model}
              </div>
            </div>
          </div>

          <div className="space-y-4 flex-1 flex flex-col overflow-y-auto pr-2 pb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
            {/* Status Row */}
            <div className="flex items-center justify-between bg-white/5 p-4 rounded-lg border border-white/5">
              <span className="text-white/40 text-[10px] font-mono tracking-wider">STATUT</span>
              <div className="flex items-center gap-2 text-sm font-mono">
                <span className={`w-2.5 h-2.5 rounded-full ${statusDot}`} />
                {agent.status}
              </div>
            </div>

            {/* Grid Stats — 2x3 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                <div className="text-white/40 text-[10px] mb-1 font-mono tracking-wider">MODÈLE</div>
                <div className="text-sm font-medium">{agent.modelFriendly || agent.model}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                <div className="text-white/40 text-[10px] mb-1 font-mono tracking-wider">UPTIME</div>
                <div className="text-sm font-medium">{formatTime(agent.lastActiveAt)}</div>
              </div>
              <div className="bg-white/5 rounded-lg p-3 border border-white/5">
                <div className="text-white/40 text-[10px] mb-1 font-mono tracking-wider">DERNIÈRE ACTIVITÉ</div>
                <div className="text-sm font-medium">{formatTime(agent.lastActiveAt)}</div>
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

            {/* Session Active */}
            <div className="bg-white/5 rounded-lg p-3 border border-white/5">
              <div className="text-white/40 text-[10px] mb-1 font-mono tracking-wider">SESSION ACTIVE</div>
              <div className="text-sm">{isActive ? `Agent ${agent.id}` : 'Aucune'}</div>
            </div>

            {/* Tâche en cours */}
            <div className="bg-white/5 rounded-lg p-3 border border-white/5">
              <div className="text-white/40 text-[10px] mb-1 font-mono tracking-wider">TÂCHE EN COURS</div>
              <div className="text-sm text-white/80 leading-relaxed">
                {isActive ? `${agent.name} est en cours de traitement...` : 'En attente de nouvelles instructions.'}
              </div>
            </div>

            {/* Connexions Mesh */}
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
