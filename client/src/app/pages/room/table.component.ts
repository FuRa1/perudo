import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonButton } from '@ionic/angular/standalone';
import { GamePhase, type PublicPlayerView } from '@shared';
import { describeBid } from '@client/app/core/bid-hints';
import { GameStore } from '@client/app/core/game.store';
import { DieComponent } from '@client/app/dice/die.component';
import { ShakeCupComponent } from '@client/app/dice/shake-cup.component';
import { BidPanelComponent } from './bid-panel.component';
import { RoundResultComponent } from './round-result.component';

/**
 * The table (8.3, basic layout): the other seats across the top in seating order starting
 * after you (scrolling sideways when crowded), the bidding in the middle, you at the bottom.
 */
@Component({
  selector: 'app-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BidPanelComponent, DieComponent, IonButton, RoundResultComponent, ShakeCupComponent],
  templateUrl: './table.component.html',
})
export class TableComponent {
  protected readonly store = inject(GameStore);
  protected readonly describeBid = describeBid;

  protected readonly round = this.store.round;
  protected readonly isRolling = computed(() => this.store.phase() === GamePhase.ROUND_ROLLING);
  protected readonly isMePendingRoll = computed(
    () => this.round()?.pendingRolls.includes(this.store.selfId() ?? '') ?? false,
  );
  protected readonly currentPlayerName = computed(() =>
    this.store.nickname(this.round()?.currentPlayerId),
  );
  protected readonly recentBids = computed(() =>
    [...(this.round()?.bidHistory ?? [])].reverse().slice(1, 6),
  );
  protected readonly startRollWinner = computed(() => {
    const view = this.store.view();
    return view?.round?.roundNumber === 1 ? this.store.nickname(view.startRollWinnerId) : null;
  });

  /** Everyone but you, in seating order starting with the seat after yours. */
  protected readonly otherSeats = computed<PublicPlayerView[]>(() => {
    const players = this.store.players();
    const selfIndex = players.findIndex((p) => p.id === this.store.selfId());
    return [...players.slice(selfIndex + 1), ...players.slice(0, Math.max(selfIndex, 0))];
  });

  protected hiddenDice(count: number): null[] {
    return Array.from({ length: count }, () => null);
  }

  protected isCurrent(playerId: string): boolean {
    return this.round()?.currentPlayerId === playerId;
  }

  protected isPendingRoll(playerId: string): boolean {
    return this.round()?.pendingRolls.includes(playerId) ?? false;
  }

  protected handleRoll(): void {
    void this.store.rollDice();
  }

  protected handleDeclareSpecialRound(): void {
    void this.store.declareSpecialRound();
  }
}
