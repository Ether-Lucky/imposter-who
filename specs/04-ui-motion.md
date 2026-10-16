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

- **Flap face:** a condensed, tabular, all-caps station grotesk, self-hosted (REQ-NFR-2). First candidate: *Big Shoulders Display* (OFL, Chicago wayfinding origins). Confirm with a rendered flap test in M4 before locking.
- **Ticket and UI text:** *Atkinson Hyperlegible* (OFL), chosen for mixed-age legibility on phones.
- **Ticket numbers:** tabular figures, dot-matrix styling via CSS (no image fonts).
- No Inter, no serif, no emoji as icons. Icons: Phosphor, one stroke weight.

### 1.4 Shape and material

- Flaps: 3px radius, a 1px seam across the middle, a faint top-half highlight (`linear-gradient`), and a shadow on the lower half during a flip.
- Board housing: brushed dark enamel with a fixed `pointer-events:none` grain overlay (never on scrolling layers).
- Tickets: 12px radius, a perforated tear line (CSS radial-gradient holes), thermal-print texture, a barcode of the player's seat number.
- No glassmorphism, no glow, no gradient text, no purple.

### 1.5 The grid

The host display is one grid of flap cells sized to the viewport: about 32 columns by 18 rows at 1920×1080, scaled so a cell is never smaller than 28px tall at 1366×768. **Everything snaps to cells**: rows, the QR block, timers, buttons. Nothing floats (raise from the oscilloscope challenger).

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
2. One flip = the top half of the current character rotates `rotateX(0 → -90deg)` with `--flap-fall` (45 ms), then the bottom half of the next character rotates `rotateX(90deg → 0)` with `--ease-out` (45 ms), overshooting to `-6deg` and settling (a little mechanical bounce).
3. A shade gradient darkens the falling half (opacity 0 → 0.5) to fake light.
4. Long walks speed up: steps after the 8th take 30 ms each. Max 40 steps; beyond that, jump the drum.

**Cascades:** when a row changes, each cell starts with `index × 18 ms + random(0–25 ms)` delay, so rows ripple left to right with organic jitter. Whole-board changes stagger rows top to bottom by 40 ms.

**Sound:** each settled cell fires a tick from a pooled Web Audio buffer, rate-limited to 60 ticks/s and pitch-jittered ±6%, so a full-board cascade sounds like a real clatter, not a buzz.

**Budget:** at most 320 cells mid-flip at once; extra changes queue. Animated elements get `will-change: transform` only while flipping. The engine pauses when `document.hidden`.

**Reduced motion:** a cell crossfades A → B in 120 ms; ticks are reduced to one per row.

**API sketch:** `<FlapRow text="MARCO" width={12} tone="amber" />` and `<FlapText>` for single strings. The engine diffs the strings and animates only the cells that changed.

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
- Each row's status shows `TICKET ISSUED`, then flaps to `✓ READY` (icon plus word) as players tear their ticket. No hint of content.

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
| Cells mid-flip at once | ≤ 320 |
| Controller JS (gzipped) | < 200 KB |
| Fonts | 2 families, subset, woff2, < 120 KB total |
| Audio | < 600 KB total, decoded lazily after first interaction |
| Grain overlay | One fixed pseudo-element |
| Confetti | ≤ 180 particles host, ≤ 60 phone, auto-stops |

Measure in M8 with the Chrome performance panel and a real mid-range Android phone.

---

## 10. Pre-flight checklist (run in M8)

- [ ] Palette: only the tokens in 1.2 appear anywhere.
- [ ] Every element on the host display sits on the flap grid.
- [ ] Role-identical controller layout verified by screenshot diff (civilian vs imposter, every phase).
- [ ] Every animation has a reduced-motion path; nothing is hidden while animations run (content visible by default).
- [ ] No em dashes, no emoji icons, no Inter, no glow, no purple.
- [ ] Touch targets ≥ 48px, primary actions in the bottom third.
- [ ] Contrast AA on all pairs.
- [ ] Automated UI lint pass (anti-patterns, contrast, palette) on the changed UI, findings fixed.
- [ ] Final design review run; DESIGN.md written from the built world.
