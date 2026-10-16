import { describe, expect, it } from 'vitest';
import { TIMINGS } from '../src/index.ts';
import { Game } from './helpers.ts';

function inClues(settings = {}) {
  const g = new Game({ settings });
  g.startWith(4);
  g.tearAll();
  return g;
}

function lastChance() {
  const g = new Game();
  g.startWith(4);
  g.toVoting();
  g.voteAll((v) => (v === g.imposter ? g.civilians[0]! : g.imposter));
  g.host({ type: 'reveal:done' });
  expect(g.state.phase).toBe('lastChance');
  return g;
}

describe('REQ-GUESS-1 early guess', () => {
  it('a correct early guess wins for the imposter', () => {
    const g = inClues();
    g.ok({ type: 'guess:submit', playerId: g.imposter, text: 'Bananas' });
    expect(g.round.outcome).toEqual({
      winner: 'imposter',
      reason: 'earlyGuessRight',
      overridden: false,
    });
    expect(g.round.guess).toEqual({ text: 'Bananas', early: true, correct: true });
  });

  it('a wrong early guess wins for the civilians', () => {
    const g = inClues();
    g.ok({ type: 'guess:submit', playerId: g.imposter, text: 'apple' });
    expect(g.round.outcome).toEqual({
      winner: 'civilians',
      reason: 'earlyGuessWrong',
      overridden: false,
    });
  });

  it.each(['discussion', 'voting'] as const)('works during %s', (phase) => {
    const g = inClues();
    g.clueAll();
    if (phase === 'voting') g.host({ type: 'phase:skip' });
    expect(g.state.phase).toBe(phase);
    g.ok({ type: 'guess:submit', playerId: g.imposter, text: 'banana' });
    expect(g.state.phase).toBe('result');
  });

  it('is not allowed during the reveal', () => {
    const g = new Game();
    g.startWith(3);
    expect(g.rejects({ type: 'guess:submit', playerId: g.imposter, text: 'banana' })).toBe(
      'GUESS_NOT_ALLOWED',
    );
  });

  it('is not allowed when the setting is off', () => {
    const g = inClues({ earlyGuess: false });
    expect(g.rejects({ type: 'guess:submit', playerId: g.imposter, text: 'banana' })).toBe(
      'GUESS_NOT_ALLOWED',
    );
  });

  it('civilians cannot guess', () => {
    const g = inClues();
    expect(g.rejects({ type: 'guess:submit', playerId: g.civilians[0]!, text: 'banana' })).toBe(
      'GUESS_NOT_ALLOWED',
    );
  });

  it('rejects an empty guess without spending it', () => {
    const g = inClues();
    expect(g.rejects({ type: 'guess:submit', playerId: g.imposter, text: ' !! ' })).toBe(
      'GUESS_INVALID',
    );
    g.ok({ type: 'guess:submit', playerId: g.imposter, text: 'banana' });
  });
});

describe('REQ-GUESS-2 last chance', () => {
  it('runs a 30 second timer', () => {
    const g = lastChance();
    expect(g.timer('phase')!.at).toBe(g.now + TIMINGS.lastChanceMs);
  });

  it('a correct guess steals the win', () => {
    const g = lastChance();
    g.ok({ type: 'guess:submit', playerId: g.imposter, text: 'banana' });
    expect(g.round.outcome?.reason).toBe('lastChanceRight');
    expect(g.round.guess?.early).toBe(false);
  });

  it('a wrong guess loses', () => {
    const g = lastChance();
    g.ok({ type: 'guess:submit', playerId: g.imposter, text: 'apple' });
    expect(g.round.outcome?.reason).toBe('lastChanceWrong');
  });

  it('timing out loses', () => {
    const g = lastChance();
    g.fire('phase');
    expect(g.round.outcome).toEqual({
      winner: 'civilians',
      reason: 'lastChanceWrong',
      overridden: false,
    });
    expect(g.round.guess).toBeNull();
  });

  it('works even with early guessing off', () => {
    const g = new Game({ settings: { earlyGuess: false } });
    g.startWith(4);
    g.toVoting();
    g.voteAll((v) => (v === g.imposter ? g.civilians[0]! : g.imposter));
    g.host({ type: 'reveal:done' });
    g.ok({ type: 'guess:submit', playerId: g.imposter, text: 'banana' });
  });
});

describe('REQ-GUESS-4 table override', () => {
  it('opens a 10 second window after a wrong guess', () => {
    const g = lastChance();
    g.ok({ type: 'guess:submit', playerId: g.imposter, text: 'plantain' });
    expect(g.timer('override')!.at).toBe(g.now + TIMINGS.overrideMs);
  });

  it('flips the result and the scores when the table says it counts', () => {
    const g = lastChance();
    g.ok({ type: 'guess:submit', playerId: g.imposter, text: 'plantain' });
    for (const id of g.civilians) expect(g.score(id)).toBe(1);
    g.host({ type: 'guess:override' });
    expect(g.round.outcome).toEqual({
      winner: 'imposter',
      reason: 'lastChanceRight',
      overridden: true,
    });
    expect(g.round.guess?.correct).toBe(true);
    for (const id of g.civilians) expect(g.score(id)).toBe(0);
    expect(g.score(g.imposter)).toBe(3);
    expect(g.timer('override')).toBeUndefined();
  });

  it('closes after 10 seconds', () => {
    const g = lastChance();
    g.ok({ type: 'guess:submit', playerId: g.imposter, text: 'plantain' });
    g.fire('override');
    expect(g.rejects({ type: 'guess:override' })).toBe('WRONG_PHASE');
  });

  it('is not offered after a correct guess or a timeout', () => {
    const right = lastChance();
    right.ok({ type: 'guess:submit', playerId: right.imposter, text: 'banana' });
    expect(right.timer('override')).toBeUndefined();

    const timeout = lastChance();
    timeout.fire('phase');
    expect(timeout.timer('override')).toBeUndefined();
  });

  it('also applies to a wrong early guess', () => {
    const g = inClues();
    g.ok({ type: 'guess:submit', playerId: g.imposter, text: 'plantain' });
    g.host({ type: 'guess:override' });
    expect(g.round.outcome?.reason).toBe('earlyGuessRight');
  });
});

describe('REQ-GUESS-1 one guess only', () => {
  it('a second guess is rejected', () => {
    const g = inClues();
    g.ok({ type: 'guess:submit', playerId: g.imposter, text: 'plantain' });
    expect(g.rejects({ type: 'guess:submit', playerId: g.imposter, text: 'banana' })).toBe(
      'GUESS_NOT_ALLOWED',
    );
  });
});
