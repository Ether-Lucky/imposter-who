import express from 'express';

/** HTTP app. Static files, REST routes and the host cookie land here in M2. */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}
