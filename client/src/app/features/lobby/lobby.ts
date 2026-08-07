import { Component, computed, inject } from '@angular/core';
import { IonBadge, IonButton, IonContent } from '@ionic/angular/standalone';
import { LucideCheck } from '@lucide/angular';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [IonContent, IonBadge, IonButton, LucideCheck],
  templateUrl: './lobby.html',
  styleUrl: './lobby.scss',
})
export class Lobby {
  private readonly store = inject(GameStore);
  private readonly socket = inject(SocketService);

  protected readonly players = computed(() => this.store.matchState()?.players ?? []);
  protected readonly roomId = computed(() => this.store.matchState()?.roomId ?? '');
  protected readonly me = this.store.me;
  protected readonly playerId = this.store.playerId;

  protected readonly readyCount = computed(() => this.players().filter((p) => p.isReady).length);
  protected readonly allReady = computed(
    () => this.players().length > 0 && this.readyCount() === this.players().length,
  );

  protected toggleReady(): void {
    const me = this.me();
    if (!me) {
      return;
    }
    this.socket.setReady(!me.isReady);
  }

  /** The roster has no avatars (CLAUDE.md 3.5) — a nickname-derived initial on a fixed, repeating
   * gradient tile gives each row "enough visual distinction" (this task's own words) without
   * inventing a real avatar system. Deterministic from the nickname alone, so it never needs to
   * be stored or synced. */
  protected initialFor(nickname: string): string {
    return (nickname.trim()[0] ?? '?').toUpperCase();
  }
}
