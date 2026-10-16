import { describe, expect, it } from 'vitest';
import { type Category, TIMINGS } from '../src/index.ts';
import { Game } from './helpers.ts';

describe('REQ-ROLE-1 fair assignment', () => {
  it('picks exactly one imposter among the round players', () => {
    const g = new Game();
    const ids = g.startWith(5);
    expect(ids).toContain(g.imposter);
    expect(g.civilians).toHaveLength(4);
    expect(g.state.phase).toBe('reveal');
    expect(g.cues()).toContain('roundStart');
  });

  it('only picks connected players as imposter', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = new Game({ seed });
      g.join('A', 'B', 'C', 'D');
      g.ok({ type: 'player:disconnected', playerId: 'p-a' });
      g.host({ type: 'round:start' });
      expect(g.imposter).not.toBe('p-a');
    }
  });

  it('spreads the imposter role across players over many rounds', () => {
    const g = new Game({ seed: 42 });
    g.join('A', 'B', 'C', 'D');
    const counts: Record<string, number> = {};
    g.host({ type: 'round:start' });
    for (let i = 0; i < 400; i++) {
      counts[g.imposter] = (counts[g.imposter] ?? 0) + 1;
      g.host({ type: 'lobby:return' });
      g.host({ type: 'round:start' });
    }
    for (const n of Object.values(counts)) expect(n).toBeGreaterThan(60);
  });
});

describe('REQ-ROLE-4 ready gate', () => {
  it('moves to clues once every connected player has torn their ticket', () => {
    const g = new Game();
    const ids = g.startWith(3);
    g.ok({ type: 'ticket:torn', playerId: ids[0]! });
    g.ok({ type: 'ticket:torn', playerId: ids[1]! });
    expect(g.state.phase).toBe('reveal');
    g.ok({ type: 'ticket:torn', playerId: ids[2]! });
    expect(g.state.phase).toBe('clues');
  });

  it('lets the host continue early', () => {
    const g = new Game();
    g.startWith(3);
    g.host({ type: 'phase:continue' });
    expect(g.state.phase).toBe('clues');
  });

  it('does not wait for offline players', () => {
    const g = new Game();
    const ids = g.startWith(4);
    g.ok({ type: 'ticket:torn', playerId: ids[0]! });
    g.ok({ type: 'ticket:torn', playerId: ids[1]! });
    g.ok({ type: 'ticket:torn', playerId: ids[2]! });
    g.ok({ type: 'player:disconnected', playerId: ids[3]! });
    expect(g.state.phase).toBe('clues');
  });

  it('rejects tearing from a standby player', () => {
    const g = new Game();
    g.startWith(3);
    const [late] = g.join('Late');
    expect(g.rejects({ type: 'ticket:torn', playerId: late! })).toBe('NOT_PLAYING');
  });
});

describe('REQ-CLUE-1 turn order', () => {
  it('starts at a random seat and goes around in seat order', () => {
    const starts = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const g = new Game({ seed });
      const ids = g.startWith(4);
      const order = g.round.turnOrder;
      const start = ids.indexOf(order[0]!);
      expect(order).toEqual([...ids.slice(start), ...ids.slice(0, start)]);
      starts.add(order[0]!);
    }
    expect(starts.size).toBe(4);
  });

  it('runs the configured number of laps then opens discussion', () => {
    const g = new Game({ settings: { laps: 2 } });
    g.startWith(3);
    g.tearAll();
    g.clueAll();
    expect(g.round.clues).toHaveLength(6);
    expect(g.round.clues.map((c) => c.lap)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(g.state.phase).toBe('discussion');
  });

  it('cues each turn and lap change', () => {
    const g = new Game({ settings: { laps: 2 } });
    g.startWith(3);
    g.tearAll();
    expect(g.cues()).toContain('turnStart');
    for (let i = 0; i < 3; i++) {
      g.ok({ type: 'clue:submit', playerId: g.current, text: `word${'abc'[i]}` });
    }
    expect(g.cues()).toEqual(['clueLanded', 'lapChange', 'turnStart']);
  });
});

describe('REQ-CLUE-2 typed clues', () => {
  const setup = () => {
    const g = new Game();
    g.startWith(4);
    g.tearAll();
    return g;
  };

  it('records a valid clue on the current player', () => {
    const g = setup();
    const id = g.current;
    g.ok({ type: 'clue:submit', playerId: id, text: ' yellow ' });
    expect(g.round.clues[0]).toEqual({ playerId: id, lap: 1, text: 'yellow', status: 'given' });
  });

  it('only accepts the current player', () => {
    const g = setup();
    const other = g.round.turnOrder[1]!;
    expect(g.rejects({ type: 'clue:submit', playerId: other, text: 'yellow' })).toBe(
      'NOT_YOUR_TURN',
    );
  });

  it.each(['two words', '', 'a'.repeat(25), 'emoji🍌', 'semi;colon'])('rejects %j', (text) => {
    const g = setup();
    expect(g.rejects({ type: 'clue:submit', playerId: g.current, text })).toBe('CLUE_INVALID');
  });

  it.each(["rock'n'roll", 'x-ray', 'Ünïcode', '42'])('accepts %j', (text) => {
    const g = setup();
    g.ok({ type: 'clue:submit', playerId: g.current, text });
  });

  it('rejects a repeat of an earlier clue, including plurals', () => {
    const g = setup();
    g.ok({ type: 'clue:submit', playerId: g.current, text: 'fruit' });
    expect(g.rejects({ type: 'clue:submit', playerId: g.current, text: 'Fruits' })).toBe(
      'CLUE_DUPLICATE',
    );
  });

  it('rejects a civilian clue that is too close to the word', () => {
    const g = setup();
    while (g.current === g.imposter)
      g.ok({ type: 'clue:submit', playerId: g.current, text: 'peel' });
    expect(g.rejects({ type: 'clue:submit', playerId: g.current, text: 'Bananas' })).toBe(
      'CLUE_TOO_CLOSE',
    );
  });

  it('never checks the imposter against the word (no leak)', () => {
    const g = setup();
    while (g.current !== g.imposter) {
      g.ok({ type: 'clue:submit', playerId: g.current, text: `c${g.round.clues.length}x` });
    }
    g.ok({ type: 'clue:submit', playerId: g.imposter, text: 'banana' });
    expect(g.round.clues.at(-1)).toMatchObject({ playerId: g.imposter, text: 'banana' });
    expect(g.round.guess).toBeNull();
  });

  it('refuses typed clues in spoken mode', () => {
    const g = new Game({ settings: { clueMode: 'spoken' } });
    g.startWith(3);
    g.tearAll();
    expect(g.rejects({ type: 'clue:submit', playerId: g.current, text: 'yellow' })).toBe(
      'WRONG_PHASE',
    );
  });
});

describe('REQ-CLUE-3 spoken mode', () => {
  it('advances when the player taps done', () => {
    const g = new Game({ settings: { clueMode: 'spoken' } });
    g.startWith(3);
    g.tearAll();
    const id = g.current;
    g.ok({ type: 'turn:done', playerId: id });
    expect(g.round.clues[0]).toEqual({ playerId: id, lap: 1, text: null, status: 'spoken' });
  });

  it('lets the host advance the turn', () => {
    const g = new Game({ settings: { clueMode: 'spoken' } });
    g.startWith(3);
    g.tearAll();
    g.host({ type: 'phase:skip' });
    expect(g.round.clues[0]!.status).toBe('spoken');
  });

  it('only the current player can tap done', () => {
    const g = new Game({ settings: { clueMode: 'spoken' } });
    g.startWith(3);
    g.tearAll();
    expect(g.rejects({ type: 'turn:done', playerId: g.round.turnOrder[1]! })).toBe('NOT_YOUR_TURN');
  });
});

describe('REQ-CLUE-4 turn timer', () => {
  it('passes the turn when the clue timer runs out', () => {
    const g = new Game({ settings: { clueSeconds: 15 } });
    g.startWith(3);
    g.tearAll();
    const id = g.current;
    expect(g.timer('phase')!.at).toBe(g.now + 15_000);
    g.fire('phase');
    expect(g.round.clues[0]).toEqual({ playerId: id, lap: 1, text: null, status: 'passed' });
    expect(g.current).not.toBe(id);
  });

  it('has no timer when the clue timer is off', () => {
    const g = new Game({ settings: { clueSeconds: 0 } });
    g.startWith(3);
    g.tearAll();
    expect(g.timer('phase')).toBeUndefined();
  });

  it('ignores a stale timer from an earlier turn', () => {
    const g = new Game();
    g.startWith(3);
    g.tearAll();
    const stale = g.timer('phase')!;
    g.ok({ type: 'clue:submit', playerId: g.current, text: 'yellow' });
    const before = g.state;
    const result = g.act({ type: 'timer:expired', key: 'phase', seq: stale.seq });
    expect(result.effects).toEqual([]);
    expect(g.state).toBe(before);
  });
});

describe('REQ-CLUE-5 ledger', () => {
  it('keeps every clue for the rest of the round', () => {
    const g = new Game();
    g.startWith(3);
    g.tearAll();
    g.clueAll();
    g.host({ type: 'phase:skip' });
    expect(g.round.clues).toHaveLength(3);
  });
});

describe('REQ-DISC-1 discussion', () => {
  const toDiscussion = (seconds: 0 | 90 = 90) => {
    const g = new Game({ settings: { discussionSeconds: seconds } });
    g.startWith(3);
    g.tearAll();
    g.clueAll();
    expect(g.state.phase).toBe('discussion');
    return g;
  };

  it('starts the discussion timer and moves to voting when it ends', () => {
    const g = toDiscussion();
    expect(g.timer('phase')!.at).toBe(g.now + 90_000);
    g.fire('phase');
    expect(g.state.phase).toBe('voting');
  });

  it('lets the host skip to voting', () => {
    const g = toDiscussion();
    g.host({ type: 'phase:skip' });
    expect(g.state.phase).toBe('voting');
  });

  it('lets the host add 30 seconds', () => {
    const g = toDiscussion();
    const at = g.timer('phase')!.at;
    g.host({ type: 'timer:add', seconds: 30 });
    expect(g.timer('phase')!.at).toBe(at + 30_000);
    expect(g.effects).toContainEqual({
      type: 'setTimer',
      key: 'phase',
      at: at + 30_000,
      seq: g.timer('phase')!.seq,
    });
  });

  it('cannot add time when the discussion timer is off', () => {
    const g = toDiscussion(0);
    expect(g.rejects({ type: 'timer:add', seconds: 30 })).toBe('WRONG_PHASE');
  });

  it('pauses and resumes with the remaining time', () => {
    const g = toDiscussion();
    g.now += 20_000;
    g.host({ type: 'game:pause' });
    expect(g.state.paused).toBe(true);
    expect(g.timer('phase')).toBeUndefined();
    expect(g.state.pausedRemaining.phase).toBe(70_000);
    g.now += 500_000;
    g.host({ type: 'game:resume' });
    expect(g.timer('phase')!.at).toBe(g.now + 70_000);
  });

  it('blocks player actions while paused', () => {
    const g = new Game();
    g.startWith(3);
    g.tearAll();
    g.host({ type: 'game:pause' });
    expect(g.rejects({ type: 'clue:submit', playerId: g.current, text: 'yellow' })).toBe('PAUSED');
  });
});

describe('REQ-WORD-3 within a session', () => {
  it('does not repeat a word until the pool is used up', () => {
    const many: Category = {
      id: 'food',
      name: 'Food',
      custom: false,
      words: Array.from({ length: 10 }, (_, i) => ({
        word: `word${'abcdefghij'[i]}`,
        aliases: [],
      })),
    };
    const g = new Game({ library: [many] });
    g.join('A', 'B', 'C');
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      g.host({ type: 'round:start' });
      seen.push(g.round.word.word);
      g.host({ type: 'lobby:return' });
    }
    expect(new Set(seen).size).toBe(10);
  });
});

it('exposes timing constants used by the spec', () => {
  expect(TIMINGS).toMatchObject({
    offlineTurnMs: 10_000,
    lowPlayersMs: 30_000,
    lastChanceMs: 30_000,
    overrideMs: 10_000,
  });
});
