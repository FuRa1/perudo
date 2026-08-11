import { Component, computed, inject } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { GameStore } from '../../core/game-store';
import { VISUAL_ASSETS_CONFIG } from '../../ui/visual-assets/visual-assets.config';

@Component({
  selector: 'app-winner',
  standalone: true,
  imports: [IonContent],
  templateUrl: './winner.html',
  styleUrl: './winner.scss',
})
export class Winner {
  private readonly store = inject(GameStore);

  /** decor/badge-won.png — unset falls back to the CSS dashed-roundel placeholder (winner.html's
   * `@if`, same swap pattern as ui/die/die.ts). */
  protected readonly badgeImageUrl = VISUAL_ASSETS_CONFIG.badgeWon.imageUrl;

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
