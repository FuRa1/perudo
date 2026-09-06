// Test-environment stubs for browser APIs the app legitimately uses but the unit-test DOM does
// not implement. Kept deliberately minimal: only APIs that exist in every browser we target, so a
// stub here can never hide a real capability gap — it only stops jsdom from throwing on them.

// ResizeObserver — used by features/board/board-shell to measure the fixed bid tray so the table surface can
// reserve exactly its height. A no-op stub is the right shape for unit tests: layout has no real
// geometry in jsdom, so there is nothing meaningful to report, and the component already handles
// a height of 0 (its CSS fallback covers the pre-measurement frame).
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
