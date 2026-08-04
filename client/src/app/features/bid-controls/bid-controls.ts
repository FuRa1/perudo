import { Component, computed, inject, signal } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import {
  cheapestLegalBid,
  isLegalBid,
  minimumAceSwitchBid,
  minimumNormalSwitchBid,
  type Bid,
  type BidScaleContext,
  type DiceValue,
  type NormalBid,
  type NormalFace,
} from '@shared';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';
import { BidPicker } from '../../ui/bid-picker/bid-picker';
import { bidToFaceValue, faceValueToBid } from '../../ui/bid-picker/bid-face.util';
import { BidSuggestion } from '../../ui/bid-suggestion/bid-suggestion';

const DEFAULT_FACE: DiceValue = 2;

@Component({
  selector: 'app-bid-controls',
  standalone: true,
  imports: [IonButton, IonIcon, BidPicker, BidSuggestion],
  templateUrl: './bid-controls.html',
})
export class BidControls {
  private readonly store = inject(GameStore);
  private readonly socket = inject(SocketService);

  protected readonly quantity = signal(1);
  protected readonly face = signal<DiceValue>(DEFAULT_FACE);

  protected readonly isMyTurn = this.store.isMyTurn;
  protected readonly canCallLiar = computed(
    () => (this.store.matchState()?.round?.bidHistory.length ?? 0) > 0,
  );
  protected readonly canDeclareSpecialRound = computed(() => {
    const round = this.store.matchState()?.round;
    const me = this.store.me();
    return (
      !!round &&
      !round.isSpecialRoundDeclared &&
      round.bidHistory.length === 0 &&
      me?.diceCount === 1
    );
  });

  protected readonly context = computed<BidScaleContext>(() => {
    const round = this.store.matchState()?.round;
    const bidHistory = round?.bidHistory ?? [];
    const lastRecord = bidHistory[bidHistory.length - 1];
    const lastNormalRecord = [...bidHistory].reverse().find((r) => r.bid.kind === 'NORMAL');
    return {
      lastBid: lastRecord?.bid ?? null,
      lastNormalBid: (lastNormalRecord?.bid as NormalBid | undefined) ?? null,
      isSpecialRound: round?.isSpecialRoundDeclared ?? false,
    };
  });

  /** 5.5: once a special round's first bid fixes the face, later bids can't change it — lock the
   * picker to that face regardless of whatever `face` was last set to before the lock kicked in. */
  protected readonly isFaceLocked = computed(
    () => this.context().isSpecialRound && this.context().lastBid !== null,
  );
  protected readonly displayedFace = computed<DiceValue>(() => {
    const lastBid = this.context().lastBid;
    return this.isFaceLocked() && lastBid ? bidToFaceValue(lastBid) : this.face();
  });

  protected readonly candidateBid = computed<Bid>(() =>
    faceValueToBid(this.displayedFace(), this.quantity()),
  );
  protected readonly isValid = computed(() => isLegalBid(this.candidateBid(), this.context()));

  protected readonly minimumSuggestion = computed(() => cheapestLegalBid(this.context()));
  protected readonly aceSwitchSuggestion = computed(() => minimumAceSwitchBid(this.context()));
  /** Which normal face "switch to a face" targets — whatever the picker currently shows, or a
   * sensible default (2) while the picker itself is showing aces. */
  protected readonly normalSwitchTargetFace = computed<NormalFace>(() => {
    const face = this.displayedFace();
    return face === 1 ? 2 : face;
  });
  protected readonly normalSwitchSuggestion = computed(() =>
    minimumNormalSwitchBid(this.context(), this.normalSwitchTargetFace()),
  );

  protected onQuantityChange(quantity: number): void {
    this.quantity.set(quantity);
  }

  protected onFaceChange(face: DiceValue): void {
    if (!this.isFaceLocked()) {
      this.face.set(face);
    }
  }

  /** A suggestion updates the picker to match it, then submits that exact bid immediately — but
   * only when it's actually legal and my turn; the server remains the real authority either way
   * (6.6) and the UI stays pessimistic — nothing here mutates match state locally. */
  protected applySuggestion(bid: Bid): void {
    this.quantity.set(bid.quantity);
    this.face.set(bidToFaceValue(bid));
    if (this.isMyTurn() && isLegalBid(bid, this.context())) {
      this.socket.placeBid(bid);
    }
  }

  protected placeBid(): void {
    if (this.isMyTurn() && this.isValid()) {
      this.socket.placeBid(this.candidateBid());
    }
  }

  protected callLiar(): void {
    if (this.isMyTurn()) {
      this.socket.callLiar();
    }
  }

  protected declareSpecialRound(): void {
    this.socket.declareSpecialRound();
  }
}
