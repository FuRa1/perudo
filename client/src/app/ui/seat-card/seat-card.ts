import { Component, input } from '@angular/core';
import { IonBadge, IonIcon } from '@ionic/angular/standalone';
import type { Player } from '@shared';
import { DiceCup } from '../dice-cup/dice-cup';

export type SeatSize = 'large' | 'medium' | 'small';
export type HandRollStatus = 'waiting' | 'rolled';

/** Single source of truth for opponent card width per size tier — Table's arc-layout math
 * reads this too, so the spacing it computes always matches what SeatCard actually renders. */
export const CARD_WIDTH_PX: Record<SeatSize, number> = { large: 140, medium: 104, small: 76 };

/** My own card must be at least this wide even before I've rolled anything — as prominent as a
 * large opponent card, never shrunk to fit "(not rolled)" text (8.3: own seat is the prominent
 * one, not the other way around). */
const MIN_MY_CARD_WIDTH_PX = CARD_WIDTH_PX.large + 10;

@Component({
  selector: 'app-seat-card',
  standalone: true,
  imports: [IonBadge, IonIcon, DiceCup],
  templateUrl: './seat-card.html',
})
export class SeatCard {
  readonly player = input.required<Player>();
  readonly isMe = input(false);
  readonly isCurrentBidder = input(false);
  readonly size = input<SeatSize>('medium');
  /** null outside ROUND_ROLLING — Table only sets this while hand-rolling is in progress. */
  readonly handRollStatus = input<HandRollStatus | null>(null);
  /** Cosmetic-only "currently rolling" cue (8.2) — never implies a value; forwarded straight to
   * the dice cup, which is the only place that decides what a roll animation actually looks
   * like (SeatCard has no rendering logic of its own for dice anymore). */
  readonly isRolling = input(false);

  protected readonly minMyCardWidthPx = MIN_MY_CARD_WIDTH_PX;
}
