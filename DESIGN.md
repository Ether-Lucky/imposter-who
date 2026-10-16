# Design

How Imposter Who? looks, moves and sounds, as built. The rules behind it live in [specs/04-ui-motion.md](specs/04-ui-motion.md); this file describes the result and where each piece lives in the code.

## The world

The laptop is a station **departure board**; every phone is a private **ticket**. The game is told in that language:

| Game                   | Station             |
| ---------------------- | ------------------- |
| Joining                | Checking in         |
| The secret word        | Your destination    |
| The imposter's ticket  | DESTINATION UNKNOWN |
| Category               | Line                |
| Your turn              | NOW BOARDING        |
| Discussion             | DELAYED             |
| Voting                 | FINAL CALL          |
| A civilian voted out   | CANCELLED           |
| The imposter voted out | DEPARTED            |
| Results                | ARRIVALS            |

Copy on the board is short, uppercase and a little deadpan (`PLEASE KEEP YOUR SUSPICIONS WITH YOU AT ALL TIMES`). No em dashes, no emoji.

## Palette

Nine colours and nothing else. A test (`apps/client/test/preflight.test.ts`) fails if any other colour appears in the client; black and white appear only as light and shade on the flaps.

| Token      | Hex       | Used for                                                                 |
| ---------- | --------- | ------------------------------------------------------------------------ |
| board      | `#16181b` | The board housing and the phone background                               |
| flap       | `#2a2d31` | Flap faces                                                               |
| flap-seam  | `#0e0f11` | The line between flap halves                                             |
| ink        | `#f2f2ee` | Flap characters and text on dark                                         |
| ink-dim    | `#9a9c98` | Secondary text, waiting states                                           |
| amber      | `#f5a623` | Live state only: the active row, NOW BOARDING, FINAL CALL, the GATE sign |
| red        | `#d6452f` | CANCELLED and errors only                                                |
| ticket     | `#eceae4` | Ticket paper                                                             |
| ticket-ink | `#1c1d1f` | Ticket print                                                             |

Every pair the screens use meets WCAG AA; red appears only as large text or as a bar beside an error, never as body text. Every state also has a word, so nothing rests on colour alone.

## Type

- **Big Shoulders Display 700** for flaps, signs and stamps: condensed, tabular, Chicago wayfinding roots. It beat Barlow Condensed and Oswald in a rendered flap test.
- **Atkinson Hyperlegible 400/700** for the ticket and every sentence a person reads, chosen for legibility across ages.
- Both are bundled from `@fontsource` (latin only, about 49 KB). Icons are Phosphor, one weight.

## The board (host display)

`apps/client/src/flap/` and `apps/client/src/host/`.

- **Grid.** The screen is one grid of flap-shaped cells: 18 rows, as many columns as fit (50 at 1366×768, 49 at 1080p, at least 40 on squarer screens). Everything snaps to cells, including the QR block and the signs. Empty cells show as blank flaps under a light grain. (`grid.ts`, `BoardGrid.tsx`)
- **Layout.** Row 0 says what this round is (round, lives, line) with the clock at the right. Row 1 is the station announcement in amber. Rows 2 to 16 hold up to 15 passengers: seat, name, clues, and a 12-cell status. Row 17 holds the host's enamel signs; amber is the GATE (the one primary action).
- **Flaps.** A changed cell walks forward round the drum (` ABC…XYZ0…9.-'!?:/`), never backwards: the top half folds down to the seam, the next character's bottom half unfolds with a small bounce. Rows ripple left to right with jitter; long walks speed up and cap at 24 steps. Text is in the page from the first render, so the board is readable before and without animation. (`drum.ts`, `Flap.tsx`)
- **Check-in.** QR at left, passengers at right, the GATE sign lights up with a wipe when three passengers are in. Click a passenger to move or remove them. While nobody has checked in, an empty row now and then flaps a fake destination. TIMETABLE (settings as flap selectors), RULES (a four-step explainer) and HELP (connection checklist with an address test) slide over the passenger rows.
- **A round.** NOW BOARDING moves an amber bar down the rows; clues flap into the clue column; FINAL CALL blinks the headline twice; the discussion ticker runs house lines and goes quiet for the last 15 seconds.
- **The vote reveal.** Votes flap in one row at a time, then the tally, then every row but the accused fades and the accused lifts. The verdict (DEPARTED in amber or CANCELLED in red) lands on the next screen, the first moment the board is allowed to know who the imposter was. The host can skip it; the server never waits for it.
- **Arrivals.** Roles flap in, scores walk up, and chad confetti bursts from both sides (civilians win) or from the imposter's row.
- **Manhunt.** Lives sit in the header; out passengers sink below the others in red; the intermission names who was cancelled and offers NEXT DEPARTURE or END MATCH.

## The ticket (phone)

`apps/client/src/play/`.

- One ticket on a dark ground: paper with a faint print texture, a dashed header, a perforated tear line with punched holes, and a barcode drawn from the seat number.
- **Check-in** prints the ticket up from below in three feeds.
- **Ticket check:** the stub is a tear strip. Drag it sideways (it resists past 30%, tears past 40% or on a quick flick, and falls away), hold it for 0.6 s, or press Enter. The face turns over to show the destination, or DESTINATION UNKNOWN in the same place and size.
- **After that** the secret hides behind a press-and-hold shutter that opens from the bottom and closes faster than it opens.
- **Your turn** slams a NOW BOARDING stamp onto the ticket; a sent clue prints up out of it.
- **Voting** turns the ticket into a passenger list; tapping a name punches a hole (and a chad drops).
- **Results** stamp ARRIVED or CANCELLED; winners get chads from the top of the ticket.
- **Ghost pass** (Manhunt, voted out): a dashed outline ticket stamped CANCELLED, with the imposter and the destination behind the same hold.
- **The same for everyone.** Civilian and imposter tickets share one layout, one set of animations and the same vibrations. Tests compare the markup in every phase, and the end-to-end test compares the two phones pixel for pixel.

## Motion

- Easing: `--ease-out` for entrances, `--ease-in-out` for moves, `--ease-drawer` for panels, a gravity curve for falling flaps and stubs. Exits are faster than entrances; nothing scales from zero; pressables shrink to 0.97.
- **Reduced motion**, from the OS or the host's setting (which also reaches every phone): flaps crossfade, the ticket swaps instead of flipping, stamps fade, no confetti, ticker or attract loop. The vote reveal keeps its beats, faster, because the order is information.
- **Performance:** with 15 passengers at 1080p the board holds about 53 fps through a full-board change and 55 fps through the reveal, measured without a GPU. That needed memoised cells, a flat fold instead of a 3D flip, and at most 160 cells moving at once. The phone page is about 97 KB of JavaScript.

## Sound and touch

All sound is synthesised in the browser (`apps/client/src/fx/synth.ts`): no files, nothing to license.

- **Board:** a low station rumble at check-in, a two-note chime when someone checks in, the classic four-note chime at departure, a turn chime, a thunk when a clue lands, a falling three-note final call, a drum roll and a stamp per vote in the reveal, stingers for DEPARTED and CANCELLED, a fanfare for a win, and the flap clatter itself (at most 60 ticks a second, pitch-jittered). Sound starts after the first click on the board.
- **Phones:** vibration on your turn, final call, tearing, punching a vote and the result, identical for every role. Each phone has a three-way button: vibration only (default), vibration and sound, or off.

## Not yet checked

A playtest on real phones (iPhone Safari and Android Chrome), including how smooth the ticket feels on a mid-range Android phone.
