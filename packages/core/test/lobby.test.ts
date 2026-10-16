import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, LIMITS } from '../src/index.ts';
import { Game } from './helpers.ts';

describe('REQ-CONN-2 join by name', () => {
  it('seats players in join order with a cue', () => {
    const g = new Game();
    const [a, b] = g.join('Ana', 'Ben');
    expect(g.state.players.map((p) => [p.id, p.seat, p.name])).toEqual([
      [a, 0, 'Ana'],
      [b, 1, 'Ben'],
    ]);
    expect(g.cues()).toEqual(['playerJoined']);
  });

  it('trims names, strips control characters and allows emoji', () => {
    const g = new Game();
    g.ok({ type: 'player:join', playerId: 'x', tokenHash: 'tx', name: '  Mia\u0007 🦊 ' });
    expect(g.state.players[0]!.name).toBe('Mia 🦊');
  });

  it.each(['', '   ', 'ThirteenChars'])('rejects invalid name %j', (name) => {
    const g = new Game();
    expect(g.rejects({ type: 'player:join', playerId: 'x', tokenHash: 't', name })).toBe(
      'NAME_INVALID',
    );
  });

  it('rejects a taken name case-insensitively', () => {
    const g = new Game();
    g.join('Ana');
    expect(g.rejects({ type: 'player:join', playerId: 'y', tokenHash: 'ty', name: 'ANA' })).toBe(
      'NAME_TAKEN',
    );
  });

  it('rejects a second join from the same token', () => {
    const g = new Game();
    g.join('Ana');
    expect(
      g.rejects({ type: 'player:join', playerId: 'other', tokenHash: 't-p-ana', name: 'Zed' }),
    ).toBe('ALREADY_JOINED');
  });
});

describe('REQ-CONN-4 player limits', () => {
  it('refuses the 16th player with BOARD_FULL', () => {
    const g = new Game();
    for (let i = 0; i < LIMITS.maxPlayers; i++) {
      g.ok({ type: 'player:join', playerId: `p${i}`, tokenHash: `t${i}`, name: `P${i}` });
    }
    expect(
      g.rejects({ type: 'player:join', playerId: 'late', tokenHash: 'tl', name: 'Late' }),
    ).toBe('BOARD_FULL');
  });

  it('cannot start with fewer than 3 connected players', () => {
    const g = new Game();
    g.join('A', 'B');
    expect(g.rejects({ type: 'round:start' })).toBe('NOT_ENOUGH_PLAYERS');
    g.join('C');
    g.ok({ type: 'player:disconnected', playerId: 'p-c' });
    expect(g.rejects({ type: 'round:start' })).toBe('NOT_ENOUGH_PLAYERS');
  });
});

describe('REQ-CONN-5 late joiners', () => {
  it('joins mid-round as standby and plays from the next round', () => {
    const g = new Game();
    g.startWith(3);
    const [late] = g.join('Late');
    const player = () => g.state.players.find((p) => p.id === late)!;
    expect(player().standby).toBe(true);
    expect(g.round.turnOrder).not.toContain(late);

    g.host({ type: 'lobby:return' });
    expect(player().standby).toBe(false);
    g.host({ type: 'round:start' });
    expect(g.round.turnOrder).toContain(late);
  });
});

describe('REQ-LOBBY-2 host controls', () => {
  it('reorders seats', () => {
    const g = new Game();
    const [a, b, c] = g.join('A', 'B', 'C');
    g.host({ type: 'seat:reorder', order: [c!, a!, b!] });
    expect(g.state.players.map((p) => p.id)).toEqual([c, a, b]);
    expect(g.state.players.map((p) => p.seat)).toEqual([0, 1, 2]);
  });

  it('rejects an order that is not a permutation of the players', () => {
    const g = new Game();
    const [a, b] = g.join('A', 'B');
    expect(g.rejects({ type: 'seat:reorder', order: [a!, a!] })).toBe('SEATS_INVALID');
    expect(g.rejects({ type: 'seat:reorder', order: [a!, b!, 'ghost'] })).toBe('SEATS_INVALID');
  });

  it('removes a player and closes the seat gap', () => {
    const g = new Game();
    const [a, b, c] = g.join('A', 'B', 'C');
    g.host({ type: 'player:remove', id: b! });
    expect(g.state.players.map((p) => [p.id, p.seat])).toEqual([
      [a, 0],
      [c, 1],
    ]);
    expect(g.state.scores[b!]).toBeUndefined();
  });

  it('cannot reorder seats mid-round', () => {
    const g = new Game();
    const ids = g.startWith(3);
    expect(g.rejects({ type: 'seat:reorder', order: [...ids].reverse() })).toBe('WRONG_PHASE');
  });
});

describe('REQ-LOBBY-3 settings', () => {
  it('has the documented defaults', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      clueMode: 'typed',
      laps: 1,
      clueSeconds: 30,
      discussionSeconds: 90,
      voteSeconds: 60,
      showCategoryToImposter: true,
      earlyGuess: true,
      hostSound: true,
      hostVolume: 70,
    });
  });

  it('applies a valid patch', () => {
    const g = new Game();
    g.host({ type: 'settings:update', patch: { clueMode: 'spoken', laps: 3, clueSeconds: 0 } });
    expect(g.state.settings).toMatchObject({ clueMode: 'spoken', laps: 3, clueSeconds: 0 });
  });

  it.each([
    { laps: 4 },
    { clueSeconds: 20 },
    { clueMode: 'mime' },
    { hostVolume: 101 },
    { categories: 'food' },
    { nonsense: true },
  ])('rejects %j', (patch) => {
    const g = new Game();
    expect(g.rejects({ type: 'settings:update', patch: patch as never })).toBe('SETTINGS_INVALID');
  });

  it('cannot change settings mid-round', () => {
    const g = new Game();
    g.startWith(3);
    expect(g.rejects({ type: 'settings:update', patch: { laps: 2 } })).toBe('WRONG_PHASE');
  });
});

describe('REQ-WORD-4 start needs words', () => {
  it('refuses to start with an empty pool', () => {
    const g = new Game({ settings: { categories: [] } });
    g.join('A', 'B', 'C');
    expect(g.rejects({ type: 'round:start' })).toBe('EMPTY_POOL');
  });
});
