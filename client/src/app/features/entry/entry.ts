import { Component, inject, signal } from '@angular/core';
import { IonButton, IonContent, IonInput, IonItem, IonList } from '@ionic/angular/standalone';
import { SocketService } from '../../core/socket.service';

@Component({
  selector: 'app-entry',
  standalone: true,
  imports: [IonContent, IonList, IonItem, IonInput, IonButton],
  templateUrl: './entry.html',
})
export class Entry {
  private readonly socket = inject(SocketService);
  protected readonly roomId = signal('');
  protected readonly nickname = signal('');

  constructor() {
    this.socket.connect();
  }

  protected join(): void {
    const roomId = this.roomId().trim();
    const nickname = this.nickname().trim();
    if (!roomId || !nickname) {
      return;
    }
    this.socket.joinRoom(roomId, nickname);
  }
}
