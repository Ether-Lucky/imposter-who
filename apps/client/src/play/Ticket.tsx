/**
 * The player's private ticket (04 §1.4, §5). Same structure for every role
 * (REQ-GUESS-5): only the text changes. Face-down until torn; afterwards the secret sits
 * behind a hold-to-peek shutter (REQ-ROLE-2, REQ-ROLE-3) and is not in the page at all
 * until held.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Ticket as TicketT } from '@imposter-who/core';
import { capturePointer } from '../ui/capture.ts';
import { useReducedMotion } from '../ui/motion.ts';
import './ticket.css';

export type TicketMode = 'waiting' | 'faceDown' | 'faceUp' | 'peek';

/** How long the peek-only footer lingers after release so it can be tapped (both roles). */
export const PEEK_FOOTER_MS = 3000;
/** Tear thresholds (04 §5.3). */
export const TEAR_FRACTION = 0.4;
export const TEAR_VELOCITY = 0.11; // px per ms
export const RUBBER_FROM = 0.3;
export const HOLD_TO_TEAR_MS = 600;

/**
 * Where the stub sits for a drag of `dx` px on a strip `width` px wide: it follows the
 * finger, then resists past 30% (rubber band).
 */
export function rubberBand(dx: number, width: number): number {
  const d = Math.max(0, dx);
  const free = width * RUBBER_FROM;
  return d <= free ? d : free + (d - free) * 0.35;
}

/** Whether a release tears: far enough, or flicked fast enough. */
export function releaseTears(dx: number, width: number, velocity: number): boolean {
  return dx / width > TEAR_FRACTION || velocity > TEAR_VELOCITY;
}

export function Barcode({ seed, breathe = false }: { seed: number; breathe?: boolean }) {
  const bars = Array.from({ length: 28 }, (_, i) => ((seed + 3) * (i + 7) * 2654435761) % 4);
  return (
    <div aria-hidden className="barcode" data-breathe={breathe || undefined}>
      {bars.map((w, i) => (
        <span key={i} className="h-full bg-ticket-ink" style={{ width: `${w + 1}px` }} />
      ))}
    </div>
  );
}

export function Stamp({ text, tone }: { text: string; tone: 'amber' | 'red' | 'ink' }) {
  return (
    <p key={text} className={`stamp stamp-${tone}`} aria-hidden>
      {text}
    </p>
  );
}

/**
 * Drag the stub sideways to tear it off (or hold it for 600 ms, or press Enter). The
 * server hears about the tear at once; the falling stub is decoration (REQ-UX-3).
 */
export function TearStrip({ onTear, disabled }: { onTear: () => void; disabled?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const drag = useRef<{ x: number; t: number; lastX: number; lastT: number; v: number } | null>(
    null,
  );
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);
  const [holding, setHolding] = useState(false);

  useEffect(
    () => () => {
      if (hold.current) clearTimeout(hold.current);
    },
    [],
  );

  const tear = (velocity: number, dx: number) => {
    if (done.current || disabled) return;
    done.current = true;
    setHolding(false);
    onTear();
    const el = ref.current;
    if (!el || reduced) return;
    const fly = Math.max(0.4, velocity) * 500;
    el.animate(
      [
        { transform: `translateX(${dx}px)`, opacity: 1 },
        { transform: `translate(${dx + fly}px, 420px) rotate(28deg)`, opacity: 0 },
      ],
      { duration: 650, easing: 'cubic-bezier(0.55, 0, 0.9, 0.4)', fill: 'forwards' },
    );
  };

  const springBack = (from: number) => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = '';
    if (!reduced && from > 0) {
      el.animate([{ transform: `translateX(${from}px)` }, { transform: 'translateX(0)' }], {
        duration: 320,
        easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
      });
    }
  };

  const stopHold = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
    setHolding(false);
  };

  return (
    <button
      ref={ref}
      type="button"
      className="tear"
      disabled={disabled}
      data-holding={holding || undefined}
      aria-label="Tear to reveal your destination"
      onPointerDown={(e) => {
        if (done.current) return;
        capturePointer(e);
        const now = e.timeStamp;
        drag.current = { x: e.clientX, t: now, lastX: e.clientX, lastT: now, v: 0 };
        setHolding(true);
        hold.current = setTimeout(() => tear(0, 0), HOLD_TO_TEAR_MS);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || done.current) return;
        const dx = e.clientX - d.x;
        if (Math.abs(dx) > 8) stopHold();
        const dt = e.timeStamp - d.lastT;
        if (dt > 0) d.v = (e.clientX - d.lastX) / dt;
        d.lastX = e.clientX;
        d.lastT = e.timeStamp;
        const w = ref.current?.offsetWidth ?? 300;
        if (ref.current) ref.current.style.transform = `translateX(${rubberBand(dx, w)}px)`;
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        stopHold();
        if (!d || done.current) return;
        const dx = e.clientX - d.x;
        const w = ref.current?.offsetWidth ?? 300;
        if (dx > 8 && releaseTears(dx, w, d.v)) tear(d.v, rubberBand(dx, w));
        else springBack(rubberBand(dx, w));
      }}
      onPointerCancel={() => {
        drag.current = null;
        stopHold();
        springBack(0);
      }}
      onClick={(e) => {
        // Keyboard activation (Enter or Space) has no pointer; a drag or hold handles itself.
        if (e.detail === 0) tear(0, 0);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span>Tear to reveal</span>
      <span className="tear-ring" aria-hidden />
    </button>
  );
}

function Face({ ticket, motion }: { ticket: TicketT; motion: 'flip' | 'open' | 'close' }) {
  const cls = { flip: 'flip-in', open: 'shutter-open', close: 'shutter-close' }[motion];
  return (
    <div className={cls}>
      <p className="ticket-label mt-4">Destination</p>
      <p className="text-4xl leading-tight font-black break-words uppercase">{ticket.headline}</p>
      <p className="min-h-6 text-sm tracking-widest uppercase">
        {ticket.line ? `Line: ${ticket.line}` : ' '}
      </p>
    </div>
  );
}

export function TicketCard({
  name,
  seat,
  ticket,
  mode,
  caption,
  peekFooter,
  stamp,
  onTear,
  tearDisabled,
  body,
}: {
  name: string;
  seat: number;
  ticket: TicketT | null;
  mode: TicketMode;
  /** Shown when the secret is not on screen (e.g. "Waiting for departure"). */
  caption?: ReactNode;
  /** Rendered in the stub only while peeking (guess link or a same-size note). */
  peekFooter?: ReactNode;
  stamp?: { text: string; tone: 'amber' | 'red' | 'ink' } | null;
  /** Face-down tickets: the stub is a tear strip. */
  onTear?: () => void;
  tearDisabled?: boolean;
  /** Replaces the face (the passenger list while voting). */
  body?: ReactNode;
}) {
  const [holding, setHolding] = useState(false);
  const [closing, setClosing] = useState(false);
  const [footerUntil, setFooterUntil] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const release = () => {
    if (!holding) return;
    setHolding(false);
    setClosing(true);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setClosing(false), 120);
    setFooterUntil(Date.now() + PEEK_FOOTER_MS);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFooterUntil(0), PEEK_FOOTER_MS);
  };

  const peekable = mode === 'peek' && !body;
  // The shutter stays on screen for its 120 ms close after release (04 §5.4).
  const showFace = mode === 'faceUp' || (peekable && (holding || closing));
  const showFooter = peekable && (holding || footerUntil > 0);

  let stub: ReactNode = <Barcode seed={seat} breathe={mode === 'waiting'} />;
  if (mode === 'faceDown' && onTear) stub = <TearStrip onTear={onTear} disabled={tearDisabled} />;
  else if (showFooter) stub = peekFooter;

  return (
    <article className="ticket">
      <header className="ticket-head">
        <span className="font-bold">Imposter Who?</span>
        <span>Seat {String(seat + 1).padStart(2, '0')}</span>
      </header>
      {stamp && <Stamp text={stamp.text} tone={stamp.tone} />}

      <div
        role={peekable ? 'button' : undefined}
        tabIndex={peekable ? 0 : undefined}
        aria-label={peekable ? 'Press and hold to see your destination' : undefined}
        onPointerDown={
          peekable
            ? (e) => {
                capturePointer(e);
                setHolding(true);
              }
            : undefined
        }
        onPointerUp={peekable ? release : undefined}
        onPointerCancel={peekable ? release : undefined}
        onKeyDown={
          peekable ? (e) => e.key === ' ' && (e.preventDefault(), setHolding(true)) : undefined
        }
        onKeyUp={peekable ? release : undefined}
        onContextMenu={(e) => e.preventDefault()}
        className={`grid min-h-48 content-center gap-1 px-5 py-6 select-none ${peekable ? 'cursor-pointer touch-none' : ''}`}
      >
        <p className="ticket-label">Passenger</p>
        <p className="text-2xl font-bold uppercase">{name}</p>

        {body ? (
          <div className="swap-in mt-3">{body}</div>
        ) : showFace && ticket ? (
          <Face ticket={ticket} motion={mode === 'faceUp' ? 'flip' : holding ? 'open' : 'close'} />
        ) : (
          <div className="mt-4 grid min-h-[6.5rem] content-center">
            {mode === 'faceDown' && (
              <p className="text-3xl font-black tracking-widest uppercase opacity-80">
                Confidential
              </p>
            )}
            {mode === 'peek' && (
              <p className="text-lg font-bold uppercase opacity-80">Hold to see your destination</p>
            )}
            {mode === 'waiting' && (
              <div className="text-lg font-bold uppercase opacity-80">{caption}</div>
            )}
          </div>
        )}
      </div>

      <div className="ticket-perf" aria-hidden />
      <footer className="ticket-stub">{stub}</footer>
    </article>
  );
}
