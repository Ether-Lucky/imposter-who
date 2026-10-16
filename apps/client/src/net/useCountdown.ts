import { useEffect, useState } from 'react';
import { secondsLeft } from './clock.ts';

/** Seconds left on the phase timer, re-rendering four times a second while it runs. */
export function useCountdown(
  deadline: number | null,
  pausedRemainingMs: number | null,
  offset: number,
): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null || pausedRemainingMs !== null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline, pausedRemainingMs]);
  return secondsLeft(deadline, pausedRemainingMs, offset, now);
}
