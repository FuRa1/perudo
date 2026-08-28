/** A short synthesized "yellow zone" beep (5.6) — Web Audio only, no audio asset (out of MVP
 * scope per CLAUDE.md section 10 to add real sound files; the timer signal is the one exception
 * the spec explicitly carves out). Presentation only: this never affects the server-authoritative
 * timer, it only plays once the client has already computed the warning phase from server
 * timestamps. Safe to call in any environment — silently does nothing if Web Audio is unavailable
 * (e.g. a headless test runner). */
export function playWarningBeep(): void {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return;
    }
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.3);
    oscillator.onended = () => void ctx.close();
  } catch {
    // Presentation-only best effort — never let a beep failure affect gameplay.
  }
}
