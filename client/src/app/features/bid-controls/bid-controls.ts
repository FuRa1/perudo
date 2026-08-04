import { Component, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonInput,
  IonItem,
  IonList,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';
import {
  aceBid,
  cheapestLegalBid,
  isLegalBid,
  minimumAceSwitchBid,
  minimumNormalSwitchBid,
  normalBid,
  type Bid,
  type BidScaleContext,
  type NormalBid,
  type NormalFace,
} from '@shared';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';

const NORMAL_FACES: readonly NormalFace[] = [2, 3, 4, 5, 6];

@Component({
  selector: 'app-bid-controls',
  standalone: true,
  imports: [IonList, IonItem, IonInput, IonSelect, IonSelectOption, IonButton],
  templateUrl: './bid-controls.html',
})
export class BidControls {
  private readonly store = inject(GameStore);
  private readonly socket = inject(SocketService);

  protected readonly normalFaces = NORMAL_FACES;
  protected readonly quantity = signal(1);
  protected readonly face = signal<NormalFace | 'ACE'>(2);

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

  protected readonly candidateBid = computed<Bid>(() => {
    const face = this.face();
    return face === 'ACE' ? aceBid(this.quantity()) : normalBid(this.quantity(), face);
  });

  protected readonly isValid = computed(() => isLegalBid(this.candidateBid(), this.context()));
  protected readonly aceSwitchBid = computed(() => minimumAceSwitchBid(this.context()));
  protected readonly normalSwitchBid = computed(() => {
    const face = this.face();
    return face === 'ACE' ? null : minimumNormalSwitchBid(this.context(), face);
  });

  protected setQuantity(value: string | number | null | undefined): void {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      this.quantity.set(parsed);
    }
  }

  protected setFace(value: string | number | null | undefined): void {
    if (value === 'ACE') {
      this.face.set('ACE');
      return;
    }
    const parsed = Number(value);
    if (NORMAL_FACES.includes(parsed as NormalFace)) {
      this.face.set(parsed as NormalFace);
    }
  }

  protected useMinimumBid(): void {
    this.applyHint(cheapestLegalBid(this.context()));
  }

  protected useAceSwitch(): void {
    const bid = this.aceSwitchBid();
    if (bid) {
      this.applyHint(bid);
    }
  }

  protected useNormalSwitch(): void {
    const bid = this.normalSwitchBid();
    if (bid) {
      this.applyHint(bid);
    }
  }

  private applyHint(bid: Bid): void {
    this.quantity.set(bid.quantity);
    this.face.set(bid.kind === 'ACE' ? 'ACE' : bid.face);
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
