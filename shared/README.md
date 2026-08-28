# @perudo/shared

The contract between `/client` and `/server`. Pure TypeScript, no framework dependencies, no side effects.

Contains (see CLAUDE.md 3.2 for the full intent):

- Game-state and event TS types (intents, server messages) — added in Phase 2/3.
- The game-phase state machine enum (CLAUDE.md 6.1) — added in Phase 2.
- The single rules-constants module, [`rules.config.ts`](./src/rules.config.ts) (CLAUDE.md 3.4).
- Pure functions with no side effects — bid legality, bid comparison with aces conversion, wild-aware counting (CLAUDE.md 5.4) — added in Phase 2. Imported by both client (instant pre-validation) and server (authoritative check), written once.
- `types/timer.types.ts` (added in Phase 5) — `TurnTimerView`/`StateSnapshot`, the server-timer
  metadata attached to the client-facing state snapshot. Deliberately kept separate from
  `MatchState` itself: `GameEngine` has no clock and never needs to know timers exist (6.3); only
  the transport layer (`selectPlayerView`, `/server`) attaches this.
- The dice-face visual config, [`dice-faces.config.ts`](./src/dice-faces.config.ts) (CLAUDE.md 8.2)
  — config-driven rendering data (label, wild flag, and now a real per-face `imageUrl`, added in
  Phase 4) that `/client`'s `Die` component reads instead of hardcoding per-face behavior.

## Prerequisites

Node.js 22.12+, npm 11+. Installed as part of the root workspace install (`npm install` at the repo root) — there is no separate install step here.

## Scripts

| Script                        | What it does                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run build -w shared`     | Compiles `src/` to `dist/` (`tsconfig.build.json`, excludes `*.spec.ts`). `/client` and `/server` resolve `shared` from this output. |
| `npm run typecheck -w shared` | `tsc --noEmit` against the full project (including tests).                                                                           |
| `npm test -w shared`          | Runs the Jest test suite.                                                                                                            |
| `npm run lint -w shared`      | Lints this package with the repo's single root ESLint config.                                                                        |

## Testing

Domain-logic tests here are deterministic — no wall-clock time, no unseeded randomness (CLAUDE.md 4.3, 6.4). The RNG dice generator itself is never tested for distribution; only the pure logic that consumes given dice values.
