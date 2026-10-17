import { describe, expect, it } from 'vitest';
import { hostView } from '@imposter-who/core';
import { phaseSeconds, shortClock, timerState } from '../src/net/timer.ts';
import { Script } from './fixtures.ts';

describe('REQ-UX-8 readable timers', () => {
  it('knows each phase set length, and that some phases have none', () => {
    const s = new Script({ clueSeconds: 30, discussionSeconds: 90, voteSeconds: 60 }).join(3);
    expect(phaseSeconds(hostView(s.state))).toBeNull();
    s.start();
    expect(phaseSeconds(hostView(s.state))).toBeNull();
    s.toClues();
    expect(phaseSeconds(hostView(s.state))).toBe(30);
    s.clueAll();
    expect(phaseSeconds(hostView(s.state))).toBe(90);
    s.act({ type: 'phase:skip' });
    expect(phaseSeconds(hostView(s.state))).toBe(60);
  });

  it('treats a timer set to Off as no timer', () => {
    const s = new Script({ discussionSeconds: 0 }).join(3).start().toClues().clueAll();
    expect(phaseSeconds(hostView(s.state))).toBeNull();
  });

  it('drains the bar in proportion to the time left', () => {
    expect(timerState(45_000, 90, false).fraction).toBeCloseTo(0.5);
    expect(timerState(0, 90, false).fraction).toBe(0);
  });

  it('keeps the bar full while added time is above the set length', () => {
    expect(timerState(110_000, 90, false).fraction).toBe(1);
  });

  it('turns urgent at 10 s and critical at 5 s, rounding seconds up', () => {
    expect(timerState(10_400, 60, false)).toMatchObject({ seconds: 11, urgent: false });
    expect(timerState(9_100, 60, false)).toMatchObject({
      seconds: 10,
      urgent: true,
      critical: false,
    });
    expect(timerState(4_200, 60, false)).toMatchObject({ seconds: 5, critical: true });
  });

  it('writes the time short for big digits', () => {
    expect(shortClock(90)).toBe('1:30');
    expect(shortClock(5)).toBe('0:05');
    expect(shortClock(180)).toBe('3:00');
  });
});
