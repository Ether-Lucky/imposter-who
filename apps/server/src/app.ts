/** HTTP routes and static files. Source: 02-design §5.3, §7, §8. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import QRCode from 'qrcode';
import { ERROR_MESSAGES, type ErrorCode } from '@imposter-who/core';
import { tokensEqual } from './auth.ts';
import { clientAddress, isLoopback, lanAddresses, type LanAddress } from './network.ts';
import { StoreError, type Store } from './store.ts';

export interface AppOptions {
  store: Store;
  hostToken: string;
  trustProxy: boolean;
  /** Port the HTTP server listens on; the default port for join links. */
  port: () => number;
  /** Built client (apps/client/dist). Served when it exists. */
  clientDist?: string;
  /** Override for tests. */
  lan?: () => LanAddress[];
}

const refuse = (res: Response, status: number, code: ErrorCode) =>
  res.status(status).json({ ok: false, code, message: ERROR_MESSAGES[code] });

export function createApp(opts: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  const lan = opts.lan ?? (() => lanAddresses());

  const fromLaptop = (req: Request) =>
    isLoopback(
      clientAddress(req.socket.remoteAddress, req.headers['x-forwarded-for'], opts.trustProxy),
    );

  /** REQ-CONN-3: host-only routes need the laptop and the per-boot token. */
  const requireHost = (req: Request, res: Response, next: NextFunction) => {
    if (!fromLaptop(req) || !tokensEqual(req.get('x-host-token'), opts.hostToken)) {
      return refuse(res, 403, 'NOT_HOST');
    }
    next();
  };

  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  /** The host display fetches its token here. Only the laptop itself gets one. */
  app.get('/api/host-session', (req, res) => {
    if (!fromLaptop(req)) return refuse(res, 403, 'NOT_HOST');
    res.set('Cache-Control', 'no-store').json({ ok: true, hostToken: opts.hostToken });
  });

  /** REQ-CONN-1/2: LAN addresses and a QR code for the join link. */
  app.get('/api/join-info', requireHost, async (req, res) => {
    const addresses = lan();
    const wanted = String(req.query.address ?? '');
    const preferred = addresses.find((a) => a.address === wanted) ?? addresses[0] ?? null;
    const queryPort = Number(req.query.port);
    const port =
      Number.isInteger(queryPort) && queryPort > 0 && queryPort < 65536 ? queryPort : opts.port();
    const url = preferred ? `http://${preferred.address}:${port}/play` : null;
    const qrSvg = url
      ? await QRCode.toString(url, {
          type: 'svg',
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: '#16181b', light: '#f2f2ee' },
        })
      : null;
    res.json({ ok: true, addresses, preferred, url, qrSvg });
  });

  const categoriesBody = () => ({
    ok: true,
    // Built-in words stay on the server so the public board never shows them.
    builtIn: opts.store.builtIn.map((c) => ({ id: c.id, name: c.name, wordCount: c.words.length })),
    custom: opts.store.customCategories(),
  });

  app.get('/api/categories', requireHost, (_req, res) => {
    res.json(categoriesBody());
  });

  /** REQ-WORD-2: replace the custom categories. */
  app.put('/api/categories', requireHost, (req, res) => {
    try {
      opts.store.setCustomCategories(req.body?.custom);
      res.json(categoriesBody());
    } catch (error) {
      if (error instanceof StoreError) {
        return res.status(400).json({ ok: false, code: 'BAD_REQUEST', message: error.message });
      }
      throw error;
    }
  });

  const dist = opts.clientDist;
  if (dist && existsSync(join(dist, 'host.html'))) {
    app.get('/', (req, res) => res.redirect(fromLaptop(req) ? '/host' : '/play'));
    app.get('/host', (_req, res) => res.sendFile(join(dist, 'host.html')));
    app.get('/play', (_req, res) => res.sendFile(join(dist, 'play.html')));
    app.use(express.static(dist, { index: false }));
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if ((error as { type?: string }).type === 'entity.parse.failed') {
      return refuse(res, 400, 'BAD_REQUEST');
    }
    console.error(error);
    res.status(500).json({ ok: false, code: 'BAD_REQUEST', message: 'Server error.' });
  });

  return app;
}
