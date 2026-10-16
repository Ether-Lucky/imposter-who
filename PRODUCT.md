# Product

## Platform

web

## Stack

Node 24 + TypeScript. Socket.IO for realtime. React + Vite for the two front-ends (host display, phone controller). Vitest for tests.

## Users

A group of 3 to 15 friends or family sitting together in one room, playing a social deduction party game. One person owns the laptop and starts the game; everyone else joins from their own phone's browser. Nobody installs anything. Players range from first-timers who need the rules shown to them to regulars who want to skip straight to the next round.

## Product Purpose

"Imposter Who?" is a local-network version of the Imposter Word Game. Every player but one sees the same secret word; the imposter sees only that they are the imposter. Players give one-word clues, argue, and vote. Success is a round that is fast to start, keeps secrets private, and ends in arguing and laughing, not in fiddling with phones.

## Positioning

The laptop is the shared table, the phones are private cards. The secret lives only in your hand, and the shared screen runs the drama: whose turn it is, the clues so far, the vote reveal. No account, no internet, no app store. Open the laptop, scan a code, play.

## Operating Context

- The laptop sits on a table; players gather around it at arm's length to about 2 m. The host display is designed for a 13 to 16 inch laptop screen read by a small crowd, not for a TV across a room.
- Phones are held privately, often one-handed, in a living room under mixed light. Players glance at them, then look up at each other.
- The phones connect to the laptop over the same Wi-Fi. They reach it by the laptop's LAN IP (shown as a QR code), never by `localhost`.
- Phones lock and wake mid-game. A dropped connection must restore the player's seat and secret silently.
- Clue mode is a per-game choice: typed on the phone, or spoken aloud with the phone only tracking turns.

## Capabilities and Constraints

- 3 to 15 players, exactly one imposter per round.
- Built-in English word bank in categories (Food, Movies, Jobs, and more). The host can add custom categories and words for in-jokes.
- Imposter can guess the word early (wrong guess = instant loss) and gets a last-chance guess when voted out.
- Sound: the host display plays music and stingers; phones give haptics and small sound effects on turns, votes and reveals. Sound is opt-in per device and must never leak a role (an imposter's phone must not sound or buzz differently from a civilian's).
- Runs entirely on the local network. No accounts, no cloud, no analytics.
- Undecided: scoring across rounds, team or multi-imposter variants, languages other than English.

## Evidence on Hand

None yet. No logo, no assets, no word lists. All word content is to be authored. No testimonials or player counts exist and none may be invented.

## Product Principles

1. **The secret is sacred.** Nothing on the shared screen, in a sound, a vibration, a timing difference or a network payload may reveal who the imposter is or what the word is to the wrong person.
2. **Heads up, not heads down.** Phones are for private info and quick taps. The social game happens between people and on the shared screen.
3. **Zero setup friction.** From opening the laptop to the first role reveal should take under a minute, with no typing of URLs.
4. **The table runs the show.** The host display carries the drama and the rhythm of the round; it should feel like a game-show set, not a web form.
5. **Forgiving by default.** Reconnects, late joiners between rounds, accidental taps and misspelled guesses are expected and handled gracefully.

## Accessibility & Inclusion

Mixed ages and tech comfort. Phone controls need large touch targets and work one-handed. Every animated moment needs a reduced-motion path. Color must never be the only signal for a state (turn, vote, win/lose).
