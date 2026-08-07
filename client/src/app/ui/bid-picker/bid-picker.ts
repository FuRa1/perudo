import { Component, input, output } from '@angular/core';
import type { DiceValue } from '@shared';
import { Die } from '../die/die';
import { DIE_SIZE_PX } from '../die/die-size.config';
import { cycleFace } from './bid-face.util';

const MIN_QUANTITY = 1;

/**
 * Compact quantity × face picker (5.8) — purely presentational. It knows nothing about Bid,
 * GameStore, or SocketService; it only reports the selected quantity/face and lets the parent
 * decide what to do with them. The face is always a die value 1..6 (1 = ace) rendered via the
 * same <app-die> the rest of the table uses, never text like "2" or "Aces (wild)".
 */
@Component({
  selector: 'app-bid-picker',
  standalone: true,
  imports: [Die],
  templateUrl: './bid-picker.html',
  styleUrl: './bid-picker.scss',
})
export class BidPicker {
  protected readonly dieSizePx = DIE_SIZE_PX.picker;

  readonly quantity = input.required<number>();
  readonly face = input.required<DiceValue>();
  /** Disables both steppers entirely (e.g. it isn't this player's turn). */
  readonly disabled = input(false);
  /** Disables only the face stepper (special round, once a bid has fixed the face — 5.5). */
  readonly faceDisabled = input(false);

  readonly quantityChange = output<number>();
  readonly faceChange = output<DiceValue>();

  protected canDecrementQuantity(): boolean {
    return !this.disabled() && this.quantity() > MIN_QUANTITY;
  }

  protected incrementQuantity(): void {
    if (!this.disabled()) {
      this.quantityChange.emit(this.quantity() + 1);
    }
  }

  protected decrementQuantity(): void {
    if (this.canDecrementQuantity()) {
      this.quantityChange.emit(this.quantity() - 1);
    }
  }

  protected canChangeFace(): boolean {
    return !this.disabled() && !this.faceDisabled();
  }

  protected incrementFace(): void {
    if (this.canChangeFace()) {
      this.faceChange.emit(cycleFace(this.face(), 1));
    }
  }

  protected decrementFace(): void {
    if (this.canChangeFace()) {
      this.faceChange.emit(cycleFace(this.face(), -1));
    }
  }

  protected onQuantityWheel(event: WheelEvent): void {
    if (this.disabled()) {
      return;
    }
    event.preventDefault();
    if (event.deltaY < 0) {
      this.incrementQuantity();
    } else if (event.deltaY > 0) {
      this.decrementQuantity();
    }
  }

  protected onFaceWheel(event: WheelEvent): void {
    if (!this.canChangeFace()) {
      return;
    }
    event.preventDefault();
    if (event.deltaY < 0) {
      this.incrementFace();
    } else if (event.deltaY > 0) {
      this.decrementFace();
    }
  }

  protected onQuantityKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.incrementQuantity();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.decrementQuantity();
    }
  }

  protected onFaceKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.incrementFace();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.decrementFace();
    }
  }
}
