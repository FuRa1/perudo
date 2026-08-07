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

  protected readonly faceValue = computed(() => bidToFaceValue(this.bid()));
}
