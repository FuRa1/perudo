import { Component, input } from '@angular/core';
import type { Bid } from '@shared';
import { BidMarker } from '../bid-marker/bid-marker';

/**
 * The current claim, floating on the mat itself (Increment 4) — shell-owned (dashboard-switching
 * plan, decision 2), rendered identically across Default/Clockwise/Linear. Purely input()-driven:
 * `BoardShell` owns the visibility check (BIDDING phase + a standing bid) and resolves the caption
 * via `GameView`; this component only ever renders what it's handed.
 */
@Component({
  selector: 'app-wager-token',
  standalone: true,
  imports: [BidMarker],
  templateUrl: './wager-token.html',
  styleUrl: './wager-token.scss',
})
export class WagerToken {
  readonly bid = input.required<Bid>();
  readonly caption = input.required<string>();
  /** One size step down at the 9-12 player stress case (Increment 5) — the token itself has no
   * size variant of its own, so this scales the whole thing down rather than duplicating it. */
  readonly compact = input(false);
}
