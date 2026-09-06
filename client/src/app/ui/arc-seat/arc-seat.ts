import { Component, computed, input } from '@angular/core';
import type { DiceValue, Player } from '@shared';
import { Die } from '../die/die';
import type { HandRollStatus } from '../seat-card/seat-card';

/** Non-null only during the opening roll (5.2) — the public per-seat die slot this input drives
 * has no reason to exist outside that window (hand dice stay private, drawn by handRollStatus
 * instead). `value` is null while the seat is still waiting to cast. */
export interface ArcSeatOpeningRoll {
  readonly value: DiceValue | null;
  readonly isWinner: boolean;
}

export const ARC_SEAT_WIDTH_PX = 84;
export const ARC_SEAT_ACTIVE_WIDTH_PX = 104;
/** 9-12 player stress case (Increment 5) — both arcs use this narrower width/tile floor instead
 * of the regular tier above, so two rows of up to six each still fit without horizontal scroll. */
export const ARC_SEAT_COMPACT_WIDTH_PX = 58;

/** How many distinct identity-tile variants exist (arc-seat.scss's `.arc-seat__tile--0..4`) — a
 * restrained set of gradient-angle tweaks, not a color palette, so no two opponents' tiles look
 * like the exact same stamped-out block without relying on hue to tell them apart (identity
 * itself is always the initial letter + nickname, never the tile alone). */
const TILE_VARIANT_COUNT = 5;

/** Simple, stable string hash (not cryptographic — just needs to be deterministic and roughly
 * even) so the same player always lands on the same tile variant across reconnects/re-renders. */
function hashToVariant(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % TILE_VARIANT_COUNT;
}

/**
 * Compact mobile opponent seat (Increment 2, designs/perudo-mobile-board.dc.html) — a 54x54
 * identity tile, nickname, and one small state slot. Deliberately not a re-skinned SeatCard: no
 * Ionic "Bidding" badge, no dice-cup visual, no bid marker — the wager token (Increment 4) is a
 * standalone element floating on the mat itself, not squeezed into an 84px-wide seat column.
 */
@Component({
  selector: 'app-arc-seat',
  standalone: true,
  imports: [Die],
  templateUrl: './arc-seat.html',
  styleUrl: './arc-seat.scss',
})
export class ArcSeat {
  readonly player = input.required<Player>();
  readonly isCurrentBidder = input(false);
  readonly handRollStatus = input<HandRollStatus | null>(null);
  readonly openingRoll = input<ArcSeatOpeningRoll | null>(null);
  /** True for the one seat that owns the standing wager (designs/mobile-lantern.dc.html's
   * "BID PLACED" pill) — which is *not* the same seat as `isCurrentBidder` (whose turn it is), so
   * both can be true, both false, or one of each depending on where the turn has moved to. */
  readonly hasStandingBid = input(false);
  /** 58px/42px tier for the 9-12 player two-arc layout (Increment 5), instead of the regular
   * 84px/54px tier used up to 8 players. */
  readonly compact = input(false);
  /** The inset "back" arc row in the two-arc layout (Increment 5) — visually subordinate to the
   * front row, same idea as the desktop tiers' size steps but expressed as opacity here since
   * both arcs already share the same (compact) size. */
  readonly subdued = input(false);
  /** Additive (dashboard-switching plan, Decision 6): the local player gets a seat in the new
   * Clockwise/Linear layouts, same size as everyone else's, filled terracotta (`--color-terracotta`,
   * the role colour already used for the lobby roster's local-player avatar) against opponents'
   * translucent-cream tile. `DefaultDashboard` never passes this input, so Default is untouched.
   * A different channel from `isCurrentBidder`'s brass halo, so a seat can be yours *and* bidding
   * with no ambiguity — see the tile's own local-player override for how the two combine. */
  readonly isLocalPlayer = input(false);

  protected readonly isEliminated = computed(() => this.player().diceCount === 0);

  /** One dot per die this seat still holds (designs/mobile-lantern.dc.html renders exactly this
   * under every name) — the only place the mobile board shows an opponent's remaining dice count,
   * which a player genuinely needs to reason about a bid. An empty array for an eliminated seat,
   * so the dashed tile + struck-through name carry that state alone, same as the reference. */
  protected readonly diceDots = computed(() =>
    Array.from({ length: this.player().diceCount }, (_, i) => i),
  );

  /** See the template comment: no dots on an eliminated seat (nothing to count) and none during
   * the opening roll (every seat still holds a full hand, and the public die slot occupies that
   * same row). */
  protected readonly showDiceDots = computed(
    () => !this.isEliminated() && this.openingRoll() === null,
  );

  /** Deterministic decorative mark, not a real avatar (CLAUDE.md 3.5/5.1) — same convention as
   * Lobby's roster tile, just larger and on the dark table surface. */
  protected readonly initial = computed(() =>
    (this.player().nickname.trim()[0] ?? '?').toUpperCase(),
  );

  /** Restrained per-player tile variant (see TILE_VARIANT_COUNT) — a geometric/gradient tweak,
   * not a hue swap, so it reads as "an intentional set of carved tiles" rather than either
   * identical stamps or a color-coded legend. */
  protected readonly tileVariantClass = computed(
    () => `arc-seat__tile--v${hashToVariant(this.player().id)}`,
  );
}
