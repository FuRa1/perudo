# server

NestJS backend — orchestration only. Holds room state, applies intents via `GameEngine` (added in Phase 2), manages timers, broadcasts filtered state. See [CLAUDE.md](../CLAUDE.md) sections 3.2, 6, 7 for the full spec.

Match state lives in server memory (a `Map` keyed by `roomId`) — no database in the MVP; restarting the server drops active matches by design (CLAUDE.md 3.3).

`GameGateway` (`src/game/game.gateway.ts`) is the only file touching Socket.io — it translates
socket messages into `GameEngine` intents and broadcasts the results, holding no game rules of
its own. `TurnTimerService` (`src/game/turn-timer.service.ts`, added in Phase 5) owns all
server-authoritative turn timing (the 15s/25s/30s-bank sequence, 5.6/5.7) and reconnect-session
bookkeeping lives on `RoomsService`'s per-room `sessionsByToken` map (`src/game/rooms.service.ts`)
— a random token handed back to the client on join, never included in any broadcast state.

## Prerequisites

Node.js 22.12+, npm 11+. Installed as part of the root workspace install (`npm install` at the repo root) — there is no separate install step here.

## Run locally

From the repo root: `npm run dev` (runs client + server together), or from here:

```
npm run start:dev -w server
```

Starts the Nest app in watch mode on `http://localhost:3000` (override with the `PORT` env var). This is the Socket.io/API backend — **open the client at `http://localhost:4200` in your browser to actually play** (see [client/README.md](../client/README.md)); this server has no page of its own beyond a JSON status check at `/`.

## Scripts

| Script        | What it does                                                                 |
| ------------- | ---------------------------------------------------------------------------- |
| `start`       | Runs the built app once (no watch).                                          |
| `start:dev`   | Runs with `nest start --watch` — restarts on file changes.                   |
| `start:debug` | Same, with the Node inspector attached.                                      |
| `start:prod`  | Runs the compiled `dist/main.js` directly.                                   |
| `build`       | `nest build` — compiles to `dist/`.                                          |
| `typecheck`   | `tsc --noEmit`.                                                              |
| `lint`        | Lints this package with the repo's single root ESLint config.                |
| `test`        | Runs unit tests (Jest, `*.spec.ts` under `src/`).                            |
| `test:watch`  | Same, in watch mode.                                                         |
| `test:cov`    | Same, with coverage.                                                         |
| `test:e2e`    | Runs end-to-end tests (`test/*.e2e-spec.ts`), spinning up the full Nest app. |

## Testing

Domain-logic tests (once `GameEngine` lands in Phase 2) are deterministic — RNG is injected and never called directly in logic (CLAUDE.md 6.4); time is controllable. The dice generator itself is never tested for distribution, only the logic that consumes given dice values (CLAUDE.md 4.3).
