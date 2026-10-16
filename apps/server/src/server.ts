/** Wires store, game, HTTP and sockets together. Used by index.ts and the integration tests. */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import type { Rng } from '@imposter-who/core';
import { createApp } from './app.ts';
import { newHostToken } from './auth.ts';
import { GameHost } from './gameHost.ts';
import type { LanAddress } from './network.ts';
import { attachSockets } from './sockets.ts';
import { Store } from './store.ts';

export interface GameServerOptions {
  dataDir: string;
  wordsDir: string;
  clientDist?: string;
  trustProxy?: boolean;
  graceMs?: number;
  ratePerSecond?: number;
  rng?: Rng;
  lan?: () => LanAddress[];
}

export function createGameServer(opts: GameServerOptions) {
  const store = new Store(opts.dataDir, opts.wordsDir);
  const game = new GameHost({
    library: () => store.library(),
    settings: store.loadSettings(),
    rng: opts.rng,
    onSettingsChanged: (settings) => store.saveSettings(settings),
  });
  const hostToken = newHostToken();
  const trustProxy = opts.trustProxy ?? false;

  const httpServer = createServer();
  const port = () => (httpServer.address() as AddressInfo | null)?.port ?? 0;
  const app = createApp({
    store,
    hostToken,
    trustProxy,
    port,
    clientDist: opts.clientDist,
    lan: opts.lan,
  });
  httpServer.on('request', app);

  const io = new Server(httpServer, { serveClient: false });
  const sockets = attachSockets(io, game, {
    hostToken,
    trustProxy,
    graceMs: opts.graceMs,
    ratePerSecond: opts.ratePerSecond,
  });

  return {
    store,
    game,
    hostToken,
    httpServer,
    io,
    port,
    listen(listenPort: number, host = '0.0.0.0') {
      return new Promise<number>((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(listenPort, host, () => resolve(port()));
      });
    },
    async close() {
      sockets.close();
      game.dispose();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}

export type GameServer = ReturnType<typeof createGameServer>;
