# client

Angular 21 (standalone components + Signals) + Ionic 8 + Tailwind CSS. Presentation only — components read state from a single Signals-based store and send intents through a service layer; components never talk to Socket.io directly (added in Phase 3). See [CLAUDE.md](../CLAUDE.md) sections 3.2, 5.8, 6.6 for the full spec.

Ships web + Android + iOS from this one codebase via Capacitor (added when native builds are wired up).

## Prerequisites

Node.js 22.12+, npm 11+. Installed as part of the root workspace install (`npm install` at the repo root) — there is no separate install step here.

## Run locally

From the repo root: `npm run dev` (runs client + server together), or from here:

```
npm start -w client
```

Opens the dev server at `http://localhost:4200/`, reloading on source changes.

## Scripts

| Script         | What it does                                                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start`        | `ng serve` — dev server with live reload.                                                                                                                                                                             |
| `build`        | `ng build` — production build to `dist/`.                                                                                                                                                                             |
| `watch`        | `ng build --watch --configuration development` — dev-mode build, watching.                                                                                                                                            |
| `typecheck`    | `tsc --noEmit` against both the app and spec tsconfigs.                                                                                                                                                               |
| `lint`         | Lints this package (including `.html` templates) with the repo's single root ESLint config.                                                                                                                           |
| `test`         | `ng test` — runs unit tests with Vitest.                                                                                                                                                                              |
| `e2e`          | Real-browser Playwright suite (`e2e/*.e2e.mjs`) against a live client+server — starts one itself if none is already running. Covers lobby/ready-up, a full bidding round, and reconnect.                              |
| `e2e:render`   | Captures reference screenshots of the running app at key UI states into `e2e/.screenshots/` (gitignored) — a visual-inspection aid, not a pass/fail check.                                                            |
| `e2e:fixtures` | Captures real `StateSnapshot`/event JSON off a live match's WebSocket traffic into `public/assets/fixtures/*.json` — feeds the fixture-preview mode below. Re-run after a `StateSnapshot`/`ServerEvent` shape change. |
| `design:compare` | Design-parity tooling — see [Comparing against the design references](#comparing-against-the-design-references).                                                                                                    |

## Comparing against the design references

The approved mockups live in `/designs` as Claude design-canvas exports (`*.dc.html`). Their `_ds`
style bundle isn't vendored, but each phone panel is plain inline-styled markup, so the panels
render faithfully in a browser on their own — meaning a comparison can be made against **real
pixels** rather than by reading hex values out of the mockup source.

`npm run design:compare -w client -- <mode> …` (dev server running):

| Mode                                                     | What it does                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `panels <designFile>`                                     | Lists the 390×844 panels (and screen labels) in a design file.                          |
| `design <designFile> <index> <out.png>`                   | Crops one design panel to a PNG.                                                        |
| `live <fixture> <out.png> [top\|bottom] [local.json]`     | Screenshots a live state via the fixture loader; `local.json` serves a synthetic state.  |
| `viewports <fixture> <outDir> [local.json]`               | Shoots 320/390/768/1440 and fails on horizontal overflow or console errors.              |
| `side <out.png> <label> <img> …`                          | Composes captures into one labelled side-by-side sheet.                                 |

Typical loop: crop the design panel, screenshot the matching live state, compose them side by
side, fix what differs, repeat.

## State-fixture preview mode (dev-only)

Load `http://localhost:4200/?fixture=<name>` (e.g. `?fixture=reveal-true`) to render the app
straight from a captured `StateSnapshot` in `public/assets/fixtures/`, skipping Socket.io
entirely — no server needed, no live match to play through. Useful for design-parity screenshots
and reviewing a state (an 8-player table, a reveal, a special round) without setting it up by
hand every time. See `core/fixture-loader.ts`'s doc comment and the repo-root
`STATE_FIXTURES_AND_SAVE_PLAN.md` for the full design. No `?fixture=` present is a total no-op —
same gating pattern as the existing `?serverUrl=...` override (`core/socket.service.ts`), since
this project has no `environment.ts` split to gate dev-only code on instead.

## Fonts

Self-hosted, never a remote/CDN font load (CLAUDE.md 8.1) — `public/assets/fonts/` holds Pirata
One (headings, banners, the wordmark) and EB Garamond (everything else: buttons, bids, room
codes, timers). Both SIL Open Font License 1.1, sourced from the Google Fonts repository; see
that directory's own `README.md` for the exact files, license text, and which CSS token
(`--font-heading` / `--font-body` in `src/theme/_tokens.scss`) each backs.

## Notes

- Change detection is zone-based (`zone.js` + `provideZoneChangeDetection`), not zoneless, because `@ionic/angular`'s component bindings currently assume `zone.js`.
- Styling: Tailwind CSS (`@import 'tailwindcss'` in `src/styles.css`) layered with Ionic components; Angular Material is not used (CLAUDE.md 8.1).
- The dice UI is 2D, config-driven and swappable — no 3D/Three.js/Babylon (CLAUDE.md 8.2, added in Phase 4).
- `vitest-base.config.ts`: `@ionic/core`'s bundle has a bare directory import with no `exports` map entry. Vitest's default SSR behavior externalizes `node_modules` deps to Node's native (strict) ESM loader, which rejects that import — `ng build`/`ng serve` never hit this because esbuild's app-bundling resolution doesn't apply Node's ESM-only restrictions. `test.server.deps.inline` forces Vitest to transform the Ionic packages instead of externalizing them. The Angular CLI only picks this file up under the exact name `vitest-base.config.ts` (via `test.options.runnerConfig: true` in `angular.json`) — not `vitest.config.ts`.
