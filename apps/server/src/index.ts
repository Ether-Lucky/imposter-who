/** Boot: `npm start` (prod, opens the board) or `npm run dev` (behind Vite on :5173). */
import { exec } from 'node:child_process';
import { join, resolve } from 'node:path';
import { lanAddresses } from './network.ts';
import { createGameServer } from './server.ts';

const args = new Set(process.argv.slice(2));
const dev = args.has('--dev');
const port = Number(process.env.PORT ?? 3000);
const root = resolve(import.meta.dirname, '../../..');

const server = createGameServer({
  dataDir: join(root, '.data'),
  wordsDir: join(root, 'data/words/en'),
  clientDist: dev ? undefined : join(root, 'apps/client/dist'),
  // In dev, phones reach us through the Vite proxy, which reports their real address.
  trustProxy: dev,
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

try {
  await server.listen(port);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    console.error(`Port ${port} is busy. Close the other copy of the game or set PORT.`);
    process.exit(1);
  }
  throw error;
}

const pagePort = dev ? 5173 : port;
const lan = lanAddresses();
console.log(`\n  IMPOSTER WHO?  ${dev ? '(dev)' : ''}`);
console.log(`  Board (this laptop):  http://localhost:${pagePort}/host`);
if (lan.length === 0) {
  console.log('  No Wi-Fi address found. Connect the laptop to the same network as the phones.');
}
for (const { name, address } of lan) {
  console.log(`  Phones join at:       http://${address}:${pagePort}/play   (${name})`);
}
console.log('');

if (args.has('--open')) openBrowser(`http://localhost:${pagePort}/host`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
