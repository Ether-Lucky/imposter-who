/**
 * The board's clock (REQ-UX-8, 04 §4.13): a two-row clock module in the top-right corner
 * and a bar under the headline that drains as time runs out. Each ticks on its own, so
 * the rest of the board does not re-render ten times a second.
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import type { HostView } from '@imposter-who/core';
import { BoardItem, useBoard } from '../flap/BoardGrid.tsx';
import { FlapRow } from '../flap/Flap.tsx';
import { shortClock, useTimer } from '../net/timer.ts';
import { useReducedMotion } from '../ui/motion.ts';
import { hostSfx } from './audio.ts';
import { glint, shudder } from './effects.ts';

/** Columns the clock module takes in rows 0 and 1. */
export const CLOCK_COLS = 9;

const timedPhase = (view: HostView) => view.phase !== 'voteReveal' && view.phase !== 'result';

export function BigClock({ view, offset }: { view: HostView; offset: number }) {
  const grid = useBoard();
  const reduced = useReducedMotion();
  const timer = useTimer(view, offset, timedPhase(view));
  const seconds = timer?.seconds ?? null;
  const ticking = !!timer && !timer.paused;
  const last = useRef<number | null>(null);

  // One tick a second in the last 10 s, a buzzer and a jolt at zero (04 §4.13).
  useEffect(() => {
    if (!ticking || seconds === null || last.current === seconds) return;
    const before = last.current;
    last.current = seconds;
    if (before === null) return;
    if (seconds === 0) {
      hostSfx('buzzer');
      shudder({ strength: 5, reduced });
    } else if (seconds <= 10) {
      hostSfx('tick');
      if (seconds <= 5) glint({ reduced });
    }
  }, [seconds, ticking, reduced]);

  if (!timer) return null;
  // Double-height cells: two rows plus the gap between them.
  const style = { '--cell-h': `${grid.cellH * 2 + grid.gapY}px` } as CSSProperties;
  const text = timer.paused ? 'HOLD' : shortClock(timer.seconds).padStart(4, ' ');
  const pulse = timer.critical && !timer.paused && !reduced;
  return (
    <BoardItem col={-1} row={0} w={CLOCK_COLS} h={2}>
      <div
        key={pulse ? timer.seconds : 'still'}
        className={`flex h-full justify-end ${pulse ? 'clock-pulse' : ''}`}
        style={style}
        role="timer"
        aria-label={timer.paused ? 'Timer paused' : `${timer.seconds} seconds left`}
      >
        <FlapRow text={text} width={4} tone={timer.urgent || timer.paused ? 'amber' : 'ink'} />
      </div>
    </BoardItem>
  );
}

/** A thin line under the headline that shrinks right to left as time runs out. */
export function TimerBar({ view, offset }: { view: HostView; offset: number }) {
  const grid = useBoard();
  const timer = useTimer(view, offset, timedPhase(view));
  if (!timer) return null;
  return (
    <BoardItem col={0} row={1} w={grid.cols - CLOCK_COLS - 1} className="pointer-events-none">
      <span
        aria-hidden
        className={`timer-bar ${timer.urgent ? 'timer-bar-urgent' : ''}`}
        style={{ transform: `scaleX(${timer.fraction})` }}
      />
    </BoardItem>
  );
}
