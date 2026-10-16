/** Actions, effects and wire events. Source: specs/02-design.md §4.2, §5. */
import type { Settings, TimerKey } from './types.ts';

/** Intents a player's controller can send. The server adds `playerId` from the socket. */
export type PlayerAction =
  | { type: 'player:join'; playerId: string; tokenHash: string; name: string }
  | { type: 'ticket:torn'; playerId: string }
  | { type: 'clue:submit'; playerId: string; text: string }
  | { type: 'turn:done'; playerId: string }
  | { type: 'vote:cast'; playerId: string; targetId: string }
  | { type: 'guess:submit'; playerId: string; text: string };

/** Intents only the host display may send (CONN-3). */
export type HostAction =
  | { type: 'seat:reorder'; order: string[] }
  | { type: 'player:remove'; id: string }
  | { type: 'settings:update'; patch: Partial<Settings> }
  | { type: 'round:start' }
  | { type: 'round:next' }
  | { type: 'lobby:return' }
  | { type: 'phase:continue' }
  | { type: 'phase:skip' }
  | { type: 'timer:add'; seconds: number }
  | { type: 'game:pause' }
  | { type: 'game:resume' }
  | { type: 'guess:override' }
  | { type: 'reveal:done' }
  | { type: 'scores:reset' };

/** Events the server itself feeds into the engine. */
export type SystemAction =
  | { type: 'player:connected'; playerId: string }
  | { type: 'player:disconnected'; playerId: string }
  | { type: 'timer:expired'; key: TimerKey; seq: number };

export type Action = PlayerAction | HostAction | SystemAction;

export type ErrorCode =
  | 'NAME_INVALID'
  | 'NAME_TAKEN'
  | 'BOARD_FULL'
  | 'ALREADY_JOINED'
  | 'UNKNOWN_PLAYER'
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'NOT_PLAYING'
  | 'PAUSED'
  | 'CLUE_INVALID'
  | 'CLUE_DUPLICATE'
  | 'CLUE_TOO_CLOSE'
  | 'VOTE_INVALID'
  | 'GUESS_NOT_ALLOWED'
  | 'GUESS_INVALID'
  | 'NOT_ENOUGH_PLAYERS'
  | 'EMPTY_POOL'
  | 'SETTINGS_INVALID'
  | 'SEATS_INVALID'
  | 'NOT_HOST'
  | 'BAD_REQUEST'
  | 'RATE_LIMITED';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  NAME_INVALID: 'Names are 1 to 12 characters.',
  NAME_TAKEN: 'That name is taken. Try another.',
  BOARD_FULL: 'Board full.',
  ALREADY_JOINED: 'You are already checked in.',
  UNKNOWN_PLAYER: 'You are not checked in.',
  WRONG_PHASE: 'Not right now.',
  NOT_YOUR_TURN: 'It is not your turn.',
  NOT_PLAYING: 'You are not in this round.',
  PAUSED: 'The game is paused.',
  CLUE_INVALID: 'One word, up to 24 letters.',
  CLUE_DUPLICATE: 'Someone already said that.',
  CLUE_TOO_CLOSE: 'Too close to the word.',
  VOTE_INVALID: 'You cannot vote for that passenger.',
  GUESS_NOT_ALLOWED: 'You cannot guess right now.',
  GUESS_INVALID: 'Type a guess first.',
  NOT_ENOUGH_PLAYERS: 'At least 3 connected players are needed.',
  EMPTY_POOL: 'Pick at least one category with words.',
  SETTINGS_INVALID: 'That setting is not allowed.',
  SEATS_INVALID: 'That seat order does not match the players.',
  NOT_HOST: 'Only the board on the laptop can do that.',
  BAD_REQUEST: 'That request was not understood.',
  RATE_LIMITED: 'Slow down a little.',
};

/** Server to client: the full view after every change. Clients drop older versions. */
export interface StateMessage<V> {
  version: number;
  serverNow: number;
  view: V;
}

/** Server to client: removed by the host. */
export interface KickedMessage {
  reason: 'removed';
}

/** Handshake auth sent by each client. */
export type HandshakeAuth = { kind: 'host'; hostToken: string } | { kind: 'player'; token: string };

/** Role-neutral one-shot signals for sounds and haptics. Sent to everyone at once. */
export type Cue =
  | { cue: 'playerJoined'; playerId: string }
  | { cue: 'roundStart' }
  | { cue: 'turnStart'; playerId: string }
  | { cue: 'clueLanded'; playerId: string }
  | { cue: 'lapChange'; lap: number }
  | { cue: 'discussionStart' }
  | { cue: 'finalCall' }
  | { cue: 'voteCast'; playerId: string }
  | { cue: 'voteReveal' }
  | { cue: 'lastCall' }
  | { cue: 'result' }
  | { cue: 'paused' }
  | { cue: 'resumed' };

export type Effect =
  | { type: 'setTimer'; key: TimerKey; at: number; seq: number }
  | { type: 'clearTimer'; key: TimerKey }
  | { type: 'cue'; cue: Cue }
  | { type: 'reject'; code: ErrorCode };

/** Socket.IO event names, client to server. Payloads are the action minus `type` and `playerId`. */
export const CLIENT_EVENTS = [
  'player:join',
  'ticket:torn',
  'clue:submit',
  'turn:done',
  'vote:cast',
  'guess:submit',
  'seat:reorder',
  'player:remove',
  'settings:update',
  'round:start',
  'round:next',
  'lobby:return',
  'phase:continue',
  'phase:skip',
  'timer:add',
  'game:pause',
  'game:resume',
  'guess:override',
  'reveal:done',
  'scores:reset',
  'time:ping',
] as const;

export type Ack = { ok: true } | { ok: false; code: ErrorCode; message: string };
