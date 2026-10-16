/** Core game types. Source: specs/02-design.md §4.1. */

export type Phase =
  | 'lobby'
  | 'reveal'
  | 'clues'
  | 'discussion'
  | 'voting'
  | 'voteReveal'
  | 'lastChance'
  /** Manhunt only: between rounds of a match (REQ-MODE-6). */
  | 'intermission'
  | 'result';

/** Phases where a round exists and is still being played. */
export const ACTIVE_PHASES: readonly Phase[] = [
  'reveal',
  'clues',
  'discussion',
  'voting',
  'voteReveal',
  'lastChance',
  'intermission',
];

export type ClueMode = 'typed' | 'spoken';

/** Classic: one vote, the imposter may guess. Manhunt: lives, no guessing (REQ-MODE). */
export type GameMode = 'classic' | 'manhunt';

export interface Settings {
  mode: GameMode;
  /** Manhunt lives; 0 means Unlimited (play until 2 remain). */
  lives: 0 | 1 | 2 | 3;
  clueMode: ClueMode;
  laps: 1 | 2 | 3;
  /** 0 means off. */
  clueSeconds: 0 | 15 | 30 | 45 | 60;
  discussionSeconds: 0 | 60 | 90 | 120 | 180;
  voteSeconds: 0 | 30 | 60;
  /** Selected category ids. */
  categories: string[];
  showCategoryToImposter: boolean;
  earlyGuess: boolean;
  hostSound: boolean;
  /** 0 to 100. */
  hostVolume: number;
  reducedMotion: boolean;
}

export interface WordEntry {
  word: string;
  aliases: string[];
}

export interface Category {
  id: string;
  name: string;
  words: WordEntry[];
  custom: boolean;
}

export interface Player {
  /** Public id, safe to broadcast. */
  id: string;
  /** Server-only. Never part of a view. */
  tokenHash: string;
  name: string;
  seat: number;
  connected: boolean;
  /** Joined mid-round; plays from the next round (CONN-5). */
  standby: boolean;
  /** Tore their ticket this round (ROLE-4). */
  ready: boolean;
}

export type ClueStatus = 'given' | 'spoken' | 'passed';

export interface Clue {
  playerId: string;
  lap: number;
  text: string | null;
  status: ClueStatus;
}

/** 'noEject' is a Manhunt tie: nobody out, no life lost (REQ-MODE-4). */
export type RevealResult = 'eject' | 'revote' | 'doubleTie' | 'noVotes' | 'noEject';

export interface VoteRecord {
  votes: Record<string, string>;
  tally: Record<string, number>;
  result: RevealResult;
  /** Set when result is 'eject'. */
  ejectedId: string | null;
  /** Players tied at the top when result is 'revote' or 'doubleTie'. */
  tied: string[];
}

/** An ejected imposter always gets a last chance, so "voted out" resolves as lastChanceRight/Wrong. */
export type OutcomeReason =
  | 'civilianVotedOut'
  | 'doubleTie'
  | 'noVotes'
  | 'earlyGuessRight'
  | 'earlyGuessWrong'
  | 'lastChanceRight'
  | 'lastChanceWrong'
  | 'imposterLeft'
  | 'aborted'
  /** Manhunt (REQ-MODE-4/5). */
  | 'imposterCaught'
  | 'outOfLives'
  | 'lastTwo';

export interface Outcome {
  winner: 'civilians' | 'imposter' | 'none';
  reason: OutcomeReason;
  /** The table ruled a wrong guess correct (GUESS-4). */
  overridden: boolean;
}

export interface Guess {
  text: string;
  early: boolean;
  correct: boolean;
}

export interface Round {
  number: number;
  categoryId: string;
  categoryName: string;
  /** Server-only until the result. */
  word: WordEntry;
  /** Server-only until last chance or the result. */
  imposterId: string;
  /** Players taking part this round, in turn order. */
  turnOrder: string[];
  turnIndex: number;
  lap: number;
  clues: Clue[];
  /** voterId -> targetId for the open ballot. Server-only until revealed. */
  votes: Record<string, string>;
  /** Restricts targets during a revote (VOTE-5). */
  revoteCandidates: string[] | null;
  /** Every closed ballot this round, oldest first. */
  ballots: VoteRecord[];
  guess: Guess | null;
  outcome: Outcome | null;
}

export type TimerKey = 'phase' | 'lowPlayers' | 'override';

export interface TimerSlot {
  at: number;
  seq: number;
}

/** A Manhunt match: several rounds with the same imposter (REQ-MODE-3). */
export interface Match {
  /** Server-only until the result. */
  imposterId: string;
  lives: 0 | 1 | 2 | 3;
  /** Null when lives are Unlimited. */
  livesLeft: number | null;
  /** Civilians voted out, in order. */
  out: string[];
  rounds: number;
  over: boolean;
}

export interface GameState {
  version: number;
  phase: Phase;
  players: Player[];
  settings: Settings;
  round: Round | null;
  /** Manhunt only. Kept after the match ends so the result can show it. */
  match: Match | null;
  roundCount: number;
  timers: Partial<Record<TimerKey, TimerSlot>>;
  /** Remaining ms per timer while paused. */
  pausedRemaining: Partial<Record<TimerKey, number>>;
  timerSeq: number;
  paused: boolean;
  pausedReason: 'host' | 'lowPlayers' | null;
  scores: Record<string, number>;
  /** Keys of recently used words, newest last (WORD-3). */
  recentWords: string[];
}

export interface Rng {
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}

export interface EngineContext {
  now: number;
  rng: Rng;
  /** Built-in and custom categories available to pick words from. */
  library: Category[];
}
