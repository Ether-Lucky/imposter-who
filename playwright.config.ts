import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests (T7.3): a real server, the real board and real phone pages.
 * First time: `npx playwright install chromium`. Set PW_CHANNEL=msedge (or chrome) to use
 * an installed browser instead.
 */
/**
 * Its own ports, so a game already running on this laptop (3000 and 5173) is left alone.
 * Override with E2E_SERVER_PORT and E2E_VITE_PORT.
 */
const serverPort = process.env.E2E_SERVER_PORT ?? '3200';
const vitePort = process.env.E2E_VITE_PORT ?? '5273';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${vitePort}`,
    channel: process.env.PW_CHANNEL || undefined,
  },
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${vitePort}/api/health`,
    // A fresh data folder: default settings, no custom lists, nothing left by earlier runs.
    env: {
      PORT: serverPort,
      VITE_PORT: vitePort,
      DATA_DIR: join(tmpdir(), `imposter-who-e2e-${Date.now()}`),
    },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
