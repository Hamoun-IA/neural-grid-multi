/**
 * BuildingAura — CSS-animated health halo around a server building.
 * Reflects server health state: healthy (subtle), warning (slow pulse), critical (fast pulse).
 */

import React from 'react';

interface BuildingAuraProps {
  status: 'healthy' | 'warning' | 'critical';
  color: string;   // server color (used for healthy subtle glow)
  width: number;   // building footprint width (px)
  depth: number;   // building footprint depth (px)
}

const KEYFRAMES = `
@keyframes pulse-warning {
  0%, 100% { opacity: 0.3; }
  50%       { opacity: 0.7; }
}
@keyframes pulse-critical {
  0%, 100% { opacity: 0.4; }
  50%       { opacity: 1;   }
}
@keyframes pulse-healthy {
  0%, 100% { opacity: 0.08; }
  50%       { opacity: 0.18; }
}
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const tag = document.createElement('style');
  tag.textContent = KEYFRAMES;
  document.head.appendChild(tag);
}

export default function BuildingAura({ status, color, width, depth }: BuildingAuraProps) {
  // Inject keyframes once into <head>
  React.useEffect(() => { injectStyles(); }, []);

  let boxShadow = '';
  let animation = '';
  let background = '';

  if (status === 'critical') {
    boxShadow = '0 0 30px 8px rgba(255,0,0,0.6)';
    animation = 'pulse-critical 0.8s ease-in-out infinite';
    background = 'rgba(255,0,0,0.08)';
  } else if (status === 'warning') {
    boxShadow = '0 0 20px 6px rgba(255,200,0,0.4)';
    animation = 'pulse-warning 2s ease-in-out infinite';
    background = 'rgba(255,200,0,0.04)';
  } else {
    // healthy — very subtle glow using server color, slow breathe
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    boxShadow = `0 0 10px 2px rgba(${r},${g},${b},0.15)`;
    animation = 'pulse-healthy 4s ease-in-out infinite';
    background = `rgba(${r},${g},${b},0.04)`;
  }

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        pointerEvents: 'none',
        boxShadow,
        animation,
        background,
        // Slightly expand beyond the building footprint for a nice halo
        width: width + 8,
        height: depth + 8,
        left: -4,
        top: -4,
        borderRadius: 2,
        zIndex: 0,
      }}
    />
  );
}
