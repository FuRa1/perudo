# Perudo — "Pirates of the Caribbean"

A networked (not hotseat) game of Perudo (Liar's Dice / Dudo) for 2–12 players. See [CLAUDE.md](./CLAUDE.md) for the full spec, architecture, and rules.

## Monorepo layout

```
/client    → Angular 21 (standalone components + Signals) + Ionic 8 + Tailwind CSS
/server    → NestJS + Socket.io — authoritative game logic
/shared    → shared TS types, phase enums, rules constants, pure functions
```

`/client` and `/server` both depend on `/shared` as an npm workspace package (`import { RULES_CONFIG } from 'shared'`).

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

Runs the NestJS server (`http://localhost:3000`) and the Angular dev server (`http://localhost:4200`) together, with labeled/colored output. To run just one side, see the package-level READMEs: [client/README.md](./client/README.md), [server/README.md](./server/README.md).

## Scripts (root)

| Script                 | What it does                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run dev`          | Runs server (`start:dev`) and client (`start`) concurrently, in watch mode.                                   |
| `npm run build`        | Builds `shared`, then `server`, then `client`, in that order (client/server depend on shared's build output). |
| `npm test`             | Runs each workspace's test suite (`shared` → Jest, `server` → Jest, `client` → Vitest via `ng test`).         |
| `npm run typecheck`    | Runs `tsc --noEmit` (or the Angular equivalent) in each workspace.                                            |
| `npm run lint`         | Lints the whole repo with the single root ESLint config ([eslint.config.mjs](./eslint.config.mjs)).           |
| `npm run lint:fix`     | Same, with `--fix`.                                                                                           |
| `npm run format`       | Formats the whole repo with the single root Prettier config ([.prettierrc.json](./.prettierrc.json)).         |
| `npm run format:check` | Checks formatting without writing.                                                                            |

There is deliberately **one** ESLint config and **one** Prettier config for the whole repo (CLAUDE.md 4.1) — no per-package configs.

## Deploy

Not chosen yet — see CLAUDE.md section 12 (open questions). This section will be filled in with step-by-step instructions once a host is picked.
