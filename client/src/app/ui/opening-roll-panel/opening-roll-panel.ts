import { Component, computed, input } from '@angular/core';
import { IonBadge } from '@ionic/angular/standalone';
import type { CompletedStartRoll, DiceValue, Player, StartRollState } from '@shared';
import { Die } from '../die/die';
import { DIE_SIZE_PX } from '../die/die-size.config';

type OpeningRollStatus = 'waiting' | 'rolling' | 'rolled';

interface OpeningRollRow {
  readonly playerId: string;
  readonly nickname: string;
  readonly status: OpeningRollStatus;
  readonly value: DiceValue | null;
  readonly isWinner: boolean;
}

/**
 * Public opening-roll board (5.2) — every player's "waiting / rolling / rolled" state and, once
 * resolved, who starts round 1. Purely presentational: no SocketService/GameStore injection, it
 * only reads the inputs Table hands it.
 *
 * Note: for 3+ players, someone eliminated from an earlier tie (before the shown sub-round) has
 * no entry in either `startRoll` or `completedStartRoll` and reads as "waiting" here — the
 * engine only ever retains the decisive sub-round's map (CompletedStartRoll), by design (see
 * game-engine.ts). Harmless for the 2-player case this is chiefly fixing, where every player is
 * always part of every sub-round.
 */
@Component({
  selector: 'app-opening-roll-panel',
  standalone: true,
  imports: [Die, IonBadge],
  templateUrl: './opening-roll-panel.html',
})
export class OpeningRollPanel {
  protected readonly dieSizePx = DIE_SIZE_PX.openingRoll;

  readonly players = input.required<readonly Player[]>();
  readonly startRoll = input<StartRollState | null>(null);
  readonly completedStartRoll = input<CompletedStartRoll | null>(null);
  readonly rollingPlayerIds = input<ReadonlySet<string>>(new Set());

  protected readonly rows = computed<readonly OpeningRollRow[]>(() => {
    const live = this.startRoll();
    const completed = this.completedStartRoll();
    const rolling = this.rollingPlayerIds();
    return this.players().map((player): OpeningRollRow => {
      const value = live?.rolls[player.id] ?? completed?.rolls[player.id] ?? null;
      const isRolling = rolling.has(player.id);
      const status: OpeningRollStatus = isRolling
        ? 'rolling'
        : value !== null
          ? 'rolled'
          : 'waiting';
      return {
        playerId: player.id,
        nickname: player.nickname,
        status,
        value,
        isWinner: completed?.firstPlayerId === player.id,
      };
    });
  });
}
