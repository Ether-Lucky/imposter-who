/**
 * The vote reveal (04 §4.9) as a timeline of beats. Pure: given how long the reveal has
 * been running, say what the board shows. The board ticks a clock and reads this, and a
 * click jumps the clock to the end (skippable). The verdict (DEPARTED or CANCELLED) is not
 * here: the board learns who the imposter is only in the next phase (REQ-SEC-3), so that
 * screen opens on it.
 */
import type { RevealResult } from '@imposter-who/core';

export interface RevealBeat {
  /** Voters whose vote is shown, in board order. */
  votesShown: number;
  /** Tally column visible. */
  tally: boolean;
  /** Every row but the accused fades back (eject only). */
  collapsed: boolean;
  /** The accused row lifts. */
  lifted: boolean;
  /** The headline has flapped to the result. */
  announced: boolean;
  /** Tell the server the animation is over. */
  done: boolean;
}

export interface RevealPlan {
  start: number;
  interval: number;
  tallyAt: number;
  collapseAt: number;
  liftAt: number;
  announceAt: number;
  doneAt: number;
}

/**
 * Timings for `voters` voters. Votes land 450 ms apart (squeezed for big tables so the
 * reveal stays under the server's 12 s fallback). Reduced motion keeps every beat, faster
 * (04 §8: sequencing is information), about 4 s.
 */
export function revealPlan(voters: number, result: RevealResult, reduced: boolean): RevealPlan {
  const n = Math.max(1, voters);
  const start = reduced ? 150 : 300;
  const interval = reduced ? Math.min(200, 1600 / n) : Math.min(450, 4500 / n);
  const tallyAt = start + n * interval + (reduced ? 300 : 600);
  if (result === 'eject') {
    const collapseAt = tallyAt + (reduced ? 400 : 600);
    const liftAt = collapseAt + (reduced ? 200 : 500);
    const announceAt = liftAt + (reduced ? 200 : 700);
    return {
      start,
      interval,
      tallyAt,
      collapseAt,
      liftAt,
      announceAt,
      doneAt: announceAt + (reduced ? 1000 : 1900),
    };
  }
  const announceAt = tallyAt + (reduced ? 300 : 600);
  return {
    start,
    interval,
    tallyAt,
    collapseAt: Infinity,
    liftAt: Infinity,
    announceAt,
    doneAt: announceAt + (reduced ? 1200 : 2500),
  };
}

export function beatAt(plan: RevealPlan, voters: number, t: number): RevealBeat {
  return {
    votesShown:
      t < plan.start ? 0 : Math.min(voters, Math.floor((t - plan.start) / plan.interval) + 1),
    tally: t >= plan.tallyAt,
    collapsed: t >= plan.collapseAt,
    lifted: t >= plan.liftAt,
    announced: t >= plan.announceAt,
    done: t >= plan.doneAt,
  };
}

export function sameBeat(a: RevealBeat, b: RevealBeat): boolean {
  return (
    a.votesShown === b.votesShown &&
    a.tally === b.tally &&
    a.collapsed === b.collapsed &&
    a.lifted === b.lifted &&
    a.announced === b.announced &&
    a.done === b.done
  );
}

/** The headline once the count is in. */
export function revealHeadline(
  result: RevealResult,
  names: { ejected: string | null; tied: string[] },
): string {
  switch (result) {
    case 'eject':
      return `MOST VOTES: ${names.ejected ?? ''}`;
    case 'revote':
      return `TIE. REVOTE: ${names.tied.join(' OR ')}`;
    case 'doubleTie':
      return 'TIED AGAIN. NOBODY LEAVES';
    case 'noEject':
      return 'TIE. NOBODY LEAVES THE TRAIN';
    case 'noVotes':
      return 'NOBODY VOTED';
  }
}
