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

There is deliberately **one** ESLint config and **one** Prettier config for the whole repo (CLAUDE.md 4.1) — no per-package configs.

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

## Deploy

Not chosen yet — see CLAUDE.md section 12 (open questions). This is a separate question from the ngrok testing above (which needs no hosting at all); this section will be filled in with step-by-step instructions once a real host is picked.
