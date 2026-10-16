/**
 * Boot: `npm start` (LAN, opens the board), `npm run dev` (behind Vite on :5173), or
 * `--public` (behind an internet tunnel; the host opens /host?key=<HOST_KEY>).
 */
import { exec } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { lanAddresses } from './network.ts';
import { createGameServer } from './server.ts';

const args = new Set(process.argv.slice(2));
const dev = args.has('--dev');
const publicMode = args.has('--public');
const port = Number(process.env.PORT ?? 3000);
const root = resolve(import.meta.dirname, '../../..');

const hostKey = publicMode
  ? process.env.HOST_KEY && process.env.HOST_KEY.length >= 12
    ? process.env.HOST_KEY
    : randomBytes(12).toString('base64url')
  : undefined;

const server = createGameServer({
  dataDir: join(root, '.data'),
  wordsDir: join(root, 'data/words/en'),
  clientDist: dev ? undefined : join(root, 'apps/client/dist'),
  // In dev, phones reach us through the Vite proxy, which reports their real address.
  trustProxy: dev,
  hostKey,
});

function openBrowser(url: string) {
  const command =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(command, (error) => {
    if (error) console.log(`Open ${url} in your browser.`);
  });
}

// Windows lets 0.0.0.0:3000 and 127.0.0.1:3000 both bind, so a leftover copy of the game
// would silently take the laptop's own requests. Refuse to start next to one.
const alreadyRunning = await fetch(`http://127.0.0.1:${port}/api/health`, {
  signal: AbortSignal.timeout(1000),
})
  .then((r) => r.ok)
  .catch(() => false);
if (alreadyRunning) {
  console.error(`Another copy of the game is already running on port ${port}. Stop it first.`);
  process.exit(1);
}

try {
  // Behind a tunnel only the tunnel needs to reach us, so stay off the LAN.
  await server.listen(port, publicMode ? '127.0.0.1' : '0.0.0.0');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    console.error(`Port ${port} is busy. Close the other copy of the game or set PORT.`);
    process.exit(1);
  }
  throw error;
}

const pagePort = dev ? 5173 : port;
const localHost = `http://localhost:${pagePort}/host${hostKey ? `?key=${hostKey}` : ''}`;
console.log(`\n  IMPOSTER WHO?  ${dev ? '(dev)' : publicMode ? '(public)' : ''}`);
if (publicMode) {
  console.log(`  Server ready on http://127.0.0.1:${port} for the tunnel.`);
  console.log('  Host key is in the board link; keep it to yourself.');
} else {
  console.log(`  Board (this laptop):  ${localHost}`);
  const lan = lanAddresses();
  if (lan.length === 0) {
    console.log('  No Wi-Fi address found. Connect the laptop to the same network as the phones.');
  }
  for (const { name, address } of lan) {
    console.log(`  Phones join at:       http://${address}:${pagePort}/play   (${name})`);
  }
}
console.log('');

if (args.has('--open')) openBrowser(localHost);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
