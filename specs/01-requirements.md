# 01 · Requirements

Product context lives in [PRODUCT.md](../PRODUCT.md). This file lists numbered, testable requirements.

**Keywords.** MUST = needed for v1. SHOULD = v1 if time allows. COULD = later.
**Format.** Each requirement has acceptance criteria written as *WHEN … THE SYSTEM SHALL …*. Tests quote the ID.

## Glossary

| Term | Meaning |
|---|---|
| Host display | The `/host` page on the laptop. Shared, everyone can see it. Shows the departure board. |
| Controller | The `/play` page on a player's phone. Private. Shows the player's ticket. |
| Server | Node process on the laptop. Holds all game state and is the only source of truth. |
| Seat | A player's place in turn order, kept across reconnects and rounds. |
| Round | One secret word, from role reveal to result. |
| Lap | One pass of clues around every seat. A round has 1 to 3 laps. |
| Civilian / Imposter | Roles. Exactly one imposter per round. |

---

## 1. Connection and joining (CONN)

**REQ-CONN-1 (MUST) Server reachable on the LAN.**
- WHEN the server starts, THE SYSTEM SHALL listen on all interfaces (`0.0.0.0`) on a fixed default port (`5173` dev / `3000` prod, configurable by `PORT`).
- WHEN the server starts, THE SYSTEM SHALL detect the laptop's private IPv4 address(es) and print the join URL to the console.
- WHEN more than one private address exists, THE SYSTEM SHALL prefer the Wi-Fi interface and let the host switch addresses from the host display.

**REQ-CONN-2 (MUST) Join by QR.**
- WHEN the host display is open, THE SYSTEM SHALL show a QR code and the plain URL (`http://<lan-ip>:<port>/play`), never a `localhost` URL.
- WHEN a phone opens the join URL, THE SYSTEM SHALL ask only for a display name (1 to 12 characters, trimmed, emoji allowed).
- WHEN a name is already taken (case-insensitive), THE SYSTEM SHALL ask for another one.

**REQ-CONN-3 (MUST) Host privileges are laptop-only.**
- WHEN a socket sends a host command, THE SYSTEM SHALL accept it only from a loopback address (`127.0.0.1`, `::1`) that presents the host token issued at server start.
- WHEN a phone opens `/host`, THE SYSTEM SHALL show a read-only message telling the player to use `/play`.

**REQ-CONN-4 (MUST) Player limits.**
- WHEN a 16th player tries to join, THE SYSTEM SHALL refuse with "Board full" and keep them on the join screen.
- WHEN fewer than 3 players are seated, THE SYSTEM SHALL disable Start.

**REQ-CONN-5 (MUST) Late joiners.**
- WHEN someone joins while a round is in progress, THE SYSTEM SHALL seat them as *standby*. They see a "next departure" ticket and join at the next round.

**REQ-CONN-6 (SHOULD) Play over the internet.** `npm run public` SHALL serve the game through a Cloudflare quick tunnel so phones can join from any network.
- WHEN running in public mode, THE SYSTEM SHALL NOT treat loopback requests as the host (tunnel traffic arrives from loopback). The host proves itself with a per-run host key in the board link (`/host?key=…`).
- WHEN the board is opened with the key, THE SYSTEM SHALL remove the key from the address bar and show a QR code for the public `/play` address.
- The server listens on `127.0.0.1` only in public mode.

## 2. Lobby and settings (LOBBY)

**REQ-LOBBY-1 (MUST) Live roster.** WHEN players join, leave or reconnect, THE SYSTEM SHALL update the host display and every controller within 250 ms on a normal home Wi-Fi.

**REQ-LOBBY-2 (MUST) Host controls in the lobby.** The host display SHALL let the host: reorder seats (drag), remove a player, change settings, and start the round.

**REQ-LOBBY-3 (MUST) Settings.** Settings live on the host display, persist on the laptop between server restarts, and include:

| Setting | Values | Default |
|---|---|---|
| Game mode | Classic / Manhunt (see §9b) | Classic |
| Lives (Manhunt) | 1, 2, 3, Unlimited | 2 |
| Clue mode | Typed on phone / Spoken aloud | Typed |
| Laps per round | 1, 2, 3 | 1 |
| Clue timer per turn | Off, 15, 30, 45, 60 s | 30 s |
| Discussion timer | Off, 60, 90, 120, 180 s | 90 s |
| Vote timer | Off, 30, 60 s | 60 s |
| Categories | Any subset of built-in and custom | All built-in |
| Show category to imposter | On / Off | On |
| Early imposter guess (Classic only) | On / Off | On |
| Sound on host | On / Off, volume | On, 70% |

**REQ-LOBBY-4 (SHOULD) How-to-play.** WHEN the host taps "How to play", THE SYSTEM SHALL show a 4-step animated explainer on the host display that anyone can skip.

## 3. Words and categories (WORD)

**REQ-WORD-1 (MUST) Built-in bank.** THE SYSTEM SHALL ship at least 8 English categories with at least 40 words each (for example Food, Animals, Jobs, Places, Movies, Sports, Household, Hobbies). Each word MAY list accepted aliases (for example `doughnut` → `donut`).

**REQ-WORD-2 (MUST) Custom lists.** The host SHALL be able to create, rename, edit and delete custom categories on the host display, by typing words or pasting one word per line. Custom lists persist as JSON on the laptop.

**REQ-WORD-3 (MUST) No quick repeats.** WHEN a word is picked, THE SYSTEM SHALL avoid words used in the last 30 rounds of this server session unless the pool is exhausted.

**REQ-WORD-4 (MUST) Valid pool.** WHEN the selected categories hold fewer than 1 usable word, THE SYSTEM SHALL disable Start and say why.

## 4. Roles and reveal (ROLE)

**REQ-ROLE-1 (MUST) Fair assignment.** WHEN a round starts, THE SYSTEM SHALL pick exactly one imposter uniformly at random from seated, connected players, using a cryptographically secure RNG.

**REQ-ROLE-2 (MUST) Private reveal.** Each controller SHALL show a face-down ticket. The player reveals it by dragging the tear strip, or by press-and-hold as an alternative. Civilians see the category and the word. The imposter sees "DESTINATION UNKNOWN", plus the category when *Show category to imposter* is on.

- WHEN a player tears their ticket, THE SYSTEM SHALL keep the face up on that phone until the player hides it, even if the round has moved on (the last player to tear would otherwise skip the reveal). *(Found in M3 playtest.)*

**REQ-ROLE-3 (MUST) Re-peek.** WHEN the player presses and holds the ticket at any later point in the round, THE SYSTEM SHALL show the secret again while they hold, and hide it on release.

**REQ-ROLE-4 (MUST) Ready gate.** WHEN every connected player has torn their ticket, or the host presses Continue, THE SYSTEM SHALL move to the clue round. The host display shows who is ready (✓) but never what they saw.

## 5. Clue round (CLUE)

**REQ-CLUE-1 (MUST) Turn order.** THE SYSTEM SHALL start each round at a random seat and go around in seat order for the configured number of laps. Standby and disconnected players are skipped (see RECON).

**REQ-CLUE-2 (MUST) Typed mode.** On your turn, your controller shows a one-word input. A clue is valid if it is 1 to 24 characters, has no spaces (hyphens and apostrophes allowed), and is not the same as a clue already given this round.
- WHEN a **civilian** submits a clue that equals or contains the secret word (after normalisation, see GUESS-3), THE SYSTEM SHALL reject it privately with "Too close to the word".
- THE SYSTEM SHALL NOT apply that check to the imposter. Rejecting the imposter's clue would leak the word.

**REQ-CLUE-3 (MUST) Spoken mode.** On your turn, your controller shows "Your turn: say your clue", with a big Done button. The host display shows the active seat. The host can also advance from the laptop.

**REQ-CLUE-4 (MUST) Turn timer.** WHEN the clue timer runs out, THE SYSTEM SHALL mark the seat PASSED for that lap and move on.

**REQ-CLUE-5 (MUST) Ledger.** THE SYSTEM SHALL show every clue on the host display, in that player's row, for the rest of the round (typed mode). In spoken mode the row shows CLUE GIVEN.

## 6. Discussion (DISC)

**REQ-DISC-1 (MUST)** WHEN the last clue is in, THE SYSTEM SHALL start the discussion phase with the discussion timer. The host can skip to voting, add 30 s, or pause.

**REQ-DISC-2 (SHOULD)** While discussing, a player MAY privately flag suspects on their controller (local only, never sent to the server).

## 7. Voting (VOTE)

**REQ-VOTE-1 (MUST) Secret ballot.** Each connected seated player votes for one other player. Self-votes are not possible. A player can change their vote until voting closes.

**REQ-VOTE-2 (MUST) Progress without leaks.** While voting is open, the host display SHALL show only how many have voted and which seats have voted. It SHALL NOT show any choices.

**REQ-VOTE-3 (MUST) Close.** Voting closes when every connected seated player has voted, or the vote timer ends. Missing votes count as abstentions.

**REQ-VOTE-4 (MUST) Reveal.** WHEN voting closes, THE SYSTEM SHALL reveal all votes at once on the host display (who voted for whom), then the tally.

**REQ-VOTE-5 (MUST) Ties.** WHEN the top vote count is tied, THE SYSTEM SHALL run one revote between the tied players only (they can still vote). WHEN the revote ties again, no one is ejected and the imposter wins.

**REQ-VOTE-6 (MUST) Ejection.** The player with the most votes is ejected. WHEN they are the imposter, go to GUESS-2. Otherwise the imposter wins.

## 8. Imposter guess (GUESS)

**REQ-GUESS-1 (MUST) Early guess.** WHEN *Early imposter guess* is on, the imposter MAY submit one guess any time from the end of the reveal until voting closes.
- A correct guess ends the round: the imposter wins.
- A wrong guess ends the round: the civilians win.
- The guess needs a deliberate confirm (hold to confirm, 1.2 s) to stop accidental submits.

**REQ-GUESS-2 (MUST) Last chance.** WHEN the imposter is ejected, THE SYSTEM SHALL give them one guess with a 30 s timer. Correct: imposter wins. Wrong or timed out: civilians win. The host display builds suspense meanwhile and does not show the typed text until it is submitted.

**REQ-GUESS-3 (MUST) Matching.** A guess matches when, after normalisation, it equals the word or one of its aliases. Normalisation: lowercase, trim, strip accents and punctuation, collapse spaces, and drop a trailing plural `s`/`es` on both sides.

**REQ-GUESS-4 (MUST) Table override.** WHEN a guess is judged wrong, the host display SHALL show the guess next to the word and offer "Table says it counts" for 10 s, so the group can overrule near misses.

**REQ-GUESS-5 (MUST) Role-neutral UI.** Every controller SHALL have the same layout, buttons and positions whatever the role. The imposter's guess entry lives behind the private ticket peek, so a glance at someone's phone does not show their role.

## 9. Results and next round (RES)

**REQ-RES-1 (MUST)** WHEN a round ends, THE SYSTEM SHALL show on the host display: the winner side, the imposter, the word, how they won (voted out, wrong vote, tie, guess), and each vote.

**REQ-RES-2 (MUST)** Controllers show a personal result (you won / you lost) plus the word.

**REQ-RES-3 (MUST)** The host can start the next round (same players, same settings) or go back to the lobby. Standby players get seated.

**REQ-RES-4 (SHOULD) Scores.** Running scores for the session: each civilian +1 when civilians win; the imposter +2 for a vote win and +3 for a guess win. The host can reset scores.

## 9b. Manhunt mode (MODE)

A second game mode where the imposter can never guess the word: their only way to win is to blend in. A **match** is a series of rounds with the **same imposter** and a **new word each round**. Wrong votes cost the civilians a life and knock that player out of the match.

**REQ-MODE-1 (MUST) Mode setting.** The host chooses Classic or Manhunt in the lobby. Classic behaves exactly as sections 4 to 9 describe.

**REQ-MODE-2 (MUST) No guessing.** In Manhunt THE SYSTEM SHALL refuse every imposter guess, early or after being voted out. There is no last-chance phase, and no controller shows a guess option.

**REQ-MODE-3 (MUST) Match and imposter.** WHEN a Manhunt match starts, THE SYSTEM SHALL pick the imposter once (as ROLE-1). Every later round of the match keeps that imposter and deals a new word (WORD-3 still applies).

**REQ-MODE-4 (MUST) Voting.**
- WHEN the vote ejects the imposter, the civilians win the match.
- WHEN the vote ejects a civilian, that player is **out** for the rest of the match (no clues, no votes, not a vote target) and the civilians lose one life.
- WHEN the top vote is tied, or nobody votes, nobody is out and no life is lost. There is no revote.

**REQ-MODE-5 (MUST) Lives and the end.**
- Lives is 1, 2, 3 or Unlimited. WHEN the civilians reach 0 lives, the imposter wins.
- WHEN only 2 players remain in the match (the imposter and one civilian), the imposter wins, whatever the lives.

**REQ-MODE-6 (MUST) Between rounds.** WHEN a round ends without ending the match, THE SYSTEM SHALL show an intermission: who was voted out (and that they were not the imposter), or that nobody was, plus the lives left. The host starts the next round from there, or ends the match.

**REQ-MODE-7 (MUST) Ghosts.** A player who is out SHALL see on their own phone who the imposter is, and the current word. Nobody else's view changes (SEC-1 still holds for every player still in the match).

**REQ-MODE-8 (MUST) Joining mid-match.** Players who join during a match wait on standby until the match ends.

**REQ-MODE-9 (SHOULD) Scores.** Civilians win: every civilian in the match, in or out, gets +1. Imposter wins: +3.

## 10. Reconnection and robustness (RECON)

**REQ-RECON-1 (MUST) Silent rejoin.** Each controller stores a random player token in `localStorage`. WHEN a phone reconnects with that token, THE SYSTEM SHALL restore the same seat, name, role and secret, and resume the current phase, without asking for a name.

**REQ-RECON-2 (MUST) Grace period.** WHEN a player disconnects, the host display shows them as *offline* after 3 s. Their seat is held until the host removes them.

**REQ-RECON-3 (MUST) Skipping the offline.** WHEN it is an offline player's clue turn, THE SYSTEM SHALL wait 10 s, then mark them PASSED. Offline players do not block the ready gate or voting.

**REQ-RECON-4 (MUST) Too few players.** WHEN fewer than 3 seated players are connected for 30 s during a round, THE SYSTEM SHALL pause the round and let the host continue waiting or end it with no result.

**REQ-RECON-5 (MUST) Host display reload.** WHEN the host display reloads, THE SYSTEM SHALL rebuild it from server state with no change to the game.

**REQ-RECON-6 (MUST) Imposter leaves.** WHEN the imposter is removed by the host mid-round, the round ends with no result and everyone is told "The imposter left the station".

## 11. Secrecy (SEC)

**REQ-SEC-1 (MUST) Server-side views.** The server SHALL send each socket only the data that recipient may see. The secret word is never sent to the imposter's socket or to the host display before the result. The imposter's identity is never sent to any socket before the result.

**REQ-SEC-2 (MUST) No side channels.** Payload shapes, event names, event timing, screen layout, sounds and vibrations SHALL be identical for civilians and the imposter wherever role is not yet public. (Threat model: a curious player glancing at screens or listening to phones. Sniffing plaintext LAN traffic is out of scope; see 02-design §8.)

**REQ-SEC-3 (MUST) Host display is public.** The host display SHALL never show a secret, including in dev tools, page title or URL.

## 12. Sound and haptics (AUD)

**REQ-AUD-1 (MUST) Host audio.** The host display plays an ambient station loop in the lobby and stingers for: round start, turn change, clue landed, final call, vote reveal, ejection, guess, win. Audio starts only after the first click on the host display (autoplay rules). Volume and mute are in settings.

**REQ-AUD-2 (MUST) Phone haptics.** Controllers vibrate (where `navigator.vibrate` exists) on: your turn, vote opened, result. Patterns are identical for all roles. A per-phone toggle turns haptics and phone sound off.

**REQ-AUD-3 (SHOULD) Phone sound.** Controllers play a short soft tick when the ticket tears and when a vote locks, only if the player turned phone sound on.

## 13. Look, motion and feel (UX)

The full spec is [04-ui-motion.md](04-ui-motion.md). Requirements here are the ones tests can check.

**REQ-UX-1 (MUST)** The host display and controller follow the Departure Board direction in [04-ui-motion.md](04-ui-motion.md).

**REQ-UX-2 (MUST)** Every animation has a `prefers-reduced-motion` path that keeps state changes readable (opacity or colour) without movement. A host setting can force reduced motion too.

**REQ-UX-3 (MUST)** Animations never block input. A player can act while the screen is still animating, and the server never waits for an animation.

**REQ-UX-4 (MUST)** Host display: 60 fps target, never under 45 fps during the vote reveal on a 2019-era integrated-GPU laptop at 1920×1080. Controller: smooth on a mid-range 2020 Android phone.

**REQ-UX-5 (MUST)** Touch targets on the controller are at least 48×48 px; primary actions sit in the bottom third of the screen for one-handed use.

**REQ-UX-6 (MUST)** No state is shown by colour alone: every state has a word (BOARDING, FINAL CALL, CANCELLED…) or an icon.

**REQ-UX-7 (MUST)** Text contrast meets WCAG AA (4.5:1 body, 3:1 for large text) on both surfaces.

## 14. Non-functional (NFR)

**REQ-NFR-1 (MUST)** One command starts everything: `npm start` builds if needed, starts the server, and opens the host display in the default browser.
**REQ-NFR-2 (MUST)** Works offline once installed: no CDN fonts, scripts or sounds. Everything is bundled.
**REQ-NFR-3 (MUST)** Controller works on current iOS Safari and Android Chrome. Host display works on current Chrome, Edge and Firefox.
**REQ-NFR-4 (MUST)** Controller JS bundle under 200 KB gzipped (excluding audio).
**REQ-NFR-5 (MUST)** The game engine is pure and covered by unit tests; every MUST in sections 4 to 11 has at least one test.

---

## Decisions log

| # | Decision | Status |
|---|---|---|
| D1 | Laptop is server + shared host display; phones are private controllers | Decided |
| D2 | Clue mode is a lobby setting (typed / spoken) | Decided |
| D3 | Imposter can guess early (wrong = loss) and gets a last-chance guess | Decided |
| D4 | Stack: Node 24, TypeScript, Socket.IO, React + Vite, Vitest | Decided |
| D5 | Host display is read at arm's length to 2 m, not across a room | Decided |
| D6 | English bank + custom lists | Decided |
| D7 | Host audio + phone haptics, role-identical | Decided |
| D8 | Visual world: Departure Board (split-flap board + private tickets) | Decided |
| D9 | Tie rule: one revote among tied; second tie = imposter wins | Decided |
| D10 | Scoring values (RES-4) | Decided |
| D11 | Single game per server (no room codes) | Decided |
| D12 | Multiple imposters / team modes | Later |
| D14 | Manhunt mode: no imposter guesses; lives 1/2/3/Unlimited; new word each round; ties eject nobody and cost nothing; ghosts see the imposter | Decided |
| D13 | Remote test runs use a Cloudflare quick tunnel (laptop stays the server). Vercel ruled out: serverless functions cannot hold the Socket.IO connections or in-memory game state | Decided |
