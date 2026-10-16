import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FlapRow } from '../src/flap/Flap.tsx';
import {
  DRUM,
  FlapScheduler,
  MAX_STEPS,
  cascadeDelay,
  drumPath,
  fitText,
  halfMs,
  walkMs,
} from '../src/flap/drum.ts';

describe('UX flap engine: drum walk (04 §3)', () => {
  it('walks forward one character at a time and ends on the target', () => {
    expect(drumPath('A', 'D')).toEqual(['B', 'C', 'D']);
  });

  it('never walks backwards: going from Z to A goes round the drum', () => {
    const path = drumPath('Z', 'A');
    expect(path.join('')).toBe("0123456789.-'!?:/ A");
    expect(path.length).toBe(DRUM.length - DRUM.indexOf('Z') + 1);
  });

  it('does nothing when the character does not change', () => {
    expect(drumPath('Q', 'Q')).toEqual([]);
    expect(drumPath('q', 'Q')).toEqual([]);
  });

  it('caps long walks at 40 steps by jumping the drum, still ending on the target', () => {
    const path = drumPath('B', 'A');
    expect(path.length).toBe(MAX_STEPS);
    expect(path.at(-1)).toBe('A');
    expect(path.at(-2)).toBe(' ');
  });

  it('reaches a character off the drum in a single flip', () => {
    expect(drumPath('A', 'É')).toEqual(['É']);
    expect(drumPath('É', 'A')).toEqual(['A']);
  });

  it('uppercases board text', () => {
    expect(drumPath(' ', 'b')).toEqual(['A', 'B']);
  });
});

describe('UX flap engine: timing (04 §3)', () => {
  it('flips at 45 ms per half for 8 steps, then speeds up to 30 ms per step', () => {
    expect(halfMs(0)).toBe(45);
    expect(halfMs(7)).toBe(45);
    expect(halfMs(8)).toBe(15);
    expect(walkMs(3)).toBe(270);
    expect(walkMs(10)).toBe(8 * 90 + 2 * 30);
  });

  it('keeps the longest walk under 1.7 s', () => {
    expect(walkMs(MAX_STEPS)).toBeLessThan(1700);
  });

  it('ripples cells left to right by 18 ms and rows top to bottom by 40 ms, plus up to 25 ms jitter', () => {
    expect(cascadeDelay(0, 0, 0)).toBe(0);
    expect(cascadeDelay(3, 0, 0)).toBe(54);
    expect(cascadeDelay(3, 2, 0)).toBe(134);
    expect(cascadeDelay(3, 2, 1)).toBe(159);
  });
});

describe('UX flap engine: text fitting', () => {
  it('pads short text with blanks and cuts long text to the row width', () => {
    expect(fitText('ab', 4)).toEqual(['A', 'B', ' ', ' ']);
    expect(fitText('marcopolo', 5).join('')).toBe('MARCO');
  });
});

describe('UX-4 flap engine: budget (04 §3, §9)', () => {
  it('runs at most `limit` cells at once and starts queued cells as others finish', () => {
    const scheduler = new FlapScheduler(2);
    const done: Array<() => void> = [];
    const started: number[] = [];
    for (let i = 0; i < 4; i++) {
      scheduler.request(
        (finish) => {
          started.push(i);
          done.push(finish);
        },
        () => {},
      );
    }
    expect(started).toEqual([0, 1]);
    expect(scheduler.waiting).toBe(2);
    done[0]!();
    expect(started).toEqual([0, 1, 2]);
    done[0]!(); // calling done twice is harmless
    expect(scheduler.running).toBe(2);
  });

  it('flush settles queued cells straight to their end state', () => {
    const scheduler = new FlapScheduler(1);
    const settled: number[] = [];
    scheduler.request(
      () => {},
      () => settled.push(0),
    );
    scheduler.request(
      () => {},
      () => settled.push(1),
    );
    scheduler.flush();
    expect(settled).toEqual([1]);
    expect(scheduler.waiting).toBe(0);
  });

  it('a queued cell can be cancelled before it starts', () => {
    const scheduler = new FlapScheduler(1);
    const started: number[] = [];
    scheduler.request(
      () => started.push(0),
      () => {},
    );
    const cancel = scheduler.request(
      () => started.push(1),
      () => {},
    );
    cancel();
    expect(scheduler.waiting).toBe(0);
  });
});

describe('UX flap engine: first render', () => {
  it('shows the final text with no animation, readable once for screen readers', () => {
    const html = renderToString(<FlapRow text="Marco" width={7} tone="amber" />);
    expect(html).toContain('<span class="sr-only">Marco</span>');
    expect(html.match(/class="flap"/g)).toHaveLength(7);
    expect(html).toContain('data-tone="amber"');
    expect(html).toMatch(/flap-glyph">M</);
  });
});
