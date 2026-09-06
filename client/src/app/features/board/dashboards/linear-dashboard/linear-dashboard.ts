import { Component, computed, inject } from '@angular/core';
import { GamePhase, type Player } from '@shared';
import { GameStore } from '../../../../core/game-store';
import { GameView } from '../../../../core/game-view';
import { ArcSeat } from '../../../../ui/arc-seat/arc-seat';
import { BidMarker } from '../../../../ui/bid-marker/bid-marker';
import { LocalHandZone } from '../../../local-hand-zone/local-hand-zone';
import { DefaultDashboard } from '../default-dashboard/default-dashboard';

/** Cards past this point in the waiting rail collapse into the trailing "+N more" pill rather
 * than scrolling forever — designs/perudo-spotlight-gallery.dc.html's own A-12P panel keeps
 * roughly this many whole cards in view before its fade/pin treatment takes over; a plain count
 * pill is this phase's simplified stand-in for that fuller scroll-and-pin choreography. */
const VISIBLE_RAIL_SEATS = 5;

/**
 * Variant A "Below deck" (designs/perudo-spotlight-gallery.dc.html) — whoever is bidding sits
 * large and lit in the centre; everyone else waits in a horizontal rail below, in turn order.
 * Real only during BIDDING (dashboard-switching plan, edge case "non-bidding phases"): outside
 * it, this falls back to `DefaultDashboard`'s own arc, since the gallery never designed a
 * START_ROLL/ROUND_ROLLING composition for this layout.
 */
@Component({
  selector: 'app-linear-dashboard',
  standalone: true,
  imports: [ArcSeat, BidMarker, LocalHandZone, DefaultDashboard],
  templateUrl: './linear-dashboard.html',
  styleUrl: './linear-dashboard.scss',
})
export class LinearDashboard {
  protected readonly store = inject(GameStore);
  protected readonly gameView = inject(GameView);

  protected readonly isBiddingPhase = computed(
    () => this.store.matchState()?.phase === GamePhase.BIDDING,
  );

  private readonly allPlayers = computed<readonly Player[]>(
    () => this.store.matchState()?.players ?? [],
  );

  /** The player currently bidding — the spotlight. Only meaningful during BIDDING; the template
   * only reads this inside the BIDDING branch. */
  protected readonly spotlightPlayer = computed<Player | null>(() => {
    const id = this.gameView.currentBidderId();
    return id ? (this.allPlayers().find((p) => p.id === id) ?? null) : null;
  });

  /** Everyone else, in turn order starting with whoever answers next — the rail reads left to
   * right like a manifest, "NEXT" first (designs/perudo-spotlight-gallery.dc.html, Variant A). */
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

  protected readonly visibleWaitingPlayers = computed(() =>
    this.waitingPlayers().slice(0, VISIBLE_RAIL_SEATS),
  );

  protected readonly overflowCount = computed(() =>
    Math.max(0, this.waitingPlayers().length - VISIBLE_RAIL_SEATS),
  );

  /** Whoever is first in the rail is next to act — the one seat that gets the rail's own "NEXT"
   * highlight (reusing ArcSeat's existing active-seat treatment for a distinct meaning: not "whose
   * turn is it" but "who answers next", since the actual current bidder is in the spotlight, not
   * the rail, and never appears in this list). */
  protected readonly nextUpPlayerId = computed(() => this.waitingPlayers()[0]?.id ?? null);

  /** Deterministic decorative mark, matching ArcSeat's own initial (CLAUDE.md 3.5/5.1: no real
   * avatar in the MVP). Duplicated here rather than shared — the spotlight's hero avatar is a
   * different size/composition entirely, not an ArcSeat instance (decision 10: ArcSeat's own
   * internals — 84px tile, no bid breakdown — don't fit a hero card carrying an inline bid). */
  protected initialOf(nickname: string): string {
    return (nickname.trim()[0] ?? '?').toUpperCase();
  }
}
