import { useEffect, useRef, useState, type ReactNode } from 'react';
import { capturePointer } from './capture.ts';

/**
 * Press and hold to confirm (REQ-GUESS-1: 1.2 s). The fill is slow while held and snaps
 * back fast on release (04 §5.7). Keyboard: hold Space or Enter.
 */
export function HoldButton({
  onConfirm,
  holdMs = 1200,
  disabled = false,
  children,
  className = '',
}: {
  onConfirm: () => void;
  holdMs?: number;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  const start = () => {
    if (disabled || timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onConfirm();
    }, holdMs);
  };
  useEffect(() => stop, []);

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => {
        capturePointer(e);
        start();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={stop}
      onBlur={stop}
      className={`relative min-h-14 overflow-hidden rounded-md border border-amber px-4 font-bold tracking-wide text-ink uppercase select-none touch-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber ${className}`}
    >
      <span
        aria-hidden
        className="absolute inset-0 bg-amber"
        style={{
          clipPath: holding ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
          transition: holding ? `clip-path ${holdMs}ms linear` : 'clip-path 200ms var(--ease-out)',
        }}
      />
      <span className={`relative ${holding ? 'text-ticket-ink' : ''}`}>{children}</span>
    </button>
  );
}
