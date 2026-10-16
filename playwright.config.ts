import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests (T7.3): a real server, the real board and real phone pages.
 * First time: `npx playwright install chromium`. Set PW_CHANNEL=msedge (or chrome) to use
 * an installed browser instead.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    channel: process.env.PW_CHANNEL || undefined,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/api/health',
    // A fresh data folder: default settings, no custom lists, nothing left by earlier runs.
    env: { PORT: '3000', DATA_DIR: join(tmpdir(), `imposter-who-e2e-${Date.now()}`) },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
