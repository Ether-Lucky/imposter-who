/**
 * Chad confetti (04 §4.11, §5.8): ticket-punch circles in ink and amber that burst, fall
 * with gravity and spin (a circle seen edge-on is an ellipse). One fixed canvas, started
 * lazily, stopped when nothing is left, paused while the tab is hidden. Budget: at most
 * `MAX_PARTICLES` on screen (04 §9).
 */

const COLOURS = ['#f2f2ee', '#f5a623', '#f2f2ee', '#eceae4'];
const GRAVITY = 1400; // px/s²
const DRAG = 0.6; // per second
const LIFE_MS = 2500;

let MAX_PARTICLES = 180;

interface Chad {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  spin: number;
  phase: number;
  colour: string;
  born: number;
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let chads: Chad[] = [];
let raf = 0;
let last = 0;

/** Phones get a smaller budget (04 §9). */
export function setConfettiBudget(n: number) {
  MAX_PARTICLES = n;
}

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '20',
    pointerEvents: 'none',
  });
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  resize();
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (chads.length) start();
  });
}

function resize() {
  if (!canvas) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function start() {
  if (raf) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
}

function frame(now: number) {
  raf = 0;
  if (!ctx || !canvas) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  chads = chads.filter((c) => now - c.born < LIFE_MS && c.y < innerHeight + 40);
  for (const c of chads) {
    c.vy += GRAVITY * dt;
    c.vx *= 1 - DRAG * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.phase += c.spin * dt;
    const age = (now - c.born) / LIFE_MS;
    ctx.globalAlpha = age > 0.8 ? (1 - age) / 0.2 : 1;
    ctx.fillStyle = c.colour;
    ctx.beginPath();
    ctx.ellipse(
      c.x,
      c.y,
      c.r,
      Math.max(0.6, c.r * Math.abs(Math.cos(c.phase))),
      c.phase * 0.3,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (chads.length) start();
  else ctx.clearRect(0, 0, innerWidth, innerHeight);
}

/**
 * Burst `count` chads from (`x`, `y`) towards `angle` degrees (0 is right, -90 is up),
 * fanning out by `spread` degrees either side.
 */
export function burstConfetti({
  x,
  y,
  angle,
  spread,
  count,
  speed = 900,
  size = 5,
}: {
  x: number;
  y: number;
  angle: number;
  spread: number;
  count: number;
  speed?: number;
  size?: number;
}) {
  if (typeof document === 'undefined' || document.hidden) return;
  ensureCanvas();
  const now = performance.now();
  const room = Math.max(0, MAX_PARTICLES - chads.length);
  for (let i = 0; i < Math.min(count, room); i++) {
    const a = ((angle + (Math.random() * 2 - 1) * spread) * Math.PI) / 180;
    const v = speed * (0.55 + Math.random() * 0.6);
    chads.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      r: size * (0.7 + Math.random() * 0.6),
      spin: 6 + Math.random() * 14,
      phase: Math.random() * Math.PI,
      colour: COLOURS[i % COLOURS.length]!,
      born: now,
    });
  }
  start();
}
