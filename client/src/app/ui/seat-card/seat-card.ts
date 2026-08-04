import { Component, computed, input } from '@angular/core';
import { IonBadge, IonIcon } from '@ionic/angular/standalone';
import type { Player } from '@shared';
import { Die } from '../die/die';

export type SeatSize = 'large' | 'medium' | 'small';

@Component({
  selector: 'app-seat-card',
  standalone: true,
  imports: [IonBadge, IonIcon, Die],
  templateUrl: './seat-card.html',
})
export class SeatCard {
  readonly player = input.required<Player>();
  readonly isMe = input(false);
  readonly isCurrentBidder = input(false);
  readonly size = input<SeatSize>('medium');

  /** One placeholder per hidden die, for the face-down count shown for other players. */
  protected readonly hiddenDicePlaceholders = computed(() =>
    Array.from({ length: this.player().diceCount }),
  );
}
