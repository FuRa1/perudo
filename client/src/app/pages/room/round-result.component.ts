import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import type { RoundResultView } from '@shared';
import { describeBid } from '@client/app/core/bid-hints';
import { GameStore } from '@client/app/core/game.store';
import { DieComponent } from '@client/app/dice/die.component';

/** What happened when the last round ended: the reveal (5.3) or a timeout (5.7). */
@Component({
  selector: 'app-round-result',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DieComponent],
  template: `
    @let r = result();
    <div class="rounded-2xl border border-amber-500/40 bg-black/30 p-4">
      @if (r.kind === 'REVEAL') {
        <div class="text-center">
          <div class="text-sm opacity-70">Round {{ r.roundNumber }} revealed</div>
          <div>
            {{ store.nickname(r.callerId) }} called liar on {{ store.nickname(r.bidderId) }}'s
            <strong>{{ describeBid(r.claimedBid) }}</strong>
          </div>
          <div class="mt-1 text-lg">
            There were <strong>{{ r.actualQuantity }}</strong>
            @if (r.wasSpecialRound) {
              <span class="text-sm opacity-70">(special round: aces not wild)</span>
            }
          </div>
          <div class="mt-1 font-semibold text-red-300">
            {{ store.nickname(r.loserId) }} loses a die
          </div>
        </div>
        <ul class="mt-3 flex flex-col gap-1">
          @for (player of store.players(); track player.id) {
            @if (r.dice[player.id]; as dice) {
              <li class="flex items-center gap-2">
                <span class="w-24 truncate text-sm">{{ player.nickname }}</span>
                @for (value of dice; track $index) {
                  <app-die [value]="value" size="sm" />
                }
              </li>
            }
          }
        </ul>
      } @else {
        <div class="text-center">
          {{ store.nickname(r.playerId) }} ran out of time —
          {{ r.isDieLost ? 'loses a die.' : 'protected from a second loss in a row.' }}
        </div>
      }
    </div>
  `,
})
export class RoundResultComponent {
  readonly result = input.required<RoundResultView>();
  protected readonly store = inject(GameStore);
  protected readonly describeBid = describeBid;
}
