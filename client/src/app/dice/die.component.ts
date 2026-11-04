import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { DiceValue } from '@shared';
import { DICE_FACES } from './dice.config';

export type DieSize = 'sm' | 'md' | 'lg';

/** Flat 2D die drawn from {@link DICE_FACES}. `value: null` draws a face-down (hidden) die. */
@Component({
  selector: 'app-die',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      [class]="'die die--' + size()"
      [class.die--hidden]="!face()"
      role="img"
      [attr.aria-label]="face()?.label ?? 'Hidden die'"
    >
      @if (face(); as f) {
        @for (pip of f.pips; track $index) {
          <span class="pip" [style.grid-row]="pip.row" [style.grid-column]="pip.col"></span>
        }
        @if (f.skull; as skull) {
          <span class="skull" [style.grid-row]="skull.row" [style.grid-column]="skull.col">☠</span>
        }
      } @else {
        <span class="hidden-mark">?</span>
      }
    </div>
  `,
  styles: `
    .die {
      display: inline-grid;
      grid-template: repeat(3, 1fr) / repeat(3, 1fr);
      place-items: center;
      aspect-ratio: 1;
      border-radius: 18%;
      background: radial-gradient(circle at 30% 25%, #f8f0dc, #d9c79f);
      border: 1px solid #8a6d3b;
      box-shadow:
        inset 0 -2px 3px rgb(0 0 0 / 0.25),
        0 1px 2px rgb(0 0 0 / 0.4);
      padding: 12%;
    }
    .die--sm {
      width: 1.5rem;
    }
    .die--md {
      width: 2.5rem;
    }
    .die--lg {
      width: 3.5rem;
    }
    .die--hidden {
      background: linear-gradient(135deg, #5b3a1e, #3b2410);
      border-color: #2a180a;
    }
    .pip {
      width: 70%;
      aspect-ratio: 1;
      border-radius: 50%;
      background: #2b1d0e;
    }
    .skull {
      font-size: 0.7em;
      line-height: 1;
      color: #2b1d0e;
    }
    .die--lg .skull {
      font-size: 1em;
    }
    .hidden-mark {
      grid-area: 2 / 2;
      color: #c9a86a;
      font-weight: 700;
      font-size: 0.8em;
    }
  `,
})
export class DieComponent {
  readonly value = input<DiceValue | null>(null);
  readonly size = input<DieSize>('md');

  protected readonly face = computed(() => {
    const value = this.value();
    return value ? DICE_FACES[value] : null;
  });
}
