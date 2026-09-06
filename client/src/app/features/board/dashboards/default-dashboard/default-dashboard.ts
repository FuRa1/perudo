import { Component, computed, inject } from '@angular/core';
import { IonButton } from '@ionic/angular/standalone';
import { LucideDices } from '@lucide/angular';
import { GamePhase, type Bid, type DiceValue, type Player } from '@shared';
import { GameStore } from '../../../../core/game-store';
import { GameView } from '../../../../core/game-view';
import { SocketService } from '../../../../core/socket.service';
import type { ArcSeatOpeningRoll } from '../../../../ui/arc-seat/arc-seat';
import { ArcSeat } from '../../../../ui/arc-seat/arc-seat';
import { OpeningRollPanel } from '../../../../ui/opening-roll-panel/opening-roll-panel';
import type { HandRollStatus } from '../../../../ui/seat-card/seat-card';
import { CARD_WIDTH_PX, SeatCard } from '../../../../ui/seat-card/seat-card';
import { LocalHandZone } from '../../../local-hand-zone/local-hand-zone';
import {
  ARC_TOP_PADDING_PX,
  CARD_GAP_PX,
  computeArcPosition,
  seatSizeFor,
} from '../../seat-geometry';

/** "Anne", "Anne and Mateo", "Anne, Mateo and Tobias" — the opening-roll tie caption never needs
 * an Oxford comma debate beyond this: at most a small handful of seats ever tie. */
function joinWithAnd(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? '';
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Today's board, unchanged — the compact mobile opponent arc plus the dead `hidden`
 * SeatCard/OpeningRollPanel desktop branches (moved here verbatim rather than cleaned up, per the
 * dashboard-switching plan's decision 9: touch Default as little as possible). `:host` MUST stay
 * `display: contents` — `.mobile-hand-zone`'s `margin-top: auto` and the shell's `gap-3` flex
 * rhythm require the arc/wager/hand/reveal to be direct children of `.table-layout__main`, not
 * boxed one level deeper by a normal block host.
 */
@Component({
  selector: 'app-default-dashboard',
  standalone: true,
  imports: [IonButton, LucideDices, SeatCard, ArcSeat, OpeningRollPanel, LocalHandZone],
  templateUrl: './default-dashboard.html',
  styleUrl: './default-dashboard.scss',
})
export class DefaultDashboard {
  protected readonly store = inject(GameStore);
  private readonly socket = inject(SocketService);
  protected readonly gameView = inject(GameView);

  protected readonly GamePhase = GamePhase;
  protected readonly arcTopPaddingPx = ARC_TOP_PADDING_PX;

  protected readonly allPlayers = computed<readonly Player[]>(
    () => this.store.matchState()?.players ?? [],
  );
  protected readonly me = this.store.me;

  protected readonly opponents = computed<readonly Player[]>(() => {
    const myId = this.store.playerId();
    return this.allPlayers().filter((p) => p.id !== myId);
  });

  protected readonly seatSize = computed(() => seatSizeFor(this.opponents().length));
  protected readonly opponentPositions = computed(() =>
    this.opponents().map((_, i) => computeArcPosition(i, this.opponents().length)),
  );
  protected readonly arcMinWidthPx = computed(() => {
    const width = CARD_WIDTH_PX[this.seatSize()];
    return this.opponents().length * (width + CARD_GAP_PX);
  });

  /** Presentation only: preserve seat order, with fuller rows nearest the viewer. */
  protected readonly opponentRows = computed<readonly (readonly Player[])[]>(() => {
    const players = this.opponents();
    if (players.length === 0) return [];
    const rowCount = players.length >= 9 ? 3 : players.length >= 5 ? 2 : 1;
    const rows: Player[][] = [];
    let offset = 0;
    for (let row = 0; row < rowCount; row += 1) {
      const size = Math.floor((players.length - offset) / (rowCount - row));
      rows.push(players.slice(offset, offset + size));
      offset += size;
    }
    return rows;
  });

  protected readonly currentBidderId = this.gameView.currentBidderId;

  /** Public opening-roll data is shown whenever either the live roll or its resolved, still
   * temporarily-retained result exists (2., "keep results visible through round 1 hand-rolling").
   * Desktop's separate OpeningRollPanel deliberately keeps using this broader flag. */
  protected readonly showOpeningRoll = computed(() => {
    const state = this.store.matchState();
    return !!state?.startRoll || !!state?.completedStartRoll;
  });

  /** Unlike showOpeningRoll above, the mobile arc's per-seat die slot must NOT linger once round 1
   * starts rolling hands — the reference's hand-roll frame shows compact roll status there
   * instead, never a stale opening die (each seat has only one state slot). */
  protected readonly isOpeningRollPhase = computed(
    () => this.store.matchState()?.phase === GamePhase.START_ROLL,
  );

  /** Tie caption for the mobile arc's mat status slot — inferred from `pendingPlayerIds` being a
   * strict subset of the roster, the same signal `START_ROLL_TIED` carries, without adding new
   * store plumbing for one caption line. Ambiguous only for a 2-player tie (subset === roster
   * there too) — the same known, accepted limit as OpeningRollPanel's own doc comment; harmless
   * since a 2-player START_ROLL is a re-roll of everyone either way. */
  protected readonly openingTieCaption = computed<string | null>(() => {
    const state = this.store.matchState();
    if (state?.phase !== GamePhase.START_ROLL || !state.startRoll) {
      return null;
    }
    const tiedIds = state.startRoll.pendingPlayerIds;
    if (tiedIds.length === 0 || tiedIds.length >= this.allPlayers().length) {
      return null;
    }
    const names = tiedIds.map((id) => this.gameView.nicknameFor(id));
    return `${joinWithAnd(names)} tied, casting again`;
  });

  /** Per-seat public opening-roll data for the mobile arc — null outside the opening-roll window
   * entirely, so ArcSeat never reserves a die-slot's worth of space once hand-rolling starts. */
  protected openingRollFor(playerId: string): ArcSeatOpeningRoll | null {
    if (!this.isOpeningRollPhase()) {
      return null;
    }
    const state = this.store.matchState();
    const value: DiceValue | null =
      state?.startRoll?.rolls[playerId] ?? state?.completedStartRoll?.rolls[playerId] ?? null;
    return { value, isWinner: state?.completedStartRoll?.firstPlayerId === playerId };
  }

  /** Per-player "rolled their hand / still waiting" status, only meaningful during ROUND_ROLLING. */
  protected readonly handRollStatusByPlayerId = computed<Readonly<
    Record<string, HandRollStatus>
  > | null>(() => {
    const state = this.store.matchState();
    if (!state || state.phase !== GamePhase.ROUND_ROLLING || !state.round) {
      return null;
    }
    const pending = new Set(state.round.pendingRolls);
    const map: Record<string, HandRollStatus> = {};
    for (const player of state.players) {
      map[player.id] = pending.has(player.id) ? 'waiting' : 'rolled';
    }
    return map;
  });

  protected handRollStatusFor(playerId: string): HandRollStatus | null {
    return this.handRollStatusByPlayerId()?.[playerId] ?? null;
  }

  protected currentBidFor(playerId: string): Bid | null {
    const record = this.gameView.latestBidRecord();
    return record && record.playerId === playerId ? record.bid : null;
  }

  /** Whether this seat is the one holding the round's standing wager — drives ArcSeat's
   * "Bid placed" pill. Gated on BIDDING so the pill clears the moment a round ends rather than
   * lingering over the reveal/next roll, and distinct from `currentBidderId()`, which is whose
   * *turn* it is. */
  protected hasStandingBidAt(playerId: string): boolean {
    if (this.store.matchState()?.phase !== GamePhase.BIDDING) {
      return false;
    }
    return this.gameView.latestBidRecord()?.playerId === playerId;
  }

  /** Dead desktop-only branches (decision 9: moved unchanged, not cleaned up) still reference
   * these two roll gates directly, duplicating `LocalHandZone`'s own copies. */
  protected readonly canRollOpeningDie = computed(() => {
    const state = this.store.matchState();
    const id = this.store.playerId();
    if (!state || !id || state.phase !== GamePhase.START_ROLL) {
      return false;
    }
    return state.startRoll?.pendingPlayerIds.includes(id) ?? false;
  });

  protected readonly canRollHand = computed(() => {
    const state = this.store.matchState();
    const id = this.store.playerId();
    if (!state || !id || state.phase !== GamePhase.ROUND_ROLLING) {
      return false;
    }
    return state.round?.pendingRolls.includes(id) ?? false;
  });

  protected roll(): void {
    this.socket.rollDice();
  }
}
