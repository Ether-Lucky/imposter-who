import { describe, expect, it } from 'vitest';
import { TIMINGS } from '../src/index.ts';
import { Game } from './helpers.ts';

/** A 4-player game in the voting phase. */
function voting(settings = {}) {
  const g = new Game({ settings });
  g.startWith(4);
  g.toVoting();
  return g;
}

describe('REQ-VOTE-1 secret ballot', () => {
  it('records a vote and lets the voter change it', () => {
    const g = voting();
    const [a, b, c] = g.round.turnOrder;
    g.ok({ type: 'vote:cast', playerId: a!, targetId: b! });
    g.ok({ type: 'vote:cast', playerId: a!, targetId: c! });
    expect(g.round.votes[a!]).toBe(c);
    expect(g.cues()).toEqual(['voteCast']);
  });

  it('rejects self-votes and unknown targets', () => {
    const g = voting();
    const [a] = g.round.turnOrder;
    expect(g.rejects({ type: 'vote:cast', playerId: a!, targetId: a! })).toBe('VOTE_INVALID');
    expect(g.rejects({ type: 'vote:cast', playerId: a!, targetId: 'ghost' })).toBe('VOTE_INVALID');
  });

  it('rejects votes outside the voting phase', () => {
    const g = new Game();
    const [a, b] = g.startWith(3);
    expect(g.rejects({ type: 'vote:cast', playerId: a!, targetId: b! })).toBe('WRONG_PHASE');
  });

  it('cues the final call when voting opens', () => {
    const g = new Game();
    g.startWith(3);
    g.tearAll();
    g.clueAll();
    g.host({ type: 'phase:skip' });
    expect(g.cues()).toEqual(['finalCall']);
  });
});

describe('REQ-VOTE-3 closing the ballot', () => {
  it('closes once every connected player has voted', () => {
    const g = voting();
    const target = g.civilians[0]!;
    g.voteAll((v) => (v === target ? g.imposter : target));
    expect(g.state.phase).toBe('voteReveal');
  });

  it('closes on the vote timer and counts missing votes as abstentions', () => {
    const g = voting();
    const [a, b] = g.round.turnOrder;
    g.ok({ type: 'vote:cast', playerId: a!, targetId: b! });
    g.fire('phase');
    expect(g.state.phase).toBe('voteReveal');
    expect(g.round.ballots[0]).toMatchObject({ result: 'eject', ejectedId: b, tally: { [b!]: 1 } });
  });

  it('does not wait for offline voters', () => {
    const g = voting();
    const [a, b, c, d] = g.round.turnOrder;
    g.ok({ type: 'vote:cast', playerId: a!, targetId: b! });
    g.ok({ type: 'vote:cast', playerId: b!, targetId: a! });
    g.ok({ type: 'vote:cast', playerId: c!, targetId: b! });
    g.ok({ type: 'player:disconnected', playerId: d! });
    expect(g.state.phase).toBe('voteReveal');
  });
});

describe('REQ-VOTE-4 reveal', () => {
  it('reveals every vote and the tally at once', () => {
    const g = voting();
    const target = g.civilians[0]!;
    g.voteAll((v) => (v === target ? g.imposter : target));
    const ballot = g.round.ballots[0]!;
    expect(Object.keys(ballot.votes)).toHaveLength(4);
    expect(ballot.tally[target]).toBe(3);
    expect(g.cues()).toContain('voteReveal');
    expect(g.timer('phase')!.at).toBe(g.now + TIMINGS.voteRevealMs);
  });

  it('moves on when the host display reports the reveal is done', () => {
    const g = voting();
    const target = g.civilians[0]!;
    g.voteAll((v) => (v === target ? g.imposter : target));
    g.host({ type: 'reveal:done' });
    expect(g.state.phase).toBe('result');
  });

  it('ignores a duplicate reveal:done', () => {
    const g = voting();
    const target = g.civilians[0]!;
    g.voteAll((v) => (v === target ? g.imposter : target));
    g.host({ type: 'reveal:done' });
    const before = g.state;
    expect(g.act({ type: 'reveal:done' }).effects).toEqual([]);
    expect(g.state).toBe(before);
  });
});

describe('REQ-VOTE-5 ties', () => {
  /** Split 4 votes 2-2 between the first two players in turn order. */
  const split = (g: Game, pool = g.round.turnOrder) => {
    const [x, y] = pool;
    g.voteAll((v) => {
      if (v === x) return y!;
      if (v === y) return x!;
      return g.round.turnOrder.indexOf(v) % 2 === 0 ? x! : y!;
    });
  };

  it('runs one revote between the tied players', () => {
    const g = voting();
    split(g);
    expect(g.round.ballots[0]!.result).toBe('revote');
    const tied = g.round.ballots[0]!.tied;
    expect(tied).toHaveLength(2);
    g.host({ type: 'reveal:done' });
    expect(g.state.phase).toBe('voting');
    expect(g.round.revoteCandidates).toEqual(tied);
  });

  it('only accepts votes for tied players in the revote, and they can still vote', () => {
    const g = voting();
    split(g);
    g.host({ type: 'reveal:done' });
    const [x, y] = g.round.revoteCandidates!;
    const outsider = g.round.turnOrder.find((id) => id !== x && id !== y)!;
    expect(g.rejects({ type: 'vote:cast', playerId: x!, targetId: outsider })).toBe('VOTE_INVALID');
    g.ok({ type: 'vote:cast', playerId: x!, targetId: y! });
  });

  it('a second tie means no ejection and the imposter wins', () => {
    const g = voting();
    split(g);
    g.host({ type: 'reveal:done' });
    split(g, g.round.revoteCandidates!);
    expect(g.round.ballots[1]!.result).toBe('doubleTie');
    g.host({ type: 'reveal:done' });
    expect(g.round.outcome).toEqual({ winner: 'imposter', reason: 'doubleTie', overridden: false });
  });

  it('no votes at all means the imposter wins', () => {
    const g = voting();
    g.fire('phase');
    expect(g.round.ballots[0]!.result).toBe('noVotes');
    g.fire('phase');
    expect(g.round.outcome?.reason).toBe('noVotes');
  });
});

describe('REQ-VOTE-6 ejection', () => {
  it('ejecting a civilian means the imposter wins', () => {
    const g = voting();
    const target = g.civilians[0]!;
    g.voteAll((v) => (v === target ? g.imposter : target));
    g.host({ type: 'reveal:done' });
    expect(g.round.outcome).toEqual({
      winner: 'imposter',
      reason: 'civilianVotedOut',
      overridden: false,
    });
  });

  it('ejecting the imposter opens the last chance', () => {
    const g = voting();
    g.voteAll((v) => (v === g.imposter ? g.civilians[0]! : g.imposter));
    g.host({ type: 'reveal:done' });
    expect(g.state.phase).toBe('lastChance');
    expect(g.cues()).toContain('lastCall');
  });
});

describe('REQ-RES-1/3 results and next round', () => {
  it('ends in the result phase with an outcome and a result cue', () => {
    const g = voting();
    const target = g.civilians[0]!;
    g.voteAll((v) => (v === target ? g.imposter : target));
    g.host({ type: 'reveal:done' });
    expect(g.state.phase).toBe('result');
    expect(g.cues()).toContain('result');
    expect(g.state.timers).toEqual({});
  });

  it('starts the next round with the same players, seating standby players', () => {
    const g = voting();
    const [late] = g.join('Late');
    g.fire('phase');
    g.fire('phase');
    expect(g.state.phase).toBe('result');
    g.host({ type: 'round:next' });
    expect(g.state.phase).toBe('reveal');
    expect(g.round.number).toBe(2);
    expect(g.round.turnOrder).toContain(late);
  });

  it('can return to the lobby', () => {
    const g = voting();
    g.host({ type: 'lobby:return' });
    expect(g.state.phase).toBe('lobby');
    expect(g.state.round).toBeNull();
  });

  it('round:next only works from the result', () => {
    const g = voting();
    expect(g.rejects({ type: 'round:next' })).toBe('WRONG_PHASE');
  });
});

describe('REQ-RES-4 scores', () => {
  it('gives each civilian +1 when civilians win', () => {
    const g = voting();
    g.voteAll((v) => (v === g.imposter ? g.civilians[0]! : g.imposter));
    g.host({ type: 'reveal:done' });
    g.fire('phase'); // last chance runs out
    for (const id of g.civilians) expect(g.score(id)).toBe(1);
    expect(g.score(g.imposter)).toBe(0);
  });

  it('gives the imposter +2 for a vote win', () => {
    const g = voting();
    const target = g.civilians[0]!;
    g.voteAll((v) => (v === target ? g.imposter : target));
    g.host({ type: 'reveal:done' });
    expect(g.score(g.imposter)).toBe(2);
    for (const id of g.civilians) expect(g.score(id)).toBe(0);
  });

  it('gives the imposter +3 for a guess win', () => {
    const g = voting();
    g.ok({ type: 'guess:submit', playerId: g.imposter, text: 'banana' });
    expect(g.score(g.imposter)).toBe(3);
  });

  it('host can reset scores', () => {
    const g = voting();
    g.ok({ type: 'guess:submit', playerId: g.imposter, text: 'banana' });
    g.host({ type: 'scores:reset' });
    expect(Object.values(g.state.scores).every((s) => s === 0)).toBe(true);
  });
});
