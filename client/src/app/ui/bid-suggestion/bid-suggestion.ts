import { Component, computed, input, output } from '@angular/core';
import type { Bid } from '@shared';
import { Die } from '../die/die';
import { DIE_SIZE_PX } from '../die/die-size.config';
import { bidToFaceValue } from '../bid-picker/bid-face.util';

/**
 * A one-click bid suggestion (5.8) — shows the actual bid shape ("4 × [die]"), never bare text.
 * `bid` is null when the suggestion isn't currently available (e.g. no normal bid to convert
 * from); `disabled` additionally covers "not my turn" — either way the button stays visibly
 * unavailable and clicking it does nothing.
 */
@Component({
  selector: 'app-bid-suggestion',
  standalone: true,
  imports: [Die],
  templateUrl: './bid-suggestion.html',
  styleUrl: './bid-suggestion.scss',
})
export class BidSuggestion {
  protected readonly dieSizePx = DIE_SIZE_PX.picker;

  readonly label = input.required<string>();
  readonly bid = input<Bid | null>(null);
  readonly disabled = input(false);

  readonly bidSelected = output<Bid>();

  protected readonly isUnavailable = computed(() => this.disabled() || !this.bid());
  protected readonly diceValueOf = bidToFaceValue;

  protected onClick(): void {
    const bid = this.bid();
    if (bid && !this.isUnavailable()) {
      this.bidSelected.emit(bid);
    }
  }
}
