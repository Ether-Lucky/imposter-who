/**
 * The privacy boundary (REQ-SEC-1). This is the only code that turns GameState into data
 * that leaves the server. Every field is copied explicitly; nothing is spread from state.
 */
import { isActive } from './engine.ts';
import type {
  Clue,
  GameState,
  Guess,
  Outcome,
  Phase,
  Settings,
  VoteRecord,
  WordEntry,
} from './types.ts';

/** Shown on the imposter's ticket in place of the word. */
export const IMPOSTER_HEADLINE = 'Destination unknown';

export interface PublicPlayer {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
  standby: boolean;
  ready: boolean;
  score: number;
}

export interface PublicRound {
  number: number;
  /** Null while hidden from the imposter (and therefore from the public board). */
  categoryName: string | null;
  turnOrder: string[];
  currentPlayerId: string | null;
  lap: number;
  laps: number;
  clues: Clue[];
  /** Who has voted in the open ballot, never for whom (VOTE-2). */
  votedIds: string[];
  revoteCandidates: string[] | null;
  /** Closed ballots, revealed in full (VOTE-4). */
  ballots: VoteRecord[];
  /** Public from last chance onward. */
  imposterId: string | null;
  /** Public only in the result. */
  word: WordEntry | null;
  guess: Guess | null;
  outcome: Outcome | null;
  overrideOpen: boolean;
}

/** Manhunt match summary. Never names the imposter (REQ-SEC-1). */
export interface PublicMatch {
  lives: 0 | 1 | 2 | 3;
  livesLeft: number | null;
  out: string[];
  rounds: number;
  over: boolean;
}

export interface PublicView {
  phase: Phase;
  paused: boolean;
  pausedReason: 'host' | 'lowPlayers' | null;
  /** Epoch ms when the phase timer fires, or null. */
  deadline: number | null;
  /** Remaining phase time while paused. */
  pausedRemainingMs: number | null;
  settings: Settings;
  players: PublicPlayer[];
  round: PublicRound | null;
  match: PublicMatch | null;
}

export type HostView = PublicView;

export interface Ticket {
  headline: string;
  /** Category name, or null when hidden from the imposter. */
  line: string | null;
}

/** Identical shape for every role (REQ-SEC-2, REQ-GUESS-5). */
export interface You {
  id: string;
  name: string;
  seat: number;
  standby: boolean;
  ticket: Ticket | null;
  myVote: string | null;
  isTurn: boolean;
  canGuess: boolean;
  /** Voted out of a Manhunt match. */
  out: boolean;
  /** REQ-MODE-7: what a voted-out player gets to see. Null for everyone still playing. */
  ghost: { imposterId: string; word: string | null } | null;
}

export interface PlayerView extends PublicView {
  you: You | null;
}

function publicView(state: GameState): PublicView {
  const round = state.round;
  const phase = state.phase;
  const showAll = phase === 'result';
  const imposterPublic = phase === 'lastChance' || phase === 'result';

  return {
    phase,
    paused: state.paused,
    pausedReason: state.pausedReason,
    deadline: state.timers.phase?.at ?? null,
    pausedRemainingMs: state.pausedRemaining.phase ?? null,
    settings: { ...state.settings, categories: [...state.settings.categories] },
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      connected: p.connected,
      standby: p.standby,
      ready: p.ready,
      score: state.scores[p.id] ?? 0,
    })),
    round: round && {
      number: round.number,
      categoryName: showAll || state.settings.showCategoryToImposter ? round.categoryName : null,
      turnOrder: [...round.turnOrder],
      currentPlayerId: phase === 'clues' ? (round.turnOrder[round.turnIndex] ?? null) : null,
      lap: round.lap,
      laps: state.settings.laps,
      clues: round.clues.map((c) => ({ ...c })),
      votedIds: phase === 'voting' ? Object.keys(round.votes) : [],
      revoteCandidates: round.revoteCandidates ? [...round.revoteCandidates] : null,
      ballots: structuredClone(round.ballots),
      imposterId: imposterPublic ? round.imposterId : null,
      word: showAll ? structuredClone(round.word) : null,
      guess: showAll && round.guess ? { ...round.guess } : null,
      outcome: showAll && round.outcome ? { ...round.outcome } : null,
      overrideOpen: showAll && !!state.timers.override,
    },
    match: state.match && {
      lives: state.match.lives,
      livesLeft: state.match.livesLeft,
      out: [...state.match.out],
      rounds: state.match.rounds,
      over: state.match.over,
    },
  };
}

export function hostView(state: GameState): HostView {
  return publicView(state);
}

export function playerView(state: GameState, playerId: string): PlayerView {
  const view = publicView(state);
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { ...view, you: null };

  const round = state.round;
  const match = state.match;
  const out = !!match && match.out.includes(playerId);
  const playing = !!round && !out && round.turnOrder.includes(playerId) && state.phase !== 'lobby';
  const isImposter = playing && round.imposterId === playerId;

  let ticket: Ticket | null = null;
  if (playing) {
    ticket = isImposter
      ? {
          headline: IMPOSTER_HEADLINE,
          line: state.settings.showCategoryToImposter ? round.categoryName : null,
        }
      : { headline: round.word.word, line: round.categoryName };
  }

  const earlyWindow =
    state.settings.earlyGuess && ['clues', 'discussion', 'voting'].includes(state.phase);
  const canGuess =
    isImposter &&
    state.settings.mode !== 'manhunt' &&
    !match &&
    !state.paused &&
    !round.guess &&
    (earlyWindow || state.phase === 'lastChance');

  return {
    ...view,
    you: {
      id: player.id,
      name: player.name,
      seat: player.seat,
      standby: player.standby,
      ticket,
      myVote: playing && state.phase === 'voting' ? (round.votes[playerId] ?? null) : null,
      isTurn: view.round?.currentPlayerId === playerId,
      canGuess: canGuess && isActive(state.phase),
      out,
      ghost:
        out && match
          ? { imposterId: match.imposterId, word: round ? round.word.word : null }
          : null,
    },
  };
}
