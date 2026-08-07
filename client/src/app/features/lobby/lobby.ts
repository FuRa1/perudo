import { Component, computed, inject } from '@angular/core';
import { IonBadge, IonButton, IonContent, IonItem, IonList } from '@ionic/angular/standalone';
import { LucideCheck } from '@lucide/angular';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [IonContent, IonList, IonItem, IonBadge, IonButton, LucideCheck],
  templateUrl: './lobby.html',
  styleUrl: './lobby.scss',
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
