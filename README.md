# Imposter Who?

A social deduction party game for 3 to 15 people in the same room. A laptop runs the game and shows the shared board; everyone plays from their own phone's browser. No app to install, no accounts.

Everyone gets the same secret word except one player, the **imposter**, who only knows they are the imposter. Players take turns giving one-word clues, argue about who sounded fake, and vote.

The laptop shows a split-flap **departure board**; each phone holds a paper **ticket** you tear open to see your destination. The look and feel are documented in [DESIGN.md](DESIGN.md).

---

## Quick start

You need **Node.js 24 or newer** on the laptop ([nodejs.org](https://nodejs.org)).

```bash
git clone https://github.com/Ether-Lucky/imposter-who.git
cd imposter-who
npm install
npm start
```

`npm start` builds the game, starts the server and opens the board in your browser. Then:

1. Everyone connects their phone to the **same Wi-Fi** as the laptop.
2. Phones scan the QR code on the board (or type the address under it).
3. Each player types a name and taps **Check in**.
4. Once 3 or more people are in, press **Start round** on the board.

> **Windows:** the first time you run it, Windows asks whether to allow Node.js on networks. Allow it on **private networks**, or phones won't be able to connect.

---

## Play over the internet (friends on different networks)

If the phones can't be on the laptop's Wi-Fi (mobile data, guest Wi-Fi, friends far away), use a free Cloudflare tunnel. The laptop stays the server and gets a temporary public `https://` address.

1. Install `cloudflared` once:
   - Windows: `winget install --id Cloudflare.cloudflared`
   - macOS: `brew install cloudflared`
   - Linux: see [Cloudflare's downloads](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
2. Run:
   ```bash
   npm run public
   ```
3. It prints two links and opens the first one:
   - **Board link** (`…/host?key=…`): open it on the laptop and keep it private. The key in it is what makes you the host.
   - **Phone link** (`…/play`): share it, or let people scan the QR on the board.

The address changes every time you run it, and the laptop must stay on while you play. Press `Ctrl+C` to stop.

---

## How to play

### A round

1. **Ticket check.** Everyone tears their ticket on their phone, out of sight. Civilians see the **destination** (the secret word) and its category. The imposter sees **Destination unknown** (plus the category, if that setting is on). Later in the round, press and hold the ticket to peek again.
2. **Clues.** Going around in seat order, each player gives **one word** related to the destination. Give a clue that proves you know the word without making it easy for the imposter to guess. Clues are typed on the phone, or spoken out loud (a lobby setting).
3. **Discussion.** Argue. Who was vague? Who hesitated?
4. **Final call.** Everyone votes on their phone for who they think the imposter is. You can change your vote until voting closes.
5. **Votes are revealed** on the board.

### Game modes

**Classic**

- If the imposter gets the most votes, they get one **last chance** to name the destination. Wrong: civilians win. Right: the imposter steals the win.
- If an innocent player gets the most votes, the imposter wins.
- Tie: one revote between the tied players. A second tie means the imposter wins.
- The imposter may also **guess the word early** (if that setting is on). A right guess wins, a wrong guess loses.

**Manhunt**

- The imposter can **never guess**. Their only way to win is to blend in.
- A match is several rounds with the **same imposter** and a **new word every round**.
- Vote out the imposter and the civilians win.
- Vote out an innocent player and they are **out** for the rest of the match, and the civilians lose a **life** (1, 2, 3 or Unlimited).
- Tie or no votes: nobody is out, no life lost, and the next round starts.
- The imposter wins when the lives run out, or when only two players are left.
- Players who are out become **ghosts**: their phone shows who the imposter is. Keep a straight face.

### Scores

|                                    | Classic          | Manhunt                                              |
| ---------------------------------- | ---------------- | ---------------------------------------------------- |
| Civilians win                      | each civilian +1 | every civilian of the match +1 (including those out) |
| Imposter wins by vote              | +2               | +3                                                   |
| Imposter wins by guessing the word | +3               | (no guessing)                                        |

---

## Settings (on the board, before a round)

| Setting                            | Options                                      |
| ---------------------------------- | -------------------------------------------- |
| Game mode                          | Classic, Manhunt                             |
| Lives (Manhunt)                    | 1, 2, 3, Unlimited                           |
| Clue mode                          | Typed on phone, Spoken aloud                 |
| Laps per round                     | 1, 2, 3                                      |
| Clue, discussion and vote timers   | Off or a number of seconds                   |
| Categories                         | 8 built-in English categories, plus your own |
| Show the category to the imposter  | On / Off                                     |
| Imposter can guess early (Classic) | On / Off                                     |
| Sound on this laptop               | On / Off                                     |
| Reduce motion                      | On / Off (also applies to every phone)       |

Open the settings with **TIMETABLE** at the bottom left of the board; **RULES** plays a short how-to-play on the board, and **HELP** has the phone connection checklist with a test of the address.

**Sound and vibration:** the board plays its station sounds after the first click on it. Each phone has its own button at the top right: vibration only (the default), vibration and sound, or off.

**Your own word lists:** in the settings, open **Edit custom lists**. Type one word per line; add other accepted spellings after a slash (`doughnut / donut`). Players can see the board, so edit before they arrive.

Settings and custom lists are saved on the laptop in `.data/`.

---

## Troubleshooting

- **Phones can't open the page.** Make sure they're on the same Wi-Fi, not mobile data. Guest networks often block devices from seeing each other. On Windows, allow Node.js through the firewall on private networks (Windows Security > Firewall & network protection > Allow an app). Or use `npm run public`.
- **The board says "This is the board".** The board only runs on the laptop that started the game (or with the private board link in online play). Phones should use `/play`.
- **A phone locked or the page reloaded.** Just open it again; it rejoins the same seat with the same secret.
- **"Another copy of the game is already running".** Close the other terminal window running the game, or use a different port: `PORT=3100 npm start` (macOS, Linux, Git Bash) or `$env:PORT=3100; npm start` (PowerShell).

---

## Privacy

The server sends each phone only what that player may see; the secret word and the imposter's identity never leave the server early. The game is meant for friends in a room. Over plain Wi-Fi the traffic is not encrypted, so it does not protect against someone sniffing your network.

---

## For developers

| Command             | What it does                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `npm run dev`       | Server with reload, plus Vite dev server on port 5173 (open `http://localhost:5173/host`) |
| `npm test`          | All tests (rules engine, server with real sockets, screens)                               |
| `npm run typecheck` | TypeScript checks for every package                                                       |
| `npm run lint`      | ESLint                                                                                    |
| `npm run bots -- 3` | Adds 3 bot players to a running game, for testing with few phones                         |
| `npm run build`     | Type-check and build the phone and board pages                                            |
| `npm run e2e`       | Plays a full round in a real browser: the board and three phones (see below)              |

Open several test "phones" in one browser with `/play?as=name`; each name keeps its own seat.

**End-to-end test:** run `npx playwright install chromium` once, then `npm run e2e`. It starts its own server on fresh settings (ports 3000 and 5173 must be free). To use an installed browser instead, set `PW_CHANNEL=msedge` or `PW_CHANNEL=chrome`. `DATA_DIR=<folder>` points any server run at a different settings folder.

**Stack:** Node 24, TypeScript, Socket.IO, Express, React 19, Vite, Tailwind CSS, Motion, Vitest, Playwright. Fonts: Big Shoulders Display and Atkinson Hyperlegible (both OFL, bundled). Sounds are synthesised in the browser, so there are no audio files.

```
packages/core   the game rules as a pure, fully tested reducer, plus what each screen may see
apps/server     Express + Socket.IO server, timers, LAN and QR, saved settings
apps/client     the board (/host) and the phone ticket (/play); src/flap is the split-flap engine
e2e/            end-to-end test of a full round
data/words/en   built-in word lists
specs/          requirements, design, UI and motion spec, task list
scripts/        online play through a Cloudflare tunnel
```

This project is built spec-first: every behaviour traces to a numbered requirement in [specs/01-requirements.md](specs/01-requirements.md), and tests are named after those requirements.
