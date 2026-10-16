import {
  type Action,
  type Ack,
  type Category,
  type GameState,
  type Settings,
  initialState,
  reduce,
  seededRng,
} from '@imposter-who/core';

export const LIBRARY: Category[] = [
  { id: 'food', name: 'Food', custom: false, words: [{ word: 'zucchini', aliases: [] }] },
];

/** Plays the real engine to reach any phase, for rendering screens in tests. */
export class Script {
  state: GameState;
  private rng = seededRng(5);
  now = 1_000_000;

  constructor(settings: Partial<Settings> = {}) {
    this.state = initialState({ categories: ['food'], ...settings });
  }

  act(action: Action) {
    const r = reduce(this.state, action, { now: this.now, rng: this.rng, library: LIBRARY });
    const reject = r.effects.find((e) => e.type === 'reject');
    if (reject) throw new Error(`${action.type}: ${JSON.stringify(reject)}`);
    this.state = r.state;
    return this;
  }

  join(n: number) {
    for (let i = 0; i < n; i++) {
      this.act({ type: 'player:join', playerId: `p${i}`, tokenHash: `t${i}`, name: `Pax${i}` });
    }
    return this;
  }

  get round() {
    return this.state.round!;
  }
  get imposter() {
    return this.round.imposterId;
  }
  get civilian() {
    return this.round.turnOrder.find((id) => id !== this.imposter)!;
  }

  start() {
    return this.act({ type: 'round:start' });
  }
  toClues() {
    return this.act({ type: 'phase:continue' });
  }
  clueAll() {
    let n = 0;
    while (this.state.phase === 'clues') {
      const id = this.round.turnOrder[this.round.turnIndex]!;
      this.act({ type: 'clue:submit', playerId: id, text: `hint${'abcdefgh'[n++]}` });
    }
    return this;
  }
  toVoting() {
    return this.toClues().clueAll().act({ type: 'phase:skip' });
  }
  voteOut(target: string) {
    for (const id of this.round.turnOrder) {
      if (this.state.phase !== 'voting') break;
      const to = id === target ? this.round.turnOrder.find((x) => x !== id)! : target;
      this.act({ type: 'vote:cast', playerId: id, targetId: to });
    }
    return this;
  }
}

export const noSend = async (): Promise<Ack> => ({ ok: true });
