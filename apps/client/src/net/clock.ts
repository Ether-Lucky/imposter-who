/** Clock sync so countdowns match the board on every phone (02-design §6). */

export interface PingSample {
  t0: number;
  t1: number;
  server: number;
}

/** Offset (server minus local) from the sample with the shortest round trip. */
export function offsetFromSamples(samples: PingSample[]): number {
  if (samples.length === 0) return 0;
  const best = [...samples].sort((a, b) => a.t1 - a.t0 - (b.t1 - b.t0))[0]!;
  return best.server - (best.t0 + best.t1) / 2;
}

/** Whole seconds left on a timer, never negative. */
export function secondsLeft(
  deadline: number | null,
  pausedRemainingMs: number | null,
  offset: number,
  now = Date.now(),
): number | null {
  if (pausedRemainingMs !== null) return Math.ceil(pausedRemainingMs / 1000);
  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - (now + offset)) / 1000));
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
