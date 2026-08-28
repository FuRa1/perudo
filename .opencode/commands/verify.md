---
description: Run lint, typecheck, tests, and build; report only real failures
agent: build
---

Full verification gate for the Perudo monorepo. Compute here is cheap — run everything below in one pass rather than stopping at the first failure, so you have the complete picture before reporting anything.

## Lint

!`npm run lint`

## Typecheck

!`npm run typecheck`

## Tests

!`npm test`

## Build

!`npm run build`

---

Now report:

1. Which of the four commands above failed, if any — quote the actual error, don't paraphrase it away.
2. For each failure, determine whether it was caused by the change made in this session or whether it already existed in the working tree beforehand. Check `git status --short` and `git diff --stat` if unsure — a failure in a file this session never touched is very likely pre-existing, not yours to fix silently and not yours to hide either.
3. Do not declare the task done while an in-scope failure (one caused by this session's change) is still open. A pre-existing, out-of-scope failure doesn't block handoff, but say so explicitly — don't just go quiet about it.
4. If everything is clean, say so in one line. Don't pad a clean result with unnecessary detail.
