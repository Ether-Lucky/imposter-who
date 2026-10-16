# 02 · Technical Design

How the requirements in [01-requirements.md](01-requirements.md) get built. UI and motion rules are in [04-ui-motion.md](04-ui-motion.md).

## 1. Architecture

```
            Laptop                                         Phones (same Wi-Fi)
 ┌───────────────────────────────────────────┐
 │  Node server  (apps/server)  :3000        │   http://192.168.1.23:3000/play
 │  ├─ Express: serves built client, REST    │◄──────────────────────────────── Controller ×3..15
 │  ├─ Socket.IO: realtime                   │◄────────────── socket.io ──────► (React, /play)
 │  ├─ GameHost: holds GameState, timers     │
 │  │    └─ core engine (pure reducer)       │
 │  └─ Store: settings + custom words (JSON) │
 │                    ▲                      │
 │                    │ socket.io (loopback) │
 │  Browser: Host display  /host (React)     │
 └───────────────────────────────────────────┘
```

- **Server-authoritative.** Clients send intents; the server validates, reduces, and pushes per-recipient views. Clients never compute game outcomes.
- **Pure core.** All game rules live in `packages/core` as a pure reducer, so they can be unit-tested without sockets or clocks.
- **Snapshots, not patches.** After every change the server sends each socket its full view (a few KB at most for 15 players). Simple, idempotent, and reconnect-proof.

## 2. Repository layout (npm workspaces)

```
imposter-who/
├─ package.json            workspaces, root scripts (start, dev, test, build)
├─ PRODUCT.md
├─ specs/
├─ packages/
│  └─ core/                no runtime deps besides TS
│     ├─ src/types.ts       GameState, Player, Round, Settings, Outcome
│     ├─ src/protocol.ts    event names + payload types (client <-> server)
│     ├─ src/engine.ts      reduce(state, action, ctx) -> { state, effects }
│     ├─ src/views.ts       hostView(state), playerView(state, playerId)
│     ├─ src/normalise.ts   word/guess normalisation (GUESS-3)
│     ├─ src/words.ts       pickWord(pool, recent, rng)
│     └─ test/              Vitest specs, named by REQ id
├─ apps/
│  ├─ server/
│  │  ├─ src/index.ts       boot: ports, LAN IP, open browser
│  │  ├─ src/gameHost.ts    owns state, dispatch(), timers, broadcast
│  │  ├─ src/sockets.ts     handshake auth, event wiring, acks
│  │  ├─ src/http.ts        static files, REST for words/settings, host cookie
│  │  ├─ src/network.ts     LAN address discovery
│  │  ├─ src/store.ts       JSON persistence in ./.data/
│  │  └─ test/              integration tests with socket.io-client
│  └─ client/
│     ├─ host.html, play.html   two entry points = two small bundles
│     ├─ src/host/          HostApp.tsx, screens per phase, AudioDirector
│     ├─ src/play/          PlayApp.tsx, ticket faces, gestures, haptics
│     ├─ src/board/         flap engine + FlapRow/FlapText (WAAPI)
│     ├─ src/fx/            chad confetti (canvas), grain, stamps
│     ├─ src/net/           socket client, store (zustand), clock sync
│     ├─ src/styles/        tokens.css (04 §1.2), fonts
│     └─ public/audio/, public/fonts/
└─ data/words/en/*.json    built-in categories
```

## 3. Stack

| Concern | Choice | Why |
|---|---|---|
| Runtime | Node 24, TypeScript (strict), ESM | Installed already; types shared end to end |
| Realtime | Socket.IO 4 | Reconnection, acks, rooms, fallbacks for flaky phone Wi-Fi |
| HTTP | Express 5 | Static files and a handful of REST routes |
| Client | React 19 + Vite | Fast dev, two entry points |
| Styling | Tailwind v4 (`@tailwindcss/vite`) with tokens in `@theme` | Utility speed, one token source |
| Motion | `motion` (`motion/react`) + own WAAPI flap engine | See 04 §2.2 |
| Client state | zustand | One store per app holding the latest view |
| Icons | `@phosphor-icons/react` | Consistent line icon set |
| QR | `qrcode` (server renders SVG) | No client dep |
| Tests | Vitest (core, server), Playwright (e2e, SHOULD) | |
| Dev runner | `tsx` for server, `concurrently` for dev | |

## 4. Game state machine

```
            ┌──────────────── round:next ───────────────────────────┐
            ▼                                                       │
 LOBBY ──round:start──► REVEAL ──all ready / continue──► CLUES ──last clue──► DISCUSSION
   ▲                       │                               │                     │
   │                       └───────── early guess (any of REVEAL..VOTING) ───────┼──► RESULT
   │                                                                             ▼
   │                                                  VOTING ◄── revote (tie #1) ┤
   │                                                     │                       │
   │                                                     ▼                       │
   │                                                VOTE_REVEAL ── tie #1 ───────┘
   │                                                     │
   │                          imposter ejected ──► LAST_CHANCE ──► RESULT
   │                          civilian ejected / tie #2 ─────────► RESULT
   └────────────────────────── lobby:return ◄──────────────────────┘
```

Cross-cutting flags: `paused` (host pause or RECON-4), `deadline` (epoch ms for the current timer, or null).

### 4.1 Core types (abridged)

```ts
type Phase = 'lobby' | 'reveal' | 'clues' | 'discussion' | 'voting'
           | 'voteReveal' | 'lastChance' | 'result';

interface Player {
  id: string;            // public id, safe to broadcast
  tokenHash: string;     // server-only, never in a view
  name: string;
  seat: number;
  connected: boolean;
  standby: boolean;
  ready: boolean;        // tore ticket this round
}

interface Round {
  number: number;
  category: string;
  word: WordEntry;       // { word, aliases[] }  server-only until result
  imposterId: string;    // server-only until result
  turnOrder: string[];
  turnIndex: number;
  lap: number;
  clues: { playerId: string; lap: number; text: string | null; status: 'given' | 'spoken' | 'passed' }[];
  votes: Record<string, string>;     // voterId -> targetId, server-only until reveal
  revoteCandidates: string[] | null;
  tieCount: 0 | 1 | 2;
  ejectedId: string | null;
  guess: { text: string; early: boolean; correct: boolean } | null;
  outcome: Outcome | null;
}

interface Outcome {
  winner: 'civilians' | 'imposter' | 'none';
  reason: 'imposterVotedOut' | 'civilianVotedOut' | 'doubleTie'
        | 'earlyGuessRight' | 'earlyGuessWrong' | 'lastChanceRight' | 'lastChanceWrong'
        | 'imposterLeft' | 'aborted';
  overridden: boolean;   // GUESS-4
}

interface GameState {
  version: number;
  phase: Phase;
  players: Player[];
  settings: Settings;
  round: Round | null;
  deadline: number | null;
  paused: boolean;
  scores: Record<string, number>;
  recentWords: string[];  // WORD-3
}
```

### 4.2 Reducer contract

```ts
reduce(state: GameState, action: Action, ctx: { now: number; rng: Rng }):
  { state: GameState; effects: Effect[] }

type Effect =
  | { type: 'setTimer'; at: number; phaseKey: string }   // phaseKey guards stale timers
  | { type: 'clearTimer' }
  | { type: 'cue'; cue: Cue }                             // role-neutral one-shot (sounds, haptics)
  | { type: 'reject'; to: string; code: ErrorCode };      // private error to one player
```

- `Action` covers every protocol intent plus `TIMER_EXPIRED { phaseKey }`, `PLAYER_CONNECTED`, `PLAYER_DISCONNECTED`.
- Invalid actions return the same state and a `reject` effect. They never throw.
- `rng` is injected: `crypto.randomInt` in production (ROLE-1), a seeded RNG in tests.

### 4.3 Views (the privacy boundary, SEC-1)

`views.ts` is the **only** code that turns state into outgoing data.

- `hostView(state)`: public info only. `round.word`, `imposterId` and `votes` are omitted until `phase === 'result'` (votes appear at `voteReveal`). During `voting` it includes `votedIds` only (VOTE-2).
- `playerView(state, id)`: public info plus `you`:

```ts
you: {
  id, name, seat, standby,
  ticket: {               // same shape for every role (SEC-2)
    headline: string;     // 'BANANA' or 'DESTINATION UNKNOWN'
    line: string | null;  // category, or null when hidden from the imposter
    canGuess: boolean;    // true only for the imposter; UI keeps layout identical
  } | null;
  myVote: string | null;
}
```

Tests fuzz random action sequences and assert: for every phase before `result`, `JSON.stringify(playerView(state, imposterId))` never contains the word or its aliases, and `JSON.stringify(hostView(state))` contains neither the word nor the imposter id.

## 5. Protocol

One Socket.IO namespace. The handshake `auth` decides the role:
- `{ kind: 'host', hostToken }` from a loopback address (CONN-3). The host display gets the token from `GET /api/host-session`, which only answers loopback requests.
- `{ kind: 'player', token }`, where `token` is a random 128-bit value stored in the phone's `localStorage` (RECON-1). The server stores only its hash.

### 5.1 Client → server (all with ack `{ ok: true } | { ok: false, code, message }`)

| Event | From | Payload | Req |
|---|---|---|---|
| `player:join` | player | `{ name }` | CONN-2 |
| `ticket:torn` | player | `{}` | ROLE-4 |
| `clue:submit` | player | `{ text }` | CLUE-2 |
| `turn:done` | player | `{}` | CLUE-3 |
| `vote:cast` | player | `{ targetId }` | VOTE-1 |
| `guess:submit` | player | `{ text }` | GUESS-1, 2 |
| `seat:reorder` | host | `{ order: string[] }` | LOBBY-2 |
| `player:remove` | host | `{ id }` | LOBBY-2, RECON-6 |
| `settings:update` | host | `Partial<Settings>` | LOBBY-3 |
| `round:start` / `round:next` / `lobby:return` | host | `{}` | RES-3 |
| `phase:continue` / `phase:skip` | host | `{}` | ROLE-4, DISC-1 |
| `timer:add` | host | `{ seconds }` | DISC-1 |
| `game:pause` / `game:resume` | host | `{}` | DISC-1, RECON-4 |
| `guess:override` | host | `{}` | GUESS-4 |
| `scores:reset` | host | `{}` | RES-4 |
| `time:ping` | any | `{ t0 }` → ack `{ t0, server }` | clock sync |

### 5.2 Server → client

| Event | Payload | Notes |
|---|---|---|
| `state` | `{ version, serverNow, view }` | Full view after every change. Clients drop older versions. |
| `cue` | `{ cue, at }` | Role-neutral one-shot (e.g. `turnStart`, `clueLanded`, `finalCall`, `voteReveal`). Sent to everyone at once. |
| `kicked` | `{ reason }` | Removed by host |

### 5.3 REST (host-only: loopback + `x-host-token`)

- `GET /api/host-session` → `{ hostToken }` (loopback only, no token needed)
- `GET /api/join-info?port=&address=` → `{ addresses, preferred, url, qrSvg }`
- `GET/PUT /api/categories` → built-in (read-only) + custom (editable) (WORD-2)
- `GET /api/health`

## 6. Server internals

- **GameHost** keeps `state`, runs `reduce`, applies effects, then broadcasts views: one `hostView` to the `host` room, and a `playerView` per player socket. Broadcasts are coalesced per tick (`queueMicrotask`) so a burst of actions sends one snapshot.
- **Timers:** one active `setTimeout` at a time. `setTimer` replaces it. On fire, dispatch `TIMER_EXPIRED` with the `phaseKey`; the reducer ignores stale keys. Pause stores the remaining ms and clears the timer.
- **Clock sync:** clients ping 5 times on connect and keep the median offset, so countdowns render from `deadline - (Date.now() + offset)`.
- **Disconnects:** Socket.IO `disconnect` → `PLAYER_DISCONNECTED` after a 3 s grace (RECON-2). Reconnect within the grace is invisible.
- **Persistence:** `./.data/settings.json`, `./.data/custom-words.json`, written atomically (write temp, rename). The game state itself is in memory only.

## 7. Networking

- **Bind:** `0.0.0.0:3000` (prod). Dev: Vite on `0.0.0.0:5173` with `/socket.io` and `/api` proxied to `:3000` (`xfwd: true`).
- **LAN address discovery:** `os.networkInterfaces()`, keep IPv4, non-internal, private ranges (10/8, 172.16/12, 192.168/16). Drop virtual adapters by name (`vEthernet`, `VirtualBox`, `VMware`, `WSL`, `Docker`, `Hyper-V`). Prefer names matching `/wi-?fi|wlan|wireless/i`.
- **QR:** points to `http://<preferred-ip>:<port the host page is served on>/play`.
- **Windows firewall:** the first run triggers the "allow Node.js on private networks" prompt. The host display shows a "Phones can't connect?" help card that walks through it, plus a self-test (the host page fetches its own LAN URL to confirm it is reachable).
- **No HTTPS:** keeps setup to zero. This means no Wake Lock on phones, so the reconnect flow (RECON-1) carries the experience when screens sleep. iOS Safari has no Vibration API; haptics are skipped silently there.

### 7.1 Public mode (`npm run public`, REQ-CONN-6)

`scripts/public.mjs` builds the client, starts the server with `--public` on `127.0.0.1:3000`, runs `cloudflared tunnel --url http://127.0.0.1:3000`, reads the `https://*.trycloudflare.com` address from its output, then prints and opens `<address>/host?key=<HOST_KEY>`.

- Every request arrives through `cloudflared` from loopback, so public mode turns off loopback trust. `GET /api/host-session` needs `?key=` instead; host sockets and host REST need only the host token.
- `HOST_KEY` comes from the environment (at least 12 characters) or is random per run.
- `/api/join-info?origin=` builds the join link and QR from the board's own public origin.
- HTTPS comes free with the tunnel, so phones get a secure context.
- The quick-tunnel address changes every run, and the tunnel has no uptime guarantee. That suits test runs; a fixed address would need a named tunnel on a Cloudflare account.

## 8. Security and secrecy model

- **In scope:** someone glancing at another phone or the board, a player opening dev tools on their own phone, a phone opening `/host`.
- **Out of scope:** sniffing plaintext Wi-Fi traffic, a hostile device on the LAN. This is a living-room game. Documented in the README.
- **Host auth:** a random host token is minted per server start. `GET /api/host-session` hands it out to loopback requests only. Host sockets and host REST routes (`x-host-token` header) need both a loopback address and the token. In dev, the request arrives through Vite's proxy, so the server trusts only the *last* `X-Forwarded-For` hop (the one the proxy appended); a phone cannot forge loopback by sending its own header.
- **Input hygiene:** names and clues are length-limited, trimmed, stripped of control characters, and rendered as text only (never HTML).
- **Rate limiting:** at most 10 actions/s per socket; extra are dropped.

## 9. Client internals

- **Two entry points:** `host.html` → `HostApp`, `play.html` → `PlayApp`. Express maps `/host` and `/play` to them.
- **Store:** zustand store `{ view, version, connected, offset }`. Screens are pure functions of `view.phase`.
- **Optimistic UI:** only for local gestures (tear, punch, hold). Server acks confirm; on a reject, the UI springs back and shows the error inline.
- **AudioDirector (host):** maps `cue` events and phase transitions to sounds; unlocks on first click; ducks the ambience under stingers.
- **Haptics (phone):** one `haptic(pattern)` helper. Patterns are constants shared by every role.
- **Flap engine:** described in 04 §3. Lives in `src/board/`, has its own tests for drum-walk sequences and diffing.

## 10. Testing strategy

| Layer | Tool | What |
|---|---|---|
| Core engine | Vitest | One `describe` per REQ id. Seeded RNG. Every MUST in ROLE, CLUE, DISC, VOTE, GUESS, RES, RECON, SEC. |
| Privacy fuzz | Vitest | 10k random action sequences; assert no leaks (4.3). |
| Normalisation | Vitest | Table of guess/word pairs (case, accents, plurals, aliases). |
| Server | Vitest + socket.io-client | Boot in-process, connect host + 4 players, play full rounds in both clue modes, reconnect mid-round. |
| Flap engine | Vitest (jsdom) | Drum-walk step sequences, diffing, queue cap. |
| E2E | Playwright (SHOULD) | Host page + 3 mobile-emulated contexts; full round; civilian vs imposter controller screenshots must match layout (pixel diff with the word masked). |
| Manual | Real devices | iPhone Safari + Android Chrome on home Wi-Fi; fps check on the laptop (UX-4). |

## 11. Scripts

| Script | Does |
|---|---|
| `npm run dev` | server (tsx watch) + Vite dev on `0.0.0.0:5173` |
| `npm start` | build if `dist` is stale, start server on `:3000`, open `/host` (NFR-1) |
| `npm test` | all Vitest suites |
| `npm run e2e` | Playwright |
| `npm run build` | type-check, build client, compile server |
