/**
 * The game rules as a pure reducer. Source: specs/02-design.md §4, specs/01-requirements.md.
 * reduce() never throws and never mutates its input. Invalid intents return the input state
 * plus a single `reject` effect.
 */
import { clueTooClose, matchesWord, normalise, sameWord } from './normalise.ts';
import type { Action, Cue, Effect, ErrorCode } from './protocol.ts';
import {
  ACTIVE_PHASES,
  type EngineContext,
  type GameState,
  type Outcome,
  type OutcomeReason,
  type Phase,
  type Player,
  type Round,
  type Settings,
  type TimerKey,
  type VoteRecord,
} from './types.ts';
import { RECENT_WORD_LIMIT, pickWord } from './words.ts';

export const LIMITS = {
  minPlayers: 3,
  maxPlayers: 15,
  nameMax: 12,
  clueMax: 24,
  guessMax: 40,
  addSecondsMax: 300,
} as const;

export const TIMINGS = {
  /** RECON-3: an offline player's clue turn passes after this. */
  offlineTurnMs: 10_000,
  /** RECON-4: pause when too few players stay connected this long. */
  lowPlayersMs: 30_000,
  /** Fallback if the host display never reports the reveal animation as done. */
  voteRevealMs: 12_000,
  /** GUESS-2 */
  lastChanceMs: 30_000,
  /** GUESS-4 */
  overrideMs: 10_000,
} as const;

export const DEFAULT_SETTINGS: Settings = {
  mode: 'classic',
  lives: 2,
  clueMode: 'typed',
  laps: 1,
  clueSeconds: 30,
  discussionSeconds: 90,
  voteSeconds: 60,
  categories: ['food', 'animals', 'jobs', 'places', 'movies', 'sports', 'household', 'hobbies'],
  showCategoryToImposter: true,
  earlyGuess: true,
  hostSound: true,
  hostVolume: 70,
  reducedMotion: false,
};

const SETTING_RULES: { [K in keyof Settings]: (v: unknown) => boolean } = {
  mode: (v) => v === 'classic' || v === 'manhunt',
  lives: (v) => v === 0 || v === 1 || v === 2 || v === 3,
  clueMode: (v) => v === 'typed' || v === 'spoken',
  laps: (v) => v === 1 || v === 2 || v === 3,
  clueSeconds: (v) => [0, 15, 30, 45, 60].includes(v as number),
  discussionSeconds: (v) => [0, 60, 90, 120, 180].includes(v as number),
  voteSeconds: (v) => [0, 30, 60].includes(v as number),
  categories: (v) => Array.isArray(v) && v.every((c) => typeof c === 'string'),
  showCategoryToImposter: (v) => typeof v === 'boolean',
  earlyGuess: (v) => typeof v === 'boolean',
  hostSound: (v) => typeof v === 'boolean',
  hostVolume: (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 100,
  reducedMotion: (v) => typeof v === 'boolean',
};

/** Keep only the valid keys of a settings object (used when loading saved settings). */
export function sanitizeSettings(input: unknown): Partial<Settings> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const rule = SETTING_RULES[key as keyof Settings];
    if (rule?.(value)) out[key] = value;
  }
  return out as Partial<Settings>;
}

export function initialState(settings: Partial<Settings> = {}): GameState {
  return {
    version: 0,
    phase: 'lobby',
    players: [],
    settings: { ...DEFAULT_SETTINGS, ...settings },
    round: null,
    match: null,
    roundCount: 0,
    timers: {},
    pausedRemaining: {},
    timerSeq: 0,
    paused: false,
    pausedReason: null,
    scores: {},
    recentWords: [],
  };
}

export interface ReduceResult {
  state: GameState;
  effects: Effect[];
}

export function reduce(state: GameState, action: Action, ctx: EngineContext): ReduceResult {
  const tx = new Tx(structuredClone(state), ctx);
  const result = tx.apply(action);
  if (result === 'noop') return { state, effects: [] };
  if (result !== 'ok') return { state, effects: [{ type: 'reject', code: result }] };
  tx.s.version = state.version + 1;
  return { state: tx.s, effects: tx.effects };
}

export function isActive(phase: Phase): boolean {
  return ACTIVE_PHASES.includes(phase);
}

/** Strip control characters and collapse whitespace. */
export function cleanText(text: unknown): string {
  return String(text ?? '')
    .replace(/\p{C}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const CLUE_PATTERN = /^[\p{L}\p{N}'’-]+$/u;

const OUTCOME_WINNER: Record<OutcomeReason, Outcome['winner']> = {
  civilianVotedOut: 'imposter',
  doubleTie: 'imposter',
  noVotes: 'imposter',
  earlyGuessRight: 'imposter',
  lastChanceRight: 'imposter',
  earlyGuessWrong: 'civilians',
  lastChanceWrong: 'civilians',
  imposterLeft: 'none',
  aborted: 'none',
  imposterCaught: 'civilians',
  outOfLives: 'imposter',
  lastTwo: 'imposter',
};

type Result = 'ok' | 'noop' | ErrorCode;

class Tx {
  readonly effects: Effect[] = [];

  constructor(
    readonly s: GameState,
    readonly ctx: EngineContext,
  ) {}

  apply(a: Action): Result {
    switch (a.type) {
      case 'player:join':
        return this.join(a.playerId, a.tokenHash, a.name);
      case 'ticket:torn':
        return this.ticketTorn(a.playerId);
      case 'clue:submit':
        return this.submitClue(a.playerId, a.text);
      case 'turn:done':
        return this.turnDone(a.playerId);
      case 'vote:cast':
        return this.castVote(a.playerId, a.targetId);
      case 'guess:submit':
        return this.submitGuess(a.playerId, a.text);
      case 'seat:reorder':
        return this.reorder(a.order);
      case 'player:remove':
        return this.remove(a.id);
      case 'settings:update':
        return this.updateSettings(a.patch);
      case 'round:start':
        return this.s.phase === 'lobby' ? this.startRound() : 'WRONG_PHASE';
      case 'round:next':
        if (this.s.phase === 'intermission') return this.startRound(true);
        return this.s.phase === 'result' ? this.startRound() : 'WRONG_PHASE';
      case 'lobby:return':
        return this.returnToLobby();
      case 'phase:continue':
        if (this.s.phase !== 'reveal') return 'WRONG_PHASE';
        this.startClues();
        return 'ok';
      case 'phase:skip':
        return this.skip();
      case 'timer:add':
        return this.addTime(a.seconds);
      case 'game:pause':
        if (!isActive(this.s.phase) || this.s.paused) return 'WRONG_PHASE';
        this.pause('host');
        return 'ok';
      case 'game:resume':
        if (!this.s.paused) return 'WRONG_PHASE';
        this.resume();
        return 'ok';
      case 'guess:override':
        return this.override();
      case 'reveal:done':
        if (this.s.phase !== 'voteReveal') return 'noop';
        this.resolveReveal();
        return 'ok';
      case 'scores:reset':
        for (const id of Object.keys(this.s.scores)) this.s.scores[id] = 0;
        return 'ok';
      case 'player:connected':
        return this.connected(a.playerId);
      case 'player:disconnected':
        return this.disconnected(a.playerId);
      case 'timer:expired':
        return this.expired(a.key, a.seq);
    }
  }

  // ── helpers ────────────────────────────────────────────────────────────

  get round(): Round {
    return this.s.round!;
  }

  player(id: string): Player | undefined {
    return this.s.players.find((p) => p.id === id);
  }

  /** In the current round and not voted out of a Manhunt match. */
  isParticipant(id: string): boolean {
    return !!this.s.round && this.s.round.turnOrder.includes(id) && !this.isOut(id);
  }

  isOut(id: string): boolean {
    return !!this.s.match?.out.includes(id);
  }

  /** A Manhunt match is running (not yet won or lost). */
  get inMatch(): boolean {
    return !!this.s.match && !this.s.match.over;
  }

  participants(): Player[] {
    if (!this.s.round) return [];
    return this.s.round.turnOrder
      .filter((id) => !this.isOut(id))
      .map((id) => this.player(id))
      .filter((p): p is Player => !!p);
  }

  connectedParticipants(): Player[] {
    return this.participants().filter((p) => p.connected);
  }

  cue(cue: Cue) {
    this.effects.push({ type: 'cue', cue });
  }

  setTimer(key: TimerKey, ms: number) {
    if (this.s.paused) {
      this.s.pausedRemaining[key] = ms;
      return;
    }
    const slot = { at: this.ctx.now + ms, seq: ++this.s.timerSeq };
    this.s.timers[key] = slot;
    this.effects.push({ type: 'setTimer', key, ...slot });
  }

  clearTimer(key: TimerKey) {
    delete this.s.pausedRemaining[key];
    if (this.s.timers[key]) {
      delete this.s.timers[key];
      this.effects.push({ type: 'clearTimer', key });
    }
  }

  clearAllTimers() {
    for (const key of ['phase', 'lowPlayers', 'override'] as const) this.clearTimer(key);
  }

  /** Player intents that need a live, unpaused round they take part in. */
  guardPlay(playerId: string, phase: Phase | null): Result {
    if (!this.player(playerId)) return 'UNKNOWN_PLAYER';
    if (phase && this.s.phase !== phase) return 'WRONG_PHASE';
    if (!this.isParticipant(playerId)) return 'NOT_PLAYING';
    if (this.s.paused) return 'PAUSED';
    return 'ok';
  }

  // ── lobby ──────────────────────────────────────────────────────────────

  join(playerId: string, tokenHash: string, rawName: string): Result {
    const name = cleanText(rawName);
    const length = [...name].length;
    if (length < 1 || length > LIMITS.nameMax) return 'NAME_INVALID';
    if (this.s.players.some((p) => p.id === playerId || p.tokenHash === tokenHash)) {
      return 'ALREADY_JOINED';
    }
    if (this.s.players.length >= LIMITS.maxPlayers) return 'BOARD_FULL';
    const lower = name.toLocaleLowerCase();
    if (this.s.players.some((p) => p.name.toLocaleLowerCase() === lower)) return 'NAME_TAKEN';

    this.s.players.push({
      id: playerId,
      tokenHash,
      name,
      seat: this.s.players.length,
      connected: true,
      standby: isActive(this.s.phase),
      ready: false,
    });
    this.s.scores[playerId] = 0;
    this.cue({ cue: 'playerJoined', playerId });
    return 'ok';
  }

  reorder(order: string[]): Result {
    if (this.s.phase !== 'lobby' && this.s.phase !== 'result') return 'WRONG_PHASE';
    const ids = this.s.players.map((p) => p.id);
    if (
      !Array.isArray(order) ||
      order.length !== ids.length ||
      new Set(order).size !== order.length ||
      !order.every((id) => ids.includes(id))
    ) {
      return 'SEATS_INVALID';
    }
    order.forEach((id, seat) => (this.player(id)!.seat = seat));
    this.s.players.sort((a, b) => a.seat - b.seat);
    return 'ok';
  }

  updateSettings(patch: Partial<Settings>): Result {
    if (this.s.phase !== 'lobby' && this.s.phase !== 'result') return 'WRONG_PHASE';
    if (!patch || typeof patch !== 'object') return 'SETTINGS_INVALID';
    for (const [key, value] of Object.entries(patch)) {
      const rule = SETTING_RULES[key as keyof Settings];
      if (!rule || !rule(value)) return 'SETTINGS_INVALID';
    }
    this.s.settings = { ...this.s.settings, ...patch };
    return 'ok';
  }

  remove(id: string): Result {
    const index = this.s.players.findIndex((p) => p.id === id);
    if (index < 0) return 'UNKNOWN_PLAYER';
    this.s.players.splice(index, 1);
    this.s.players.forEach((p, seat) => (p.seat = seat));
    delete this.s.scores[id];
    if (this.s.match) this.s.match.out = this.s.match.out.filter((pid) => pid !== id);

    const round = this.s.round;
    if (!round || !isActive(this.s.phase) || !round.turnOrder.includes(id)) {
      if (round) round.turnOrder = round.turnOrder.filter((pid) => pid !== id);
      return 'ok';
    }

    // RECON-6: the imposter leaving ends the round with no result.
    if (id === round.imposterId) {
      round.turnOrder = round.turnOrder.filter((pid) => pid !== id);
      this.finish('imposterLeft');
      return 'ok';
    }

    const turnPos = round.turnOrder.indexOf(id);
    round.turnOrder.splice(turnPos, 1);
    delete round.votes[id];
    for (const [voter, target] of Object.entries(round.votes)) {
      if (target === id) delete round.votes[voter];
    }
    if (round.revoteCandidates) {
      round.revoteCandidates = round.revoteCandidates.filter((pid) => pid !== id);
    }

    if (round.turnOrder.length < LIMITS.minPlayers) {
      this.finish('aborted');
      return 'ok';
    }

    switch (this.s.phase) {
      case 'reveal':
        this.checkReady();
        break;
      case 'clues':
        if (turnPos < round.turnIndex) round.turnIndex--;
        else if (turnPos === round.turnIndex) this.continueTurns();
        break;
      case 'voting':
        this.checkVotes();
        break;
    }
    return 'ok';
  }

  returnToLobby(): Result {
    if (this.s.phase === 'lobby') return 'WRONG_PHASE';
    this.clearAllTimers();
    this.s.phase = 'lobby';
    this.s.round = null;
    this.s.match = null;
    this.s.paused = false;
    this.s.pausedReason = null;
    this.s.pausedRemaining = {};
    for (const p of this.s.players) {
      p.standby = false;
      p.ready = false;
    }
    return 'ok';
  }

  // ── round start and reveal ─────────────────────────────────────────────

  /**
   * Start a round. `continueMatch` deals the next round of a Manhunt match: same imposter,
   * new word, without the players who were voted out (REQ-MODE-3).
   */
  startRound(continueMatch = false): Result {
    const match = continueMatch ? this.s.match : null;
    const eligible = this.s.players.filter(
      (p) => !match || (!p.standby && !match.out.includes(p.id)),
    );
    const connected = eligible.filter((p) => p.connected);
    if (connected.length < LIMITS.minPlayers) return 'NOT_ENOUGH_PLAYERS';
    const picked = pickWord(
      this.ctx.library,
      this.s.settings.categories,
      this.s.recentWords,
      this.ctx.rng,
    );
    if (!picked) return 'EMPTY_POOL';

    this.clearAllTimers();
    for (const p of this.s.players) {
      // MODE-8: mid-match joiners keep waiting until the match ends.
      if (!match) p.standby = false;
      p.ready = false;
    }

    // ROLE-1: imposter from seated, connected players. CLUE-1: random starting seat.
    const imposterId = match ? match.imposterId : connected[this.ctx.rng.int(connected.length)]!.id;
    if (!match) {
      const lives = this.s.settings.lives;
      this.s.match =
        this.s.settings.mode === 'manhunt'
          ? {
              imposterId,
              lives,
              livesLeft: lives === 0 ? null : lives,
              out: [],
              rounds: 0,
              over: false,
            }
          : null;
    }
    if (this.s.match) this.s.match.rounds += 1;
    const seated = [...eligible].sort((a, b) => a.seat - b.seat).map((p) => p.id);
    const start = this.ctx.rng.int(seated.length);
    const turnOrder = [...seated.slice(start), ...seated.slice(0, start)];

    this.s.roundCount += 1;
    this.s.round = {
      number: this.s.roundCount,
      categoryId: picked.category.id,
      categoryName: picked.category.name,
      word: picked.entry,
      imposterId,
      turnOrder,
      turnIndex: 0,
      lap: 1,
      clues: [],
      votes: {},
      revoteCandidates: null,
      ballots: [],
      guess: null,
      outcome: null,
    };
    this.s.recentWords = [...this.s.recentWords, picked.key].slice(-RECENT_WORD_LIMIT);
    this.s.phase = 'reveal';
    this.s.paused = false;
    this.s.pausedReason = null;
    this.s.pausedRemaining = {};
    for (const id of turnOrder) this.s.scores[id] ??= 0;
    this.cue({ cue: 'roundStart' });
    this.checkLowPlayers();
    return 'ok';
  }

  ticketTorn(playerId: string): Result {
    const player = this.player(playerId);
    if (!player) return 'UNKNOWN_PLAYER';
    if (!this.s.round || !isActive(this.s.phase)) return 'WRONG_PHASE';
    if (!this.isParticipant(playerId)) return 'NOT_PLAYING';
    if (player.ready) return 'noop';
    player.ready = true;
    if (this.s.phase === 'reveal') this.checkReady();
    return 'ok';
  }

  /** ROLE-4 + RECON-3: everyone connected has torn their ticket. */
  checkReady() {
    if (this.s.phase !== 'reveal') return;
    if (this.connectedParticipants().every((p) => p.ready)) this.startClues();
  }

  // ── clues ──────────────────────────────────────────────────────────────

  startClues() {
    this.s.phase = 'clues';
    this.round.lap = 1;
    this.round.turnIndex = 0;
    this.beginTurn();
  }

  currentTurnId(): string | null {
    if (this.s.phase !== 'clues' || !this.s.round) return null;
    return this.s.round.turnOrder[this.s.round.turnIndex] ?? null;
  }

  beginTurn() {
    const id = this.currentTurnId()!;
    const player = this.player(id)!;
    const clueMs = this.s.settings.clueSeconds * 1000;
    let ms: number | null = clueMs > 0 ? clueMs : null;
    if (!player.connected) ms = Math.min(ms ?? Infinity, TIMINGS.offlineTurnMs);
    if (ms === null) this.clearTimer('phase');
    else this.setTimer('phase', ms);
    this.cue({ cue: 'turnStart', playerId: id });
  }

  recordTurn(status: 'given' | 'spoken' | 'passed', text: string | null) {
    const id = this.currentTurnId()!;
    this.round.clues.push({ playerId: id, lap: this.round.lap, text, status });
    if (status === 'given') this.cue({ cue: 'clueLanded', playerId: id });
    this.round.turnIndex += 1;
    this.continueTurns();
  }

  /** Start the turn at turnIndex, rolling into the next lap or discussion when past the end. */
  continueTurns() {
    const round = this.round;
    if (round.turnIndex < round.turnOrder.length) {
      this.beginTurn();
      return;
    }
    if (round.lap < this.s.settings.laps) {
      round.lap += 1;
      round.turnIndex = 0;
      this.cue({ cue: 'lapChange', lap: round.lap });
      this.beginTurn();
      return;
    }
    this.startDiscussion();
  }

  submitClue(playerId: string, rawText: string): Result {
    const guard = this.guardPlay(playerId, 'clues');
    if (guard !== 'ok') return guard;
    if (this.currentTurnId() !== playerId) return 'NOT_YOUR_TURN';
    if (this.s.settings.clueMode !== 'typed') return 'WRONG_PHASE';

    const text = cleanText(rawText);
    if ([...text].length > LIMITS.clueMax || !CLUE_PATTERN.test(text) || !normalise(text)) {
      return 'CLUE_INVALID';
    }
    if (this.round.clues.some((c) => c.text !== null && sameWord(c.text, text))) {
      return 'CLUE_DUPLICATE';
    }
    // CLUE-2: only civilians are checked. Rejecting the imposter would leak the word.
    if (playerId !== this.round.imposterId && clueTooClose(text, this.round.word)) {
      return 'CLUE_TOO_CLOSE';
    }
    this.recordTurn('given', text);
    return 'ok';
  }

  turnDone(playerId: string): Result {
    const guard = this.guardPlay(playerId, 'clues');
    if (guard !== 'ok') return guard;
    if (this.currentTurnId() !== playerId) return 'NOT_YOUR_TURN';
    if (this.s.settings.clueMode !== 'spoken') return 'WRONG_PHASE';
    this.recordTurn('spoken', null);
    return 'ok';
  }

  // ── discussion and voting ──────────────────────────────────────────────

  startDiscussion() {
    this.s.phase = 'discussion';
    const ms = this.s.settings.discussionSeconds * 1000;
    if (ms > 0) this.setTimer('phase', ms);
    else this.clearTimer('phase');
    this.cue({ cue: 'discussionStart' });
  }

  startVoting(candidates: string[] | null) {
    this.s.phase = 'voting';
    this.round.votes = {};
    this.round.revoteCandidates = candidates;
    const ms = this.s.settings.voteSeconds * 1000;
    if (ms > 0) this.setTimer('phase', ms);
    else this.clearTimer('phase');
    this.cue({ cue: 'finalCall' });
    this.checkVotes();
  }

  castVote(playerId: string, targetId: string): Result {
    const guard = this.guardPlay(playerId, 'voting');
    if (guard !== 'ok') return guard;
    const candidates = this.round.revoteCandidates;
    if (
      targetId === playerId ||
      !this.isParticipant(targetId) ||
      (candidates !== null && !candidates.includes(targetId))
    ) {
      return 'VOTE_INVALID';
    }
    this.round.votes[playerId] = targetId;
    this.cue({ cue: 'voteCast', playerId });
    this.checkVotes();
    return 'ok';
  }

  /** VOTE-3: close once every connected participant has voted. */
  checkVotes() {
    if (this.s.phase !== 'voting') return;
    const votes = this.round.votes;
    if (this.connectedParticipants().every((p) => votes[p.id])) this.closeVoting();
  }

  closeVoting() {
    const round = this.round;
    const tally: Record<string, number> = {};
    const votes: Record<string, string> = {};
    for (const [voter, target] of Object.entries(round.votes)) {
      if (!this.isParticipant(voter) || !this.isParticipant(target)) continue;
      votes[voter] = target;
      tally[target] = (tally[target] ?? 0) + 1;
    }
    const max = Math.max(0, ...Object.values(tally));
    const top = Object.keys(tally).filter((id) => tally[id] === max);
    const hadRevote = round.ballots.some((b) => b.result === 'revote');

    const record: VoteRecord = { votes, tally, result: 'eject', ejectedId: null, tied: [] };
    if (max === 0) record.result = 'noVotes';
    else if (top.length > 1) {
      // MODE-4: a Manhunt tie ejects nobody and has no revote.
      record.result = this.inMatch ? 'noEject' : hadRevote ? 'doubleTie' : 'revote';
      record.tied = top;
    } else record.ejectedId = top[0]!;

    round.ballots.push(record);
    round.votes = {};
    this.s.phase = 'voteReveal';
    this.setTimer('phase', TIMINGS.voteRevealMs);
    this.cue({ cue: 'voteReveal' });
  }

  resolveReveal() {
    const ballot = this.round.ballots.at(-1)!;
    if (this.inMatch) {
      this.resolveManhunt(ballot);
      return;
    }
    switch (ballot.result) {
      case 'revote':
        this.startVoting(ballot.tied);
        break;
      case 'doubleTie':
        this.finish('doubleTie');
        break;
      case 'noVotes':
        this.finish('noVotes');
        break;
      case 'eject':
        if (ballot.ejectedId === this.round.imposterId) this.startLastChance();
        else this.finish('civilianVotedOut');
        break;
    }
  }

  /** REQ-MODE-4/5/6: catch the imposter, or lose a life and keep hunting. */
  resolveManhunt(ballot: VoteRecord) {
    const match = this.s.match!;
    if (ballot.result !== 'eject') {
      this.intermission();
      return;
    }
    if (ballot.ejectedId === this.round.imposterId) {
      this.finish('imposterCaught');
      return;
    }
    match.out.push(ballot.ejectedId!);
    if (match.livesLeft !== null) match.livesLeft -= 1;
    if (match.livesLeft === 0) this.finish('outOfLives');
    else if (this.participants().length <= 2) this.finish('lastTwo');
    else this.intermission();
  }

  intermission() {
    this.s.phase = 'intermission';
    this.clearTimer('phase');
    this.cue({ cue: 'intermission' });
  }

  // ── guesses ────────────────────────────────────────────────────────────

  startLastChance() {
    this.s.phase = 'lastChance';
    this.setTimer('phase', TIMINGS.lastChanceMs);
    this.cue({ cue: 'lastCall' });
  }

  submitGuess(playerId: string, rawText: string): Result {
    const guard = this.guardPlay(playerId, null);
    if (guard !== 'ok') return guard;
    // MODE-2: in Manhunt the imposter can only blend in.
    if (this.s.settings.mode === 'manhunt' || this.inMatch) return 'GUESS_NOT_ALLOWED';
    const round = this.round;
    const early =
      this.s.settings.earlyGuess && ['clues', 'discussion', 'voting'].includes(this.s.phase);
    const last = this.s.phase === 'lastChance';
    if (playerId !== round.imposterId || round.guess || (!early && !last)) {
      return 'GUESS_NOT_ALLOWED';
    }
    const text = cleanText(rawText);
    if (!normalise(text) || [...text].length > LIMITS.guessMax) return 'GUESS_INVALID';

    const correct = matchesWord(text, round.word);
    round.guess = { text, early: !last, correct };
    if (last) this.finish(correct ? 'lastChanceRight' : 'lastChanceWrong');
    else this.finish(correct ? 'earlyGuessRight' : 'earlyGuessWrong');
    return 'ok';
  }

  override(): Result {
    const round = this.s.round;
    const outcome = round?.outcome;
    if (
      this.s.phase !== 'result' ||
      !this.s.timers.override ||
      !round?.guess ||
      !outcome ||
      (outcome.reason !== 'earlyGuessWrong' && outcome.reason !== 'lastChanceWrong')
    ) {
      return 'WRONG_PHASE';
    }
    this.applyScores(outcome, -1);
    round.outcome = {
      winner: 'imposter',
      reason: outcome.reason === 'earlyGuessWrong' ? 'earlyGuessRight' : 'lastChanceRight',
      overridden: true,
    };
    round.guess.correct = true;
    this.applyScores(round.outcome, 1);
    this.clearTimer('override');
    return 'ok';
  }

  // ── result ─────────────────────────────────────────────────────────────

  finish(reason: OutcomeReason) {
    const round = this.round;
    this.clearAllTimers();
    this.s.paused = false;
    this.s.pausedReason = null;
    this.s.pausedRemaining = {};
    round.outcome = { winner: OUTCOME_WINNER[reason], reason, overridden: false };
    if (this.s.match) this.s.match.over = true;
    this.s.phase = 'result';
    this.applyScores(round.outcome, 1);
    if ((reason === 'earlyGuessWrong' || reason === 'lastChanceWrong') && round.guess) {
      this.setTimer('override', TIMINGS.overrideMs);
    }
    this.cue({ cue: 'result' });
  }

  /**
   * RES-4: civilians +1 each on a win; imposter +2 for a vote win, +3 for a guess win.
   * MODE-9 (Manhunt): every civilian of the match, in or out, +1; imposter +3.
   */
  applyScores(outcome: Outcome, sign: 1 | -1) {
    const round = this.round;
    const add = (id: string, n: number) => {
      if (this.player(id)) this.s.scores[id] = (this.s.scores[id] ?? 0) + sign * n;
    };
    const match = this.s.match;
    if (match) {
      if (outcome.winner === 'civilians') {
        const civilians = new Set([...round.turnOrder, ...match.out]);
        civilians.delete(match.imposterId);
        for (const id of civilians) add(id, 1);
      } else if (outcome.winner === 'imposter') {
        add(match.imposterId, 3);
      }
      return;
    }
    if (outcome.winner === 'civilians') {
      for (const id of round.turnOrder) if (id !== round.imposterId) add(id, 1);
    } else if (outcome.winner === 'imposter') {
      const guessWin = outcome.reason === 'earlyGuessRight' || outcome.reason === 'lastChanceRight';
      add(round.imposterId, guessWin ? 3 : 2);
    }
  }

  // ── host flow controls ─────────────────────────────────────────────────

  skip(): Result {
    switch (this.s.phase) {
      case 'reveal':
        this.startClues();
        return 'ok';
      case 'clues':
        this.recordTurn(this.s.settings.clueMode === 'spoken' ? 'spoken' : 'passed', null);
        return 'ok';
      case 'discussion':
        this.startVoting(null);
        return 'ok';
      case 'voting':
        this.closeVoting();
        return 'ok';
      case 'voteReveal':
        this.resolveReveal();
        return 'ok';
      default:
        return 'WRONG_PHASE';
    }
  }

  addTime(seconds: number): Result {
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > LIMITS.addSecondsMax) {
      return 'SETTINGS_INVALID';
    }
    if (!isActive(this.s.phase) || this.s.phase === 'voteReveal') return 'WRONG_PHASE';
    const ms = seconds * 1000;
    if (this.s.paused && this.s.pausedRemaining.phase !== undefined) {
      this.s.pausedRemaining.phase += ms;
      return 'ok';
    }
    const slot = this.s.timers.phase;
    if (!slot) return 'WRONG_PHASE';
    slot.at += ms;
    this.effects.push({ type: 'setTimer', key: 'phase', at: slot.at, seq: slot.seq });
    return 'ok';
  }

  pause(reason: 'host' | 'lowPlayers') {
    for (const [key, slot] of Object.entries(this.s.timers) as [TimerKey, { at: number }][]) {
      this.s.pausedRemaining[key] = Math.max(0, slot.at - this.ctx.now);
      this.effects.push({ type: 'clearTimer', key });
    }
    this.s.timers = {};
    this.s.paused = true;
    this.s.pausedReason = reason;
    this.cue({ cue: 'paused' });
  }

  resume() {
    const remaining = this.s.pausedRemaining;
    this.s.paused = false;
    this.s.pausedReason = null;
    this.s.pausedRemaining = {};
    for (const [key, ms] of Object.entries(remaining) as [TimerKey, number][]) {
      if (key !== 'lowPlayers') this.setTimer(key, ms);
    }
    this.cue({ cue: 'resumed' });
    this.checkLowPlayers();
  }

  // ── connection and timers ──────────────────────────────────────────────

  /** RECON-4: start or stop the low-players countdown. */
  checkLowPlayers() {
    if (!isActive(this.s.phase)) return;
    const few = this.connectedParticipants().length < LIMITS.minPlayers;
    if (few && !this.s.paused && !this.s.timers.lowPlayers) {
      this.setTimer('lowPlayers', TIMINGS.lowPlayersMs);
    } else if (!few) {
      this.clearTimer('lowPlayers');
    }
  }

  disconnected(playerId: string): Result {
    const player = this.player(playerId);
    if (!player || !player.connected) return 'noop';
    player.connected = false;
    if (!isActive(this.s.phase) || !this.isParticipant(playerId)) return 'ok';

    if (this.currentTurnId() === playerId) {
      // RECON-3: an offline player's turn passes after a short wait.
      const ms = TIMINGS.offlineTurnMs;
      if (this.s.paused) {
        const left = this.s.pausedRemaining.phase;
        this.s.pausedRemaining.phase = left === undefined ? ms : Math.min(left, ms);
      } else {
        const slot = this.s.timers.phase;
        if (!slot || slot.at > this.ctx.now + ms) this.setTimer('phase', ms);
      }
    }
    this.checkReady();
    this.checkVotes();
    this.checkLowPlayers();
    return 'ok';
  }

  connected(playerId: string): Result {
    const player = this.player(playerId);
    if (!player || player.connected) return 'noop';
    player.connected = true;
    if (!isActive(this.s.phase) || !this.isParticipant(playerId)) return 'ok';
    // With the clue timer off, a returning player gets their unlimited turn back.
    if (this.currentTurnId() === playerId && this.s.settings.clueSeconds === 0) {
      this.clearTimer('phase');
    }
    this.checkLowPlayers();
    return 'ok';
  }

  expired(key: TimerKey, seq: number): Result {
    const slot = this.s.timers[key];
    if (!slot || slot.seq !== seq) return 'noop';
    delete this.s.timers[key];

    if (key === 'override') return 'ok';
    if (key === 'lowPlayers') {
      if (isActive(this.s.phase) && this.connectedParticipants().length < LIMITS.minPlayers) {
        this.pause('lowPlayers');
      }
      return 'ok';
    }
    switch (this.s.phase) {
      case 'clues':
        this.recordTurn('passed', null);
        break;
      case 'discussion':
        this.startVoting(null);
        break;
      case 'voting':
        this.closeVoting();
        break;
      case 'voteReveal':
        this.resolveReveal();
        break;
      case 'lastChance':
        this.finish('lastChanceWrong');
        break;
    }
    return 'ok';
  }
}
