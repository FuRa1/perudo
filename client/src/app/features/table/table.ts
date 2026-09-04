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
import { IonButton, IonContent } from '@ionic/angular/standalone';
import { LucideDices } from '@lucide/angular';
import {
  GamePhase,
  diceValueMatchesClaimedFace,
  type Bid,
  type BidRecord,
  type DiceValue,
  type Player,
  type ServerEvent,
} from '@shared';
import { GameStore } from '../../core/game-store';
import { SocketService } from '../../core/socket.service';
import type { ArcSeatOpeningRoll } from '../../ui/arc-seat/arc-seat';
import { ARC_SEAT_ACTIVE_WIDTH_PX, ARC_SEAT_WIDTH_PX, ArcSeat } from '../../ui/arc-seat/arc-seat';
import { BidMarker } from '../../ui/bid-marker/bid-marker';
import { Die } from '../../ui/die/die';
import { OpeningRollPanel } from '../../ui/opening-roll-panel/opening-roll-panel';
import type { HandRollStatus, SeatSize } from '../../ui/seat-card/seat-card';
import { CARD_WIDTH_PX, SeatCard } from '../../ui/seat-card/seat-card';
import { TurnTimer } from '../../ui/turn-timer/turn-timer';
import { BidControls } from '../bid-controls/bid-controls';
import { RoundLossModal } from '../round-loss-modal/round-loss-modal';

const UNKNOWN_PLAYER_LABEL = 'Unknown player';

interface ArcPosition {
  readonly left: string;
  readonly top: string;
}

type RoundRevealedEvent = Extract<ServerEvent, { type: 'ROUND_REVEALED' }>;

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

/** The compact mobile arc-seat is far shorter than a full SeatCard (no dice-cup/bid-marker), so
 * it needs much less of the same vertical-clipping headroom as ARC_TOP_PADDING_PX above. */
const MOBILE_ARC_TOP_PADDING_PX = 64;
const MOBILE_ARC_GAP_PX = 10;

/** Height of the mobile arc box. computeArcPosition places seats on a sine curve whose vertical
 * spread only materialises from three seats up — at one or two opponents every seat lands on the
 * same line, so a box sized for the full curve left ~80px of dead mat between the arc and the
 * wager token below it (visible as a conspicuous empty gap in a 2-player match). Two values, not
 * a formula: the curve either has spread to show or it doesn't. */
const MOBILE_ARC_HEIGHT_PX = 176;
const MOBILE_ARC_FLAT_HEIGHT_PX = 104;

/** 9-12 total players (Increment 5) means 8-11 opponents — the point past which a single arc
 * row of even the compact 58px tier can no longer fit six-plus seats without either scrolling
 * (ruled out for this stress case) or shrinking below legibility. */
const MOBILE_ARC_STRESS_THRESHOLD = 8;
const MOBILE_ARC_STRESS_ROW_SIZE = 6;

function describeBid(bid: Bid): string {
  return bid.kind === 'ACE' ? `${bid.quantity} aces` : `${bid.quantity} × face ${bid.face}`;
}

/** Plain-language stand-in for the mobile header's phase chip (Increment 1) — never surfaces a
 * raw GamePhase enum value to players. `round` is null only pre-round-1 (LOBBY/START_ROLL, per
 * game-engine.ts), so that's the one case with no round number or dice count to report yet. */
function describeMobilePhase(
  state: { readonly phase: GamePhase; readonly round: { readonly roundNumber: number } | null },
  totalDiceCount: number,
  isMyTurn: boolean,
): string {
  if (!state.round) {
    return 'Before round 1';
  }
  if (state.phase === GamePhase.BIDDING && isMyTurn) {
    return 'Your turn';
  }
  return `Round ${state.round.roundNumber} · ${totalDiceCount} dice`;
}

/** "Anne", "Anne and Mateo", "Anne, Mateo and Tobias" — the opening-roll tie caption (Increment
 * 2) never needs an Oxford comma debate beyond this: at most a small handful of seats ever tie. */
function joinWithAnd(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? '';
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

@Component({
  selector: 'app-table',
  standalone: true,
  imports: [
    IonContent,
    IonButton,
    LucideDices,
    SeatCard,
    ArcSeat,
    BidMarker,
    Die,
    OpeningRollPanel,
    BidControls,
    RoundLossModal,
    TurnTimer,
  ],
  templateUrl: './table.html',
  styleUrl: './table.scss',
})
export class Table {
  protected readonly store = inject(GameStore);
  private readonly socket = inject(SocketService);
  private readonly destroyRef = inject(DestroyRef);

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

  protected readonly GamePhase = GamePhase;
  protected readonly describeBid = describeBid;
  protected readonly arcTopPaddingPx = ARC_TOP_PADDING_PX;

  protected readonly allPlayers = computed<readonly Player[]>(
    () => this.store.matchState()?.players ?? [],
  );
  protected readonly me = this.store.me;

  /** Mobile-only header chip (Increment 1) — plain-language phase context, never a raw enum. */
  protected readonly mobilePhaseLabel = computed<string>(() => {
    const state = this.store.matchState();
    if (!state) {
      return '';
    }
    const totalDiceCount = this.allPlayers().reduce((sum, p) => sum + p.diceCount, 0);
    return describeMobilePhase(state, totalDiceCount, this.store.isMyTurn());
  });

  /** Server-authoritative turn timer (5.6/6.5) — null unless a BIDDING turn is currently active. */
  protected readonly turnTimer = this.store.turnTimer;

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

  /** Mobile arc sizing (Increment 2) — fixed 84px seats rather than the desktop tiers above; the
   * one active (current-bidder) seat is wider (104px), same data `currentBidderId` already
   * tracks. Reuses `opponentPositions` as-is: it's percentage-based and doesn't care about the
   * pixel width of any one seat. */
  protected readonly mobileArcTopPaddingPx = MOBILE_ARC_TOP_PADDING_PX;
  /** See MOBILE_ARC_FLAT_HEIGHT_PX — collapses the arc box when the curve has no spread to show. */
  protected readonly mobileArcHeightPx = computed(() =>
    this.opponents().length <= 2 ? MOBILE_ARC_FLAT_HEIGHT_PX : MOBILE_ARC_HEIGHT_PX,
  );
  protected readonly mobileArcMinWidthPx = computed(() => {
    const bidderId = this.currentBidderId();
    const widths = this.opponents().map((o) =>
      o.id === bidderId ? ARC_SEAT_ACTIVE_WIDTH_PX : ARC_SEAT_WIDTH_PX,
    );
    if (widths.length === 0) {
      return 0;
    }
    return widths.reduce((sum, w) => sum + w, 0) + (widths.length - 1) * MOBILE_ARC_GAP_PX;
  });

  /** Two-arc stress layout (Increment 5) — an inset "back" row (up to 6, subdued) plus a "front"
   * row (the rest, up to 6), both at the compact 58px/42px tier. A plain flex row rather than the
   * single arc's absolute-percentage positions above: with up to 6 fixed-width seats needing to
   * fit even a 320px-wide screen with no horizontal scroll, letting flex-shrink compress the
   * columns gracefully is far more robust than trying to keep percentage math overlap-free at
   * every count and viewport width. */
  protected readonly isArcStressCase = computed(
    () => this.opponents().length >= MOBILE_ARC_STRESS_THRESHOLD,
  );
  protected readonly frontArcOpponents = computed(() =>
    this.opponents().slice(0, MOBILE_ARC_STRESS_ROW_SIZE),
  );
  protected readonly backArcOpponents = computed(() =>
    this.opponents().slice(MOBILE_ARC_STRESS_ROW_SIZE),
  );

  /** The turn order/index exist as soon as a round starts (well before bidding), so this must
   * also gate on phase — otherwise the eventual first bidder shows a "Bidding" badge all through
   * ROUND_ROLLING, before anyone has actually bid (Design QA Task 6, finding 1). Turn-order
   * itself is untouched; this only controls when the seat-card badge is allowed to show it. */
  protected readonly currentBidderId = computed(() => {
    const state = this.store.matchState();
    if (state?.phase !== GamePhase.BIDDING || !state.round) {
      return null;
    }
    return state.round.turnOrder[state.round.currentTurnIndex];
  });

  /** Whether it's meaningfully my turn to act (Increment 3/4) — deliberately narrower than
   * GameStore's own `isMyTurn`, which is already true the instant a round's turn order is
   * decided (well before BIDDING opens, same reason currentBidderId above gates on phase).
   * Increment 4's bid sheet must only switch out of its compact "waiting" state once there's
   * actually something to act on. */
  protected readonly isMyBiddingTurn = computed(() => {
    const bidderId = this.currentBidderId();
    return bidderId !== null && bidderId === this.store.playerId();
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

  /** Possessive form of nicknameFor — "You's" doesn't read as English, so the local player gets
   * "Your" instead of the generic "'s" suffix. */
  protected possessiveNicknameFor(playerId: string): string {
    if (playerId === this.store.playerId()) {
      return 'Your';
    }
    return `${this.nicknameFor(playerId)}'s`;
  }

  /** The wager token's caption (mobile-lantern.dc.html: "Anne's bid — your turn") — the bidder
   * is guaranteed to never be the player whose turn it currently is (placing a bid always advances
   * the turn), so "— your turn" only ever appends to someone else's bid, never doubles up with the
   * possessive "Your" case. */
  protected wagerCaptionFor(bidderPlayerId: string): string {
    const bid = `${this.possessiveNicknameFor(bidderPlayerId)} bid`;
    return this.isMyBiddingTurn() ? `${bid} — your turn` : bid;
  }

  /** Public opening-roll data is shown whenever either the live roll or its resolved, still
   * temporarily-retained result exists (2., "keep results visible through round 1 hand-rolling").
   * Desktop's separate OpeningRollPanel deliberately keeps using this broader flag. */
  protected readonly showOpeningRoll = computed(() => {
    const state = this.store.matchState();
    return !!state?.startRoll || !!state?.completedStartRoll;
  });

  /** Unlike showOpeningRoll above, the mobile arc's per-seat die slot (Increment 2) must NOT
   * linger once round 1 starts rolling hands — the reference's hand-roll frame shows compact
   * roll status there instead, never a stale opening die (each seat has only one state slot). */
  protected readonly isOpeningRollPhase = computed(
    () => this.store.matchState()?.phase === GamePhase.START_ROLL,
  );

  /** Tie caption for the mobile arc's mat status slot (Increment 2) — inferred from
   * `pendingPlayerIds` being a strict subset of the roster, the same signal `START_ROLL_TIED`
   * carries, without adding new store plumbing for one caption line. Ambiguous only for a
   * 2-player tie (subset === roster there too) — the same known, accepted limit as
   * OpeningRollPanel's own doc comment; harmless since a 2-player START_ROLL is a re-roll of
   * everyone either way. */
  protected readonly openingTieCaption = computed<string | null>(() => {
    const state = this.store.matchState();
    if (state?.phase !== GamePhase.START_ROLL || !state.startRoll) {
      return null;
    }
    const tiedIds = state.startRoll.pendingPlayerIds;
    if (tiedIds.length === 0 || tiedIds.length >= this.allPlayers().length) {
      return null;
    }
    const names = tiedIds.map((id) => this.nicknameFor(id));
    return `${joinWithAnd(names)} tied, casting again`;
  });

  /** Per-seat public opening-roll data for the mobile arc (Increment 2) — null outside the
   * opening-roll window entirely, so ArcSeat never reserves a die-slot's worth of space once
   * hand-rolling starts. */
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

  /** The verdict is intentionally phrased around the bid, not the caller. An exact count is a
   * true bid under 5.3, so the caller loses even though the quantity matches perfectly. */
  protected revealOutcomeText(reveal: RoundRevealedEvent): string {
    const isLocalLoser = reveal.loserId === this.store.playerId();
    if (reveal.outcome === 'CALLER_LOSES') {
      return isLocalLoser
        ? 'You called liar — the bid was true, so you lose a die.'
        : `${this.nicknameFor(reveal.loserId)} called liar — the bid was true, so they lose a die.`;
    }
    return isLocalLoser
      ? 'Your bid was false — you lose a die.'
      : `${this.nicknameFor(reveal.loserId)}'s bid was false — they lose a die.`;
  }

  /** Closing summary line for the mobile reveal panel — "<loser> drops to N dice · next round
   * opens with <player>", or "<loser> is out" once eliminated (5.9's win condition means there's
   * no "next round" line for that case). Reads the already-updated `matchState` rather than the
   * reveal event itself (neither field exists on it) — safe because the engine emits
   * ROUND_REVEALED and the resulting `state` snapshot together, so by the time a consumer
   * observes `reveal()` as non-null, `matchState()` already reflects the post-loss dice count and
   * (unless the match just ended) the next round's turn order — same ordering revealRows relies
   * on. Returns `null` (renders nothing) only when there's no reveal to summarize at all. */
  protected readonly nextRoundSummary = computed(() => {
    const r = this.reveal();
    const state = this.store.matchState();
    if (!r || !state) {
      return null;
    }
    const loserName = this.nicknameFor(r.loserId);
    const remaining = state.players.find((p) => p.id === r.loserId)?.diceCount;
    if (remaining === undefined) {
      return null;
    }
    // nicknameFor renders the local player as "You", which takes a plural verb — "You drops to
    // four dice" / "You is out" otherwise.
    const isLocal = r.loserId === this.store.playerId();
    if (remaining === 0) {
      return `${loserName} ${isLocal ? 'are' : 'is'} out.`;
    }
    const dieWord = remaining === 1 ? 'die' : 'dice';
    const starterId = state.round?.turnOrder[state.round.currentTurnIndex];
    // "next round opens with You" reads as a typo. The local player gets the active phrasing.
    const starterClause = !starterId
      ? ''
      : starterId === this.store.playerId()
        ? ' · you open the next round'
        : ` · next round opens with ${this.nicknameFor(starterId)}`;
    return `${loserName} ${isLocal ? 'drop' : 'drops'} to ${remaining} ${dieWord}${starterClause}`;
  });

  /** Per-player revealed hands for the mobile reveal panel (Increment 5) — the same
   * ROUND_REVEALED event already drives the desktop banner and RoundLossModal, just read here
   * for its full `dice` map (public once revealed, 5.3) instead of only the aggregate outcome. */
  protected readonly revealRows = computed(() => {
    const r = this.reveal();
    if (!r) {
      return [];
    }
    // The design's "ringed" die treatment (Die-face component inventory) — highlights the
    // specific dice that count toward the claimed face, wilds included unless it was a special
    // round (5.4/5.5). `lastRevealWasSpecialRound` is a client-only snapshot (GameStore) since
    // that flag resets before this event's own `state` message would otherwise let us read it.
    const isSpecialRound = this.store.lastRevealWasSpecialRound();
    return Object.entries(r.dice).map(([playerId, dice]) => ({
      playerId,
      nickname: this.nicknameFor(playerId),
      dice: dice.map((value) => ({
        value,
        ringed: diceValueMatchesClaimedFace(value, r.claimedBid, isSpecialRound),
      })),
      isBidder: playerId === r.bidderId,
      isLoser: playerId === r.loserId,
    }));
  });

  protected handRollStatusFor(playerId: string): HandRollStatus | null {
    return this.handRollStatusByPlayerId()?.[playerId] ?? null;
  }

  protected currentBidFor(playerId: string): Bid | null {
    const record = this.latestBidRecord();
    return record && record.playerId === playerId ? record.bid : null;
  }

  /** Whether this seat is the one holding the round's standing wager — drives ArcSeat's
   * "Bid placed" pill (designs/mobile-lantern.dc.html). Gated on BIDDING so the pill clears the
   * moment a round ends rather than lingering over the reveal/next roll, and distinct from
   * `currentBidderId()`, which is whose *turn* it is. */
  protected hasStandingBidAt(playerId: string): boolean {
    if (this.store.matchState()?.phase !== GamePhase.BIDDING) {
      return false;
    }
    return this.latestBidRecord()?.playerId === playerId;
  }

  protected roll(): void {
    this.socket.rollDice();
  }
}
