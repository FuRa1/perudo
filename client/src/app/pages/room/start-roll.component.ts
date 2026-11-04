import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameStore } from '@client/app/core/game.store';
import { DieComponent } from '@client/app/dice/die.component';
import { ShakeCupComponent } from '@client/app/dice/shake-cup.component';

/** Starting roll (5.2): everyone rolls one die openly; highest goes first, ties re-roll. */
@Component({
  selector: 'app-start-roll',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DieComponent, ShakeCupComponent],
  template: `
    <div class="mx-auto flex max-w-md flex-col items-center gap-5 text-center">
      <h2 class="text-xl font-bold">Who takes the helm?</h2>
      <p class="opacity-75">Everyone rolls one die in the open. Highest bids first.</p>

      @if (startRoll()?.previousTie) {
        <div class="rounded-lg bg-amber-500/20 p-3">
          Tie between {{ tiedNames() }} — they roll again.
        </div>
      }

      <ul class="flex w-full flex-col gap-2">
        @for (player of store.players(); track player.id) {
          <li class="flex items-center justify-between rounded-lg bg-black/20 px-4 py-2">
            <span>{{ player.nickname }}</span>
            @if (startRoll()?.rolls?.[player.id]; as value) {
              <app-die [value]="value" size="md" />
            } @else if (isPending(player.id)) {
              <span class="text-sm opacity-60">shaking…</span>
            } @else {
              <span class="text-sm opacity-40">waiting for the tie</span>
            }
          </li>
        }
      </ul>

      @if (isMePending()) {
        <app-shake-cup
          [isEnabled]="!store.isBusy()"
          label="Hold to shake, release to roll"
          (rolled)="handleRoll()"
        />
      }
    </div>
  `,
})
export class StartRollComponent {
  protected readonly store = inject(GameStore);
  protected readonly startRoll = computed(() => this.store.view()?.startRoll ?? null);
  protected readonly isMePending = computed(() => this.isPending(this.store.selfId()));
  protected readonly tiedNames = computed(() =>
    (this.startRoll()?.previousTie?.tiedPlayerIds ?? [])
      .map((id) => this.store.nickname(id))
      .join(', '),
  );

  protected isPending(playerId: string | null): boolean {
    return !!playerId && (this.startRoll()?.pendingPlayerIds.includes(playerId) ?? false);
  }

  protected handleRoll(): void {
    void this.store.rollDice();
  }
}
