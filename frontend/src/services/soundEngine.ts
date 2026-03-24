/**
 * SoundEngine — Web Audio API singleton for Neural Grid
 * TRON-style audio system with 3 buses, crossfade, duck, anti-spam
 */

type BusName = 'ambience' | 'ui' | 'alerts';

interface SoundDef {
  file: string;
  bus: BusName;
  loop?: boolean;
  debounce?: number;
  cooldown?: number;
  duck?: { bus: BusName; dB: number; ms: number };
}

const SOUNDS: Record<string, SoundDef> = {
  // SFX → bus 'ui'
  'mesh:send':            { file: 'mesh-send.mp3',  bus: 'ui',      debounce: 150 },
  'mesh:receive':         { file: 'mesh-receive.mp3',  bus: 'ui',      debounce: 150 },
  'agent:wake':           { file: 'agent-wake.mp3',         bus: 'ui',      debounce: 2000 },
  'rack:blade_out':       { file: 'blade-out.mp3',      bus: 'ui',      debounce: 0 },
  'rack:blade_in':        { file: 'blade-in.mp3',       bus: 'ui',      debounce: 0 },
  'server:deploy':        { file: 'deploy.mp3',         bus: 'ui',      cooldown: 5000 },

  // Alerts → bus 'alerts'
  'alert:warning':        { file: 'warning.mp3',        bus: 'alerts',  debounce: 1000 },
  'alert:critical':       { file: 'critical.mp3',       bus: 'alerts',  debounce: 0,
                            duck: { bus: 'ambience', dB: -8, ms: 2000 } },

  // Loops → bus 'ambience'
  'ambience:healthy':     { file: 'city-healthy.mp3',   bus: 'ambience', loop: true },
  'ambience:maintenance': { file: 'maintenance.mp3',    bus: 'ambience', loop: true },
  'ambience:incident':    { file: 'incident.mp3',       bus: 'ambience', loop: true },
  'agent:idle':           { file: 'agent-idle.mp3',     bus: 'ambience', loop: true },
  'agent:thinking':       { file: 'agent-thinking.mp3', bus: 'ambience', loop: true },
};

// Default volumes per bus (0–1 linear)
const BUS_DEFAULTS: Record<BusName, number> = {
  ambience: 0.15,
  ui:       0.50,
  alerts:   0.80,
};

class SoundEngine {
  private ctx: AudioContext | null = null;
  private buffers: Map<string, AudioBuffer> = new Map();
  private loops: Map<string, { source: AudioBufferSourceNode; gain: GainNode }> = new Map();
  private masterGain: GainNode | null = null;
  private busGains: Partial<Record<BusName, GainNode>> = {};

  // Anti-spam
  private lastPlayed: Map<string, number> = new Map();
  private activeSfxCount = 0;
  private readonly MAX_POLYPHONY = 5;

  private _enabled: boolean;
  private _masterVolume = 1.0;
  private _initialized = false;

  constructor() {
    const stored = localStorage.getItem('ng-sound');
    this._enabled = stored === null ? false : stored === 'true';
  }

  get enabled(): boolean { return this._enabled; }

  // ── Init (must be called after a user gesture) ──────────────────────────
  async init(): Promise<void> {
    if (this._initialized) {
      // Resume suspended context (mobile policy)
      if (this.ctx?.state === 'suspended') await this.ctx.resume();
      return;
    }
    this._initialized = true;

    this.ctx = new AudioContext();

    // Master gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this._masterVolume;
    this.masterGain.connect(this.ctx.destination);

    // 3 bus gains
    for (const bus of ['ambience', 'ui', 'alerts'] as BusName[]) {
      const g = this.ctx.createGain();
      g.gain.value = BUS_DEFAULTS[bus];
      g.connect(this.masterGain);
      this.busGains[bus] = g;
    }

    // Preload all sounds
    await this._preloadAll();

    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  private async _preloadAll(): Promise<void> {
    if (!this.ctx) return;
    const seen = new Set<string>();
    const entries = Object.entries(SOUNDS);

    await Promise.allSettled(
      entries.map(async ([, def]) => {
        if (seen.has(def.file)) return;
        seen.add(def.file);
        try {
          const res = await fetch(`/sounds/${def.file}`);
          if (!res.ok) return;
          const arrayBuffer = await res.arrayBuffer();
          const audioBuffer = await this.ctx!.decodeAudioData(arrayBuffer);
          this.buffers.set(def.file, audioBuffer);
        } catch {
          // Silently ignore missing/corrupt files
        }
      }),
    );
  }

  // ── Play one-shot SFX ────────────────────────────────────────────────────
  play(id: string): void {
    if (!this._enabled || !this.ctx || !this.masterGain) return;

    const def = SOUNDS[id];
    if (!def || def.loop) return;

    // Debounce / cooldown
    const wait = def.debounce ?? def.cooldown ?? 0;
    if (wait > 0) {
      const last = this.lastPlayed.get(id) ?? 0;
      if (Date.now() - last < wait) return;
    }

    // Polyphony cap
    if (this.activeSfxCount >= this.MAX_POLYPHONY) return;

    const buf = this.buffers.get(def.file);
    if (!buf) return;

    const busGain = this.busGains[def.bus];
    if (!busGain) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buf;

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = 1;

    source.connect(gainNode);
    gainNode.connect(busGain);

    this.lastPlayed.set(id, Date.now());
    this.activeSfxCount++;

    source.onended = () => { this.activeSfxCount = Math.max(0, this.activeSfxCount - 1); };
    source.start();

    // Duck side-effect
    if (def.duck) {
      this.duck(def.duck.bus, def.duck.dB, def.duck.ms);
    }
  }

  // ── Start a loop ─────────────────────────────────────────────────────────
  startLoop(id: string): void {
    if (!this._enabled || !this.ctx) return;
    if (this.loops.has(id)) return; // already running

    const def = SOUNDS[id];
    if (!def) return;

    const buf = this.buffers.get(def.file);
    if (!buf) return;

    const busGain = this.busGains[def.bus];
    if (!busGain) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buf;
    source.loop = true;

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = 0;
    source.connect(gainNode);
    gainNode.connect(busGain);

    source.start();

    // Fade in
    const now = this.ctx.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(1, now + 1.5);

    this.loops.set(id, { source, gain: gainNode });
  }

  // ── Stop a loop with fade ─────────────────────────────────────────────────
  stopLoop(id: string, fadeMs = 800): void {
    const loop = this.loops.get(id);
    if (!loop || !this.ctx) return;

    const { source, gain } = loop;
    const now = this.ctx.currentTime;
    const fadeSec = fadeMs / 1000;

    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + fadeSec);

    setTimeout(() => {
      try { source.stop(); } catch { /* already stopped */ }
      this.loops.delete(id);
    }, fadeMs + 50);
  }

  // ── Crossfade between two loops ──────────────────────────────────────────
  crossfadeLoop(from: string, to: string, durationMs = 1500): void {
    if (!this.ctx) return;

    // Start the incoming loop first if not already running
    const toLoop = this.loops.get(to);
    if (!toLoop) {
      // Start new loop at 0 and ramp up
      const def = SOUNDS[to];
      if (!def) return;
      const buf = this.buffers.get(def.file);
      if (!buf) return;
      const busGain = this.busGains[def.bus];
      if (!busGain) return;

      const source = this.ctx.createBufferSource();
      source.buffer = buf;
      source.loop = true;

      const gainNode = this.ctx.createGain();
      gainNode.gain.value = 0;
      source.connect(gainNode);
      gainNode.connect(busGain);
      source.start();

      const now = this.ctx.currentTime;
      const fadeSec = durationMs / 1000;
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(1, now + fadeSec);

      this.loops.set(to, { source, gain: gainNode });
    }

    // Fade out the 'from' loop
    if (this.loops.has(from)) {
      this.stopLoop(from, durationMs);
    }
  }

  // ── Duck a bus temporarily ───────────────────────────────────────────────
  duck(bus: BusName, dB: number, durationMs: number): void {
    if (!this.ctx) return;
    const busGain = this.busGains[bus];
    if (!busGain) return;

    const factor = Math.pow(10, dB / 20); // dB to linear
    const now = this.ctx.currentTime;
    const fadeSec = 0.1;
    const holdSec = durationMs / 1000;

    const current = busGain.gain.value;
    busGain.gain.setValueAtTime(current, now);
    busGain.gain.linearRampToValueAtTime(current * factor, now + fadeSec);

    // Restore after hold
    const restoreAt = now + holdSec;
    busGain.gain.setValueAtTime(current * factor, restoreAt);
    busGain.gain.linearRampToValueAtTime(current, restoreAt + 0.4);
  }

  // ── Enable / disable ─────────────────────────────────────────────────────
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    localStorage.setItem('ng-sound', String(enabled));

    if (!enabled) {
      // Stop all loops
      for (const id of Array.from(this.loops.keys())) {
        this.stopLoop(id, 400);
      }
      // Mute master
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
      }
    } else {
      // Unmute master
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(this._masterVolume, this.ctx.currentTime);
      }
    }
  }

  // ── Master volume ────────────────────────────────────────────────────────
  setVolume(volume: number): void {
    this._masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this._masterVolume, this.ctx.currentTime);
    }
  }
}

export const soundEngine = new SoundEngine();
