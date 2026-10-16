/**
 * The pure half of the flap engine (04 §3): which characters a cell walks through, how
 * long each flip takes, and when each cell in a cascade starts. No DOM here, so it is
 * unit tested directly.
 */

/** The drum, in order, like a real split-flap unit (04 §3). Index 0 is blank. */
export const DRUM = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-'!?:/";

/**
 * Longest walk; a longer one jumps the drum and walks only the last steps. 24, not the
 * 40 first planned: measured in T7.4, full-board changes stay smooth and still read as a
 * drum walk.
 */
export const MAX_STEPS = 24;
/** Steps 1 to 8 are full speed flips; later steps speed up. */
export const SLOW_STEPS = 8;
/** One half of a flip (top falls, then bottom rises), in ms. */
export const HALF_MS = 45;
/** One half of a flip once the walk has sped up (a whole step is 30 ms). */
export const FAST_HALF_MS = 15;
/**
 * Most cells mid-flip at once across the board (04 §3, §9). Planned as 320; measured in
 * T7.4, 160 keeps frames even and only stretches the biggest cascades a little.
 */
export const MAX_ACTIVE = 160;
/** Reduced motion: a cell crossfades instead of walking (04 §8). */
export const FADE_MS = 120;

/** Cascade timing (04 §3): per cell, per row, plus organic jitter. */
export const CELL_STAGGER_MS = 18;
export const ROW_STAGGER_MS = 40;
export const JITTER_MS = 25;

/** Board text is uppercase. Anything off the drum still shows; it just cannot walk. */
export function normaliseChar(ch: string): string {
  return ch.toUpperCase();
}

/** Pad or cut `text` to exactly `width` cells. */
export function fitText(text: string, width: number): string[] {
  const chars = Array.from(text.toUpperCase()).slice(0, width);
  while (chars.length < width) chars.push(' ');
  return chars;
}

/**
 * The characters a cell shows on its way from `from` to `to`, excluding `from` and
 * ending with `to`. Always forward round the drum, never backwards. Empty when nothing
 * changes. A character off the drum is reached in a single flip.
 */
export function drumPath(from: string, to: string): string[] {
  const a = normaliseChar(from);
  const b = normaliseChar(to);
  if (a === b) return [];
  const i = DRUM.indexOf(a);
  const j = DRUM.indexOf(b);
  if (i < 0 || j < 0) return [b];
  const steps = (j - i + DRUM.length) % DRUM.length;
  const path: string[] = [];
  for (let s = Math.max(1, steps - MAX_STEPS + 1); s <= steps; s++) {
    path.push(DRUM[(i + s) % DRUM.length]!);
  }
  return path;
}

/** Duration of one half of step `n` (0-based): long walks speed up after the 8th. */
export function halfMs(n: number): number {
  return n < SLOW_STEPS ? HALF_MS : FAST_HALF_MS;
}

/** Total time a walk of `steps` flips takes. */
export function walkMs(steps: number): number {
  let total = 0;
  for (let n = 0; n < steps; n++) total += 2 * halfMs(n);
  return total;
}

/**
 * Start delay for the cell at `index` in row `row`: rows ripple top to bottom, cells left
 * to right, with `random` (0 to 1) adding jitter so the ripple looks mechanical, not
 * metronomic.
 */
export function cascadeDelay(index: number, row = 0, random = Math.random()): number {
  return row * ROW_STAGGER_MS + index * CELL_STAGGER_MS + random * JITTER_MS;
}

/**
 * Caps how many cells flip at once (04 §3 budget). Extra cells wait in a queue and start
 * as running ones finish. `flush` drops the queue and settles everything (used when the
 * tab is hidden: no point animating what nobody sees).
 */
export class FlapScheduler {
  private active = 0;
  private readonly queue: Array<{ start: (done: () => void) => void; settle: () => void }> = [];

  constructor(private readonly limit = MAX_ACTIVE) {}

  get running(): number {
    return this.active;
  }

  get waiting(): number {
    return this.queue.length;
  }

  /**
   * Ask to run an animation. `start` gets a `done` callback to call when it ends;
   * `settle` jumps straight to the end state if the job is flushed before it starts.
   * Returns a cancel function that removes the job if it has not started yet.
   */
  request(start: (done: () => void) => void, settle: () => void): () => void {
    const job = { start, settle };
    if (this.active < this.limit) {
      this.run(job);
      return () => {};
    }
    this.queue.push(job);
    return () => {
      const at = this.queue.indexOf(job);
      if (at >= 0) this.queue.splice(at, 1);
    };
  }

  flush(): void {
    for (const job of this.queue.splice(0)) job.settle();
  }

  private run(job: { start: (done: () => void) => void }): void {
    this.active++;
    let finished = false;
    job.start(() => {
      if (finished) return;
      finished = true;
      this.active--;
      const next = this.queue.shift();
      if (next) this.run(next);
    });
  }
}
