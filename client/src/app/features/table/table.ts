import { Component, computed, inject } from '@angular/core';
import { IonBadge, IonButton, IonContent, IonItem, IonList } from '@ionic/angular/standalone';
import { GamePhase, type Bid } from '@shared';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';
import { BidControls } from '../bid-controls/bid-controls';

function describeBid(bid: Bid): string {
  return bid.kind === 'ACE' ? `${bid.quantity} aces` : `${bid.quantity} × face ${bid.face}`;
}

@Component({
  selector: 'app-table',
  standalone: true,
  imports: [IonContent, IonList, IonItem, IonBadge, IonButton, BidControls],
  templateUrl: './table.html',
})
export class Table {
  protected readonly store = inject(GameStore);
  private readonly socket = inject(SocketService);

  protected readonly GamePhase = GamePhase;
  protected readonly describeBid = describeBid;

  protected readonly players = computed(() => this.store.matchState()?.players ?? []);
  protected readonly currentBidderId = computed(() => {
    const round = this.store.matchState()?.round;
    return round ? round.turnOrder[round.currentTurnIndex] : null;
  });

  protected readonly canRoll = computed(() => {
    const state = this.store.matchState();
    const id = this.store.playerId();
    if (!state || !id) {
      return false;
    }
    if (state.phase === GamePhase.START_ROLL) {
      return state.startRoll?.pendingPlayerIds.includes(id) ?? false;
    }
    if (state.phase === GamePhase.ROUND_ROLLING) {
      return state.round?.pendingRolls.includes(id) ?? false;
    }
    return false;
  });

  protected readonly reveal = this.store.lastReveal;

  protected roll(): void {
    this.socket.rollDice();
  }
}
