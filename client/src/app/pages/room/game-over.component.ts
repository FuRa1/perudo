import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonButton } from '@ionic/angular/standalone';
import { GameStore } from '@client/app/core/game.store';
import { RoundResultComponent } from './round-result.component';

/** Match over (5.9): the last pirate with dice wins. */
@Component({
  selector: 'app-game-over',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonButton, RoundResultComponent],
  template: `
    <div class="mx-auto flex max-w-md flex-col items-center gap-5 pt-6 text-center">
      <div class="text-6xl" aria-hidden="true">🏆</div>
      <h2 class="text-3xl font-bold">{{ winnerName() }} wins!</h2>
      <p class="opacity-75">
        {{ isWinner() ? 'The treasure is yours, captain.' : 'Better luck on the next voyage.' }}
      </p>
      @if (store.view()?.lastResult; as result) {
        <app-round-result class="w-full" [result]="result" />
      }
      <ion-button expand="block" (click)="handleBackToHarbor()">Back to the harbor</ion-button>
    </div>
  `,
})
export class GameOverComponent {
  protected readonly store = inject(GameStore);
  protected readonly winnerName = computed(() => this.store.nickname(this.store.view()?.winnerId));
  protected readonly isWinner = computed(() => this.store.view()?.winnerId === this.store.selfId());

  protected handleBackToHarbor(): void {
    this.store.leave();
  }
}
