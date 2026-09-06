import { Component, computed, inject } from '@angular/core';
import { GamePhase, type Player } from '@shared';
import { GameStore } from '../../../../core/game-store';
import { GameView } from '../../../../core/game-view';
import { ArcSeat } from '../../../../ui/arc-seat/arc-seat';
import { BidMarker } from '../../../../ui/bid-marker/bid-marker';
import { LocalHandZone } from '../../../local-hand-zone/local-hand-zone';
import { DefaultDashboard } from '../default-dashboard/default-dashboard';
import {
  type ArcPosition,
  computeRingPosition,
  ringSeatOpacity,
  ringSeatSizePx,
} from '../../seat-geometry';

/** Avatar eases 56px → 52px as the ring fills (designs/perudo-spotlight-gallery.dc.html, B-4P vs
 * B-12P: "the hero card is 148px (136px at twelve)... avatar demoted 112→56px, because the bid is
 * the thing being answered and the portrait was the cheapest thing on the card"). The card's own
 * *height* is left to size to its content instead of matching those exact 148/136px figures —
 * this build's BidMarker (reused rather than redrawn, decision 10) needs more vertical room than
 * the reference's bespoke compact "CALLS" row, so forcing that exact height only clipped it. */
const HERO_AVATAR_MAX_PX = 56;
const HERO_AVATAR_MIN_PX = 52;

function lerp(min: number, max: number, opponentCount: number): number {
  const t = Math.max(0, Math.min(1, (opponentCount - 3) / (11 - 3)));
  return min + t * (max - min);
}

/**
 * Variant B "Round the table" (designs/perudo-spotlight-gallery.dc.html) — the waiting crew ring
 * the spotlight like seats around a barrel, so turn order *is* the circle. Real only during
 * BIDDING (same edge case as Linear): outside it, this falls back to `DefaultDashboard`'s own arc.
 * Static for Phase 3 (dashboard-switching plan) — positions simply recompute on turn change,
 * nothing animates yet (Phase 4).
 */
@Component({
  selector: 'app-clockwise-dashboard',
  standalone: true,
  imports: [ArcSeat, BidMarker, LocalHandZone, DefaultDashboard],
  templateUrl: './clockwise-dashboard.html',
  styleUrl: './clockwise-dashboard.scss',
})
export class ClockwiseDashboard {
  protected readonly store = inject(GameStore);
  protected readonly gameView = inject(GameView);

  protected readonly isBiddingPhase = computed(
    () => this.store.matchState()?.phase === GamePhase.BIDDING,
  );

  private readonly allPlayers = computed<readonly Player[]>(
    () => this.store.matchState()?.players ?? [],
  );

  /** The player currently bidding — the spotlight at the centre of the ring. Duplicated from
   * LinearDashboard rather than shared (dashboard-switching plan, decision 9: dashboards are free
   * to duplicate rather than abstract). */
  protected readonly spotlightPlayer = computed<Player | null>(() => {
    const id = this.gameView.currentBidderId();
    return id ? (this.allPlayers().find((p) => p.id === id) ?? null) : null;
  });

  /** Everyone else, in turn order starting with whoever answers next — the ring places index 0
   * just clockwise of the reserved bottom gap. */
  protected readonly waitingPlayers = computed<readonly Player[]>(() => {
    const state = this.store.matchState();
    const round = state?.round;
    const spotlightId = this.spotlightPlayer()?.id;
    if (!round || !spotlightId) {
      return [];
    }
    const order = round.turnOrder;
    const startIndex = order.indexOf(spotlightId);
    if (startIndex === -1) {
      return [];
    }
    const rotated: string[] = [];
    for (let i = 1; i < order.length; i += 1) {
      rotated.push(order[(startIndex + i) % order.length]);
    }
    const byId = new Map(this.allPlayers().map((p) => [p.id, p]));
    return rotated.map((id) => byId.get(id)).filter((p): p is Player => p !== undefined);
  });

  protected readonly nextUpPlayerId = computed(() => this.waitingPlayers()[0]?.id ?? null);

  /** Player-count scaling (decision 7) — continuous functions of the ring's own seat count, all
   * keyed to the same opponent count so the ring, the seats, and the hero card ease together. */
  protected readonly ringSeatSizePx = computed(() => ringSeatSizePx(this.waitingPlayers().length));
  protected readonly heroAvatarPx = computed(() =>
    lerp(HERO_AVATAR_MAX_PX, HERO_AVATAR_MIN_PX, this.waitingPlayers().length),
  );

  protected ringPosition(index: number): ArcPosition {
    return computeRingPosition(index, this.waitingPlayers().length);
  }

  /** Seats dim with distance from the light, but never the local player's own seat — "yours by
   * fill, not by size" holds at full opacity wherever it lands (designs/perudo-spotlight-
   * gallery.dc.html's own closing note). */
  protected seatOpacity(index: number, playerId: string): number {
    if (playerId === this.store.playerId()) {
      return 1;
    }
    const indexFromEnd = this.waitingPlayers().length - 1 - index;
    return ringSeatOpacity(indexFromEnd, this.waitingPlayers().length);
  }

  /** Deterministic decorative mark, matching ArcSeat's own initial — duplicated rather than
   * shared, same reasoning as LinearDashboard's own copy. */
  protected initialOf(nickname: string): string {
    return (nickname.trim()[0] ?? '?').toUpperCase();
  }
}
