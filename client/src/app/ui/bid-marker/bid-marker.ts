import { Component, computed, input } from '@angular/core';
import type { Bid } from '@shared';
import { Die } from '../die/die';
import { bidToFaceValue } from '../bid-picker/bid-face.util';

/**
 * The current claim, rendered visually (quantity × die face) rather than as text — used to mark
 * the active bid next to whichever seat card placed it. Purely presentational: no store/socket
 * injection, no knowledge of whose turn it is or where it's positioned — the parent decides that
 * (SeatCard renders it inline in its own layout, never as a floating overlay, so it can never
 * cover the nickname/cup/badges it sits alongside).
 */
@Component({
  selector: 'app-bid-marker',
  standalone: true,
  imports: [Die],
  templateUrl: './bid-marker.html',
  styleUrl: './bid-marker.scss',
})
export class BidMarker {
  readonly bid = input.required<Bid>();
  /** 'default' fits inline next to a seat card's own nickname/cup/badges (SeatCard, the round-loss
   * verdict card); 'prominent' matches the reference's standalone mat token (mobile-lantern.dc.html:
   * a 50px die), used only where the marker itself is the focal point of the screen — the mobile
   * wager token, not embedded in any other card. */
  readonly size = input<'default' | 'prominent'>('default');

  protected readonly faceValue = computed(() => bidToFaceValue(this.bid()));
}
