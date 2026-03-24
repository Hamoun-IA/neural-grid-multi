import React, { useState } from 'react';
import { soundEngine } from '../services/soundEngine';

export const SoundToggle: React.FC = () => {
  const [enabled, setEnabled] = useState(() => soundEngine.enabled);

  const toggle = async () => {
    const next = !enabled;
    if (next && !soundEngine.enabled) {
      // First activation — need AudioContext after user gesture
      await soundEngine.init();
    }
    soundEngine.setEnabled(next);
    setEnabled(next);
  };

  return (
    <button
      onClick={toggle}
      title={enabled ? 'Mute sounds' : 'Enable sounds'}
      className="pointer-events-auto flex items-center justify-center px-2.5 py-1 text-sm rounded-full transition-all duration-150 font-mono"
      style={{
        border: `1px solid ${enabled ? 'rgba(0,240,255,0.4)' : 'rgba(255,255,255,0.12)'}`,
        color: enabled ? '#00f0ff' : 'rgba(255,255,255,0.35)',
        background: enabled ? 'rgba(0,240,255,0.05)' : 'transparent',
        textShadow: enabled ? '0 0 6px rgba(0,240,255,0.4)' : 'none',
        boxShadow: enabled ? '0 0 8px rgba(0,240,255,0.1)' : 'none',
      }}
    >
      {enabled ? '🔊' : '🔇'}
    </button>
  );
};

export default SoundToggle;
