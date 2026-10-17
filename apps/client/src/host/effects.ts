/**
 * Showpiece effects on the board (REQ-UX-9, 04 §4.14). Each one animates one or two
 * elements with transform or opacity and cleans up after itself, so none costs more than
 * a flap row (04 §9). Every function takes `reduced` and keeps the information then.
 * None of them knows anything the board is not already showing.
 */
import { burstConfetti } from '../fx/confetti.ts';

type Opts = { reduced?: boolean };

const board = () => document.querySelector<HTMLElement>('.board');
const layer = () => document.querySelectorAll<HTMLElement>('.board-layer')[1] ?? null;

/** Add a short-lived element to the board, removed when its animation ends. */
function overlay(className: string, html = ''): HTMLElement | null {
  const host = board();
  if (!host) return null;
  const el = document.createElement('div');
  el.className = className;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = html;
  host.appendChild(el);
  return el;
}

function finish(el: HTMLElement, anim: Animation) {
  anim.onfinish = () => el.remove();
  anim.oncancel = () => el.remove();
}

/** A mechanical jolt of the whole board. */
export function shudder({ strength = 3, reduced }: Opts & { strength?: number } = {}) {
  const el = layer();
  if (!el || reduced) return;
  const s = strength;
  el.animate(
    [
      { transform: 'translate(0, 0)' },
      { transform: `translate(${-s}px, ${s * 0.6}px)` },
      { transform: `translate(${s}px, ${-s * 0.4}px)` },
      { transform: `translate(${-s * 0.6}px, ${s * 0.3}px)` },
      { transform: `translate(${s * 0.3}px, 0)` },
      { transform: 'translate(0, 0)' },
    ],
    { duration: 380, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
  );
}

/** The board's frame catches the light: one amber inset flash. */
export function glint({ reduced }: Opts = {}) {
  if (reduced) return;
  const el = overlay('fx-glint');
  if (!el) return;
  finish(el, el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], 320));
}

/** A band of light crossing the board diagonally (round start). */
export function sweep({ reduced }: Opts = {}) {
  if (reduced) return;
  const el = overlay('fx-sweep');
  if (!el) return;
  finish(
    el,
    el.animate(
      [
        { transform: 'translateX(-60vw) skewX(-20deg)', opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { opacity: 1, offset: 0.8 },
        { transform: 'translateX(140vw) skewX(-20deg)', opacity: 0 },
      ],
      { duration: 700, easing: 'cubic-bezier(0.77, 0, 0.175, 1)' },
    ),
  );
}

/** The station lights flicker twice (final call). */
export function flicker({ reduced }: Opts = {}) {
  const el = layer();
  if (!el || reduced) return;
  el.animate(
    [
      { opacity: 1 },
      { opacity: 0.7, offset: 0.15 },
      { opacity: 1, offset: 0.3 },
      { opacity: 0.7, offset: 0.55 },
      { opacity: 1, offset: 0.7 },
      { opacity: 1 },
    ],
    { duration: 420, easing: 'steps(1, end)' },
  );
}

/**
 * A giant stamp slams onto the middle of the board with a shockwave and a burst of chads
 * (the verdict: DEPARTED in amber or CANCELLED in red).
 */
export function verdictStamp(text: string, tone: 'amber' | 'red', { reduced }: Opts = {}) {
  const el = overlay(`fx-stamp fx-stamp-${tone}`, `<span>${escapeHtml(text)}</span>`);
  if (!el) return;
  const stamp = el.firstElementChild as HTMLElement;
  if (reduced) {
    finish(
      el,
      el.animate(
        [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }],
        2400,
      ),
    );
    return;
  }
  finish(
    el,
    el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], {
      duration: 2600,
      easing: 'linear',
    }),
  );
  stamp.animate(
    [
      { transform: 'rotate(-6deg) scale(2.2)', opacity: 0 },
      { transform: 'rotate(-6deg) scale(0.96)', opacity: 1, offset: 0.55 },
      { transform: 'rotate(-6deg) scale(1)', opacity: 1 },
    ],
    { duration: 420, easing: 'cubic-bezier(0.55, 0, 0.9, 0.4)', fill: 'both' },
  );
  // The impact: a ring expands, the board jolts, chads fly from the stamp.
  setTimeout(() => {
    const ring = overlay(`fx-ring fx-ring-${tone}`);
    if (ring) {
      finish(
        ring,
        ring.animate(
          [
            { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0.9 },
            { transform: 'translate(-50%, -50%) scale(3.2)', opacity: 0 },
          ],
          { duration: 700, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
        ),
      );
    }
    shudder({ strength: 7 });
    const r = stamp.getBoundingClientRect();
    burstConfetti({
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      angle: -90,
      spread: 120,
      count: 70,
      speed: 750,
    });
  }, 230);
}

/** Civilians win: volleys of chads from around the board. */
export function fireworks({ reduced }: Opts = {}) {
  if (reduced) return;
  const w = innerWidth;
  const h = innerHeight;
  const volleys = [
    { x: 0, y: h * 0.9, angle: -60 },
    { x: w, y: h * 0.9, angle: -120 },
    { x: w * 0.3, y: h, angle: -85 },
    { x: w * 0.7, y: h, angle: -95 },
    { x: w * 0.5, y: h, angle: -90 },
  ];
  volleys.forEach((v, i) =>
    setTimeout(() => burstConfetti({ ...v, spread: 28, count: 45, speed: 1150 }), i * 320),
  );
}

/** Imposter wins: a train of flap cells races across the board. */
export function getaway(text: string, { reduced }: Opts = {}) {
  const cells = [...` ${text.toUpperCase()} `]
    .map((ch) => `<b>${ch === ' ' ? '&nbsp;' : escapeHtml(ch)}</b>`)
    .join('');
  const el = overlay('fx-train', `<span>${cells}</span>`);
  if (!el) return;
  if (reduced) {
    finish(
      el,
      el.animate(
        [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }],
        3000,
      ),
    );
    return;
  }
  const train = el.firstElementChild as HTMLElement;
  finish(
    el,
    train.animate([{ transform: 'translateX(100vw)' }, { transform: 'translateX(-100%)' }], {
      duration: 1700,
      iterations: 2,
      easing: 'cubic-bezier(0.45, 0, 0.55, 1)',
    }),
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
