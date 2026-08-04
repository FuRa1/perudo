import { Component, computed, inject } from '@angular/core';
import { IonButton, IonContent, IonIcon } from '@ionic/angular/standalone';
import { GamePhase, type Bid, type Player } from '@shared';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';
import type { SeatSize } from '../../ui/seat-card/seat-card';
import { SeatCard } from '../../ui/seat-card/seat-card';
import { BidControls } from '../bid-controls/bid-controls';

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

const CARD_WIDTH_PX: Record<SeatSize, number> = { large: 140, medium: 104, small: 76 };
const CARD_GAP_PX = 12;

function describeBid(bid: Bid): string {
  return bid.kind === 'ACE' ? `${bid.quantity} aces` : `${bid.quantity} × face ${bid.face}`;
}

@Component({
  selector: 'app-table',
  standalone: true,
  imports: [IonContent, IonButton, IonIcon, SeatCard, BidControls],
  templateUrl: './table.html',
})
export class Table {
  protected readonly store = inject(GameStore);
  private readonly socket = inject(SocketService);

  protected readonly GamePhase = GamePhase;
  protected readonly describeBid = describeBid;

  protected readonly me = this.store.me;
  protected readonly opponents = computed<readonly Player[]>(() => {
    const state = this.store.matchState();
    const myId = this.store.playerId();
    return state ? state.players.filter((p) => p.id !== myId) : [];
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

  protected readonly canRoll = computed(() => {
    const state = this.store.matchState();
    const id = this.store.playerId();
    if (!state || !id) {
      return false;
    }
    if (state.phase === GamePhase.START_ROLL) {
      return state.startRoll?.pendingPlayerIds.includes(id) ?? false;
    }
    if (state.phase === GamePhase.ROUND_ROLLING) {
      return state.round?.pendingRolls.includes(id) ?? false;
    }
    return false;
  });

  protected readonly reveal = this.store.lastReveal;

  protected roll(): void {
    this.socket.rollDice();
  }
}
