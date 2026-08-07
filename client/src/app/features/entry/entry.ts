import { Component, inject, signal } from '@angular/core';
import { IonButton, IonContent, IonInput, IonItem, IonList } from '@ionic/angular/standalone';
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

@Component({
  selector: 'app-entry',
  standalone: true,
  imports: [IonContent, IonList, IonItem, IonInput, IonButton],
  templateUrl: './entry.html',
  styleUrl: './entry.scss',
})
export class Entry {
  private readonly socket = inject(SocketService);
  protected readonly roomId = signal('');
  protected readonly nickname = signal('');

  constructor() {
    this.socket.connect();
  }

  protected createRoom(): void {
    const nickname = this.nickname().trim();
    if (!nickname) {
      return;
    }
    this.socket.joinRoom(generateRoomCode(), nickname);
  }

  protected joinRoom(): void {
    const roomId = this.roomId().trim();
    const nickname = this.nickname().trim();
    if (!roomId || !nickname) {
      return;
    }
    this.socket.joinRoom(roomId, nickname);
  }
}
