# 04 · UI and Motion

**Design read.** A local party game with a shared table display and private phone controllers, built in a split-flap station-board language, using React + Motion for UI state and a custom WAAPI flap engine on a fixed grid.

**Dials:** `DESIGN_VARIANCE 6` (the flap grid is law, and the drama comes from motion, not layout chaos) · `MOTION_INTENSITY 9` · `VISUAL_DENSITY` 5 on the host, 2 on the phone.

**Mode:** Experience. The game itself leads from the first viewport.

This doc is the binding visual direction: the Departure Board world turned into buildable rules.

---

## 1. The world

### 1.1 Metaphor map

| Game concept | Station world |
|---|---|
| Host display | The departure board in the hall |
| Controller | Your ticket |
| Joining | Checking in |
| Secret word | Your destination |
| Imposter | DESTINATION UNKNOWN |
| Category | Line / platform name |
| Your clue turn | NOW BOARDING |
| Clue given | Row flaps to show the clue |
| Discussion | DELAYED, platform announcement |
| Voting | FINAL CALL |
| Ejected civilian | CANCELLED (red) |
| Ejected imposter | DEPARTED (then last call to guess) |
| Round result | Arrivals board |

### 1.2 Palette (total commitment, no other colours)

| Token | Hex | Use |
|---|---|---|
| `--board` | `#16181b` | Host background, board housing |
| `--flap` | `#2a2d31` | Flap tile face |
| `--flap-seam` | `#0e0f11` | Gap between flap halves |
| `--ink` | `#f2f2ee` | Flap characters, primary text |
| `--ink-dim` | `#9a9c98` | Secondary text (≥ 4.5:1 on `--board`) |
| `--amber` | `#f5a623` | Live state: active row, NOW BOARDING, GATE button, focus ring |
| `--red` | `#d6452f` | CANCELLED and errors only |
| `--ticket` | `#eceae4` | Ticket paper on phones (cool off-white, not cream) |
| `--ticket-ink` | `#1c1d1f` | Ticket print |

The phone background is `--board`; the ticket is the only light object on it. Contrast for every pairing is checked in M8 (REQ-UX-7).

### 1.3 Type

- **Flap face:** a condensed, tabular, all-caps station grotesk, self-hosted (REQ-NFR-2). **Locked in T4.1: *Big Shoulders Display* 700** (OFL, Chicago wayfinding origins). It beat Barlow Condensed and Oswald in a rendered flap-cell test: it fills a tall cell, keeps letters distinct at 28px, and reads most like a station board.
- **Ticket and UI text:** *Atkinson Hyperlegible* 400 and 700 (OFL), chosen for mixed-age legibility on phones.
- Both come from `@fontsource` packages, latin subset only, imported in `apps/client/src/styles/fonts.ts` and bundled by Vite (about 49 KB of woff2).
- **Ticket numbers:** tabular figures, dot-matrix styling via CSS (no image fonts).
- No Inter, no serif, no emoji as icons. Icons: Phosphor, one stroke weight.

### 1.4 Shape and material

- Flaps: 3px radius, a 1px seam across the middle, a faint top-half highlight (`linear-gradient`), and a shadow on the lower half during a flip.
- Board housing: brushed dark enamel with a fixed `pointer-events:none` grain overlay (never on scrolling layers).
- Tickets: 12px radius, a perforated tear line (CSS radial-gradient holes), thermal-print texture, a barcode of the player's seat number.
- No glassmorphism, no glow, no gradient text, no purple.

### 1.5 The grid

The host display is one grid of flap cells sized to the viewport. **Everything snaps to cells**: rows, the QR block, timers, buttons. Nothing floats.

- **Cells are flap-shaped:** width 0.68 × height, like a real split-flap character. The column gap is 0.08 × height (the same gap `FlapRow` uses, so text lines up with columns). The row gap is 0.14 × height.
- **18 rows** always. The cell height is the largest whole pixel that fits 18 rows plus a half-cell margin top and bottom.
- **Columns** fill the width (with a half-cell margin each side): about 49 at 16:9. If that leaves fewer than **40 columns** (a squarer screen), cells shrink until 40 fit. Layouts are designed for 40 columns and may anchor to the right edge.
- Result: 1366×768 gives 35px cells and 50 columns; 1920×1080 gives 50px cells and 49 columns; 1024×768 gives 32px cells and 40 columns. A cell is never under 28px tall at 1366×768.
- Empty cells show as blank flaps, so the whole screen reads as one board. A fixed grain overlay sits on top (§1.4).
- Built in T4.3: `apps/client/src/flap/grid.ts` (pure maths, tested) and `BoardGrid.tsx` (`<BoardGrid>` with `<BoardItem col row w h>`; a negative `col` or `row` counts from the right or bottom edge).

### 1.6 Copy voice

Station announcement: short, uppercase on the board, calm and a little deadpan. Examples: `NOW BOARDING: MARCO`, `FINAL CALL. CAST YOUR VOTE`, `ALL PASSENGERS CHECKED IN`, `DESTINATION UNKNOWN`, `SERVICE CANCELLED`. No em dashes in UI copy.

---

## 2. Motion grammar

### 2.1 Tokens

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Entrances, UI response |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | On-screen moves, board scroll |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | Sheets, ticket slide |
| `--flap-fall` | `cubic-bezier(0.55, 0, 0.9, 0.4)` | Top half falling (gravity: the only ease-in) |
| spring `press` | `{ duration: 0.25, bounce: 0 }` | Button press release |
| spring `ticket` | `{ duration: 0.5, bounce: 0.2 }` | Ticket drag, stamp |
| spring `stub` | velocity-preserving, gravity 2400 px/s² | Torn stub falling off-screen |

| Duration | Use |
|---|---|
| 80–120 ms | Press feedback, one flap step |
| 150–250 ms | Routine state change on phone |
| 300–500 ms | Phase change, sheet, overlay |
| 600–1200 ms | Board cascades (a whole row settling) |
| up to 9 s | The vote reveal sequence (authored, skippable) |

Rules: exits are faster than entrances. Nothing scales from 0 (start at 0.95 or more). Only `transform`, `opacity`, `clip-path` and `filter` (bounded) animate. Hover effects only under `(hover: hover) and (pointer: fine)`. Every pressable thing has `:active { scale: 0.97 }`.

### 2.2 Libraries

- **Motion** (`motion/react`) for React state transitions, layout moves (`layout`, `layoutId`), and the ticket drag gesture.
- **Flap engine**: our own module using the Web Animations API, isolated in its own component tree (not mixed with Motion on the same element).
- **Chad confetti**: a small Canvas 2D particle system (ticket-punch chads), lazily started, paused when hidden.
- No GSAP. No `window.addEventListener('scroll')`.

---

## 3. Signature: the flap engine

The flap board is the product's signature. It must feel mechanical and real.

**Character set:** ` ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-'!?:/` in this order, like a real drum.

**Flip a cell from A to B:**
1. Walk the drum forward from A to B (never backwards). Each step is one flip.
2. One flip = the top half of the current character folds down to the seam with `--flap-fall` (45 ms), then the bottom half of the next character unfolds from the seam with `--ease-out` (45 ms), overshooting slightly and settling (a little mechanical bounce). Built as a flat fold (`scaleY`) rather than a 3D `rotateX`: identical at this speed, and far cheaper (T7.4).
3. A shade gradient darkens the falling half towards its free edge to fake light (static, so each step animates only the two halves).
4. Long walks speed up: steps after the 8th take 30 ms each. Max 24 steps; beyond that, jump the drum. (Planned as 40; cut in T7.4 so full-board changes keep their frame rate.)

**Cascades:** when a row changes, each cell starts with `index × 18 ms + random(0–25 ms)` delay, so rows ripple left to right with organic jitter. Whole-board changes stagger rows top to bottom by 40 ms.

**Sound:** each settled cell fires a tick from a pooled Web Audio buffer, rate-limited to 60 ticks/s and pitch-jittered ±6%, so a full-board cascade sounds like a real clatter, not a buzz.

**Budget:** at most 160 cells mid-flip at once (planned as 320; halved in T7.4); extra changes queue. A cell's two leaves are raised once for its whole walk and get no `will-change` (WAAPI transforms composite on their own; toggling per step made the browser rebuild layers every step, T7.4). While `document.hidden`, cells settle straight to their final text and queued flips are dropped (nobody is watching, and the board is correct when the tab returns).

**Timing:** each step is pinned to a planned time on the document timeline, so frame-boundary delays do not add up over a long walk. Measured in T4.2: a full-board change with 40-step walks settled in about 2.2 s; with the 24-step cap, about 1.5 s.

**Reduced motion:** a cell crossfades A → B in 120 ms; ticks are reduced to one per row.

**API (built in T4.2, `apps/client/src/flap/`):** `<FlapRow text="MARCO" width={12} row={2} tone="amber" />`; without `width`, the row is as wide as its text. The engine diffs per cell and animates only the cells that changed. `<FlapMotion.Provider value={{ reduced: true }}>` forces reduced motion (the host setting, REQ-UX-2). `drum.ts` holds the pure logic; `Flap.tsx` the WAAPI cell.

---

## 4. Host display choreography

Each screen below lists its **job**, its **layout** (in grid cells), and its **moments**.

### 4.1 Boot and attract (lobby, no players)
- Board housing fades up (400 ms). The title row `IMPOSTER WHO?` flaps in from blank with a full drum walk, then the subtitle `CHECK IN BELOW`.
- QR block (8×8 cells) at left, with the URL flapping beneath it.
- **Attract loop:** every 6–10 s, one empty row flaps through a fake destination (`LONDON`, `PLATFORM 9`, `NOWHERE`) and back to blank. It stops when the first player checks in and pauses when the tab is hidden. Purpose: shows the board is alive and invites people to scan.

### 4.2 Check-in (players joining)
- New player's row flaps in their name, seat number and `CHECKED IN`. A soft chime plays.
- Reorder: dragging a row lifts it (shadow plus 2% scale). Other rows slide with `layout` animation, and the seat numbers flap to their new values.
- Offline player: their status flaps to `OFFLINE` in `--ink-dim`, and the row dims to 60%.
- START is the amber `GATE` sign at bottom right. When the minimum of 3 players is reached, it does one 600 ms "lights on" sweep (a clip-path wipe of amber across the sign).

### 4.3 Settings
- Opens as a "timetable" panel that slides up from the bottom of the board (`--ease-drawer`, 400 ms). Values are flap selectors: pressing ◀ ▶ flaps the value cell.

### 4.4 Departure (round start)
- The whole board does a **full-board cascade**: every row walks the drum to the round layout (rows top to bottom, 40 ms stagger). About 1.4 s. A departure chime plays.
- Header flaps to `ROUND 3   LINE: FOOD`. The category appears on the board only when *Show category to imposter* is on; otherwise the header reads `ROUND 3   LINE: CLASSIFIED`, since the board is public (REQ-SEC-3).

### 4.5 Ticket check (reveal phase)
- Each row's status shows `ISSUED`, then flaps to `READY` as players tear their ticket. No hint of content. (The status column is 12 cells, so `TICKET ISSUED` became `ISSUED`.)

### 4.6 Clue round
- **Active row:** amber left bar slides to the row (Motion `layoutId`, 350 ms `--ease-in-out`), the status flaps to `NOW BOARDING`, and a turn chime plays.
- **Turn timer:** a row of 10 flap cells counts down as digits, and the last 5 s turn amber with a tick per second.
- **Clue landed (typed):** the clue walks the drum into the row's clue column (letters cascade), and the status flaps to `CLUE GIVEN`. A soft thunk plays when the last cell settles.
- **Spoken mode:** the clue column flaps to `SPOKEN` and the row holds.
- **Passed:** clue column flaps to `-----`, status `PASSED` in `--ink-dim`.
- **Lap change:** a thin amber sweep crosses the board (300 ms), and the header flaps `LAP 2 OF 2`.

### 4.7 Discussion
- Header flaps to `DELAYED: DISCUSS`. The timer becomes a big 4-cell `01:30` clock.
- **Platform announcement ticker:** the bottom row scrolls once per 20 s with house lines (`PLEASE KEEP YOUR SUSPICIONS WITH YOU AT ALL TIMES`). It stops in the last 15 s, when the clock turns amber.

### 4.8 Final call (voting)
- Board-wide **FINAL CALL** cascade: every status flaps to `FINAL CALL`, the header blinks amber twice (opacity, not movement), and the final-call chime plays.
- As each player votes, their row's status flaps to `VOTED` (no target shown). Counter `6/8 VOTED`.

### 4.9 Vote reveal (the memorable moment)

Authored timeline, about 9 s, skippable by the host with a click (jumps to the end state):

| t (ms) | Beat |
|---|---|
| 0 | Board dims to 40% except the vote column. Low drum-roll loop starts. |
| 300 | Votes reveal **one row at a time**: each voter's vote column flaps to the target's name (rows top to bottom, 450 ms apart). Each settle plays a stamp sound. |
| ~4000 | Tally column flaps to counts, each count walking up from 0 (drum walk gives a natural slot-machine feel). |
| +600 | All rows except the top-voted one flap to blank, collapsing left to right. |
| +500 | The accused row lifts (scale 1.04, shadow) and moves to the board centre (`layoutId`, 700 ms `--ease-in-out`). |
| +900 | **Hold** for 1 s of silence. |
| +0 | Imposter: status flaps to `DEPARTED` in amber, and a heavy departure stinger plays. Civilian: status flaps to `CANCELLED` in red with a brief 3-cell "glitch" (cells briefly flap to random characters before settling), and a sad stinger plays. |

Tie: the tied rows stay lit, and the header flaps `TIE. REVOTE BETWEEN 2 PASSENGERS`. Revote reuses 4.8 and 4.9.

### 4.10 Last call (imposter guess after ejection)
- Board flaps to `LAST CALL: CAN THE IMPOSTER NAME THE DESTINATION?` with a 30 s clock.
- While the imposter types, a row of cells **shuffles randomly** (no content leaked) to build suspense.
- On submit, the guess walks into its row, then the true word walks into the row below. Match: both rows go amber, and the imposter wins. Miss: the guess row flaps to red `X`, and the civilians win. The "Table says it counts" override sits beside it for 10 s as an amber outlined button.

### 4.11 Arrivals (results)
- Board flips to `ARRIVALS`. Rows show each player, their role, their clue and their vote. The imposter's row carries the amber `IMPOSTER` tag.
- **Win celebration:** chad confetti (ticket-punch circles in `--ink` and `--amber`) bursts from the GATE sign and falls with gravity and spin for 2.5 s. Civilians win: burst from both sides. Imposter wins: a single tight burst from the imposter's row.
- Scores walk up via drum flaps.

---

### 4.12 Manhunt on the board (REQ-MODE)

Manhunt reuses 4.1 to 4.11. These are the differences.

- **Header:** a lives block sits at the right end of the header row: `LIVES 2`, the count in flap digits. Unlimited reads `LIVES: NO LIMIT`. When one life is left, the count turns amber (the word stays, so state is not colour alone, REQ-UX-6). The match round counter reads `ROUND 3 OF MATCH`.
- **Out rows:** a passenger who is out keeps their row, moved below the live passengers (Motion `layout`, 600 ms `--ease-in-out`, at the start of the next round). Their status column reads `CANCELLED` in red, the rest of the row dims to 60%, and the clue and vote columns flap to blank. They never light up as `NOW BOARDING` or `FINAL CALL`.
- **Vote reveal (4.9):** the same beats, with these endings:
  - Imposter ejected: `DEPARTED` in amber, then the match goes to Arrivals (4.11). No last call (REQ-MODE-2), so 4.10 never runs.
  - Civilian ejected: `CANCELLED` with the glitch, then the lives count walks down one step on the drum (`2` to `1`) with a heavy stamp sound, 400 ms after the status settles.
  - Tie or no votes: the tied rows dim back, and the header flaps `TIE. NOBODY LEAVES THE TRAIN`. No revote and no life lost.
- **Intermission (REQ-MODE-6):** a whole-board cascade to an intermission layout:
  - Header: `INTERMISSION`.
  - Centre rows: `MARCO: CANCELLED` then `NOT THE IMPOSTER`, or `NOBODY LEFT THE TRAIN`.
  - Below: `LIVES LEFT 1` and `PASSENGERS ON BOARD 5`.
  - The GATE sign reads `NEXT DEPARTURE` (amber, the host's primary action). Beside it, an outlined `END SERVICE` sign ends the match.
  - The platform ticker (4.7) runs with Manhunt house lines (`THE IMPOSTER REMAINS ON BOARD`).
- **Match end:** Arrivals (4.11) with the header `IMPOSTER CAUGHT` or `IMPOSTER ESCAPED`, plus a summary row: rounds played and lives left. Every out passenger's row keeps its red `CANCELLED`.

### 4.13 The clock (REQ-UX-8)

- **Big clock:** the top-right corner of the board is a clock module two rows tall and seven columns wide: `01:30` in double-height flap cells, so it reads from across the room. Rows 0 and 1 make room for it.
- **Draining bar:** a thin amber line under the headline, full width, shrinks from right to left as time runs out. The full length is the phase's set time (clue, discussion or vote timer, or 30 s for the last call), stretched if the host adds time.
- **Last 10 seconds:** the clock and bar turn amber and a soft tick plays each second. **Last 5 seconds:** the clock module pulses once per second (scale 1 to 1.06 and back, 300 ms) and the board's frame glints amber at each tick.
- **Time up:** a short buzzer, and the clock flaps to `00:00` and holds.
- **Paused:** the clock reads `PAUSE` and the bar freezes.
- Reduced motion: no pulse or glint; colour, digits, bar and sound stay.

### 4.14 Showpiece effects (REQ-UX-9)

Big moments get big, mechanical effects, still in the station world (light on enamel, ink, paper, steel), never glow or neon.

| Moment | Board | Reduced motion |
| --- | --- | --- |
| Round start | A **departure sweep**: a band of light crosses the board diagonally (600 ms) as the cascade starts, and the board **shudders** once (a 3 px mechanical jolt). | Sweep and shudder off; cascade crossfades |
| Final call | The board lights **flicker** twice (the board dims to 70% for 60 ms, twice) with the headline blink. | Headline blink only |
| Vote reveal tally | A **searchlight** (a lighter band one row tall) sweeps up and down the passenger rows, faster and faster, then stops on the accused as they lift. | No sweep; the accused row is marked |
| Verdict (DEPARTED or CANCELLED, on the next screen) | A **giant stamp** slams onto the middle of the board (scale 2.2 to 1, rotated -6°), a **shockwave** ring expands from it, the board shudders hard, and chads burst from the impact. It lifts away after 2.2 s. | The stamp fades in and out; no ring, shudder or chads |
| Civilians win | **Fireworks:** five chad bursts from different points of the board over 1.6 s, then a slow fall. | None; the headline says it |
| Imposter wins | **The getaway:** a train of flap cells reading `IMPOSTER ESCAPED` races across the middle of the board, right to left, twice. | Static banner row |
| Time up | Clock `00:00` holds; a single hard shudder. | No shudder |

Phones: the ticket **jolts** (a quick 2-step shake) when the verdict or result lands, a **ring of amber** pulses around the screen edge while it is your turn, and the last 3 seconds of your turn flash the timer with a buzz. Same for every role.

Performance: each effect is one or two elements animated with transform or opacity (no per-cell effects), so the board keeps its frame budget (§9).

## 5. Controller (phone) choreography

The phone is one ticket on a dark ground. Same layout for every role (REQ-GUESS-5).

### 5.1 Join
- The ticket **prints**: it feeds up from a slot at the bottom of the screen in 3 steps (`translateY` with small pauses, like a thermal printer), with a printer whirr if sound is on. The name field is printed on it, with the label above the input.
- Submit button: `CHECK IN`. On success, the barcode draws in left to right (clip-path) and a haptic tap fires.

### 5.2 Waiting
- The ticket sits with `WAITING FOR DEPARTURE`. A slow 4 s breathing shimmer on the barcode is the only loop, and it stops under reduced motion.

### 5.3 Ticket reveal (signature gesture)
- The ticket arrives face down (stamped `CONFIDENTIAL`).
- **Tear strip:** drag the perforated stub at the bottom. The stub follows the finger with rubber-band resistance (damping past 30%). Release past 40%, or flick faster than 0.11 px/ms: the stub tears off (perforation holes split along the line with a staggered clip-path) and falls off-screen with velocity and spin. The ticket flips (`rotateY`, 500 ms, `ticket` spring) to show the destination.
- Release early: the stub springs back.
- Alternative: press and hold for 600 ms (a ring fills around the thumb) to do the same.
- Civilian face: `DESTINATION` / `BANANA`, `LINE: FOOD`. Imposter face: `DESTINATION UNKNOWN` set in the same size and position, `LINE: FOOD` if enabled.
- Same animation, same timing and same haptic for both roles (REQ-SEC-2).

### 5.4 Peek (rest of the round)
- The secret is hidden by default. Press and hold the ticket to lift a privacy shutter (clip-path inset from the bottom, 180 ms). It closes on release (120 ms, faster exit).
- For the imposter, the peeked face also has a small `GUESS DESTINATION` link (REQ-GUESS-1). Civilians' peeked face has a same-sized `REMEMBER: ONE WORD CLUES` line in the same place, so the layouts match at a glance.

### 5.5 Your turn
- A `NOW BOARDING` stamp slams onto the ticket (scale 1.15 → 1 with `ticket` spring, slight rotation −4°), plus a haptic double-pulse.
- **Typed:** a one-word field with a dot-matrix caret. Valid input shows a live amber underline. `SEND CLUE` button. On send, the text "prints" out of the ticket upward and fades (feedback that it went to the board).
- **Spoken:** a full-width `DONE` button, 72px tall.
- Others' turns: a slim strip shows `NOW BOARDING: MARCO` so players know whose turn it is without looking up.

### 5.6 Voting
- Ticket flips to a **passenger list**: big rows (min 56px) with name and seat. Tap a row to select: it gets punched (a hole punch animation: circle clip-path plus a chad dropping) and turns amber-outlined. Tapping another moves the punch.
- `LOCK VOTE` turns the punch solid and fires a haptic. Changing is allowed until close (REQ-VOTE-1).

### 5.7 Guess (imposter only, behind peek)
- A bottom sheet (`--ease-drawer`, 400 ms) with one input and a **hold-to-confirm** button: an amber fill wipes across in 1.2 s linear (clip-path), and releasing early snaps it back in 200 ms.

### 5.8 Result
- Win: `ARRIVED` stamp, chad confetti from the top of the ticket, haptic celebration pattern.
- Loss: `CANCELLED` stamp in red, the ticket desaturates slightly, a single long haptic.
- Both show the true destination.

---

### 5.9 Manhunt tickets (REQ-MODE)

- **No guess link:** in Manhunt the peeked face never shows `GUESS DESTINATION`. Both roles show the `REMEMBER: ONE WORD CLUES` line in that slot, so layouts still match (REQ-MODE-2, REQ-GUESS-5).
- **Lives:** the ticket's footer line reads `LIVES 2`, the same for every role.
- **Intermission:** the ticket flips to an `INTERMISSION` face with the result line (`MARCO: CANCELLED` or `NOBODY LEFT THE TRAIN`), the lives left, and `NEXT DEPARTURE SOON`. On the next round, a new ticket prints (5.1 printer feed, shortened to 1 step) and arrives face down for a new tear (5.3).
- **Ghost pass (REQ-MODE-7):** when a player is voted out, their ticket gets a red `CANCELLED` stamp (5.5 stamp motion), then tears in half diagonally (two clip-path halves drift apart 8px and rotate ±3deg). It becomes a **ghost pass**: a ticket with a dashed outline and `GHOST PASS` at the top. The secrets (`IMPOSTER: NAME` and `DESTINATION: WORD`) sit behind the same press-and-hold shutter as 5.4, because people nearby can still glance at the phone. The ghost pass updates to the new word each round. Ghosts get no turn, vote or haptic cues.
- **Standby (REQ-MODE-8):** a player who joins mid-match gets a ticket stamped `STANDBY` with `BOARDING AFTER THIS SERVICE`. It stays static (no breathing shimmer) and prints a normal ticket when the match ends.

## 6. Phase transitions

- Host: phase changes are board cascades (section 3). No page fades.
- Phone: the ticket flips (`rotateY`) to its new face for major phases (reveal → clue → vote → result). Minor changes crossfade with 4px blur (150 ms) to hide the swap.
- Reconnect: the phone shows a skeleton ticket in the ticket's exact shape (no spinner) and restores to the current face with no animation replay.

---

## 7. Sound and haptic map

Host sounds play from the laptop. Phone haptics and sounds are opt-in per phone and **identical for every role**.

| Event | Host sound | Phone haptic | Phone sound (opt-in) |
|---|---|---|---|
| Lobby | Station ambience loop (low) | none | none |
| Player checks in | Chime | Tap 20 ms | Print whirr |
| Round start | Departure chime | Tap 20 ms | none |
| Ticket torn | none | Tap 15 ms | Paper tear |
| Your turn | Turn chime | 2 × 40 ms | Ding |
| Clue landed | Flap clatter + thunk | none | none |
| Final call | Final-call chime | 3 × 30 ms | Ding |
| Vote locked | none | Tap 25 ms | Punch |
| Vote reveal | Drum roll, stamps | none | none |
| Ejection | Departure or cancel stinger | none | none |
| Result | Win fanfare | Win: 3 rising pulses, loss: 1 × 200 ms | Win / loss jingle |

All audio is self-hosted, short, and under 600 KB total (Opus/OGG with MP3 fallback). Flap ticks are synthesised or a single tiny sample pitched at runtime.

---

## 8. Reduced motion

Triggered by `prefers-reduced-motion: reduce` or the host setting:
- Flaps crossfade (120 ms), with no drum walk.
- Ticket tear becomes a 200 ms crossfade to the face. Hold-to-reveal still works.
- No confetti, no attract loop, no ticker scroll, no board dimming movement.
- Stamps fade in without scale.
- Vote reveal keeps its beats (sequencing is information) but uses fades, about 4 s total.
- Colour and word state changes stay.

---

## 9. Performance budget

| Item | Budget |
|---|---|
| Host fps during full-board cascade | ≥ 45 on integrated GPU at 1080p |
| Cells mid-flip at once | ≤ 160 |
| Controller JS (gzipped) | < 200 KB |
| Fonts | 2 families, subset, woff2, < 120 KB total |
| Audio | < 600 KB total, decoded lazily after first interaction |
| Grain overlay | One fixed pseudo-element |
| Confetti | ≤ 180 particles host, ≤ 60 phone, auto-stops |

Measure in M8 with the Chrome performance panel and a real mid-range Android phone.

**Measured in T7.4** (production build, 15 passengers, 1920×1080, headless Edge with software rendering, so a real GPU only does better): idle 58 fps; round-start cascade 53 fps average (95th percentile frame 34 ms); vote reveal 55 fps (95th 18 ms). Controller JS: about 97 KB gzipped. What got it there, from a first measurement of 24 and 11 fps:

- Flap cells and rows are memoised; the vote reveal re-renders only when a beat changes.
- A cell's leaves stay raised for its whole walk, and fold flat (`scaleY` of a registered `--fold` property) instead of a 3D `rotateX`: no compositor layer per moving leaf.
- At most 160 cells flip at once, walks cap at 24 steps, the shade is static, and cells use `contain: strict`.

Still to do with the owner: the same check on a real mid-range Android phone (T3.4).

---

## 10. Pre-flight checklist (run in M8)

- [x] Palette: only the tokens in 1.2 appear anywhere.
- [x] Every element on the host display sits on the flap grid.
- [x] Role-identical controller layout verified by screenshot diff (civilian vs imposter, every phase).
- [x] Every animation has a reduced-motion path; nothing is hidden while animations run (content visible by default).
- [x] No em dashes, no emoji icons, no Inter, no glow, no purple.
- [x] Touch targets ≥ 48px, primary actions in the bottom third. (Checked in screenshots at 390×844; still to feel on real phones in T3.4.)
- [x] Contrast AA on all pairs. (Red only as large text or a bar; dimmed rows keep their status at full strength.)
- [x] Automated UI lint pass (anti-patterns, contrast, palette) on the changed UI, findings fixed.
- [x] Final design review run; DESIGN.md written from the built world.
