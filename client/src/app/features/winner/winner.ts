import { Component, computed, inject } from '@angular/core';
import { IonButton, IonContent } from '@ionic/angular/standalone';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';
import { VISUAL_ASSETS_CONFIG } from '../../ui/visual-assets/visual-assets.config';

@Component({
  selector: 'app-winner',
  standalone: true,
  imports: [IonButton, IonContent],
  templateUrl: './winner.html',
  styleUrl: './winner.scss',
})
export class Winner {
  private readonly store = inject(GameStore);
  private readonly socket = inject(SocketService);

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

  /** The reference gives the winner their own kicker ("The table is yours") rather than the same
   * neutral label everyone sees; the defeated keep the neutral one. */
  protected readonly kicker = computed(() =>
    this.isMe() ? 'The table is yours' : 'Match complete',
  );

  /** Without this the screen is a dead end — the stored reconnect token outlives the match, so a
   * reload just restores the same finished game. */
  protected leave(): void {
    this.socket.leaveMatch();
  }
}
