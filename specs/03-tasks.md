# 03 · Tasks

Ordered milestones. Each task names the requirements it satisfies and how it is proven. Tick a box only when its tests pass.

The order is deliberate: **rules first, plumbing second, looks third**. The game must be fully playable with plain UI by the end of M3. M4 to M6 then turn it into the Departure Board.

---

## M0 · Scaffold

- [x] **T0.1** npm workspaces: `packages/core`, `apps/server`, `apps/client`. Strict TS, ESLint, Prettier, Vitest at root. `.data/` in `.gitignore`. `git init`.
- [x] **T0.2** Root scripts `dev`, `build`, `start`, `test` (02 §11). A smoke test runs in every workspace.
- [x] **T0.3** Vite with two entry points (`host.html`, `play.html`), Tailwind v4, tokens file from 04 §1.2.

**Done when:** `npm test` and `npm run dev` work on a clean clone.

## M1 · Core engine (pure, no I/O)

- [x] **T1.1** Types + protocol definitions (02 §4.1, §5). *REQ: all*
- [x] **T1.2** `normalise()` and `matchesWord()` with table tests. *GUESS-3*
- [x] **T1.3** Word bank loader + `pickWord()` with recent-word avoidance. Author 8 categories × 40 words with aliases. *WORD-1, WORD-3, WORD-4*
- [x] **T1.4** Lobby actions: join, rename clash, limits, standby, reorder, remove, settings. *CONN-2, CONN-4, CONN-5, LOBBY-2, LOBBY-3*
- [x] **T1.5** Round start + role assignment + reveal/ready gate. *ROLE-1, ROLE-4*
- [x] **T1.6** Clue round: turn order, laps, typed validation (civilian-only closeness check), spoken mode, timer pass, skipping offline. *CLUE-1..5, RECON-3*
- [x] **T1.7** Discussion: timer, skip, add time, pause. *DISC-1*
- [x] **T1.8** Voting: secret ballot, change vote, close rules, tie → revote → double tie. *VOTE-1..6*
- [x] **T1.9** Guesses: early guess, last chance, override window. *GUESS-1, 2, 4*
- [x] **T1.10** Results, next round, scores. *RES-1, RES-3, RES-4*
- [x] **T1.11** Disconnect handling, too-few-players pause, imposter leaves. *RECON-2..4, RECON-6*
- [x] **T1.12** `hostView` / `playerView` + privacy fuzz test. *SEC-1, SEC-2, GUESS-5 (data side)*

**Done when:** every MUST in sections 4 to 11 of 01 has a passing test named with its REQ id.

## M2 · Server

- [x] **T2.1** Express + Socket.IO boot on `0.0.0.0`, LAN discovery, console join URL, open browser. *CONN-1, NFR-1*
- [x] **T2.2** Handshake auth: host token (loopback-only issue) + loopback; player token hashing. *CONN-3, RECON-1*
- [x] **T2.3** GameHost: dispatch, effects, timers with phase keys, coalesced broadcasts, cues. *LOBBY-1*
- [x] **T2.4** Clock sync ping. 
- [x] **T2.5** Persistence of settings and custom words; REST routes; QR SVG. *LOBBY-3, WORD-2, CONN-2*
- [x] **T2.6** Rate limit + input hygiene. *02 §8*
- [x] **T2.7** Integration tests: full round typed, full round spoken, reconnect mid-round, host reload, phone hitting `/host`. *RECON-1, RECON-5, CONN-3*

**Done when:** a scripted 4-player game plays start to finish over real sockets in CI.

## M3 · Plain playable UI (no world yet)

Functional screens with plain styling, to prove the flow on real phones before investing in looks.

- [x] **T3.1** Net layer: socket client, zustand store, version check, reconnect with token. *RECON-1*
- [x] **T3.2** Host screens for every phase + settings + custom word editor. *LOBBY-2, LOBBY-3, WORD-2* (LOBBY-4 how-to-play explainer moved to T4.4, where it can be animated on the board.)
- [x] **T3.3** Controller screens for every phase, with role-identical layout. *ROLE-2, ROLE-3, CLUE-2, CLUE-3, VOTE-1, GUESS-1, GUESS-5, RES-2*
- [ ] **T3.4** Playtest on real phones on home Wi-Fi, including the Windows firewall prompt and a phone sleeping mid-round. Log issues back into 01 as spec changes.

- [x] **T3.5** Manhunt mode: engine (match, lives, intermission, no guesses), views (match summary, ghost), host and phone screens, tests. *MODE-1..9*

**Done when:** a real group plays 3 rounds with no blocker.

## M4 · The Departure Board world

- [ ] **T4.1** Font test: render flap cells in candidate faces; lock the flap face; subset and self-host. *04 §1.3, NFR-2*
- [ ] **T4.2** Flap engine: drum walk, two-half flip, overshoot, cascade jitter, queue cap, pause on hidden, reduced-motion crossfade. Unit tests for step sequences. *04 §3, UX-2, UX-4*
- [ ] **T4.3** Board grid layout system: viewport → cell size, everything snaps to cells. *04 §1.5*
- [ ] **T4.4** Host screens rebuilt on the board (lobby, check-in, settings timetable, all phases), plus the how-to-play explainer. *04 §4, UX-1, LOBBY-4*
- [ ] **T4.5** Ticket component: paper, perforation, barcode, faces, stamps. *04 §1.4, §5*
- [ ] **T4.6** Controller screens rebuilt as tickets. *04 §5, UX-5*

## M5 · Motion choreography

- [ ] **T5.1** Motion tokens (CSS vars + Motion presets) and the `:active` press rule everywhere. *04 §2*
- [ ] **T5.2** Ticket print-in, tear-strip gesture (rubber band, velocity flick, perforation split, falling stub, flip), hold alternative. *04 §5.1, §5.3*
- [ ] **T5.3** Peek shutter, NOW BOARDING stamp, clue print-out, hole-punch voting, hold-to-confirm guess. *04 §5.4 to §5.7*
- [ ] **T5.4** Host: departure cascade, active-row `layoutId` bar, lap sweep, final-call cascade, ticker, attract loop. *04 §4.1 to §4.8*
- [ ] **T5.5** Vote reveal timeline (skippable) and last-call suspense shuffle. *04 §4.9, §4.10*
- [ ] **T5.6** Chad confetti (host + phone), arrivals board, score walk-up. *04 §4.11, §5.8*
- [ ] **T5.7** Reduced-motion paths for every item above, plus the host "reduce motion" setting. *UX-2, 04 §8*
- [ ] **T5.8** Verify animations never block input. *UX-3*

## M6 · Sound and haptics

- [ ] **T6.1** Source or synthesise sounds (licence noted per file); compress under 600 KB. *04 §7*
- [ ] **T6.2** Host AudioDirector: unlock on first click, ambience, ducking, pooled flap ticks. *AUD-1*
- [ ] **T6.3** Phone haptics + opt-in sounds with a per-phone toggle; identical patterns for every role. *AUD-2, AUD-3, SEC-2*

## M7 · Hardening

- [ ] **T7.1** "Phones can't connect?" help card + LAN self-test + interface switcher. *CONN-1, 02 §7*
- [ ] **T7.2** Edge cases from playtests (late joiners, removal mid-turn, double taps, very long names, 15 players on one board).
- [ ] **T7.3** Playwright e2e: full round with host + 3 phones; civilian vs imposter screenshot diff with the word masked. *SEC-2, GUESS-5*
- [ ] **T7.4** Performance pass on a mid-range laptop and Android phone. *UX-4, NFR-4, 04 §9*

## M8 · Finish

- [ ] **T8.1** Run the 04 §10 pre-flight checklist.
- [ ] **T8.2** Automated UI lint pass on changed UI; fix mechanical findings.
- [ ] **T8.3** Desktop + mobile screenshots; final design review; act on its findings.
- [ ] **T8.4** Write `DESIGN.md` from the built world.
- [x] **T8.5** README: how to start, how phones join, firewall note, secrecy model.

---

## Suggested parallel work

After M1 lands, these can run side by side in separate sessions because they touch different folders:

- **M2 server** (`apps/server`)
- **T4.1 to T4.3 flap engine + grid** (`apps/client/src/board`), which needs no server
- **T6.1 sound sourcing** (`apps/client/public/audio`)
