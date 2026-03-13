import React from 'react';
import { motion } from 'framer-motion';

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0, 255, 255';
};

// Pixel-art 8×8 icons — one per server
const ICONS: Record<string, number[][]> = {
  // NOVA — supernova / 8-point star
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
  // STUDIO — film clapper board
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
  // CYBERPUNK — IC chip with pins
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
  // BABOUNETTE — cat paw
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
  // HOMELAB — house silhouette
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

// Fallback icon (generic CPU)
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

const PixelLogo = ({
  serverId,
  color,
  active,
  rotation,
}: {
  serverId: string;
  color: string;
  active: boolean;
  rotation: string;
}) => {
  const icon = ICONS[serverId] ?? DEFAULT_ICON;
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${icon[0].length}, 1fr)`,
          width: '32px',
          height: '32px',
          opacity: active ? 1 : 0.15,
          filter: active
            ? `drop-shadow(0 0 5px ${color}) drop-shadow(0 0 10px ${color})`
            : 'none',
          transform: rotation,
          transition: 'opacity 0.3s, filter 0.3s',
        }}
      >
        {icon.map((row, y) =>
          row.map((cell, x) => (
            <div
              key={`${x}-${y}`}
              style={{
                backgroundColor: cell ? color : 'transparent',
                boxShadow: cell && active ? `0 0 2px ${color}` : 'none',
              }}
            />
          )),
        )}
      </div>
    </div>
  );
};

interface BuildingProps {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  color?: string;
  opacity?: number;
  glowing?: boolean;
  /** Server ID used to look up the icon */
  label?: string;
  /** Short role text shown below the server name */
  role?: string;
  /** Number of agents — shown in the floating label */
  agentCount?: number;
  active?: boolean;
  status?: string;
  rotation?: { x: number; z: number };
}

export const Building: React.FC<BuildingProps> = ({
  x,
  y,
  w,
  d,
  h,
  color,
  opacity = 0.3,
  glowing = false,
  label = '',
  role = '',
  agentCount,
  active = false,
  status,
  rotation = { x: 60, z: -45 },
}) => {
  const baseColor = color || '#0ff';
  const borderStyle = `1px solid ${baseColor}`;
  const bgOpacity = glowing ? 0.3 : 0.1;
  const bgColor = `rgba(${hexToRgb(baseColor)}, ${bgOpacity})`;
  const solidBg = `rgba(5, 5, 10, 0.85)`;

  return (
    <div
      className="absolute"
      style={{
        left: x,
        top: y,
        width: w,
        height: d,
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Back */}
      <div
        className="absolute top-0 left-0"
        style={{
          width: w,
          height: h,
          transformOrigin: 'top',
          transform: 'rotateX(90deg)',
          background: solidBg,
          border: borderStyle,
          opacity,
        }}
      >
        {label && (
          <PixelLogo
            serverId={label}
            color={baseColor}
            active={active}
            rotation="rotate(180deg)"
          />
        )}
      </div>

      {/* Left */}
      <div
        className="absolute top-0 left-0"
        style={{
          width: h,
          height: d,
          transformOrigin: 'left',
          transform: 'rotateY(90deg)',
          background: solidBg,
          border: borderStyle,
          opacity,
        }}
      >
        {label && (
          <PixelLogo
            serverId={label}
            color={baseColor}
            active={active}
            rotation="rotate(90deg)"
          />
        )}
      </div>

      {/* Front */}
      <div
        className="absolute bottom-0 left-0 overflow-hidden"
        style={{
          width: w,
          height: h,
          transformOrigin: 'bottom',
          transform: 'rotateX(-90deg)',
          background: solidBg,
          border: borderStyle,
          opacity: opacity + 0.2,
        }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(${baseColor} 1px, transparent 1px)`,
            backgroundSize: '4px 4px',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(transparent 80%, ${baseColor} 80%)`,
            backgroundSize: '100% 20px',
            opacity: 0.3,
          }}
        />
        {label && (
          <PixelLogo
            serverId={label}
            color={baseColor}
            active={active}
            rotation="none"
          />
        )}
      </div>

      {/* Right */}
      <div
        className="absolute top-0 right-0 overflow-hidden"
        style={{
          width: h,
          height: d,
          transformOrigin: 'right',
          transform: 'rotateY(-90deg)',
          background: solidBg,
          border: borderStyle,
          opacity: opacity + 0.1,
        }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(${baseColor} 1px, transparent 1px)`,
            backgroundSize: '4px 4px',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(90deg, transparent 80%, ${baseColor} 80%)`,
            backgroundSize: '20px 100%',
            opacity: 0.3,
          }}
        />
        {label && (
          <PixelLogo
            serverId={label}
            color={baseColor}
            active={active}
            rotation="rotate(-90deg)"
          />
        )}
      </div>

      {/* Top */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          transform: `translateZ(${h}px)`,
          background: bgColor,
          border: borderStyle,
          opacity: opacity + 0.4,
          boxShadow: glowing ? `0 0 40px ${baseColor}` : 'none',
        }}
      >
        {glowing && (
          <div
            className="w-full h-full animate-pulse"
            style={{ background: baseColor, opacity: 0.4 }}
          />
        )}
      </div>

      {/* Volumetric Beam */}
      {glowing && (
        <div
          className="absolute left-1/2 top-1/2 pointer-events-none"
          style={{
            width: w,
            height: d,
            marginLeft: -w / 2,
            marginTop: -d / 2,
            transform: `translateZ(${h}px)`,
            transformStyle: 'preserve-3d',
          }}
        >
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 300, opacity: 0.4 }}
            className="absolute bottom-0 left-0"
            style={{
              width: w,
              background: `linear-gradient(to top, ${baseColor}, transparent)`,
              transformOrigin: 'bottom',
              transform: 'rotateX(-90deg)',
            }}
          />
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 300, opacity: 0.4 }}
            className="absolute top-0 left-0"
            style={{
              width: w,
              background: `linear-gradient(to bottom, ${baseColor}, transparent)`,
              transformOrigin: 'top',
              transform: 'rotateX(90deg)',
            }}
          />
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 0.4 }}
            className="absolute top-0 right-0"
            style={{
              height: d,
              background: `linear-gradient(to left, ${baseColor}, transparent)`,
              transformOrigin: 'right',
              transform: 'rotateY(90deg)',
            }}
          />
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 0.4 }}
            className="absolute top-0 left-0"
            style={{
              height: d,
              background: `linear-gradient(to right, ${baseColor}, transparent)`,
              transformOrigin: 'left',
              transform: 'rotateY(-90deg)',
            }}
          />
        </div>
      )}

      {/* Floating Diamond */}
      {active && (
        <motion.div
          animate={{ z: [h + 30, h + 50, h + 30], rotateZ: [0, 180, 360] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          className="absolute left-1/2 top-1/2"
          style={{
            width: 24,
            height: 24,
            marginLeft: -12,
            marginTop: -12,
            border: `2px solid ${baseColor}`,
            boxShadow: `0 0 15px ${baseColor}, inset 0 0 10px ${baseColor}`,
            transformStyle: 'preserve-3d',
          }}
        >
          <div className="absolute inset-0 opacity-50" style={{ backgroundColor: baseColor }} />
        </motion.div>
      )}

      {/* Floating Label — server name + role + agent count */}
      {label && (
        <div
          className="absolute left-1/2 top-1/2 transform-style-3d pointer-events-none"
          style={{ transform: `translateZ(${h + 90}px)` }}
        >
          <div
            className="flex flex-col items-center justify-center"
            style={{
              transform: `rotateZ(${-rotation.z}deg) rotateX(${-rotation.x}deg)`,
            }}
          >
            <motion.div
              className="px-2 py-1 relative flex flex-col items-center justify-center overflow-hidden"
              animate={
                glowing
                  ? { y: [0, -4, 0], opacity: [0.8, 1, 0.8] }
                  : { y: [0, -2, 0], opacity: [0.5, 0.7, 0.5] }
              }
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                backgroundColor: `${baseColor}15`,
                border: `1px solid ${baseColor}40`,
                boxShadow: glowing
                  ? `0 0 15px ${baseColor}40, inset 0 0 10px ${baseColor}20`
                  : `0 0 5px ${baseColor}20, inset 0 0 5px ${baseColor}10`,
                backdropFilter: 'blur(2px)',
                minWidth: '80px',
              }}
            >
              {/* Holographic Scanlines */}
              <div
                className="absolute inset-0 pointer-events-none opacity-30"
                style={{
                  backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 1px, ${baseColor} 1px, ${baseColor} 2px)`,
                  backgroundSize: '100% 2px',
                }}
              />

              {/* Glitch/Flicker Overlay */}
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{ backgroundColor: baseColor }}
                animate={{ opacity: [0.02, 0.1, 0.02, 0.15, 0.02] }}
                transition={{
                  duration: 0.2,
                  repeat: Infinity,
                  repeatType: 'mirror',
                  repeatDelay: Math.random() * 2 + 0.5,
                }}
              />

              {/* Corner Accents */}
              <div
                className="absolute top-0 left-0 w-1 h-1 border-t border-l"
                style={{ borderColor: baseColor, boxShadow: `-1px -1px 3px ${baseColor}` }}
              />
              <div
                className="absolute top-0 right-0 w-1 h-1 border-t border-r"
                style={{ borderColor: baseColor, boxShadow: `1px -1px 3px ${baseColor}` }}
              />
              <div
                className="absolute bottom-0 left-0 w-1 h-1 border-b border-l"
                style={{ borderColor: baseColor, boxShadow: `-1px 1px 3px ${baseColor}` }}
              />
              <div
                className="absolute bottom-0 right-0 w-1 h-1 border-b border-r"
                style={{ borderColor: baseColor, boxShadow: `1px 1px 3px ${baseColor}` }}
              />

              {/* Server Name */}
              <div
                className="font-bold text-[10px] tracking-widest relative z-10 text-center"
                style={{
                  color: '#fff',
                  textShadow: `0 0 5px ${baseColor}, 0 0 10px ${baseColor}, 0 0 15px ${baseColor}`,
                }}
              >
                {label}
              </div>

              {/* Role */}
              {role && (
                <div
                  className="text-[7px] tracking-wider relative z-10 text-center opacity-80 mt-0.5"
                  style={{ color: baseColor }}
                >
                  {role}
                </div>
              )}

              {/* Agent count */}
              {agentCount !== undefined && (
                <div
                  className="text-[7px] tracking-wider relative z-10 text-center opacity-60 mt-0.5"
                  style={{ color: baseColor }}
                >
                  {agentCount} agent{agentCount !== 1 ? 's' : ''}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </div>
  );
};
