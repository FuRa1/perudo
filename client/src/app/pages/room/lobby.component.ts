import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IonBadge, IonButton, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';
import { RULES_CONFIG } from '@shared';
import { GameStore } from '@client/app/core/game.store';

/** Lobby (5.1): who's aboard, who's ready. The match starts once everyone is ready. */
@Component({
  selector: 'app-lobby',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonBadge, IonButton, IonItem, IonLabel, IonList],
  template: `
    <div class="mx-auto flex max-w-md flex-col gap-4">
      <div class="rounded-xl bg-black/20 p-4 text-center">
        <div class="text-sm opacity-70">Room code</div>
        <div class="text-4xl font-bold tracking-[0.3em]">{{ store.view()?.roomId }}</div>
        <div class="mt-2 break-all text-xs opacity-70">{{ shareLink() }}</div>
        <ion-button size="small" fill="clear" (click)="handleCopyLink()"
          >Copy invite link</ion-button
        >
      </div>

      <ion-list inset>
        @for (player of store.players(); track player.id) {
          <ion-item>
            <ion-label>
              {{ player.nickname }}
              @if (player.id === store.selfId()) {
                <span class="opacity-60">(you)</span>
              }
            </ion-label>
            <ion-badge slot="end" [color]="player.isReady ? 'success' : 'medium'">
              {{ player.isReady ? 'Ready' : 'Waiting' }}
            </ion-badge>
          </ion-item>
        }
      </ion-list>

      <p class="text-center text-sm opacity-70">
        {{ store.players().length }} / {{ players.max }} pirates ·
        @if (store.players().length < players.min) {
          need at least {{ players.min }} to sail
        } @else {
          sails when everyone is ready
        }
      </p>

      <ion-button
        expand="block"
        [color]="isReady() ? 'medium' : 'success'"
        [disabled]="store.isBusy()"
        (click)="handleToggleReady()"
      >
        {{ isReady() ? 'Not ready yet' : "I'm ready" }}
      </ion-button>
    </div>
  `,
})
export class LobbyComponent {
  protected readonly store = inject(GameStore);
  protected readonly players = RULES_CONFIG.players;
  protected readonly isReady = computed(() => this.store.me()?.isReady ?? false);
  protected readonly shareLink = computed(
    () => `${window.location.origin}/?room=${this.store.view()?.roomId ?? ''}`,
  );

  protected handleToggleReady(): void {
    void this.store.setReady(!this.isReady());
  }

  protected handleCopyLink(): void {
    void navigator.clipboard?.writeText(this.shareLink());
  }
}
