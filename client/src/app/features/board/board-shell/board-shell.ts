import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { GamePhase } from '@shared';
import { GameStore } from '../../../core/game-store';
import { GameView } from '../../../core/game-view';
import { LayoutStore } from '../../../core/layout.store';
import { TurnTimer } from '../../../ui/turn-timer/turn-timer';
import { MobileRevealPanel } from '../../../ui/mobile-reveal-panel/mobile-reveal-panel';
import { WagerToken } from '../../../ui/wager-token/wager-token';
import { BidControls } from '../../bid-controls/bid-controls';
import { RoundLossModal } from '../../round-loss-modal/round-loss-modal';
import { ClockwiseDashboard } from '../dashboards/clockwise-dashboard/clockwise-dashboard';
import { DefaultDashboard } from '../dashboards/default-dashboard/default-dashboard';
import { LinearDashboard } from '../dashboards/linear-dashboard/linear-dashboard';

/**
 * The frame around a swappable board (dashboard-switching plan). Owns everything that renders
 * identically across Default/Clockwise/Linear (decision 2): the mobile header/switcher, the
 * wager token, the mobile reveal panel, the bid rail, and `RoundLossModal`. The opponent
 * arrangement itself is delegated to whichever `LayoutStore.activeLayout()` names, via a static
 * `@switch` (full compile-time type checking, and simpler than `NgComponentOutlet` at three
 * fixed layouts).
 */
@Component({
  selector: 'app-board-shell',
  standalone: true,
  imports: [
    IonContent,
    TurnTimer,
    WagerToken,
    MobileRevealPanel,
    BidControls,
    RoundLossModal,
    DefaultDashboard,
    LinearDashboard,
    ClockwiseDashboard,
  ],
  templateUrl: './board-shell.html',
  styleUrl: './board-shell.scss',
})
export class BoardShell {
  protected readonly store = inject(GameStore);
  protected readonly gameView = inject(GameView);
  protected readonly layoutStore = inject(LayoutStore);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly GamePhase = GamePhase;

  /** Live height of the fixed bid tray, so .table-surface can reserve exactly that much bottom
   * padding instead of a hand-tuned constant. The tray is `position: fixed`, so it contributes
   * nothing to flow and the surface has to reserve the space itself; the old constant (420px) was
   * measured once against a taller build of the tray and had drifted ~85px above its real height,
   * which showed up as a band of empty mat between the player's dice and the tray. */
  private readonly bidSheet = viewChild<ElementRef<HTMLElement>>('bidSheet');
  protected readonly bidSheetHeightPx = signal(0);

  constructor() {
    // `bidSheet` is a signal and the tray lives inside an @if, so an effect re-runs on its own
    // whenever the element appears, disappears, or is replaced — no polling needed. The observer
    // then tracks height changes within one element's lifetime (the tray grows/shrinks as the
    // suggestion row wraps or the waiting bar swaps in).
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.target.getBoundingClientRect();
      this.bidSheetHeightPx.set(rect ? Math.ceil(rect.height) : 0);
    });
    this.destroyRef.onDestroy(() => observer.disconnect());

    effect((onCleanup) => {
      const el = this.bidSheet()?.nativeElement;
      if (!el) {
        this.bidSheetHeightPx.set(0);
        return;
      }
      observer.observe(el);
      this.bidSheetHeightPx.set(Math.ceil(el.getBoundingClientRect().height));
      onCleanup(() => observer.unobserve(el));
    });
  }

  /** Whether the standalone wager token has anything to show — BIDDING with a bid on the table.
   * Computed once here (rather than each dashboard re-deriving it) since it also drives
   * `.table-layout__main`'s own grid-row formula (former `:has(.mobile-wager-token)` CSS check,
   * now a plain class binding since the token moved into its own component). */
  protected readonly showWagerToken = computed(
    () =>
      this.store.matchState()?.phase === GamePhase.BIDDING &&
      this.gameView.latestBidRecord() !== null,
  );

  /** One size step down at the 9-12 player stress case (Increment 5) — the wager token's own
   * `compact` input, resolved here since the shell (not any one dashboard) owns that instance. */
  protected readonly wagerTokenCompact = computed(() => {
    const totalPlayers = this.store.matchState()?.players.length ?? 1;
    return totalPlayers - 1 >= 5;
  });
}
