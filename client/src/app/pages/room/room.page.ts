import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonTitle,
  IonToast,
  IonToolbar,
} from '@ionic/angular/standalone';
import { GamePhase } from '@shared';
import { GameStore } from '@client/app/core/game.store';
import { GameOverComponent } from './game-over.component';
import { LobbyComponent } from './lobby.component';
import { StartRollComponent } from './start-roll.component';
import { TableComponent } from './table.component';

/** One route for the whole match; which screen shows is decided by the server's phase. */
@Component({
  selector: 'app-room-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GameOverComponent,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonTitle,
    IonToast,
    IonToolbar,
    LobbyComponent,
    StartRollComponent,
    TableComponent,
  ],
  templateUrl: './room.page.html',
})
export class RoomPage {
  protected readonly store = inject(GameStore);
  protected readonly GamePhase = GamePhase;
  private readonly router = inject(Router);

  constructor() {
    // No snapshot means no seat (fresh load, or the connection dropped): back to the harbor.
    effect(() => {
      if (!this.store.view()) {
        void this.router.navigate(['/']);
      }
    });
  }

  protected handleLeave(): void {
    this.store.leave();
  }
}
