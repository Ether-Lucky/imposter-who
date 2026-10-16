/**
 * `npm run public`: play over the internet without deploying.
 * Builds the client, starts the server in public mode on 127.0.0.1, opens a Cloudflare
 * quick tunnel to it, then prints and opens the secret board link.
 *
 * Env: PORT (default 3000), HOST_KEY (default: random per run).
 */
import { exec, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT ?? 3000);
const hostKey =
  process.env.HOST_KEY && process.env.HOST_KEY.length >= 12
    ? process.env.HOST_KEY
    : randomBytes(12).toString('base64url');
const children = [];

function findCloudflared() {
  const candidates = [
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    '/opt/homebrew/bin/cloudflared',
    '/usr/local/bin/cloudflared',
    '/usr/bin/cloudflared',
  ];
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['cloudflared'], {
    encoding: 'utf8',
  });
  const onPath = probe.status === 0 ? probe.stdout.split(/\r?\n/)[0]?.trim() : '';
  return onPath || candidates.find((p) => existsSync(p)) || null;
}

function stopAll(code = 0) {
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  process.exit(code);
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

function openBrowser(url) {
  const command =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(command);
}

async function waitForHealth(timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('The game server did not start.');
}

const cloudflared = findCloudflared();
if (!cloudflared) {
  console.error(
    'cloudflared is not installed.\n' +
      '  Windows: winget install --id Cloudflare.cloudflared\n' +
      '  macOS:   brew install cloudflared',
  );
  process.exit(1);
}

console.log('Building the game…');
// One command string: passing args with shell: true is deprecated (DEP0190).
const build = spawnSync('npm run build', { cwd: root, stdio: 'inherit', shell: true });
if (build.status !== 0) process.exit(build.status ?? 1);

// Run the server through tsx directly (not npm) so Ctrl+C stops it cleanly on Windows.
const require = createRequire(join(root, 'apps/server/package.json'));
const tsxCli = require.resolve('tsx/cli');
const server = spawn(process.execPath, [tsxCli, 'src/index.ts', '--public'], {
  cwd: join(root, 'apps/server'),
  env: { ...process.env, PORT: String(port), HOST_KEY: hostKey },
  stdio: ['ignore', 'inherit', 'inherit'],
});
children.push(server);
server.on('exit', (code) => {
  console.error(`Game server stopped (${code}).`);
  stopAll(code ?? 1);
});
await waitForHealth();

console.log('Opening a Cloudflare tunnel…');
const tunnel = spawn(
  cloudflared,
  ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
children.push(tunnel);

let announced = false;
const onOutput = (chunk) => {
  const text = chunk.toString();
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match && !announced) {
    announced = true;
    const base = match[0];
    const board = `${base}/host?key=${hostKey}`;
    console.log(`
  ┌───────────────────────────────────────────────────────────────
  │ IMPOSTER WHO? is online
  │
  │ Board (open on this laptop, keep this link private):
  │   ${board}
  │
  │ Phones join at (or scan the QR on the board):
  │   ${base}/play
  │
  │ The address changes every run. Ctrl+C to stop.
  └───────────────────────────────────────────────────────────────
`);
    // The new hostname can take a few seconds to resolve everywhere.
    setTimeout(() => openBrowser(board), 4000);
  }
  if (/ERR|error/i.test(text) && !/Failed to initialize DNS local resolver/i.test(text)) {
    process.stderr.write(
      text
        .split('\n')
        .filter((l) => /ERR|error/i.test(l))
        .join('\n') + '\n',
    );
  }
};
tunnel.stdout.on('data', onOutput);
tunnel.stderr.on('data', onOutput);
tunnel.on('exit', (code) => {
  console.error(`Tunnel closed (${code}).`);
  stopAll(code ?? 1);
});
