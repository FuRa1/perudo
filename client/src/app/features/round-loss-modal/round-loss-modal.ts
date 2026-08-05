import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { IonButton, IonModal } from '@ionic/angular/standalone';
import type { ServerEvent } from '@shared';
import { GameStore } from '../../core/game-store';
import { BidMarker } from '../../ui/bid-marker/bid-marker';

type RoundRevealedEvent = Extract<ServerEvent, { type: 'ROUND_REVEALED' }>;

const AUTO_CLOSE_MS = 5000;

/**
 * A compact, local-player-only notification for losing a "call liar" challenge — the public
 * reveal banner in Table is easy to miss, this is not. Driven entirely by the authoritative
 * ROUND_REVEALED event (never locally-computed outcome data, per CLAUDE.md 4.5/6.6); it never
 * sends an intent or mutates match state, purely a client presentation concern.
 */
@Component({
  selector: 'app-round-loss-modal',
  standalone: true,
  imports: [IonModal, IonButton, BidMarker],
  templateUrl: './round-loss-modal.html',
})
export class RoundLossModal {
  private readonly store = inject(GameStore);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isOpen = signal(false);
  private readonly reveal = signal<RoundRevealedEvent | null>(null);

  /** The last reveal we've already shown (and possibly dismissed) — guards against the modal
   * reopening itself off a still-true derived condition (e.g. a re-render) instead of a
   * genuinely new loss. */
  private lastShownReveal: RoundRevealedEvent | null = null;
  private autoCloseHandle: ReturnType<typeof setTimeout> | null = null;

  protected readonly lostBecauseBidWasTrue = computed(
    () => this.reveal()?.outcome === 'CALLER_LOSES',
  );
  protected readonly claimedBid = computed(() => this.reveal()?.claimedBid ?? null);
  protected readonly actualQuantity = computed(() => this.reveal()?.actualQuantity ?? null);

  constructor() {
    effect(() => {
      const latest = this.store.lastReveal();
      const myId = this.store.playerId();
      if (latest && myId && latest.loserId === myId && latest !== this.lastShownReveal) {
        this.lastShownReveal = latest;
        this.reveal.set(latest);
        this.isOpen.set(true);
        this.scheduleAutoClose();
      }
    });
    this.destroyRef.onDestroy(() => this.clearAutoClose());
  }

  private scheduleAutoClose(): void {
    this.clearAutoClose();
    this.autoCloseHandle = setTimeout(() => this.close(), AUTO_CLOSE_MS);
  }

  private clearAutoClose(): void {
    if (this.autoCloseHandle !== null) {
      clearTimeout(this.autoCloseHandle);
      this.autoCloseHandle = null;
    }
  }

  /** Handles both the explicit Close button and any other dismissal (e.g. backdrop tap) — bound
   * to the modal's (didDismiss) so both paths always clean up the timer the same way. */
  protected close(): void {
    this.clearAutoClose();
    this.isOpen.set(false);
  }
}
