import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { IonButton } from '@ionic/angular/standalone';
import { type Bid, type DiceValue } from '@shared';
import {
  ALL_FACES,
  bidFromInput,
  computeBidHints,
  describeBid,
  faceOf,
  isInputLegal,
} from '@client/app/core/bid-hints';
import { GameStore } from '@client/app/core/game.store';
import { DieComponent } from '@client/app/dice/die.component';

/**
 * The bid interface (5.8): one-click hints plus free input, pre-validated locally on every
 * change with the same shared function the server re-runs on submit.
 */
@Component({
  selector: 'app-bid-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DieComponent, IonButton],
  templateUrl: './bid-panel.component.html',
})
export class BidPanelComponent {
  protected readonly store = inject(GameStore);
  protected readonly faces = ALL_FACES;
  protected readonly describeBid = describeBid;

  protected readonly hints = computed(() => {
    const context = this.store.bidContext();
    return context ? computeBidHints(context) : null;
  });

  /** Free input starts at the minimum legal bid and resets whenever the table moves on. */
  protected readonly quantity = linkedSignal(() => this.hints()?.minimum.quantity ?? 1);
  protected readonly face = linkedSignal<DiceValue>(() => {
    const minimum = this.hints()?.minimum;
    return minimum ? faceOf(minimum) : 2;
  });

  protected readonly isLegal = computed(() => {
    const context = this.store.bidContext();
    return !!context && isInputLegal(this.quantity(), this.face(), context);
  });
  protected readonly inputBid = computed(() => bidFromInput(this.quantity(), this.face()));
  protected readonly hasBidToChallenge = computed(() => !!this.store.lastBid());

  protected handleQuantityStep(delta: number): void {
    this.quantity.update((q) => Math.max(1, q + delta));
  }

  protected handleFaceSelect(face: DiceValue): void {
    this.face.set(face);
  }

  protected handleBidSubmit(bid: Bid | null): void {
    if (bid) {
      void this.store.placeBid(bid);
    }
  }

  protected handleCallLiar(): void {
    void this.store.callLiar();
  }
}
