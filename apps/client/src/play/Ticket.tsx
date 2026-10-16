/**
 * The player's private ticket. Same structure for every role (REQ-GUESS-5): only the
 * text changes. Face-down until torn; afterwards hidden behind a hold-to-peek shutter
 * (REQ-ROLE-2, REQ-ROLE-3). Gestures and the paper world arrive in M4/M5.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Ticket as TicketT } from '@imposter-who/core';
import { capturePointer } from '../ui/capture.ts';

export type TicketMode = 'waiting' | 'faceDown' | 'faceUp' | 'peek';

/** How long the peek-only footer lingers after release so it can be tapped (both roles). */
export const PEEK_FOOTER_MS = 3000;

function Barcode({ seed }: { seed: number }) {
  const bars = Array.from({ length: 28 }, (_, i) => ((seed + 3) * (i + 7) * 2654435761) % 4);
  return (
    <div aria-hidden className="flex h-8 items-end gap-[2px]">
      {bars.map((w, i) => (
        <span key={i} className="h-full bg-ticket-ink" style={{ width: `${w + 1}px` }} />
      ))}
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
}: {
  name: string;
  seat: number;
  ticket: TicketT | null;
  mode: TicketMode;
  /** Shown when the secret is not on screen (e.g. "Waiting for departure"). */
  caption?: ReactNode;
  /** Rendered under the face only while peeking (guess link or a same-size note). */
  peekFooter?: ReactNode;
}) {
  const [holding, setHolding] = useState(false);
  const [footerUntil, setFooterUntil] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const release = () => {
    if (!holding) return;
    setHolding(false);
    setFooterUntil(Date.now() + PEEK_FOOTER_MS);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFooterUntil(0), PEEK_FOOTER_MS);
  };

  const showFace = mode === 'faceUp' || (mode === 'peek' && holding);
  const showFooter = mode === 'peek' && (holding || footerUntil > 0);
  const peekable = mode === 'peek';

  return (
    <article className="w-full max-w-sm rounded-xl bg-ticket text-ticket-ink shadow-[0_20px_60px_rgb(0_0_0/0.45)]">
      <header className="flex items-center justify-between border-b border-dashed border-ticket-ink/30 px-5 py-3 text-sm tracking-widest uppercase">
        <span className="font-bold">Imposter Who?</span>
        <span>Seat {String(seat + 1).padStart(2, '0')}</span>
      </header>

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
        <p className="text-xs tracking-[0.2em] uppercase opacity-70">Passenger</p>
        <p className="text-2xl font-bold uppercase">{name}</p>

        {showFace && ticket ? (
          <>
            <p className="mt-4 text-xs tracking-[0.2em] uppercase opacity-70">Destination</p>
            <p className="text-4xl leading-tight font-black break-words uppercase">
              {ticket.headline}
            </p>
            <p className="min-h-6 text-sm tracking-widest uppercase">
              {ticket.line ? `Line: ${ticket.line}` : ' '}
            </p>
          </>
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

      <footer className="grid min-h-16 items-center gap-2 border-t border-dashed border-ticket-ink/30 px-5 py-3">
        {showFooter ? peekFooter : <Barcode seed={seat} />}
      </footer>
    </article>
  );
}
