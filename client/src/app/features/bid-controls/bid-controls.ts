import { Component, computed, effect, inject, signal } from '@angular/core';
import { IonButton } from '@ionic/angular/standalone';
import { LucideHand } from '@lucide/angular';
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
  imports: [IonButton, LucideHand, BidPicker, BidSuggestion],
  templateUrl: './bid-controls.html',
  styleUrl: './bid-controls.scss',
})
export class BidControls {
  private readonly store = inject(GameStore);
  private readonly socket = inject(SocketService);

  protected readonly quantity = signal(1);
  protected readonly face = signal<DiceValue>(DEFAULT_FACE);

  protected readonly isMyTurn = this.store.isMyTurn;
  protected readonly currentPlayer = computed(() => {
    const round = this.store.matchState()?.round;
    if (!round) {
      return null;
    }
    const currentPlayerId = round.turnOrder[round.currentTurnIndex];
    const players = this.store.matchState()?.players ?? [];
    return players.find((p) => p.id === currentPlayerId) ?? null;
  });
  protected readonly currentPlayerName = computed(() => this.currentPlayer()?.nickname ?? null);
  /** The waiting status bar's "X answers next" line (design's status-bar spec) — the next seat in
   * turnOrder after the current one, wrapping around. Deliberately not "next player after me
   * specifically" — turnOrder is the single source of truth for who goes when. */
  protected readonly nextPlayerName = computed(() => {
    const round = this.store.matchState()?.round;
    if (!round || round.turnOrder.length === 0) {
      return null;
    }
    const nextIndex = (round.currentTurnIndex + 1) % round.turnOrder.length;
    const nextPlayerId = round.turnOrder[nextIndex];
    const players = this.store.matchState()?.players ?? [];
    return players.find((p) => p.id === nextPlayerId)?.nickname ?? null;
  });
  /** Deterministic decorative mark, not a real avatar (CLAUDE.md 3.5/5.1) — same convention as
   * ArcSeat's own identity tile. */
  protected readonly currentPlayerInitial = computed(() =>
    (this.currentPlayer()?.nickname.trim()[0] ?? '?').toUpperCase(),
  );
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

  constructor() {
    // Whenever the authoritative bidding context changes (someone placed a bid, a special round
    // was declared, a new round started, ...), snap the picker's local quantity/face back to the
    // cheapest legal raise for that new context. Without this, a stale quantity/face left over
    // from a previous turn can silently become illegal the moment it's this player's turn again,
    // showing a "Not a legal raise" message the player never actually caused — this keeps the
    // picker starting from a legal bid, while still letting the player freely edit it (and
    // genuinely see "Not a legal raise" if *they* dial in something illegal).
    effect(() => {
      const suggestion = cheapestLegalBid(this.context());
      this.quantity.set(suggestion.quantity);
      this.face.set(bidToFaceValue(suggestion));
    });
  }

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
