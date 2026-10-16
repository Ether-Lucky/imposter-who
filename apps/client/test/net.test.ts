import { describe, expect, it } from 'vitest';
import { formatClock, offsetFromSamples, secondsLeft } from '../src/net/clock.ts';
import { newToken, playerToken } from '../src/net/token.ts';
import { fromText, toText } from '../src/host/CategoryEditor.tsx';

describe('clock sync', () => {
  it('uses the sample with the shortest round trip', () => {
    const offset = offsetFromSamples([
      { t0: 0, t1: 400, server: 5000 }, // slow: midpoint 200
      { t0: 1000, t1: 1020, server: 6010 }, // fast: midpoint 1010
    ]);
    expect(offset).toBe(5000);
  });

  it('is zero with no samples', () => {
    expect(offsetFromSamples([])).toBe(0);
  });

  it('counts down against the server clock and never goes negative', () => {
    expect(secondsLeft(10_000, null, 0, 1_000)).toBe(9);
    expect(secondsLeft(10_000, null, 2_000, 1_000)).toBe(7);
    expect(secondsLeft(10_000, null, 0, 20_000)).toBe(0);
    expect(secondsLeft(null, null, 0)).toBeNull();
  });

  it('shows the frozen remainder while paused', () => {
    expect(secondsLeft(10_000, 4_100, 0, 1_000)).toBe(5);
  });

  it('formats mm:ss', () => {
    expect(formatClock(90)).toBe('01:30');
    expect(formatClock(5)).toBe('00:05');
  });
});

describe('REQ-RECON-1 player token', () => {
  it('generates url-safe tokens the server accepts', () => {
    for (let i = 0; i < 50; i++) expect(newToken()).toMatch(/^[\w-]{16,128}$/);
  });

  it('is stable per profile and different across profiles', () => {
    const a = playerToken('');
    expect(playerToken('')).toBe(a);
    const b = playerToken('?as=phone2');
    expect(b).not.toBe(a);
    expect(playerToken('?as=phone2')).toBe(b);
  });
});

describe('REQ-WORD-2 custom list text format', () => {
  it('reads one word per line with slash aliases', () => {
    expect(fromText('stapler\n doughnut / donut \n\n  \ncoffee/kopi/kape')).toEqual([
      'stapler',
      ['doughnut', 'donut'],
      ['coffee', 'kopi', 'kape'],
    ]);
  });

  it('round-trips a category', () => {
    const text = toText({
      id: 'custom-x',
      name: 'X',
      custom: true,
      words: [
        { word: 'doughnut', aliases: ['donut'] },
        { word: 'tea', aliases: [] },
      ],
    });
    expect(text).toBe('doughnut / donut\ntea');
    expect(fromText(text)).toEqual([['doughnut', 'donut'], 'tea']);
  });
});
