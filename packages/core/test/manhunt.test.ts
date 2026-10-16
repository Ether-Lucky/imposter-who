import { describe, expect, it } from 'vitest';
import { type Category, type Settings, hostView, playerView, seededRng } from '../src/index.ts';
import { Game } from './helpers.ts';

const WORDS: Category = {
  id: 'food',
  name: 'Food',
  custom: false,
  words: ['zucchini', 'pretzel', 'lasagna', 'avocado', 'popcorn', 'broccoli'].map((word) => ({
    word,
    aliases: [],
  })),
};

function manhunt(players: number, settings: Partial<Settings> = {}) {
  const g = new Game({ library: [WORDS], settings: { mode: 'manhunt', lives: 2, ...settings } });
  g.startWith(players);
  return g;
}

/** Everyone still playing votes `target` (the target votes for someone else). */
function voteOut(g: Game, target: string) {
  g.voteAll((v) =>
    v === target ? g.round.turnOrder.find((id) => id !== v && !isOut(g, id))! : target,
  );
}

const isOut = (g: Game, id: string) => !!g.state.match?.out.includes(id);
const alive = (g: Game) => g.round.turnOrder.filter((id) => !isOut(g, id));

/** Play clues and open the vote for the current round. */
function toVote(g: Game) {
  g.toVoting();
}

describe('REQ-MODE-1 mode setting', () => {
  it('accepts the mode and lives settings', () => {
    const g = new Game();
    g.host({ type: 'settings:update', patch: { mode: 'manhunt', lives: 0 } });
    expect(g.state.settings).toMatchObject({ mode: 'manhunt', lives: 0 });
  });

  it.each([{ mode: 'battle' }, { lives: 4 }, { lives: -1 }])('rejects %j', (patch) => {
    const g = new Game();
    expect(g.rejects({ type: 'settings:update', patch: patch as never })).toBe('SETTINGS_INVALID');
  });

  it('classic has no match', () => {
    const g = new Game();
    g.startWith(3);
    expect(g.state.match).toBeNull();
  });

  it('starts a match with the chosen lives', () => {
    const g = manhunt(4, { lives: 3 });
    expect(g.state.match).toMatchObject({
      imposterId: g.imposter,
      lives: 3,
      livesLeft: 3,
      out: [],
      rounds: 1,
      over: false,
    });
  });
});

describe('REQ-MODE-2 no guessing', () => {
  it.each(['clues', 'discussion', 'voting'] as const)(
    'the imposter cannot guess during %s',
    (phase) => {
      const g = manhunt(4);
      g.tearAll();
      if (phase !== 'clues') g.clueAll();
      if (phase === 'voting') g.host({ type: 'phase:skip' });
      expect(g.rejects({ type: 'guess:submit', playerId: g.imposter, text: 'zucchini' })).toBe(
        'GUESS_NOT_ALLOWED',
      );
    },
  );

  it('catching the imposter wins at once, with no last chance', () => {
    const g = manhunt(4);
    toVote(g);
    voteOut(g, g.imposter);
    g.host({ type: 'reveal:done' });
    expect(g.state.phase).toBe('result');
    expect(g.round.outcome).toEqual({
      winner: 'civilians',
      reason: 'imposterCaught',
      overridden: false,
    });
  });

  it('never offers a guess on the phone', () => {
    const g = manhunt(4);
    g.tearAll();
    expect(playerView(g.state, g.imposter).you!.canGuess).toBe(false);
  });
});

describe('REQ-MODE-3 and REQ-MODE-6 rounds of a match', () => {
  it('keeps the imposter and deals a new word each round', () => {
    const g = manhunt(5, { lives: 0 });
    const imposter = g.imposter;
    const words = [g.round.word.word];
    for (let i = 0; i < 3; i++) {
      toVote(g);
      g.fire('phase'); // nobody votes: no ejection
      g.host({ type: 'reveal:done' });
      expect(g.state.phase).toBe('intermission');
      g.host({ type: 'round:next' });
      expect(g.imposter).toBe(imposter);
      words.push(g.round.word.word);
    }
    expect(new Set(words).size).toBe(4);
    expect(g.state.match!.rounds).toBe(4);
  });

  it('cues the intermission and stops the clock', () => {
    const g = manhunt(4);
    toVote(g);
    voteOut(g, g.civilians[0]!);
    g.host({ type: 'reveal:done' });
    expect(g.state.phase).toBe('intermission');
    expect(g.cues()).toContain('intermission');
    expect(g.timer('phase')).toBeUndefined();
  });

  it('the host can end the match from the intermission', () => {
    const g = manhunt(4);
    toVote(g);
    voteOut(g, g.civilians[0]!);
    g.host({ type: 'reveal:done' });
    g.host({ type: 'lobby:return' });
    expect(g.state.match).toBeNull();
    expect(g.state.phase).toBe('lobby');
  });

  it('round:start does not work mid-match', () => {
    const g = manhunt(4);
    toVote(g);
    voteOut(g, g.civilians[0]!);
    g.host({ type: 'reveal:done' });
    expect(g.rejects({ type: 'round:start' })).toBe('WRONG_PHASE');
  });
});

describe('REQ-MODE-4 voting', () => {
  it('a voted-out civilian is out and costs a life', () => {
    const g = manhunt(5);
    const victim = g.civilians[0]!;
    toVote(g);
    voteOut(g, victim);
    g.host({ type: 'reveal:done' });
    expect(g.state.match).toMatchObject({ out: [victim], livesLeft: 1 });

    g.host({ type: 'round:next' });
    expect(g.round.turnOrder).not.toContain(victim);
    expect(g.round.turnOrder).toHaveLength(4);
  });

  it('players who are out cannot act or be voted for', () => {
    const g = manhunt(5);
    const victim = g.civilians[0]!;
    toVote(g);
    voteOut(g, victim);
    g.host({ type: 'reveal:done' });
    g.host({ type: 'round:next' });
    expect(g.rejects({ type: 'ticket:torn', playerId: victim })).toBe('NOT_PLAYING');
    toVote(g);
    expect(g.rejects({ type: 'vote:cast', playerId: victim, targetId: g.imposter })).toBe(
      'NOT_PLAYING',
    );
    expect(g.rejects({ type: 'vote:cast', playerId: g.imposter, targetId: victim })).toBe(
      'VOTE_INVALID',
    );
  });

  it('a tie ejects nobody, costs nothing and has no revote', () => {
    const g = manhunt(4);
    toVote(g);
    const [x, y] = g.round.turnOrder;
    g.voteAll((v) =>
      v === x ? y! : v === y ? x! : g.round.turnOrder.indexOf(v) % 2 === 0 ? x! : y!,
    );
    expect(g.round.ballots[0]!.result).toBe('noEject');
    g.host({ type: 'reveal:done' });
    expect(g.state.phase).toBe('intermission');
    expect(g.state.match).toMatchObject({ out: [], livesLeft: 2 });
  });

  it('no votes ejects nobody', () => {
    const g = manhunt(4);
    toVote(g);
    g.fire('phase');
    g.fire('phase');
    expect(g.state.phase).toBe('intermission');
    expect(g.state.match!.livesLeft).toBe(2);
  });
});

describe('REQ-MODE-5 lives and the end', () => {
  it('runs out of lives: the imposter wins', () => {
    const g = manhunt(5, { lives: 1 });
    toVote(g);
    voteOut(g, g.civilians[0]!);
    g.host({ type: 'reveal:done' });
    expect(g.round.outcome).toEqual({
      winner: 'imposter',
      reason: 'outOfLives',
      overridden: false,
    });
    expect(g.state.match!.over).toBe(true);
  });

  it('with Unlimited lives, plays until two remain', () => {
    const g = manhunt(4, { lives: 0 });
    expect(g.state.match!.livesLeft).toBeNull();
    toVote(g);
    voteOut(g, g.civilians[0]!);
    g.host({ type: 'reveal:done' });
    expect(g.state.phase).toBe('intermission');
    g.host({ type: 'round:next' });
    expect(alive(g)).toHaveLength(3);
    toVote(g);
    voteOut(g, g.civilians[0]!);
    g.host({ type: 'reveal:done' });
    expect(g.round.outcome?.reason).toBe('lastTwo');
  });

  it('two left ends the match even with lives to spare', () => {
    const g = manhunt(3, { lives: 3 });
    toVote(g);
    voteOut(g, g.civilians[0]!);
    g.host({ type: 'reveal:done' });
    expect(g.round.outcome?.reason).toBe('lastTwo');
    expect(g.state.match!.livesLeft).toBe(2);
  });
});

describe('REQ-MODE-7 ghosts', () => {
  it('shows a voted-out player the imposter and the word, and nobody else', () => {
    const g = manhunt(5);
    const victim = g.civilians[0]!;
    toVote(g);
    voteOut(g, victim);
    g.host({ type: 'reveal:done' });
    g.host({ type: 'round:next' });

    const ghost = playerView(g.state, victim).you!;
    expect(ghost).toMatchObject({ out: true, ticket: null });
    expect(ghost.ghost).toEqual({ imposterId: g.imposter, word: g.round.word.word });

    for (const id of alive(g)) {
      expect(playerView(g.state, id).you).toMatchObject({ out: false, ghost: null });
    }
    expect(hostView(g.state).round!.imposterId).toBeNull();
    expect(JSON.stringify(hostView(g.state).match)).not.toContain(g.imposter);
  });

  it('players still in keep identical payload shapes', () => {
    const g = manhunt(5);
    toVote(g);
    voteOut(g, g.civilians[0]!);
    g.host({ type: 'reveal:done' });
    g.host({ type: 'round:next' });
    const civilian = alive(g).find((id) => id !== g.imposter)!;
    const keys = (id: string) => Object.keys(playerView(g.state, id).you!).sort();
    expect(keys(g.imposter)).toEqual(keys(civilian));
    expect(Object.keys(playerView(g.state, g.imposter).you!.ticket!).sort()).toEqual(
      Object.keys(playerView(g.state, civilian).you!.ticket!).sort(),
    );
  });
});

describe('REQ-MODE-8 joining mid-match', () => {
  it('waits on standby until the match ends', () => {
    const g = manhunt(4, { lives: 0 });
    const [late] = g.join('Late');
    toVote(g);
    g.fire('phase');
    g.host({ type: 'reveal:done' });
    g.host({ type: 'round:next' });
    expect(g.round.turnOrder).not.toContain(late);
    expect(g.state.players.find((p) => p.id === late)!.standby).toBe(true);

    toVote(g);
    voteOut(g, g.imposter);
    g.host({ type: 'reveal:done' });
    g.host({ type: 'round:next' }); // new match
    expect(g.round.turnOrder).toContain(late);
    expect(g.state.match).toMatchObject({ out: [], rounds: 1 });
  });
});

describe('REQ-MODE-9 scores', () => {
  it('every civilian of the match scores when the imposter is caught, in or out', () => {
    const g = manhunt(5);
    const victim = g.civilians[0]!;
    toVote(g);
    voteOut(g, victim);
    g.host({ type: 'reveal:done' });
    g.host({ type: 'round:next' });
    toVote(g);
    voteOut(g, g.imposter);
    g.host({ type: 'reveal:done' });
    for (const id of g.state.players.map((p) => p.id)) {
      expect(g.score(id)).toBe(id === g.imposter ? 0 : 1);
    }
  });

  it('the imposter scores 3 for surviving', () => {
    const g = manhunt(4, { lives: 1 });
    toVote(g);
    voteOut(g, g.civilians[0]!);
    g.host({ type: 'reveal:done' });
    expect(g.score(g.imposter)).toBe(3);
  });
});

describe('REQ-SEC-1 Manhunt privacy fuzz', () => {
  it('only ghosts and the result ever name the imposter', () => {
    const rng = seededRng(77);
    const pick = <T>(xs: readonly T[]): T => xs[rng.int(xs.length)]!;
    for (let run = 0; run < 150; run++) {
      const g = new Game({
        seed: run + 3,
        library: [WORDS],
        settings: { mode: 'manhunt', lives: pick([0, 1, 2, 3] as const) },
      });
      const ids = g.join('A', 'B', 'C', 'D', 'E', 'F');
      for (let step = 0; step < 80; step++) {
        const id = pick(ids);
        const timerKeys = Object.keys(g.state.timers) as ('phase' | 'lowPlayers' | 'override')[];
        if (timerKeys.length && rng.int(3) === 0) g.fire(pick(timerKeys));
        else
          g.act(
            pick([
              { type: 'round:start' },
              { type: 'round:next' },
              { type: 'ticket:torn', playerId: id },
              {
                type: 'clue:submit',
                playerId: g.state.round?.turnOrder[g.state.round.turnIndex] ?? id,
                text: `w${step}x`.replace(/\d/g, 'q'),
              },
              { type: 'vote:cast', playerId: id, targetId: pick(ids) },
              { type: 'phase:skip' },
              { type: 'reveal:done' },
              { type: 'guess:submit', playerId: id, text: 'zucchini' },
            ] as const),
          );
        const match = g.state.match;
        if (!match || match.over || g.state.phase === 'result') continue;
        expect(hostView(g.state).round?.imposterId ?? null).toBeNull();
        for (const pid of ids) {
          const you = playerView(g.state, pid).you!;
          if (match.out.includes(pid)) expect(you.ghost?.imposterId).toBe(match.imposterId);
          else expect(you.ghost).toBeNull();
        }
        expect(g.state.round?.guess ?? null).toBeNull();
      }
    }
  });
});
