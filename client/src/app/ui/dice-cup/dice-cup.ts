import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { DiceValue } from '@shared';
import { DIE_SIZE_PX } from '../die/die-size.config';
import { Die } from '../die/die';
import type { SeatSize } from '../seat-card/seat-card';
import {
  CUP_SIZE_PX,
  DICE_CUP_CSS_CLASS,
  DIE_GAP_PX,
  INNER_BOWL_RATIO,
  OWNER_CUP_FALLBACK_PX,
} from './dice-cup.config';
import { computeFinalLayout, type CupBounds } from './dice-layout';

interface DieView {
  readonly transform: string;
  readonly face: DiceValue;
}

/**
 * A stylized 2D dice-cup renderer (client presentation only — CLAUDE.md 8.2/3.5): a static open
 * cup for the owner once their hand is dealt, or a static closed cup for everyone else. `dice`
 * is the sole source of truth for what's shown — there is no cosmetic pre-roll animation here,
 * only the server-authoritative result.
 */
@Component({
  selector: 'app-dice-cup',
  standalone: true,
  imports: [Die],
  templateUrl: './dice-cup.html',
  styleUrl: './dice-cup.scss',
})
export class DiceCup {
  /** The local player's authoritative dice, once known — null/empty means "not dealt yet". */
  readonly dice = input<readonly DiceValue[] | null>(null);
  readonly diceCount = input.required<number>();
  readonly isOwner = input(false);
  readonly size = input<SeatSize>('medium');

  private readonly ownerCupEl = viewChild<ElementRef<HTMLElement>>('ownerCupEl');

  protected readonly cssClass = DICE_CUP_CSS_CLASS;
  protected readonly dieSizePx = DIE_SIZE_PX.table;
  /** The owner's cup is sized by CSS (`.dice-cup-owner-shell`, a `clamp()`); this signal mirrors
   * whatever the browser actually rendered (via ResizeObserver) so the resting layout always
   * matches reality instead of a guessed number. Falls back to a sane default before the first
   * measurement lands. */
  private readonly measuredOwnerSizePx = signal<number | null>(null);
  protected readonly cupSizePx = computed(() =>
    this.isOwner()
      ? (this.measuredOwnerSizePx() ?? OWNER_CUP_FALLBACK_PX)
      : CUP_SIZE_PX[this.size()],
  );
  /** The visible inner-bowl inset, matching INNER_BOWL_RATIO so the drawn bowl lines up with
   * where dice are actually laid out. CSS `inset` shorthand takes `vertical horizontal`. */
  protected readonly innerBowlInset = computed(() => {
    const yPercent = (1 - INNER_BOWL_RATIO.y) * 50;
    const xPercent = (1 - INNER_BOWL_RATIO.x) * 50;
    return `${yPercent}% ${xPercent}%`;
  });

  protected readonly dieViews = computed<readonly DieView[]>(() => {
    const values = this.dice();
    if (!this.isOwner() || !values || values.length === 0) {
      return [];
    }
    const positions = computeFinalLayout(
      values.length,
      this.bounds(),
      this.dieHalfSize(),
      DIE_GAP_PX,
    );
    return values.map((face, i) => {
      const position = positions[i] ?? { x: 0, y: 0 };
      return {
        // The -50%/-50% centers the die square on its layout position (the wrapper itself is
        // positioned with its top-left corner at the cup's exact center, `left-1/2 top-1/2`).
        transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
        face,
      };
    });
  });

  private readonly destroyRef = inject(DestroyRef);
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    effect(() => this.observeOwnerCupSize(this.ownerCupEl()));
    this.destroyRef.onDestroy(() => this.resizeObserver?.disconnect());
  }

  private observeOwnerCupSize(elRef: ElementRef<HTMLElement> | undefined): void {
    if (!elRef || this.resizeObserver || typeof ResizeObserver === 'undefined') {
      return;
    }
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const measured = Math.min(entry.contentRect.width, entry.contentRect.height);
      if (measured > 0) {
        this.measuredOwnerSizePx.set(measured);
      }
    });
    this.resizeObserver.observe(elRef.nativeElement);
  }

  private bounds(): CupBounds {
    const radius = this.cupSizePx() / 2;
    return { radiusX: radius * INNER_BOWL_RATIO.x, radiusY: radius * INNER_BOWL_RATIO.y };
  }

  private dieHalfSize(): number {
    return this.dieSizePx / 2;
  }
}
