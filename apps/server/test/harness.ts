import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import type {
  Ack,
  Cue,
  HandshakeAuth,
  HostView,
  PlayerView,
  StateMessage,
} from '@imposter-who/core';
import { createGameServer, type GameServer, type GameServerOptions } from '../src/server.ts';

export const WORDS_DIR = join(import.meta.dirname, '../../../data/words/en');

export interface Harness {
  server: GameServer;
  url: string;
  host(): Promise<Client<HostView>>;
  phone(token?: string, headers?: Record<string, string>): Promise<Client<PlayerView>>;
  close(): Promise<void>;
}

export async function startHarness(opts: Partial<GameServerOptions> = {}): Promise<Harness> {
  const server = createGameServer({
    dataDir: mkdtempSync(join(tmpdir(), 'iw-int-')),
    wordsDir: WORDS_DIR,
    graceMs: 50,
    lan: () => [{ name: 'Wi-Fi', address: '192.168.1.23' }],
    ...opts,
  });
  const port = await server.listen(0, '127.0.0.1');
  const url = `http://127.0.0.1:${port}`;
  const clients: Client<unknown>[] = [];
  const track = <V>(c: Client<V>) => {
    clients.push(c as Client<unknown>);
    return c;
  };

  return {
    server,
    url,
    async host() {
      const res = await fetch(`${url}/api/host-session`);
      const { hostToken } = (await res.json()) as { hostToken: string };
      return track(await Client.connect<HostView>(url, { kind: 'host', hostToken }));
    },
    async phone(token = randomBytes(16).toString('base64url'), headers) {
      return track(await Client.connect<PlayerView>(url, { kind: 'player', token }, headers));
    },
    async close() {
      for (const c of clients) c.socket.disconnect();
      await server.close();
    },
  };
}

export class Client<V> {
  states: StateMessage<V>[] = [];
  cues: Cue[] = [];
  kicked = false;

  private constructor(
    readonly socket: Socket,
    readonly auth: HandshakeAuth,
  ) {
    socket.on('state', (m: StateMessage<V>) => this.states.push(m));
    socket.on('cue', (c: Cue) => this.cues.push(c));
    socket.on('kicked', () => (this.kicked = true));
  }

  static connect<V>(url: string, auth: HandshakeAuth, headers?: Record<string, string>) {
    const socket = io(url, {
      auth,
      transports: ['websocket'],
      extraHeaders: headers,
      forceNew: true,
      reconnection: false,
    });
    const client = new Client<V>(socket, auth);
    return new Promise<Client<V>>((resolve, reject) => {
      socket.once('connect', () => resolve(client));
      socket.once('connect_error', (error) => reject(error));
    });
  }

  get view(): V {
    const last = this.states.at(-1);
    if (!last) throw new Error('no state yet');
    return last.view;
  }

  emit(event: string, payload?: unknown): Promise<Ack> {
    return this.socket.timeout(2000).emitWithAck(event, payload);
  }

  async ok(event: string, payload?: unknown) {
    const ack = await this.emit(event, payload);
    if (!ack.ok) throw new Error(`${event} rejected: ${ack.code}`);
    return ack;
  }

  async waitForCue(cue: Cue['cue'], timeoutMs = 2000) {
    const start = Date.now();
    while (!this.cues.some((c) => c.cue === cue)) {
      if (Date.now() - start > timeoutMs) throw new Error(`cue ${cue} never arrived`);
      await sleep(5);
    }
  }

  /** Resolve once the latest view satisfies the predicate. */
  waitFor(predicate: (view: V) => boolean, timeoutMs = 2000): Promise<V> {
    return new Promise((resolve, reject) => {
      const check = () => {
        const last = this.states.at(-1);
        if (last && predicate(last.view)) {
          cleanup();
          resolve(last.view);
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `waitFor timed out; last view: ${JSON.stringify(this.states.at(-1)?.view)?.slice(0, 400)}`,
          ),
        );
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.socket.off('state', check);
      };
      this.socket.on('state', check);
      check();
    });
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
