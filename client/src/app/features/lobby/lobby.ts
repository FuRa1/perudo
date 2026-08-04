import { Component, computed, inject } from '@angular/core';
import {
  IonBadge,
  IonButton,
  IonContent,
  IonIcon,
  IonItem,
  IonList,
} from '@ionic/angular/standalone';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [IonContent, IonList, IonItem, IonBadge, IonButton, IonIcon],
  templateUrl: './lobby.html',
})
export class Lobby {
  private readonly store = inject(GameStore);
  private readonly socket = inject(SocketService);

  protected readonly players = computed(() => this.store.matchState()?.players ?? []);
  protected readonly roomId = computed(() => this.store.matchState()?.roomId ?? '');
  protected readonly me = this.store.me;

  protected toggleReady(): void {
    const me = this.me();
    if (!me) {
      return;
    }
    this.socket.setReady(!me.isReady);
  }
}
