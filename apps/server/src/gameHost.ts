/**
 * Owns the GameState: runs the pure reducer, turns timer effects into real timeouts, and
 * coalesces changes so a burst of actions produces one broadcast. Source: 02-design §6.
 */
import { randomInt } from 'node:crypto';
import {
  type Ack,
  type Action,
  type Category,
  type Cue,
  ERROR_MESSAGES,
  type GameState,
  type Rng,
  type Settings,
  type TimerKey,
  initialState,
  reduce,
} from '@imposter-who/core';

/** REQ-ROLE-1: cryptographically secure randomness in production. */
export const cryptoRng: Rng = { int: (max) => randomInt(max) };

export interface GameHostOptions {
  library: () => Category[];
  settings?: Partial<Settings>;
  now?: () => number;
  rng?: Rng;
  onSettingsChanged?: (settings: Settings) => void;
}

export type FlushListener = (state: GameState, cues: Cue[]) => void;

export class GameHost {
  state: GameState;
  private readonly timers = new Map<TimerKey, ReturnType<typeof setTimeout>>();
  private readonly listeners = new Set<FlushListener>();
  private pendingCues: Cue[] = [];
  private flushQueued = false;
  private readonly now: () => number;
  private readonly rng: Rng;

  constructor(private readonly opts: GameHostOptions) {
    this.state = initialState(opts.settings);
    this.now = opts.now ?? Date.now;
    this.rng = opts.rng ?? cryptoRng;
  }

  onFlush(listener: FlushListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  serverNow(): number {
    return this.now();
  }

  dispatch(action: Action): Ack {
    const before = this.state;
    const { state, effects } = reduce(before, action, {
      now: this.now(),
      rng: this.rng,
      library: this.opts.library(),
    });

    for (const effect of effects) {
      switch (effect.type) {
        case 'reject':
          return { ok: false, code: effect.code, message: ERROR_MESSAGES[effect.code] };
        case 'setTimer':
          this.schedule(effect.key, effect.at, effect.seq);
          break;
        case 'clearTimer':
          this.cancel(effect.key);
          break;
        case 'cue':
          this.pendingCues.push(effect.cue);
          break;
      }
    }

    if (state !== before) {
      this.state = state;
      if (state.settings !== before.settings) this.opts.onSettingsChanged?.(state.settings);
      this.queueFlush();
    }
    return { ok: true };
  }

  private schedule(key: TimerKey, at: number, seq: number) {
    this.cancel(key);
    const handle = setTimeout(
      () => {
        this.timers.delete(key);
        this.dispatch({ type: 'timer:expired', key, seq });
      },
      Math.max(0, at - this.now()),
    );
    handle.unref?.();
    this.timers.set(key, handle);
  }

  private cancel(key: TimerKey) {
    const handle = this.timers.get(key);
    if (handle) clearTimeout(handle);
    this.timers.delete(key);
  }

  private queueFlush() {
    if (this.flushQueued) return;
    this.flushQueued = true;
    queueMicrotask(() => this.flush());
  }

  /** Push the latest state (and any cues) to listeners now. */
  flush() {
    this.flushQueued = false;
    const cues = this.pendingCues;
    this.pendingCues = [];
    for (const listener of this.listeners) listener(this.state, cues);
  }

  dispose() {
    for (const key of [...this.timers.keys()]) this.cancel(key);
    this.listeners.clear();
  }
}
