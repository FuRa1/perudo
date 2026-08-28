---
description: Run the Playwright e2e suite against a fresh dev server
agent: build
---

Run the end-to-end suite. This drives real browser contexts over a real socket connection — use it when a change touches transport (`game.gateway.ts`, `rooms.service.ts`), the gameplay flow, reconnect, or timers (`turn-timer.service.ts`). Skip it for a change scoped to one component's styling or a pure function already covered by its own unit tests — it's slow relative to `npm test` and isn't the right tool for that.

!`npm run e2e`

Report:

- Which of the three scripts (`lobby-flow`, `bidding-flow`, `reconnect-timer-flow`) ran and what happened.
- Any console errors surfaced during the run — the suite is written specifically to catch these, don't dismiss one as noise without checking what it actually was.
- If a script hangs or times out, check whether a leftover dev-server process is already holding port 3000 or 4200 before assuming the code itself is at fault.
