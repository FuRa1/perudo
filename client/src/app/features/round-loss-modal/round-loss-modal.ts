import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { IonButton, IonModal } from '@ionic/angular/standalone';
import type { ServerEvent } from '@shared';
import { GameStore } from '../../core/game-store';
import { BidMarker } from '../../ui/bid-marker/bid-marker';
import { VISUAL_ASSETS_CONFIG } from '../../ui/visual-assets/visual-assets.config';

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
  styleUrl: './round-loss-modal.scss',
})
export class RoundLossModal {
  private readonly store = inject(GameStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly modalElementRef = viewChild<unknown, ElementRef<HTMLElement>>('modalEl', {
    read: ElementRef,
  });

  protected readonly isOpen = signal(false);
  private readonly reveal = signal<RoundRevealedEvent | null>(null);

  /** decor/badge-lost.png — unset falls back to the CSS dashed-roundel placeholder
   * (round-loss-modal.html's `@if`, same swap pattern as ui/die/die.ts). */
  protected readonly badgeImageUrl = VISUAL_ASSETS_CONFIG.badgeLost.imageUrl;

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
  /** The reveal event and the post-loss state update land in the same batch (see the
   * ROUND_STARTED/ROUND_REVEALED ordering note above), so `me()` already reflects the
   * decremented count by the time this modal opens — matches the design's "one die taken — N
   * remain" line rather than leaving the player to do the subtraction themselves. */
  protected readonly lossSummary = computed(() => {
    const remaining = this.store.me()?.diceCount;
    if (remaining === undefined) {
      return 'You lost one die.';
    }
    if (remaining === 0) {
      return "You lost your last die — you're out.";
    }
    return `You lost one die — ${remaining} ${remaining === 1 ? 'remains' : 'remain'}.`;
  });

  constructor() {
    effect(() => {
      const latest = this.store.lastReveal();
      const myId = this.store.playerId();
      // The server always sends 'events' (ROUND_REVEALED) before 'state' for the same batch
      // (game.gateway.ts), so a loss that also ends the match is briefly seen before isGameOver()
      // catches up — this guard is the common case, the destroy-time cleanup below is the
      // guaranteed one (see its comment for why this alone is not sufficient).
      if (
        latest &&
        myId &&
        latest.loserId === myId &&
        latest !== this.lastShownReveal &&
        !this.store.isGameOver()
      ) {
        this.lastShownReveal = latest;
        this.reveal.set(latest);
        this.isOpen.set(true);
        this.scheduleAutoClose();
      }
    });
    // GAME_OVER always wins over a still-open round-loss notification: the moment authoritative
    // state reports the match has ended, the winner screen takes over (CLAUDE.md 5.9/6.1).
    effect(() => {
      if (this.store.isGameOver() && this.isOpen()) {
        this.close();
      }
    });
    this.destroyRef.onDestroy(() => {
      this.clearAutoClose();
      // Once presented, Ionic's <ion-modal> relocates its rendered overlay to document.body for
      // stacking (outside this component's own DOM subtree). app.html swaps Table for Winner in
      // the same change-detection pass that flips isGameOver() — that synchronous teardown can
      // beat the isOpen-driven close effect above, which only runs on the next microtask flush.
      // A modal already relocated to document.body when that race is lost is never touched by
      // Angular's removal of this (now-destroyed) component's original template position, so it
      // is orphaned there, permanently covering the winner screen. Force it out directly,
      // independent of Ionic's own dismiss lifecycle/timing.
      this.modalElementRef()?.nativeElement.remove();
    });
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
