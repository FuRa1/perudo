---
description: Implement a change test-first (red-green-refactor)
agent: build
---

Task: $ARGUMENTS

Work test-first. Do not write implementation code before there is a failing test that names the behavior you're about to build.

1. Locate where this behavior belongs: domain logic and pure functions go in `/shared` (Jest), transport/orchestration in `/server` (Jest), presentation in `/client` (Vitest). Check `AGENTS.md` if the boundary isn't obvious, and don't duplicate logic that already exists in `/shared` — both client and server are meant to import it, not reimplement it.
2. Write or extend the test first, describing the behavior named above. For anything touching bid validation, the aces conversion scale, or `GameEngine` state transitions, ground the test in `AGENTS.md`'s actual rules and worked examples (section 5.4/6.1) — don't invent different behavior than what's specified there.
3. Run just that test file and confirm it fails, and fails for the reason you expect — not a typo, an import error, or an unrelated crash. Compute is cheap: actually run it, don't reason about whether it would fail.
4. Write the minimal implementation to make it pass. Resist adding anything the test doesn't require yet.
5. Run the test again and confirm it's green.
6. If the implementation or the test itself is awkward, refactor, then run the test a third time to confirm the refactor didn't break it.
7. Once the specific test is green and stable, run `/verify` for the full repo-wide gate before considering the task done.

If the task can't be cleanly expressed as a test first (pure CSS/layout work, a docs change, an infra/tooling change), say so and explain why, rather than silently skipping the test-first step without comment.
