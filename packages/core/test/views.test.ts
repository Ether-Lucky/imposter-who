import { describe, expect, it } from 'vitest';
import {
  type Action,
  type Category,
  IMPOSTER_HEADLINE,
  hostView,
  playerView,
  seededRng,
} from '../src/index.ts';
import { Game } from './helpers.ts';

const SECRET: Category = {
  id: 'food',
  name: 'Food',
  words: [{ word: 'zucchini', aliases: ['courgette'] }],
  custom: false,
};

const SECRET_STRINGS = ['zucchini', 'courgette'];

function leaks(data: unknown, needles: string[]) {
  const text = JSON.stringify(data).toLowerCase();
  return needles.filter((n) => text.includes(n.toLowerCase()));
}

/** Recursively list the keys of an object so two payloads can be compared by shape. */
function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? [shape(value[0])] : [];
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, shape(v)]),
    );
  }
  return value === null ? 'null-or-value' : typeof value;
}

describe('REQ-SEC-1 server-side views', () => {
  it('never sends the word to the imposter or the board before the result', () => {
    const g = new Game({ library: [SECRET] });
    g.startWith(4);
    const imposterTicket = playerView(g.state, g.imposter).you!.ticket!;
    expect(imposterTicket.headline).toBe(IMPOSTER_HEADLINE);
    expect(leaks(playerView(g.state, g.imposter), SECRET_STRINGS)).toEqual([]);
    expect(leaks(hostView(g.state), SECRET_STRINGS)).toEqual([]);
    expect(hostView(g.state).round!.imposterId).toBeNull();
  });

  it('gives civilians the word and category', () => {
    const g = new Game({ library: [SECRET] });
    g.startWith(4);
    expect(playerView(g.state, g.civilians[0]!).you!.ticket).toEqual({
      headline: 'zucchini',
      line: 'Food',
    });
  });

  it('hides the category from the imposter and the board when the setting is off', () => {
    // Two selected categories, so the settings list alone does not give the category away.
    const veg: Category = { ...SECRET, id: 'cat-1', name: 'Vegetables' };
    const other: Category = {
      ...SECRET,
      id: 'cat-2',
      name: 'Gadgets',
      words: [{ word: 'zzz', aliases: [] }],
    };
    const g = new Game({
      library: [veg, other],
      settings: { showCategoryToImposter: false, categories: ['cat-1', 'cat-2'] },
    });
    g.startWith(4);
    expect(playerView(g.state, g.imposter).you!.ticket!.line).toBeNull();
    expect(hostView(g.state).round!.categoryName).toBeNull();
    expect(leaks(hostView(g.state), [g.round.categoryName])).toEqual([]);
    expect(leaks(playerView(g.state, g.imposter), [g.round.categoryName])).toEqual([]);
  });

  it('never exposes token hashes', () => {
    const g = new Game();
    g.startWith(3);
    expect(leaks(hostView(g.state), ['t-p-'])).toEqual([]);
    expect(leaks(playerView(g.state, g.civilians[0]!), ['t-p-'])).toEqual([]);
  });

  it('reveals the word, imposter and outcome in the result', () => {
    const g = new Game({ library: [SECRET] });
    g.startWith(4);
    g.tearAll();
    g.ok({ type: 'guess:submit', playerId: g.imposter, text: 'courgette' });
    const round = hostView(g.state).round!;
    expect(round.word?.word).toBe('zucchini');
    expect(round.imposterId).toBe(g.imposter);
    expect(round.outcome?.reason).toBe('earlyGuessRight');
  });
});

describe('REQ-VOTE-2 progress without leaks', () => {
  it('shows who voted but not for whom', () => {
    const g = new Game();
    g.startWith(4);
    g.toVoting();
    const [a, b] = g.round.turnOrder;
    g.ok({ type: 'vote:cast', playerId: a!, targetId: b! });
    const view = hostView(g.state);
    expect(view.round!.votedIds).toEqual([a]);
    expect(view.round!.ballots).toEqual([]);
    expect(playerView(g.state, b!).you!.myVote).toBeNull();
    expect(playerView(g.state, a!).you!.myVote).toBe(b);
  });
});

describe('REQ-SEC-2 / REQ-GUESS-5 role-neutral payloads', () => {
  it('civilian and imposter views have the same shape in every phase', () => {
    const g = new Game({ library: [SECRET] });
    g.startWith(4);
    const check = () => {
      const civ = shape(playerView(g.state, g.civilians[0]!));
      const imp = shape(playerView(g.state, g.imposter));
      expect(imp).toEqual(civ);
    };
    check();
    g.tearAll();
    check();
    g.clueAll();
    check();
    g.host({ type: 'phase:skip' });
    check();
  });

  it('only the imposter can guess, and only in the guess windows', () => {
    const g = new Game();
    g.startWith(4);
    expect(playerView(g.state, g.imposter).you!.canGuess).toBe(false);
    g.tearAll();
    expect(playerView(g.state, g.imposter).you!.canGuess).toBe(true);
    expect(playerView(g.state, g.civilians[0]!).you!.canGuess).toBe(false);
  });

  it('cues carry no role information', () => {
    const g = new Game();
    g.startWith(4);
    g.tearAll();
    for (const id of g.round.turnOrder) {
      expect(JSON.stringify(g.effects)).not.toContain(`"imposter"`);
      if (g.state.phase === 'clues')
        g.ok({ type: 'clue:submit', playerId: g.current, text: `w${id}x`.replace(/-/g, '') });
    }
  });
});

describe('REQ-SEC-1 privacy fuzz', () => {
  it('no random sequence of actions leaks the word or imposter early', () => {
    const rng = seededRng(2024);
    const pick = <T>(xs: readonly T[]): T => xs[rng.int(xs.length)]!;
    const texts = ['yellow', 'fruit', 'zucchini', 'courgettes', 'green', 'x', 'two words', ''];

    for (let run = 0; run < 300; run++) {
      const g = new Game({
        seed: run + 1,
        library: [SECRET],
        settings: {
          clueMode: pick(['typed', 'spoken'] as const),
          laps: pick([1, 2] as const),
          showCategoryToImposter: pick([true, false]),
          earlyGuess: pick([true, false]),
        },
      });
      const ids = g.join('A', 'B', 'C', 'D', 'E');

      for (let step = 0; step < 60; step++) {
        const id = pick(ids);
        const actions: Action[] = [
          { type: 'round:start' },
          { type: 'round:next' },
          { type: 'ticket:torn', playerId: id },
          {
            type: 'clue:submit',
            playerId: g.state.round?.turnOrder[g.state.round.turnIndex] ?? id,
            text: pick(texts),
          },
          { type: 'turn:done', playerId: id },
          { type: 'vote:cast', playerId: id, targetId: pick(ids) },
          { type: 'guess:submit', playerId: id, text: pick(texts) },
          { type: 'phase:skip' },
          { type: 'phase:continue' },
          { type: 'reveal:done' },
          { type: 'player:disconnected', playerId: id },
          { type: 'player:connected', playerId: id },
          { type: 'game:pause' },
          { type: 'game:resume' },
          { type: 'timer:add', seconds: 30 },
          { type: 'guess:override' },
        ];
        const timerKeys = Object.keys(g.state.timers) as ('phase' | 'lowPlayers' | 'override')[];
        if (timerKeys.length && rng.int(4) === 0) g.fire(pick(timerKeys));
        else g.act(pick(actions));

        const round = g.state.round;
        if (!round || g.state.phase === 'result' || g.state.phase === 'lobby') continue;

        // The imposter may type the word as a clue without knowing it; that text is public.
        const typedClues = round.clues.flatMap((c) => (c.text ? [c.text.toLowerCase()] : []));
        const unexplained = (found: string[]) =>
          found.filter((s) => !typedClues.some((c) => c.includes(s)));

        // Imposter view never holds the word; nobody else learns who the imposter is.
        expect(unexplained(leaks(playerView(g.state, round.imposterId), SECRET_STRINGS))).toEqual(
          [],
        );
        const host = hostView(g.state);
        expect(unexplained(leaks(host, SECRET_STRINGS))).toEqual([]);
        if (g.state.phase !== 'lastChance') {
          expect(host.round!.imposterId).toBeNull();
          for (const civ of round.turnOrder.filter((p) => p !== round.imposterId)) {
            expect(JSON.stringify(playerView(g.state, civ).you)).not.toContain('Destination');
          }
        }
      }
    }
  });
});
