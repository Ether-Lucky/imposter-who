/**
 * The DOM half of the flap engine (04 §3): a cell walks the drum with a two-half flip on
 * the Web Animations API. Text changes go straight to the DOM, so a full-board cascade
 * never re-renders React per step. The first render already shows the final text, so
 * content is visible without animation (04 §10) and server rendering works.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { FADE_MS, FlapScheduler, cascadeDelay, drumPath, fitText, halfMs } from './drum.ts';
import './flap.css';

export type FlapTone = 'ink' | 'amber' | 'red' | 'dim';

const EASE_FALL = 'cubic-bezier(0.55, 0, 0.9, 0.4)';
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
/** Extra time on the last step for the overshoot and settle. */
const SETTLE_MS = 70;

const scheduler = new FlapScheduler();

/** Called once per flip step, for the clatter (04 §3 sound). The host sets it; phones don't. */
let onStep: (() => void) | null = null;
export function setFlapStepSound(fn: (() => void) | null) {
  onStep = fn;
}
let hidden = typeof document !== 'undefined' && document.hidden;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (hidden) scheduler.flush();
  });
}

/**
 * Reduced motion for flaps: the OS setting, or forced by the host (REQ-UX-2). Wrap a tree
 * in `<FlapMotion.Provider value={{ reduced: true }}>` to force it.
 */
export const FlapMotion = createContext<{ reduced?: boolean }>({});

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReduced(onChange: () => void) {
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

type Parts = {
  top: HTMLSpanElement;
  bottom: HTMLSpanElement;
  fall: HTMLSpanElement;
  fallText: HTMLSpanElement;
  shade: HTMLSpanElement;
  rise: HTMLSpanElement;
  riseText: HTMLSpanElement;
};

/** The cell's moving parts, in the order the markup below lays them out. */
function partsOf(cell: HTMLSpanElement | null): Parts | null {
  if (!cell) return null;
  const [top, bottom, fall, rise] = Array.from(cell.children) as HTMLSpanElement[];
  if (!top || !bottom || !fall || !rise) return null;
  const at = (el: HTMLSpanElement, i: number) => el.children[i] as HTMLSpanElement;
  return {
    top: at(top, 0),
    bottom: at(bottom, 0),
    fall,
    fallText: at(fall, 0),
    shade: at(fall, 1),
    rise,
    riseText: at(rise, 0),
  };
}

function show(parts: Parts, ch: string) {
  parts.top.textContent = ch;
  parts.bottom.textContent = ch;
  delete parts.fall.dataset.on;
  delete parts.rise.dataset.on;
}

export function FlapCell({
  char,
  index = 0,
  row = 0,
  tone = 'ink',
}: {
  char: string;
  index?: number;
  row?: number;
  tone?: FlapTone;
}) {
  const forced = useContext(FlapMotion).reduced;
  const prefers = usePrefersReducedMotion();
  const reduced = forced ?? prefers;
  const [initial] = useState(char);
  const shown = useRef(char);
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const parts = partsOf(root.current);
    if (!parts) return;
    const path = drumPath(shown.current, char);
    if (path.length === 0) return;

    let cancelled = false;
    const running: Animation[] = [];
    const settle = () => {
      shown.current = char;
      show(parts, char);
    };

    const walk = async (done: () => void) => {
      try {
        if (reduced) {
          const glyphs = [parts.top, parts.bottom];
          await Promise.all(
            glyphs.map((g) => track(g.animate([{ opacity: 1 }, { opacity: 0 }], FADE_MS / 2))),
          );
          if (cancelled) return;
          settle();
          await Promise.all(
            glyphs.map((g) => track(g.animate([{ opacity: 0 }, { opacity: 1 }], FADE_MS / 2))),
          );
          return;
        }
        // Steps are pinned to planned times on the document timeline, so the frame or two
        // each step loses waiting to start and finish does not pile up over a long walk:
        // a late step just plays the rest of its flip.
        let planned = Number(document.timeline.currentTime ?? performance.now());
        for (let n = 0; n < path.length; n++) {
          if (cancelled) return;
          if (hidden) return settle();
          const next = path[n]!;
          const last = n === path.length - 1;
          const half = halfMs(n);
          parts.top.textContent = next;
          parts.bottom.textContent = shown.current;
          parts.fallText.textContent = shown.current;
          parts.riseText.textContent = next;
          // Both halves are scheduled at once (the rise waits out the fall with `delay`),
          // so each step costs one await, not two: long walks stay near their budget.
          parts.fall.dataset.on = '';
          parts.rise.dataset.on = '';
          const rise = parts.rise.animate(
            last
              ? [
                  { transform: 'rotateX(90deg)' },
                  { transform: 'rotateX(-6deg)', offset: 0.6 },
                  { transform: 'rotateX(0deg)' },
                ]
              : [{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(0deg)' }],
            {
              delay: half,
              duration: last ? half + SETTLE_MS : half,
              easing: EASE_OUT,
              fill: 'both',
            },
          );
          const step = [
            parts.fall.animate([{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-90deg)' }], {
              duration: half,
              easing: EASE_FALL,
              fill: 'forwards',
            }),
            parts.shade.animate([{ opacity: 0 }, { opacity: 0.5 }], half),
            rise,
          ];
          for (const anim of step) anim.startTime = planned;
          planned += 2 * half + (last ? SETTLE_MS : 0);
          running.push(...step);
          await rise.finished;
          if (cancelled) return;
          shown.current = next;
          parts.bottom.textContent = next;
          onStep?.();
          delete parts.fall.dataset.on;
          delete parts.rise.dataset.on;
          for (const anim of running.splice(0)) anim.cancel();
        }
      } catch {
        // A cancelled animation rejects `finished`; the cleanup below already settled.
      } finally {
        for (const a of running.splice(0)) a.cancel();
        done();
      }
    };
    const track = (a: Animation) => {
      running.push(a);
      return a.finished;
    };

    let cancelQueue = () => {};
    const timer = setTimeout(
      () => {
        cancelQueue = scheduler.request(walk, settle);
      },
      reduced ? 0 : cascadeDelay(index, row),
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
      cancelQueue();
      for (const a of running.splice(0)) a.cancel();
      // Leave the cell readable; the next walk starts from what is on screen.
      show(parts, shown.current);
    };
  }, [char, index, row, reduced]);

  return (
    <span ref={root} className="flap" data-tone={tone === 'ink' ? undefined : tone} aria-hidden>
      <span className="flap-half flap-top">
        <span className="flap-glyph">{initial}</span>
      </span>
      <span className="flap-half flap-bottom">
        <span className="flap-glyph">{initial}</span>
      </span>
      <span className="flap-half flap-top flap-leaf">
        <span className="flap-glyph" />
        <span className="flap-shade" />
      </span>
      <span className="flap-half flap-bottom flap-leaf">
        <span className="flap-glyph" />
      </span>
    </span>
  );
}

/**
 * A row of flap cells showing `text`, padded or cut to `width` cells. Screen readers get
 * the text once, not cell by cell.
 */
export function FlapRow({
  text,
  width = Array.from(text).length,
  row = 0,
  tone = 'ink',
  className = '',
}: {
  text: string;
  width?: number;
  row?: number;
  tone?: FlapTone;
  className?: string;
}) {
  const cells = fitText(text, width);
  return (
    <span className={`flap-row ${className}`}>
      <span className="sr-only">{text}</span>
      {cells.map((ch, i) => (
        <FlapCell key={i} char={ch} index={i} row={row} tone={tone} />
      ))}
    </span>
  );
}
