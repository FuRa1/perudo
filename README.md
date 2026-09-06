# Perudo — "Pirates of the Caribbean"

A networked (not hotseat) game of Perudo (Liar's Dice / Dudo) for 2–12 players. See [CLAUDE.md](./CLAUDE.md) for the full spec, architecture, and rules.

## Monorepo layout

```
/client    → Angular 21 (standalone components + Signals) + Ionic 8 + Tailwind CSS
/server    → NestJS + Socket.io — authoritative game logic
/shared    → shared TS types, phase enums, rules constants, pure functions
```

`/client` and `/server` both depend on `/shared` as an npm workspace package.

## Import aliases

No relative (`../..`) imports across or within packages — each package's tsconfig defines `paths` instead:

| Alias                   | Resolves to                    | Used from                                  |
| ----------------------- | ------------------------------ | ------------------------------------------ |
| `@shared` / `@shared/*` | `/shared`'s barrel / internals | `/client`, `/server`, and `/shared` itself |
| `@client/*`             | `/client/src/*`                | `/client` only                             |
| `@server/*`             | `/server/src/*`                | `/server` only                             |

`@shared` resolves to `/shared`'s TS source in `/client` (Angular's esbuild bundler compiles it directly — no CommonJS interop needed) and to `/shared`'s built `dist` in `/server` (so the compiled output has a real relative `require()` path — `tsc` doesn't rewrite `paths` aliases on its own, hence the `tsc-alias` postbuild step in both `/shared` and `/server`).

## Prerequisites

- Node.js 22.12+ (Node 22.16 is what this was built against)
- npm 11+ (comes with the workspaces used here)

## Install

From the repo root:

```
npm install
```

This installs dependencies for all three workspaces (`shared`, `server`, `client`) in one pass.

## Run locally

```
npm run dev
```

Runs the NestJS server (`http://localhost:3000` — Socket.io/API backend, not a page) and the Angular dev server (`http://localhost:4200`) together, with labeled/colored output.

**Open `http://localhost:4200` in your browser to play** — that's the client. The server has no UI of its own; the client is what talks to it over Socket.io. To run just one side, see the package-level READMEs: [client/README.md](./client/README.md), [server/README.md](./server/README.md).

## Scripts (root)

| Script                 | What it does                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run dev`          | Builds `shared` first, then runs server (`start:dev`) and client (`start`) concurrently, in watch mode.       |
| `npm run build`        | Builds `shared`, then `server`, then `client`, in that order (client/server depend on shared's build output). |
| `npm test`             | Runs each workspace's test suite (`shared` → Jest, `server` → Jest, `client` → Vitest via `ng test`).         |
| `npm run typecheck`    | Runs `tsc --noEmit` (or the Angular equivalent) in each workspace.                                            |
| `npm run lint`         | Lints the whole repo with the single root ESLint config ([eslint.config.mjs](./eslint.config.mjs)).           |
| `npm run lint:fix`     | Same, with `--fix`.                                                                                           |
| `npm run format`       | Formats the whole repo with the single root Prettier config ([.prettierrc.json](./.prettierrc.json)).         |
| `npm run format:check` | Checks formatting without writing.                                                                            |
| `npm run e2e`          | Runs the client's real-browser Playwright suite (`client/e2e/*.e2e.mjs`) against a live client+server.        |

There is deliberately **one** ESLint config and **one** Prettier config for the whole repo (CLAUDE.md 4.1) — no per-package configs.

## End-to-end tests

```
npm run e2e
```

Drives two real browser contexts (Playwright/Chromium) through the actual running app over a
real Socket.io connection — room creation, ready-up, the opening roll, hidden hand-rolling, a
full bid → call-liar → reveal cycle, and (in a separate script) a real page reload proving the
reconnect-token flow restores the correct seat with dice privacy intact. If a dev server isn't
already running on `:3000`/`:4200`, the suite starts one itself (and stops it afterward); if one
already is, it reuses it. See [client/README.md](./client/README.md) for the individual scripts.
This is separate from `npm test` (deterministic, fake-timer unit/integration tests) — the e2e
suite exercises the real transport and real (short) timers end to end.

## Known issues

[ISSUES.md](./ISSUES.md) is the live backlog: only what is still open, with enough context to pick
an item up cold. Most open entries are decisions waiting on a human rather than defects.

[RESOLVED.md](./RESOLVED.md) holds the closed entries. Nothing there needs action — it exists so a
past bug's root cause can be found without digging through git history.

## Testing over the internet with ngrok

No hosting needed for this — `npm run dev` already runs a real server + client, ngrok just makes your machine reachable. Two tunnels, since the client (web page) and server (Socket.io) are separate processes:

```
ngrok http 3000   # server — note the https URL, e.g. https://abcd-1-2-3-4.ngrok-free.app
ngrok http 4200   # client — note this https URL too
```

Share the **client** tunnel URL with the `serverUrl` query param pointing at the **server** tunnel:

```
https://<client-tunnel>/?serverUrl=https://<server-tunnel>
```

Nothing else to configure — CORS is already permissive (`origin: '*'`, no auth by design), the server binds all interfaces by default, and `client/angular.json`'s dev-server `allowedHosts` already allows `*.ngrok-free.app` / `*.ngrok.io` / `*.ngrok.app` (Vite's dev server otherwise rejects unrecognized `Host` headers). A free ngrok tunnel gets a new random URL each run unless you have a reserved domain — regenerate the shared link each session.

## Testing on an Android emulator/device

A native Capacitor Android project already exists at [client/android](./client/android) (appId `com.perudo.app`), but for day-to-day playtesting you don't need to build it — just point the emulator/device's browser at your dev machine over `adb`.

1. Connect the device/emulator and confirm it's authorized: `adb devices` should list it as `device` (not `unauthorized`/`offline`).
2. Run:
   ```
   npm run dev:android
   ```
   This forwards the device's `localhost:4200` and `localhost:3000` to your dev machine (`adb reverse`), then starts the server + client exactly like `npm run dev`.
3. On the device, open Chrome to `http://localhost:4200`. No `?serverUrl=` override needed — the reverse tunnel makes the client's default `http://localhost:3000` resolve correctly.
4. Perudo needs 2+ players — open a second player in a desktop browser tab at `http://localhost:4200` and join the same room code.

To instead run the actual installed native app (not just the browser) on a connected device/emulator:

```
npm run build -w client
cd client && npx cap sync android && npx cap run android
```

This loads a static build (no live reload — repeat after each change) and still needs `adb reverse tcp:3000 tcp:3000` (or the app's native-only "Server URL" field on the Entry screen) so it can reach the server.

## Deploy

**Stub — no host chosen yet.** This is an open question (AGENTS.md/CLAUDE.md section 12) that
only the project owner can close, not something an agent should pick on its own — so this section
deliberately stays a placeholder rather than a real guide. Once a host is chosen, this section
gets the same step-by-step pattern as "Run locally" above: prerequisites, the exact commands, and
what to configure (the client needs to know the server's public URL — see the `serverUrl` query
param used for ngrok above, the same mechanism a real deploy would use unless the client and
server end up served from the same origin). This is a separate question from the ngrok testing
above, which needs no hosting decision at all and works today.

## Development workflows

For detailed workflows (fixture mode for UI review, agent integration, etc.), see [SKILLS.md](./SKILLS.md).
