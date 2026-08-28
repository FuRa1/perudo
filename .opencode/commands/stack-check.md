---
description: Check current best practice for a specific stack feature before using it
agent: build
---

Topic: $ARGUMENTS

Before writing code that uses this, confirm the current idiomatic approach rather than relying on memory — this stack moves fast enough that stale training knowledge is a real risk (Angular 21 standalone components + Signals, Ionic 8.8.x — deliberately pinned below 9.x, which isn't published yet, don't "helpfully" bump it — Tailwind 4, NestJS 11, Socket.io 4).

1. Identify the exact library and version actually in use (check the relevant `package.json` — don't assume).
2. Look up current official documentation or release notes for that library at that version, not a generic or older tutorial that may predate breaking changes.
3. Cross-check against how the rest of this codebase already uses that library (`rg` for existing usage). Prefer the pattern already established here over introducing a new one, unless the existing pattern is itself demonstrably wrong.
4. Report the specific API/pattern you're going to use and why, before writing the implementation.

Skip this for routine edits that follow an existing, already-proven pattern in this codebase — it's for adopting something the codebase doesn't already do, not a gate on every change.
