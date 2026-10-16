# Imposter Who? — Specs

Spec-driven development: every feature traces **requirement → design → task → test**.

| Doc | What it answers |
|---|---|
| [01-requirements.md](01-requirements.md) | *What* the game does. Numbered requirements (`REQ-…`) with acceptance criteria. |
| [02-design.md](02-design.md) | *How* it is built. Architecture, state machine, data model, socket protocol. |
| [03-tasks.md](03-tasks.md) | *In what order.* Milestones and tasks, each linked to the REQs it satisfies. |
| [04-ui-motion.md](04-ui-motion.md) | *How it looks and moves.* The Departure Board world, flap engine, per-screen choreography, sound/haptics, reduced motion. |

Also: [PRODUCT.md](../PRODUCT.md) (product truth).

## Workflow

1. Change a spec before you change behaviour. New behaviour → new or edited `REQ-…`.
2. Each task in `03-tasks.md` lists the REQs it covers; its tests assert those acceptance criteria.
3. A task is done when its tests pass and the REQ checkboxes are ticked.
4. Open questions live in the **Decisions log** at the bottom of `01-requirements.md` until settled.

## Decisions already made

- The laptop runs the server **and** shows the shared host display. Phones are private controllers.
- Clue mode (typed on phone vs. spoken aloud) is a lobby setting.
- The imposter can guess the word early (wrong = instant loss) **and** gets a last-chance guess when voted out.
- Stack: Node 24 + TypeScript, Socket.IO, React + Vite, Vitest.
- Visual world: **Departure Board**. The laptop is a split-flap station board; each phone is a private ticket. Motion intensity 9/10.
