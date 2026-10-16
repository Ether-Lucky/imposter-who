/**
 * One socket per page plus a zustand store holding the latest view.
 * Screens are pure functions of that view (02-design §9).
 */
import { io, type Socket } from 'socket.io-client';
import { createStore, useStore } from 'zustand';
import type { Ack, Cue, HandshakeAuth, StateMessage } from '@imposter-who/core';
import { offsetFromSamples, type PingSample } from './clock.ts';

export type Status = 'connecting' | 'online' | 'offline' | 'refused';

export interface NetState<V> {
  status: Status;
  view: V | null;
  version: number;
  /** Server clock minus local clock, ms. */
  offset: number;
  kicked: boolean;
  /** Latest cue with a counter so effects can react to repeats. */
  cue: { cue: Cue; n: number } | null;
}

const NO_ANSWER: Ack = {
  ok: false,
  code: 'BAD_REQUEST',
  message: 'No answer from the board. Check the Wi-Fi.',
};

export function createConnection<V>(auth: HandshakeAuth, url?: string) {
  const store = createStore<NetState<V>>(() => ({
    status: 'connecting',
    view: null,
    version: -1,
    offset: 0,
    kicked: false,
    cue: null,
  }));

  const socket: Socket = io(url ?? '/', {
    auth,
    transports: ['websocket', 'polling'],
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
  });

  const syncClock = async () => {
    const samples: PingSample[] = [];
    for (let i = 0; i < 5 && socket.connected; i++) {
      const t0 = Date.now();
      try {
        const reply = (await socket.timeout(2000).emitWithAck('time:ping', { t0 })) as {
          server: number;
        };
        samples.push({ t0, t1: Date.now(), server: reply.server });
      } catch {
        break;
      }
    }
    if (samples.length) store.setState({ offset: offsetFromSamples(samples) });
  };

  socket.on('connect', () => {
    // A server restart resets versions, so accept whatever arrives first after connecting.
    store.setState({ status: 'online', version: -1 });
    void syncClock();
  });
  socket.on('disconnect', () => store.setState({ status: 'offline' }));
  socket.on('connect_error', (error) => {
    store.setState({ status: error.message === 'NOT_HOST' ? 'refused' : 'offline' });
  });
  socket.on('state', (message: StateMessage<V>) => {
    if (message.version < store.getState().version) return;
    store.setState({ view: message.view, version: message.version, kicked: false });
  });
  socket.on('cue', (cue: Cue) => {
    store.setState((s) => ({ cue: { cue, n: (s.cue?.n ?? 0) + 1 } }));
  });
  socket.on('kicked', () => store.setState({ kicked: true }));

  async function send(event: string, payload?: unknown): Promise<Ack> {
    if (!socket.connected) return NO_ANSWER;
    try {
      return (await socket.timeout(4000).emitWithAck(event, payload)) as Ack;
    } catch {
      return NO_ANSWER;
    }
  }

  function use<T>(selector: (s: NetState<V>) => T): T {
    return useStore(store, selector);
  }

  return { socket, store, send, use };
}

export type Connection<V> = ReturnType<typeof createConnection<V>>;
