import { Component, input } from '@angular/core';
import type { ServerEvent } from '@shared';
import type { RevealRow } from '../../core/game-view';
import { Die } from '../die/die';

type RoundRevealedEvent = Extract<ServerEvent, { type: 'ROUND_REVEALED' }>;

/**
 * Mobile reveal panel (Increment 5) — claimed-vs-actual plus every revealed hand, in the same
 * board context as the rest of the mobile table. Shell-owned (dashboard-switching plan, decision
 * 2), rendered identically across Default/Clockwise/Linear. Purely input()-driven: `BoardShell`
 * resolves every derived string via `GameView` and hands them down, so this component never
 * touches `GameStore` itself.
 */
@Component({
  selector: 'app-mobile-reveal-panel',
  standalone: true,
  imports: [Die],
  templateUrl: './mobile-reveal-panel.html',
  styleUrl: './mobile-reveal-panel.scss',
})
export class MobileRevealPanel {
  readonly reveal = input.required<RoundRevealedEvent>();
  readonly rows = input.required<readonly RevealRow[]>();
  readonly bidderNickname = input.required<string>();
  readonly claimedBidText = input.required<string>();
  readonly lossSentence = input.required<string>();
  readonly isSpecialRound = input(false);
  readonly nextRoundSummary = input<string | null>(null);
}
