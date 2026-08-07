import { Component, computed, effect, inject, signal } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonInput,
  IonItem,
  IonList,
  IonSpinner,
} from '@ionic/angular/standalone';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';

// Excludes visually-ambiguous characters (0/O, 1/I/L) — this is a shareable room code, not
// game-fairness RNG (6.4 only governs dice), so plain Math.random() is fine here.
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateRoomCode(length = 5): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

type PendingAction = 'create' | 'join' | null;

@Component({
  selector: 'app-entry',
  standalone: true,
  imports: [IonContent, IonList, IonItem, IonInput, IonButton, IonSpinner],
  templateUrl: './entry.html',
  styleUrl: './entry.scss',
})
export class Entry {
  protected readonly store = inject(GameStore);
  private readonly socket = inject(SocketService);
  protected readonly roomId = signal('');
  protected readonly nickname = signal('');

  /** Which action is currently awaiting a server response, if any — drives the loading state on
   * whichever button was actually pressed. Purely presentational: the real join is still only
   * ever confirmed by the server's 'joined'/'error' events (6.6), this never assumes success. */
  protected readonly pendingAction = signal<PendingAction>(null);
  protected readonly connected = this.store.connected;

  protected readonly canCreate = computed(() => !!this.nickname().trim());
  protected readonly canJoin = computed(() => !!this.nickname().trim() && !!this.roomId().trim());

  constructor() {
    this.socket.connect();
    // A returned error (e.g. the room was full) means the attempt already failed — stop showing
    // a loading state so the player can see the error and try again. Success needs no matching
    // reset here: app.html swaps this whole component out the moment playerId() is set.
    effect(() => {
      if (this.store.lastError()) {
        this.pendingAction.set(null);
      }
    });
  }

  protected createRoom(): void {
    if (!this.canCreate()) {
      return;
    }
    this.pendingAction.set('create');
    this.socket.joinRoom(generateRoomCode(), this.nickname().trim());
  }

  protected joinRoom(): void {
    if (!this.canJoin()) {
      return;
    }
    this.pendingAction.set('join');
    this.socket.joinRoom(this.roomId().trim(), this.nickname().trim());
  }
}
