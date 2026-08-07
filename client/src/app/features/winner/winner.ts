import { Component, computed, inject } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { GameStore } from '../../core/game-store';

@Component({
  selector: 'app-winner',
  standalone: true,
  imports: [IonContent],
  templateUrl: './winner.html',
  styleUrl: './winner.scss',
})
export class Winner {
  private readonly store = inject(GameStore);

  protected readonly winnerName = computed(() => {
    const state = this.store.matchState();
    return state?.players.find((p) => p.id === state.winnerId)?.nickname ?? 'Unknown';
  });

  protected readonly isMe = computed(
    () => this.store.matchState()?.winnerId === this.store.playerId(),
  );

  /** Every player reaches this screen the same way (5.9) — winner and defeated alike need a
   * closing line, not just the winner. */
  protected readonly subtitle = computed(() =>
    this.isMe()
      ? 'Congratulations, you won the match.'
      : `The match is over — ${this.winnerName()} took the last die.`,
  );
}
