/**
 * Dev tool: fill the board with bot passengers that play along, so a round can be tested
 * with one or two real phones. Usage: npm run bots -- [count] [server-url]
 */
import { randomBytes } from 'node:crypto';
import { io } from 'socket.io-client';
import {
  IMPOSTER_HEADLINE,
  type Ack,
  type PlayerView,
  type StateMessage,
} from '@imposter-who/core';

const count = Math.min(14, Math.max(1, Number(process.argv[2] ?? 3)));
const url = process.argv[3] ?? 'http://localhost:3000';
const NAMES = [
  'Bot Ada',
  'Bot Ben',
  'Bot Cy',
  'Bot Dee',
  'Bot Eli',
  'Bot Fay',
  'Bot Gus',
  'Bot Hal',
  'Bot Ivy',
  'Bot Jo',
  'Bot Kai',
  'Bot Lu',
  'Bot Max',
  'Bot Ned',
];
const CLUES = [
  'yellow',
  'round',
  'sweet',
  'loud',
  'tiny',
  'heavy',
  'shiny',
  'fast',
  'warm',
  'soft',
  'wild',
  'green',
  'tall',
  'sharp',
  'cold',
  'old',
  'bright',
  'noisy',
];

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;
const later = (min: number, max: number, fn: () => void) =>
  setTimeout(fn, min + Math.random() * (max - min));

function bot(name: string) {
  const socket = io(url, {
    auth: { kind: 'player', token: randomBytes(16).toString('base64url') },
    transports: ['websocket'],
  });
  const send = (event: string, payload?: unknown) =>
    socket
      .timeout(4000)
      .emitWithAck(event, payload)
      .catch(() => null) as Promise<Ack | null>;
  const done = new Set<string>();
  const once = (key: string, fn: () => void) => {
    if (done.has(key)) return;
    done.add(key);
    fn();
  };

  socket.on('connect_error', (e) => console.log(`${name}: ${e.message}`));
  socket.on('state', (message: StateMessage<PlayerView>) => {
    const view = message.view;
    const you = view.you;
    if (!you) return once('join', () => void send('player:join', { name }));
    const round = view.round;
    if (!round || !you.ticket || view.paused) return;
    const key = `${round.number}`;
    const imposter = you.ticket.headline === IMPOSTER_HEADLINE;

    switch (view.phase) {
      case 'reveal':
        once(`${key}:tear`, () => later(800, 2500, () => void send('ticket:torn')));
        break;
      case 'clues':
        if (you.isTurn) {
          once(`${key}:clue:${round.clues.length}`, () =>
            later(1500, 3500, async () => {
              if (view.settings.clueMode === 'spoken') return void send('turn:done');
              for (let i = 0; i < 5; i++) {
                const ack = await send('clue:submit', { text: `${pick(CLUES)}${i ? i : ''}` });
                if (!ack || ack.ok || ack.code === 'NOT_YOUR_TURN') break;
              }
            }),
          );
        }
        break;
      case 'voting': {
        const pool = (round.revoteCandidates ?? round.turnOrder).filter((id) => id !== you.id);
        once(`${key}:vote:${round.ballots.length}`, () =>
          later(1000, 4000, () => void send('vote:cast', { targetId: pick(pool) })),
        );
        break;
      }
      case 'lastChance':
        if (imposter)
          once(`${key}:guess`, () =>
            later(2000, 4000, () => void send('guess:submit', { text: pick(CLUES) })),
          );
        break;
    }
  });
  return socket;
}

console.log(`Starting ${count} bot passenger(s) against ${url}. Ctrl+C to stop.`);
const sockets = NAMES.slice(0, count).map(bot);
process.on('SIGINT', () => {
  for (const s of sockets) s.disconnect();
  process.exit(0);
});
