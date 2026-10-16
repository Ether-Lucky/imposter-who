import { expect } from 'vitest';
import {
  type Action,
  type Category,
  type Effect,
  type ErrorCode,
  type GameState,
  type HostAction,
  type Settings,
  type TimerKey,
  initialState,
  reduce,
  seededRng,
} from '../src/index.ts';

export const BANANA: Category = {
  id: 'food',
  name: 'Food',
  words: [{ word: 'banana', aliases: ['bananas'] }],
  custom: false,
};

/** Drives the pure engine the way the server will: real actions, a fake clock, fired timers. */
export class Game {
  state: GameState;
  now = 1_000_000;
  effects: Effect[] = [];
  readonly rng;
  library: Category[];

  constructor(opts: { seed?: number; settings?: Partial<Settings>; library?: Category[] } = {}) {
    this.rng = seededRng(opts.seed ?? 1);
    this.library = opts.library ?? [BANANA];
    this.state = initialState({ categories: ['food'], ...opts.settings });
  }

  act(action: Action) {
    const result = reduce(this.state, action, {
      now: this.now,
      rng: this.rng,
      library: this.library,
    });
    this.state = result.state;
    this.effects = result.effects;
    return result;
  }

  /** Apply and assert it was accepted. */
  ok(action: Action) {
    const result = this.act(action);
    const reject = result.effects.find((e) => e.type === 'reject');
    expect(reject, `${action.type} rejected with ${JSON.stringify(reject)}`).toBeUndefined();
    return result;
  }

  /** Apply and return the reject code (fails if accepted). State must be unchanged. */
  rejects(action: Action): ErrorCode {
    const before = this.state;
    const result = this.act(action);
    const reject = result.effects.find((e) => e.type === 'reject');
    expect(reject, `${action.type} should have been rejected`).toBeDefined();
    expect(this.state).toBe(before);
    return (reject as { code: ErrorCode }).code;
  }

  host(action: HostAction) {
    return this.ok(action);
  }

  join(...names: string[]): string[] {
    return names.map((name) => {
      const id = `p-${name.toLowerCase()}`;
      this.ok({ type: 'player:join', playerId: id, tokenHash: `t-${id}`, name });
      return id;
    });
  }

  /** Join N players named A, B, C... and start a round. */
  startWith(count: number): string[] {
    const ids = this.join(...'ABCDEFGHIJKLMNO'.slice(0, count).split(''));
    this.host({ type: 'round:start' });
    return ids;
  }

  get round() {
    return this.state.round!;
  }

  get imposter() {
    return this.round.imposterId;
  }

  get civilians() {
    return this.round.turnOrder.filter((id) => id !== this.imposter);
  }

  get current() {
    return this.round.turnOrder[this.round.turnIndex]!;
  }

  tearAll() {
    for (const id of this.round.turnOrder) {
      const p = this.state.players.find((x) => x.id === id)!;
      if (p.connected && !p.ready && this.state.phase === 'reveal') {
        this.ok({ type: 'ticket:torn', playerId: id });
      }
    }
  }

  /** Give a unique typed clue for every remaining turn until discussion. */
  clueAll() {
    let n = 0;
    while (this.state.phase === 'clues') {
      this.ok({ type: 'clue:submit', playerId: this.current, text: `clue${'xyzw'[n % 4]}${n}` });
      n++;
    }
  }

  toVoting() {
    this.tearAll();
    this.clueAll();
    this.host({ type: 'phase:skip' });
    expect(this.state.phase).toBe('voting');
  }

  /** Every connected participant votes according to pick(voterId). */
  voteAll(pick: (voter: string) => string) {
    for (const id of [...this.round.turnOrder]) {
      if (this.state.phase !== 'voting') break;
      const p = this.state.players.find((x) => x.id === id)!;
      if (p.connected) this.ok({ type: 'vote:cast', playerId: id, targetId: pick(id) });
    }
  }

  timer(key: TimerKey) {
    return this.state.timers[key];
  }

  /** Jump the clock to a timer and fire it. */
  fire(key: TimerKey) {
    const slot = this.state.timers[key];
    expect(slot, `no ${key} timer to fire`).toBeDefined();
    this.now = slot!.at;
    return this.act({ type: 'timer:expired', key, seq: slot!.seq });
  }

  cues() {
    return this.effects.flatMap((e) => (e.type === 'cue' ? [e.cue.cue] : []));
  }

  score(id: string) {
    return this.state.scores[id] ?? 0;
  }
}
