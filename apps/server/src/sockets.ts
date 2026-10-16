/**
 * Socket.IO wiring: handshake auth, intent events with acks, reconnect grace, and
 * per-recipient views. Source: 02-design §5, REQ-CONN-3, REQ-RECON-1/2, REQ-SEC-1.
 */
import type { Server, Socket } from 'socket.io';
import {
  type Ack,
  type Action,
  type Cue,
  ERROR_MESSAGES,
  type ErrorCode,
  type GameState,
  type HandshakeAuth,
  type HostAction,
  type PlayerAction,
  type StateMessage,
  hostView,
  playerView,
} from '@imposter-who/core';
import { hashToken, isValidPlayerToken, newPlayerId, tokensEqual } from './auth.ts';
import type { GameHost } from './gameHost.ts';
import { clientAddress, isLoopback } from './network.ts';

export interface SocketOptions {
  hostToken: string;
  /** Trust the last X-Forwarded-For hop from a loopback proxy (dev only). */
  trustProxy: boolean;
  /** REQ-RECON-2: how long a dropped player stays "connected" before going offline. */
  graceMs?: number;
  /** Max intents per second per socket (02-design §8). */
  ratePerSecond?: number;
  /** Public mode: tunnel traffic is all loopback, so the host token alone authorises. */
  publicMode?: boolean;
}

interface SocketData {
  kind: 'host' | 'player';
  tokenHash?: string;
  playerId?: string;
  bucket: { tokens: number; at: number };
}

type AckFn = (ack: Ack | Record<string, unknown>) => void;
type Payload = Record<string, unknown> | undefined;

const fail = (code: ErrorCode): Ack => ({ ok: false, code, message: ERROR_MESSAGES[code] });

const PLAYER_EVENTS: Record<
  Exclude<PlayerAction['type'], 'player:join'>,
  (playerId: string, p: Payload) => PlayerAction
> = {
  'ticket:torn': (playerId) => ({ type: 'ticket:torn', playerId }),
  'clue:submit': (playerId, p) => ({ type: 'clue:submit', playerId, text: String(p?.text ?? '') }),
  'turn:done': (playerId) => ({ type: 'turn:done', playerId }),
  'vote:cast': (playerId, p) => ({
    type: 'vote:cast',
    playerId,
    targetId: String(p?.targetId ?? ''),
  }),
  'guess:submit': (playerId, p) => ({
    type: 'guess:submit',
    playerId,
    text: String(p?.text ?? ''),
  }),
};

const HOST_EVENTS: Record<HostAction['type'], (p: Payload) => HostAction> = {
  'seat:reorder': (p) => ({ type: 'seat:reorder', order: p?.order as string[] }),
  'player:remove': (p) => ({ type: 'player:remove', id: String(p?.id ?? '') }),
  'settings:update': (p) => ({ type: 'settings:update', patch: (p ?? {}) as never }),
  'round:start': () => ({ type: 'round:start' }),
  'round:next': () => ({ type: 'round:next' }),
  'lobby:return': () => ({ type: 'lobby:return' }),
  'phase:continue': () => ({ type: 'phase:continue' }),
  'phase:skip': () => ({ type: 'phase:skip' }),
  'timer:add': (p) => ({ type: 'timer:add', seconds: Number(p?.seconds) }),
  'game:pause': () => ({ type: 'game:pause' }),
  'game:resume': () => ({ type: 'game:resume' }),
  'guess:override': () => ({ type: 'guess:override' }),
  'reveal:done': () => ({ type: 'reveal:done' }),
  'scores:reset': () => ({ type: 'scores:reset' }),
};

export function attachSockets(io: Server, game: GameHost, opts: SocketOptions) {
  const graceMs = opts.graceMs ?? 3000;
  const rate = opts.ratePerSecond ?? 10;
  const playerSockets = new Map<string, Set<Socket>>();
  const graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const data = (socket: Socket) => socket.data as SocketData;

  const stateMessage = <V>(state: GameState, view: V): StateMessage<V> => ({
    version: state.version,
    serverNow: game.serverNow(),
    view,
  });

  const sendState = (socket: Socket, state = game.state) => {
    const d = data(socket);
    const view = d.kind === 'host' ? hostView(state) : playerView(state, d.playerId ?? '');
    socket.emit('state', stateMessage(state, view));
  };

  const broadcast = (state: GameState, cues: Cue[]) => {
    const host = stateMessage(state, hostView(state));
    const byPlayer = new Map<string, StateMessage<unknown>>();
    for (const socket of io.of('/').sockets.values()) {
      const d = data(socket);
      if (d.kind === 'host') {
        socket.emit('state', host);
        continue;
      }
      const id = d.playerId ?? '';
      let message = byPlayer.get(id);
      if (!message) {
        message = stateMessage(state, playerView(state, id));
        byPlayer.set(id, message);
      }
      socket.emit('state', message);
    }
    for (const cue of cues) io.emit('cue', cue);
  };
  const unsubscribe = game.onFlush(broadcast);

  /** Token bucket: refills `rate` tokens per second up to `rate`. */
  const allow = (socket: Socket) => {
    const bucket = data(socket).bucket;
    const now = Date.now();
    bucket.tokens = Math.min(rate, bucket.tokens + ((now - bucket.at) / 1000) * rate);
    bucket.at = now;
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  };

  const bind = (socket: Socket, playerId: string) => {
    data(socket).playerId = playerId;
    let set = playerSockets.get(playerId);
    if (!set) playerSockets.set(playerId, (set = new Set()));
    set.add(socket);
    const timer = graceTimers.get(playerId);
    if (timer) clearTimeout(timer);
    graceTimers.delete(playerId);
    game.dispatch({ type: 'player:connected', playerId });
  };

  const unbind = (socket: Socket) => {
    const playerId = data(socket).playerId;
    if (!playerId) return;
    data(socket).playerId = undefined;
    const set = playerSockets.get(playerId);
    set?.delete(socket);
    if (set && set.size > 0) return;
    playerSockets.delete(playerId);
    if (!game.state.players.some((p) => p.id === playerId)) return;
    const timer = setTimeout(() => {
      graceTimers.delete(playerId);
      if (!playerSockets.has(playerId)) game.dispatch({ type: 'player:disconnected', playerId });
    }, graceMs);
    timer.unref?.();
    graceTimers.set(playerId, timer);
  };

  /** RECON-6 and LOBBY-2: tell a removed player's phones and forget the binding. */
  const kick = (playerId: string) => {
    const timer = graceTimers.get(playerId);
    if (timer) clearTimeout(timer);
    graceTimers.delete(playerId);
    for (const socket of playerSockets.get(playerId) ?? []) {
      data(socket).playerId = undefined;
      socket.emit('kicked', { reason: 'removed' });
    }
    playerSockets.delete(playerId);
  };

  const on = (socket: Socket, event: string, handler: (p: Payload) => Ack) => {
    socket.on(event, (payload: unknown, ack?: unknown) => {
      const reply = typeof ack === 'function' ? (ack as AckFn) : () => {};
      if (!allow(socket)) return reply(fail('RATE_LIMITED'));
      const p = payload && typeof payload === 'object' ? (payload as Payload) : undefined;
      try {
        reply(handler(p));
      } catch (error) {
        console.error(`Error handling ${event}:`, error);
        reply(fail('BAD_REQUEST'));
      }
    });
  };

  io.use((socket, next) => {
    const auth = (socket.handshake.auth ?? {}) as Partial<HandshakeAuth>;
    const address = clientAddress(
      socket.handshake.address,
      socket.handshake.headers['x-forwarded-for'],
      opts.trustProxy,
    );
    const base = { bucket: { tokens: rate, at: Date.now() } };
    if (auth.kind === 'host') {
      // REQ-CONN-3: host commands only from the laptop itself, with the per-boot token.
      const place = opts.publicMode || isLoopback(address);
      if (!place || !tokensEqual(auth.hostToken, opts.hostToken)) {
        return next(new Error('NOT_HOST'));
      }
      socket.data = { ...base, kind: 'host' } satisfies SocketData;
      return next();
    }
    if (auth.kind === 'player' && isValidPlayerToken(auth.token)) {
      socket.data = {
        ...base,
        kind: 'player',
        tokenHash: hashToken(auth.token),
      } satisfies SocketData;
      return next();
    }
    next(new Error('BAD_REQUEST'));
  });

  io.on('connection', (socket) => {
    const d = data(socket);

    socket.on('time:ping', (payload: unknown, ack?: unknown) => {
      if (typeof ack === 'function') {
        (ack as AckFn)({ t0: (payload as Payload)?.t0 ?? null, server: game.serverNow() });
      }
    });

    if (d.kind === 'host') {
      socket.join('host');
      for (const [event, build] of Object.entries(HOST_EVENTS)) {
        on(socket, event, (p) => {
          const action = build(p) as Action;
          const ack = game.dispatch(action);
          if (ack.ok && action.type === 'player:remove') kick(action.id);
          return ack;
        });
      }
      sendState(socket);
      return;
    }

    // RECON-1: a known token silently restores the seat.
    const existing = game.state.players.find((p) => p.tokenHash === d.tokenHash);
    if (existing) bind(socket, existing.id);

    on(socket, 'player:join', (p) => {
      if (data(socket).playerId) return fail('ALREADY_JOINED');
      const playerId = newPlayerId();
      const ack = game.dispatch({
        type: 'player:join',
        playerId,
        tokenHash: d.tokenHash!,
        name: String(p?.name ?? ''),
      });
      if (ack.ok) bind(socket, playerId);
      return ack;
    });

    for (const [event, build] of Object.entries(PLAYER_EVENTS)) {
      on(socket, event, (p) => {
        const playerId = data(socket).playerId;
        if (!playerId) return fail('UNKNOWN_PLAYER');
        return game.dispatch(build(playerId, p));
      });
    }

    socket.on('disconnect', () => unbind(socket));
    sendState(socket);
  });

  return {
    close() {
      unsubscribe();
      for (const timer of graceTimers.values()) clearTimeout(timer);
      graceTimers.clear();
    },
  };
}
