/**
 * Every sound in the game, synthesised with Web Audio (04 §7, T6.1): no audio files, so
 * nothing to license and 0 KB against the 600 KB budget. The context is created on the
 * first user gesture (autoplay rules) and nothing plays before that.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

/** Create (or resume) the audio context. Call from a user gesture. */
export function unlockAudio(): boolean {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return false;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return true;
}

export function audioReady(): boolean {
  return !!ctx && ctx.state === 'running';
}

export function setMasterVolume(v: number) {
  if (master && ctx)
    master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), ctx.currentTime, 0.05);
}

function out(gain = 1, dest: AudioNode | null = master): GainNode | null {
  if (!ctx || !dest) return null;
  const g = ctx.createGain();
  g.gain.value = gain;
  g.connect(dest);
  return g;
}

/** A pitched note with a soft attack and exponential release. */
function tone(
  freq: number,
  at: number,
  dur: number,
  {
    type = 'sine' as OscillatorType,
    gain = 0.2,
    glideTo = 0,
    dest = master as AudioNode | null,
  } = {},
) {
  if (!ctx) return;
  const g = out(0, dest);
  if (!g) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g);
  o.start(at);
  o.stop(at + dur + 0.05);
}

/** A burst of filtered noise. */
function hiss(
  at: number,
  dur: number,
  {
    filter = 'bandpass' as BiquadFilterType,
    freq = 2000,
    q = 1,
    gain = 0.2,
    rate = 1,
    dest = master as AudioNode | null,
  } = {},
) {
  if (!ctx || !noise) return;
  const g = out(0, dest);
  if (!g) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = rate;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g);
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.02);
}

const now = () => ctx?.currentTime ?? 0;

// ── flap ticks: pooled, rate-limited to 60 a second, pitch jittered ±6% (04 §3) ──
let tickWindow = 0;
let ticksInWindow = 0;
export function flapTick() {
  if (!ctx) return;
  const t = performance.now();
  if (t - tickWindow > 1000) {
    tickWindow = t;
    ticksInWindow = 0;
  }
  if (++ticksInWindow > 60) return;
  const jitter = 1 + (Math.random() * 2 - 1) * 0.06;
  hiss(now(), 0.018, { freq: 3200 * jitter, q: 2.5, gain: 0.08, rate: jitter });
  tone(1800 * jitter, now(), 0.012, { type: 'square', gain: 0.012 });
}

// ── chimes and stingers (host) ──
const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12);

function chord(
  notes: number[],
  at: number,
  step: number,
  dur: number,
  gain = 0.12,
  type: OscillatorType = 'sine',
) {
  notes.forEach((n, i) => tone(NOTE(n), at + i * step, dur, { type, gain }));
}

export const sfx = {
  /** A passenger checks in. */
  checkIn: () => chord([84, 88], now(), 0.09, 0.5, 0.08),
  /** The classic station "ding-dong-ding" for a departure. */
  departure: () => chord([79, 76, 72, 79], now(), 0.32, 1.1, 0.12),
  turn: () => chord([81, 86], now(), 0.12, 0.6, 0.1),
  /** The soft thunk when a clue's last cell settles. */
  thunk: () => {
    tone(110, now(), 0.12, { gain: 0.25, glideTo: 70 });
    hiss(now(), 0.05, { filter: 'lowpass', freq: 700, gain: 0.15 });
  },
  finalCall: () => chord([84, 81, 77], now(), 0.22, 0.9, 0.12),
  /** One vote landing in the reveal. */
  stamp: () => {
    hiss(now(), 0.07, { filter: 'lowpass', freq: 900, gain: 0.3 });
    tone(150, now(), 0.09, { gain: 0.22, glideTo: 90 });
  },
  departed: () => {
    chord([55, 62, 67, 74], now(), 0.05, 1.6, 0.07, 'sawtooth');
    hiss(now(), 1.2, { filter: 'lowpass', freq: 500, gain: 0.08 });
  },
  cancelled: () => {
    tone(NOTE(64), now(), 0.5, { type: 'triangle', gain: 0.14, glideTo: NOTE(58) });
    tone(NOTE(60), now() + 0.45, 0.9, { type: 'triangle', gain: 0.14, glideTo: NOTE(52) });
  },
  fanfare: () => chord([72, 76, 79, 84, 88], now(), 0.11, 0.9, 0.1, 'triangle'),
  /** A station clock's tick for each of the last 10 seconds. */
  tick: () => {
    hiss(now(), 0.025, { freq: 2400, q: 6, gain: 0.22 });
    tone(1250, now(), 0.04, { type: 'square', gain: 0.03 });
  },
  /** Time up. */
  buzzer: () => {
    tone(147, now(), 0.55, { type: 'sawtooth', gain: 0.09 });
    tone(155, now(), 0.55, { type: 'sawtooth', gain: 0.09 });
  },
  /** The giant verdict stamp landing. */
  boom: () => {
    tone(90, now(), 0.5, { gain: 0.35, glideTo: 40 });
    hiss(now(), 0.25, { filter: 'lowpass', freq: 400, gain: 0.35 });
  },
  /** The getaway train rushing past. */
  whoosh: () => {
    const at = now();
    hiss(at, 1.4, { filter: 'bandpass', freq: 900, q: 0.7, gain: 0.18 });
    chord([76, 72], at + 0.1, 0.25, 0.6, 0.06, 'square');
  },
  // phone (opt-in)
  tear: () => {
    const at = now();
    for (let i = 0; i < 6; i++)
      hiss(at + i * 0.018, 0.03, { filter: 'highpass', freq: 2500 + i * 300, gain: 0.12 });
  },
  punch: () => {
    hiss(now(), 0.03, { filter: 'bandpass', freq: 1500, q: 4, gain: 0.3 });
    tone(220, now(), 0.05, { gain: 0.15 });
  },
  ding: () => tone(NOTE(88), now(), 0.5, { gain: 0.12 }),
  win: () => chord([72, 76, 79, 84], now(), 0.1, 0.6, 0.1, 'triangle'),
  loss: () => chord([67, 63, 60], now(), 0.18, 0.8, 0.1, 'triangle'),
};

/** A looping drum roll for the vote reveal. Returns a stop function. */
export function drumRoll(): () => void {
  if (!ctx || !noise || !master) return () => {};
  const g = out(0);
  if (!g) return () => {};
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 380;
  const trem = ctx.createGain();
  const lfo = ctx.createOscillator();
  const depth = ctx.createGain();
  lfo.frequency.value = 17;
  depth.gain.value = 0.5;
  trem.gain.value = 0.5;
  lfo.connect(depth).connect(trem.gain);
  src.connect(f).connect(trem).connect(g);
  g.gain.linearRampToValueAtTime(0.22, now() + 0.8);
  src.start();
  lfo.start();
  return () => {
    const t = now();
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0, t, 0.08);
    src.stop(t + 0.5);
    lfo.stop(t + 0.5);
  };
}

/** Low station ambience for the lobby: distant rumble. Returns { stop, duck }. */
export function ambience(): { stop: () => void; duck: (ms: number) => void } {
  if (!ctx || !noise) return { stop: () => {}, duck: () => {} };
  const g = out(0);
  if (!g) return { stop: () => {}, duck: () => {} };
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  src.playbackRate.value = 0.25;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 260;
  src.connect(f).connect(g);
  const level = 0.06;
  g.gain.linearRampToValueAtTime(level, now() + 2);
  src.start();
  return {
    stop: () => {
      g.gain.setTargetAtTime(0, now(), 0.4);
      src.stop(now() + 2);
    },
    duck: (ms) => {
      const t = now();
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(level * 0.3, t, 0.05);
      g.gain.setTargetAtTime(level, t + ms / 1000, 0.4);
    },
  };
}
