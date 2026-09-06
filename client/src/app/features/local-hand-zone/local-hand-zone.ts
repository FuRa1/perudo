import { Component, computed, inject } from '@angular/core';
import { IonButton } from '@ionic/angular/standalone';
import { LucideDices } from '@lucide/angular';
import { GamePhase, type DiceValue } from '@shared';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';
import type { ArcSeatOpeningRoll } from '../../ui/arc-seat/arc-seat';
import { Die } from '../../ui/die/die';

/**
 * Mobile-only private local zone (Increment 3): your own hand, the opening die, and the roll
 * button — self-contained (dashboard-switching plan, Structure), so every dashboard (Default,
 * Linear, Clockwise) renders the exact same instance rather than duplicating this logic. Exactly
 * one of three states is ever visible, no duplicate local seat/card UI.
 */
@Component({
  selector: 'app-local-hand-zone',
  standalone: true,
  imports: [IonButton, LucideDices, Die],
  templateUrl: './local-hand-zone.html',
  styleUrl: './local-hand-zone.scss',
})
export class LocalHandZone {
  private readonly store = inject(GameStore);
  private readonly socket = inject(SocketService);

  protected readonly me = this.store.me;

  /** Public opening-roll data is shown whenever either the live roll or its resolved, still
   * temporarily-retained result exists. */
  protected readonly isOpeningRollPhase = computed(
    () => this.store.matchState()?.phase === GamePhase.START_ROLL,
  );

  /** Public opening die (5.2) — not tied to a cup, so its roll button stays in the general
   * table area rather than under any one seat. */
  protected readonly canRollOpeningDie = computed(() => {
    const state = this.store.matchState();
    const id = this.store.playerId();
    if (!state || !id || state.phase !== GamePhase.START_ROLL) {
      return false;
    }
    return state.startRoll?.pendingPlayerIds.includes(id) ?? false;
  });

  /** Private hand roll (5.3) — only the local player can ever roll their own hand, so this
   * button is placed directly under their own cup rather than anyone else's. */
  protected readonly canRollHand = computed(() => {
    const state = this.store.matchState();
    const id = this.store.playerId();
    if (!state || !id || state.phase !== GamePhase.ROUND_ROLLING) {
      return false;
    }
    return state.round?.pendingRolls.includes(id) ?? false;
  });

  /** Per-seat public opening-roll data for the local player's own die slot. */
  protected openingRollFor(playerId: string): ArcSeatOpeningRoll | null {
    if (!this.isOpeningRollPhase()) {
      return null;
    }
    const state = this.store.matchState();
    const value: DiceValue | null =
      state?.startRoll?.rolls[playerId] ?? state?.completedStartRoll?.rolls[playerId] ?? null;
    return { value, isWinner: state?.completedStartRoll?.firstPlayerId === playerId };
  }

  /** A reveal recap competing for the same screen shrinks the reserved roll-stage spacer to
   * nothing, and (at the narrowest supported width) tightens this zone's own spacing — same
   * `.table-surface:has(.mobile-reveal)` condition table.scss used to express as a cross-element
   * CSS selector, now a plain input-free local computed since this component injects GameStore
   * directly. */
  protected readonly revealActive = computed(() => this.store.lastReveal() !== null);

  /** The fixed mobile bid tray is on screen — tightens this zone's own spacing so the tray has
   * more room (former `.table-surface--bid-sheet-open .mobile-hand-zone` rules). */
  protected readonly biddingOpen = computed(
    () => this.store.matchState()?.phase === GamePhase.BIDDING,
  );

  protected roll(): void {
    this.socket.rollDice();
  }
}
