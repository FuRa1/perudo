import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
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

/** Roughly the gallery's own "the bid lands, [it] holds for about 300ms" beat (designs/perudo-
 * spotlight-gallery.dc.html, "The handoff, in four beats") — how long the hero card's enter
 * animation (scale+fade) plays before settling, so the class binding driving it clears in time
 * for the next handoff rather than lingering statefully across turns. */
const HERO_ENTER_MS = 320;

/**
 * Variant B "Round the table" (designs/perudo-spotlight-gallery.dc.html) — the waiting crew ring
 * the spotlight like seats around a barrel, so turn order is the circle itself.
 * Real only during BIDDING (same edge case as Linear): outside it, this falls back to
 * `DefaultDashboard`'s own arc.
 *
 * Motion (Phase 4 of the dashboard-switching plan): the "seats move between slots" model (the
 * gallery's own literal drawing, chosen over "the ring rotates" since track-by-id already keeps
 * a remaining seat's DOM node stable across a re-sort — a plain CSS transition on its position is
 * enough, no rotation math needed). The hero card gets a scale+fade entrance instead of the
 * reference's literal fly-in from the ring edge: hero and ring are structurally different DOM
 * subtrees (a `SpotlightCard` sharing one continuous element with `ArcSeat` across the swap was
 * judged not worth building for this pass — see the plan's own status report), so there is no
 * single element to animate a path between. The remaining ring seats sliding to their new slots,
 * staggered by position, is what actually carries "the queue closes up" cue.
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
  private readonly destroyRef = inject(DestroyRef);

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

  /** Drives the hero card's brief scale+fade entrance (`.clockwise-hero--enter`) whenever the
   * spotlight actually changes hands — not on every render, which would replay it on unrelated
   * state changes (a bid being placed while the same player is still bidding, a dice-count
   * update). `effect()` here (not a `computed`) because this exists purely to schedule a
   * self-clearing timeout as a side effect; the class binding itself reads a plain signal. */
  protected readonly heroEntering = signal(false);
  private previousSpotlightId: string | null = null;

  constructor() {
    effect(() => {
      const id = this.spotlightPlayer()?.id ?? null;
      if (id === null || id === this.previousSpotlightId) {
        this.previousSpotlightId = id;
        return;
      }
      this.previousSpotlightId = id;
      this.heroEntering.set(true);
      const timeout = setTimeout(() => this.heroEntering.set(false), HERO_ENTER_MS);
      this.destroyRef.onDestroy(() => clearTimeout(timeout));
    });
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
