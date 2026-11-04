import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { RULES_CONFIG, type JoinedRoom } from '@shared';
import { GameStore } from '@client/app/core/game.store';

const NICKNAME_KEY = 'perudo.nickname';

/** Entry screen (5.1): pick a nickname, then create a room or join one by code or link. */
@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    IonButton,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonList,
    IonNote,
    IonTitle,
    IonToolbar,
  ],
  templateUrl: './home.page.html',
})
export class HomePage {
  protected readonly store = inject(GameStore);
  private readonly router = inject(Router);

  protected readonly limits = RULES_CONFIG.room;
  protected readonly nickname = signal(localStorage.getItem(NICKNAME_KEY) ?? '');
  protected readonly roomCode = signal(
    inject(ActivatedRoute).snapshot.queryParamMap.get('room')?.toUpperCase() ?? '',
  );

  protected readonly hasNickname = computed(() => this.nickname().trim().length > 0);
  protected readonly hasRoomCode = computed(
    () => this.roomCode().trim().length === RULES_CONFIG.room.codeLength,
  );

  protected async handleCreate(): Promise<void> {
    this.rememberNickname();
    await this.enter(await this.store.createRoom(this.nickname().trim()));
  }

  protected async handleJoin(): Promise<void> {
    this.rememberNickname();
    const code = this.roomCode().trim().toUpperCase();
    await this.enter(await this.store.joinRoom(code, this.nickname().trim()));
  }

  private async enter(joined: JoinedRoom | null): Promise<void> {
    if (joined) {
      await this.router.navigate(['/room', joined.roomId]);
    }
  }

  private rememberNickname(): void {
    localStorage.setItem(NICKNAME_KEY, this.nickname().trim());
  }
}
