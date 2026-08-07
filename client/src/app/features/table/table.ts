import { Component, computed, inject } from '@angular/core';
import { IonButton, IonContent } from '@ionic/angular/standalone';
import { LucideDice5 } from '@lucide/angular';
import { GamePhase, type Bid, type BidRecord, type Player } from '@shared';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';
import { OpeningRollPanel } from '../../ui/opening-roll-panel/opening-roll-panel';
import type { HandRollStatus, SeatSize } from '../../ui/seat-card/seat-card';
import { CARD_WIDTH_PX, SeatCard } from '../../ui/seat-card/seat-card';
import { BidControls } from '../bid-controls/bid-controls';
import { RoundLossModal } from '../round-loss-modal/round-loss-modal';

const UNKNOWN_PLAYER_LABEL = 'Unknown player';

interface ArcPosition {
  readonly left: string;
  readonly top: string;
}

/**
 * Table layout (8.3): my seat is fixed bottom-center; everyone else is spread across the top
 * arc of an oval, left to right — a plain sine curve rather than exact ellipse trigonometry,
 * which reads the same visually and is simpler to reason about than a full parametric ellipse.
 */
function computeArcPosition(index: number, count: number): ArcPosition {
  if (count <= 1) {
    return { left: '50%', top: '18%' };
  }
  const marginPct = 10;
  const x = index / (count - 1);
  const left = marginPct + x * (100 - marginPct * 2);
  const archTopMin = 4;
  const archDepth = 26;
  const top = archTopMin + archDepth * (1 - Math.sin(Math.PI * x));
  return { left: `${left}%`, top: `${top}%` };
}

/** Shrink proportionally as the table fills up (8.3); the arc container widens past this point
 * so cards stop shrinking below a legible floor and the row scrolls horizontally instead. */
function seatSizeFor(opponentCount: number): SeatSize {
  if (opponentCount <= 4) {
    return 'large';
  }
  if (opponentCount <= 7) {
    return 'medium';
  }
  return 'small';
}

const CARD_GAP_PX = 12;

/** Fixes the known vertical-clipping bug: the arc's own sine curve (computeArcPosition) puts the
 * topmost seat's *center* as little as 4% down the arc box, and each card is centered on that
 * point via `-translate-y-1/2` — so a card's upper half can extend well above the arc box's own
 * y=0. Harmless on its own, except the arc sits inside a horizontally-scrolling wrapper, and
 * setting `overflow-x` on an element forces `overflow-y` to compute to `auto` too (a CSS quirk,
 * not a bug we can select our way out of) — so that clipped region was actually being cut off
 * rather than merely overflowing visibly. Padding the scroll wrapper by more than the tallest
 * seat card's own half-height (large tier, with a current-bid marker showing) gives every card
 * room to render in full before the scrollable box's content even starts. One constant for every
 * tier rather than a tighter per-tier value: simpler to reason about and verify, and the small
 * amount of extra headroom at smaller tiers matches the arc's own generous space in the design. */
const ARC_TOP_PADDING_PX = 140;

function describeBid(bid: Bid): string {
  return bid.kind === 'ACE' ? `${bid.quantity} aces` : `${bid.quantity} × face ${bid.face}`;
}

@Component({
  selector: 'app-table',
  standalone: true,
  imports: [
    IonContent,
    IonButton,
    LucideDice5,
    SeatCard,
    OpeningRollPanel,
    BidControls,
    RoundLossModal,
  ],
  templateUrl: './table.html',
  styleUrl: './table.scss',
})
export class Table {
  protected readonly store = inject(GameStore);
  private readonly socket = inject(SocketService);

  protected readonly GamePhase = GamePhase;
  protected readonly describeBid = describeBid;
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

  protected readonly currentBidderId = computed(() => {
    const round = this.store.matchState()?.round;
    return round ? round.turnOrder[round.currentTurnIndex] : null;
  });

  /** The most recently placed bid this round, or null once history is empty (round just ended
   * or just started) — drives the on-table bid marker (2.). Presentation-only; no game logic. */
  protected readonly latestBidRecord = computed<BidRecord | null>(() => {
    const history = this.store.matchState()?.round?.bidHistory;
    return history && history.length > 0 ? history[history.length - 1] : null;
  });
  protected readonly latestBidderId = computed(() => this.latestBidRecord()?.playerId ?? null);

  /** Bid history is public-by-rule and only ever holds player ids (1.) — nicknames are a
   * client-only presentation concern, resolved here rather than in /shared. */
  protected nicknameFor(playerId: string): string {
    if (playerId === this.store.playerId()) {
      return 'You';
    }
    return this.allPlayers().find((p) => p.id === playerId)?.nickname ?? UNKNOWN_PLAYER_LABEL;
  }

  /** Public opening-roll data is shown whenever either the live roll or its resolved, still
   * temporarily-retained result exists (2., "keep results visible through round 1 hand-rolling"). */
  protected readonly showOpeningRoll = computed(() => {
    const state = this.store.matchState();
    return !!state?.startRoll || !!state?.completedStartRoll;
  });

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

  /** Public opening die (5.2) — not tied to a cup, so its roll button stays in the general
   * table area rather than under any one seat. */
  protected readonly canRollOpeningDie = computed(() => {
    const state = this.store.matchState();
    const id = this.store.playerId();
    if (!state || !id || state.phase !== GamePhase.START_ROLL) {
      return false;
    }
    return state.startRoll?.pendingPlayerIds.includes(id) ?? false;
  });

  /** Private hand roll (5.3) — only the local player can ever roll their own hand, so this
   * button is placed directly under their own cup rather than anyone else's. */
  protected readonly canRollHand = computed(() => {
    const state = this.store.matchState();
    const id = this.store.playerId();
    if (!state || !id || state.phase !== GamePhase.ROUND_ROLLING) {
      return false;
    }
    return state.round?.pendingRolls.includes(id) ?? false;
  });

  protected readonly reveal = this.store.lastReveal;

  protected handRollStatusFor(playerId: string): HandRollStatus | null {
    return this.handRollStatusByPlayerId()?.[playerId] ?? null;
  }

  protected currentBidFor(playerId: string): Bid | null {
    const record = this.latestBidRecord();
    return record && record.playerId === playerId ? record.bid : null;
  }

  protected roll(): void {
    this.socket.rollDice();
  }
}
