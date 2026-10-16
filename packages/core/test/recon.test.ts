import { describe, expect, it } from 'vitest';
import { TIMINGS } from '../src/index.ts';
import { Game } from './helpers.ts';

describe('REQ-RECON-2 seats are held', () => {
  it('keeps an offline player seated in the lobby', () => {
    const g = new Game();
    const [a] = g.join('A', 'B');
    g.ok({ type: 'player:disconnected', playerId: a! });
    expect(g.state.players.find((p) => p.id === a)).toMatchObject({ connected: false, seat: 0 });
    g.ok({ type: 'player:connected', playerId: a! });
    expect(g.state.players.find((p) => p.id === a)!.connected).toBe(true);
  });

  it('ignores repeated connect/disconnect events', () => {
    const g = new Game();
    const [a] = g.join('A');
    expect(g.act({ type: 'player:connected', playerId: a! }).effects).toEqual([]);
    g.ok({ type: 'player:disconnected', playerId: a! });
    expect(g.act({ type: 'player:disconnected', playerId: a! }).effects).toEqual([]);
  });
});

describe('REQ-RECON-3 offline turns', () => {
  it("shortens an offline player's turn to 10 seconds, then passes it", () => {
    const g = new Game({ settings: { clueSeconds: 60 } });
    g.startWith(4);
    g.tearAll();
    const id = g.current;
    g.ok({ type: 'player:disconnected', playerId: id });
    expect(g.timer('phase')!.at).toBe(g.now + TIMINGS.offlineTurnMs);
    g.fire('phase');
    expect(g.round.clues[0]).toMatchObject({ playerId: id, status: 'passed' });
  });

  it('gives an offline player 10 seconds even with the clue timer off', () => {
    const g = new Game({ settings: { clueSeconds: 0 } });
    const ids = g.startWith(4);
    g.tearAll();
    const second = g.round.turnOrder[1]!;
    g.ok({ type: 'player:disconnected', playerId: second });
    g.ok({ type: 'clue:submit', playerId: g.current, text: 'yellow' });
    expect(g.current).toBe(second);
    expect(g.timer('phase')!.at).toBe(g.now + TIMINGS.offlineTurnMs);
    expect(ids).toContain(second);
  });

  it('gives back an unlimited turn when the player returns (timer off)', () => {
    const g = new Game({ settings: { clueSeconds: 0 } });
    g.startWith(4);
    g.tearAll();
    const id = g.current;
    g.ok({ type: 'player:disconnected', playerId: id });
    g.ok({ type: 'player:connected', playerId: id });
    expect(g.timer('phase')).toBeUndefined();
  });

  it('does not lengthen a turn that already has less than 10 seconds', () => {
    const g = new Game({ settings: { clueSeconds: 15 } });
    g.startWith(4);
    g.tearAll();
    g.now += 10_000;
    const at = g.timer('phase')!.at;
    g.ok({ type: 'player:disconnected', playerId: g.current });
    expect(g.timer('phase')!.at).toBe(at);
  });
});

describe('REQ-RECON-4 too few players', () => {
  it('pauses after 30 seconds below 3 connected players', () => {
    const g = new Game();
    const ids = g.startWith(3);
    g.tearAll();
    g.ok({ type: 'player:disconnected', playerId: ids[0]! });
    expect(g.timer('lowPlayers')!.at).toBe(g.now + TIMINGS.lowPlayersMs);
    g.fire('lowPlayers');
    expect(g.state).toMatchObject({ paused: true, pausedReason: 'lowPlayers' });
  });

  it('cancels the countdown when someone comes back', () => {
    const g = new Game();
    const ids = g.startWith(3);
    g.ok({ type: 'player:disconnected', playerId: ids[0]! });
    g.ok({ type: 'player:connected', playerId: ids[0]! });
    expect(g.timer('lowPlayers')).toBeUndefined();
  });

  it('host can keep waiting (resume) or end the round with no result', () => {
    const g = new Game();
    const ids = g.startWith(3);
    g.tearAll();
    g.ok({ type: 'player:disconnected', playerId: ids[0]! });
    g.fire('lowPlayers');
    g.host({ type: 'game:resume' });
    expect(g.state.paused).toBe(false);
    expect(g.timer('lowPlayers')).toBeDefined();
    g.host({ type: 'lobby:return' });
    expect(g.state.phase).toBe('lobby');
    expect(Object.values(g.state.scores).every((s) => s === 0)).toBe(true);
  });
});

describe('REQ-RECON-6 and removals mid-round', () => {
  it('removing the imposter ends the round with no result', () => {
    const g = new Game();
    g.startWith(4);
    g.tearAll();
    g.host({ type: 'player:remove', id: g.imposter });
    expect(g.state.phase).toBe('result');
    expect(g.round.outcome).toEqual({ winner: 'none', reason: 'imposterLeft', overridden: false });
    expect(Object.values(g.state.scores).every((s) => s === 0)).toBe(true);
  });

  it('removing the current clue giver moves the turn on', () => {
    const g = new Game();
    g.startWith(5);
    g.tearAll();
    while (g.current === g.imposter)
      g.ok({ type: 'clue:submit', playerId: g.current, text: 'peel' });
    const removed = g.current;
    const next = g.round.turnOrder[g.round.turnIndex + 1];
    g.host({ type: 'player:remove', id: removed });
    expect(g.round.turnOrder).not.toContain(removed);
    expect(g.current).toBe(next);
  });

  it('removing an earlier player keeps the current turn', () => {
    const g = new Game();
    g.startWith(5);
    g.tearAll();
    g.ok({ type: 'clue:submit', playerId: g.current, text: 'yellow' });
    const earlier = g.round.turnOrder[0]!;
    const current = g.current;
    if (earlier !== g.imposter) {
      g.host({ type: 'player:remove', id: earlier });
      expect(g.current).toBe(current);
    }
  });

  it('removing a voter drops their vote and votes for them, then rechecks the ballot', () => {
    const g = new Game();
    g.startWith(5);
    g.toVoting();
    const [victim, ...rest] = g.civilians;
    for (const id of rest) g.ok({ type: 'vote:cast', playerId: id, targetId: victim! });
    g.ok({ type: 'vote:cast', playerId: g.imposter, targetId: rest[0]! });
    expect(g.state.phase).toBe('voting');
    g.host({ type: 'player:remove', id: victim! });
    // Everyone left has voted, but their votes for the removed player were dropped.
    expect(g.state.phase).toBe('voting');
    expect(Object.values(g.round.votes)).not.toContain(victim);
  });

  it('aborts the round when fewer than 3 players remain', () => {
    const g = new Game();
    g.startWith(3);
    g.tearAll();
    g.host({ type: 'player:remove', id: g.civilians[0]! });
    expect(g.round.outcome?.reason).toBe('aborted');
  });
});
