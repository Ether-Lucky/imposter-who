/**
 * The phase timer as both screens show it (REQ-UX-8): seconds left, how full the bar is,
 * and how urgent it looks. Pure apart from `useTimer`, which ticks it.
 */
import { useEffect, useState } from 'react';
import type { PublicView } from '@imposter-who/core';

/** Last call is a fixed 30 s (GUESS-2). */
export const LAST_CALL_SECONDS = 30;
/** Amber and ticking from here. */
export const URGENT_SECONDS = 10;
/** Pulsing from here. */
export const CRITICAL_SECONDS = 5;

/** The phase's set length in seconds, or null when the phase has no timer. */
export function phaseSeconds(view: Pick<PublicView, 'phase' | 'settings'>): number | null {
  const s = view.settings;
  const set =
    view.phase === 'clues'
      ? s.clueSeconds
      : view.phase === 'discussion'
        ? s.discussionSeconds
        : view.phase === 'voting'
          ? s.voteSeconds
          : view.phase === 'lastChance'
            ? LAST_CALL_SECONDS
            : 0;
  return set > 0 ? set : null;
}

export interface TimerState {
  seconds: number;
  /** Time left as a share of the whole, 0 to 1, for the draining bar. */
  fraction: number;
  /** Milliseconds left (for animating the bar smoothly to empty). */
  remainingMs: number;
  paused: boolean;
  urgent: boolean;
  critical: boolean;
}

/**
 * The bar's full length is the set time. With time added by the host (or an offline turn
 * on its own clock) the bar stays full until the time left drops under the set length.
 */
export function timerState(
  remainingMs: number,
  setSeconds: number | null,
  paused: boolean,
): TimerState {
  const total = Math.max(1, (setSeconds ?? 0) * 1000, setSeconds ? 0 : remainingMs);
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return {
    seconds,
    fraction: Math.max(0, Math.min(1, remainingMs / total)),
    remainingMs: Math.max(0, remainingMs),
    paused,
    urgent: seconds <= URGENT_SECONDS,
    critical: seconds <= CRITICAL_SECONDS,
  };
}

/** `1:30`, or `0:05`; minutes are not padded so big digits stay few. */
export function shortClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Ticks the current phase timer ten times a second while it runs. */
export function useTimer(
  view: Pick<PublicView, 'phase' | 'settings' | 'deadline' | 'pausedRemainingMs'> | null,
  offset: number,
  enabled = true,
): TimerState | null {
  const deadline = enabled ? (view?.deadline ?? null) : null;
  const paused = enabled ? (view?.pausedRemainingMs ?? null) : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null || paused !== null) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [deadline, paused]);
  if (!view || (deadline === null && paused === null)) return null;
  const remaining = paused ?? Math.max(0, (deadline ?? 0) - (now + offset));
  return timerState(remaining, phaseSeconds(view), paused !== null);
}
