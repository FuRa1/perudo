/**
 * Runs tasks strictly one at a time, in submission order (CLAUDE.md 3.3). Each room owns one, so
 * every mutation of a room — player intents now, server timers in Phase 5 — is serialized and
 * can never interleave with another, even once some of them become async.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => T | Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    // Keep the chain alive even if a task rejects — the caller still sees the rejection.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
