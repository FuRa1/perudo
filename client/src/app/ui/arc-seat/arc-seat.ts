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

  protected readonly isEliminated = computed(() => this.player().diceCount === 0);

  /** Deterministic decorative mark, not a real avatar (CLAUDE.md 3.5/5.1) — same convention as
   * Lobby's roster tile, just larger and on the dark table surface. */
  protected readonly initial = computed(() =>
    (this.player().nickname.trim()[0] ?? '?').toUpperCase(),
  );
}
