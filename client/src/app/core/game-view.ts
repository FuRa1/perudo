import { Injectable, computed, inject } from '@angular/core';
import {
  GamePhase,
  diceValueMatchesClaimedFace,
  type Bid,
  type BidRecord,
  type DiceValue,
  type Player,
  type ServerEvent,
} from '@shared';
import { GameStore } from './game-store';

const UNKNOWN_PLAYER_LABEL = 'Unknown player';

/** Plural face names, as the canonical design writes them ("4 × fives", not "4 × face 5") —
 * indexed by face value, so index 0 is unused (there is no face 0; face 1 is aces, which
 * describeBid handles separately since it is a distinct bid kind, not a numbered face). */
const FACE_WORDS = ['', 'ones', 'twos', 'threes', 'fours', 'fives', 'sixes'] as const;

function describeBid(bid: Bid): string {
  if (bid.kind === 'ACE') {
    return `${bid.quantity} aces`;
  }
  return `${bid.quantity} × ${FACE_WORDS[bid.face] ?? `face ${bid.face}`}`;
}

/** Plain-language stand-in for the mobile header's phase chip (Increment 1) — never surfaces a
 * raw GamePhase enum value to players. `round` is null only pre-round-1 (LOBBY/START_ROLL, per
 * game-engine.ts), so that's the one case with no round number or dice count to report yet. */
function describeMobilePhase(
  state: { readonly phase: GamePhase; readonly round: { readonly roundNumber: number } | null },
  totalDiceCount: number,
  isMyTurn: boolean,
  isRevealed: boolean,
): string {
  if (!state.round) {
    return 'Before round 1';
  }
  if (state.phase === GamePhase.BIDDING && isMyTurn) {
    return 'Your turn';
  }
  // The canonical design labels the reveal explicitly ("Round 3 · revealed"). The dice count is
  // the wrong thing to show there — it has already changed to reflect the loss the player is still
  // reading about.
  if (isRevealed) {
    return `Round ${state.round.roundNumber} · revealed`;
  }
  return `Round ${state.round.roundNumber} · ${totalDiceCount} dice`;
}

type RoundRevealedEvent = Extract<ServerEvent, { type: 'ROUND_REVEALED' }>;

/** One revealed hand, as `MobileRevealPanel` (an input()-driven, presentational component)
 * consumes it — exported here so it doesn't need to redeclare the shape `revealRows` produces. */
export type RevealRow = {
  readonly playerId: string;
  readonly nickname: string;
  readonly dice: readonly { readonly value: DiceValue; readonly ringed: boolean }[];
  readonly isBidder: boolean;
  readonly isLoser: boolean;
};

/**
 * Shared state→text/flag derivations the board shell needs once it owns the wager token, reveal
 * panel, and bid rail (all "shell", per the dashboard-switching plan's decision 2). Deliberately
 * NOT a dumping ground for every helper `table.ts` used to have — layout-specific arrangement
 * (e.g. `arcMinWidthPx`) stays in whichever dashboard needs it; this only holds what the shell
 * (and, incidentally, any dashboard) genuinely shares.
 */
@Injectable({ providedIn: 'root' })
export class GameView {
  private readonly store = inject(GameStore);

  readonly describeBid = describeBid;

  private readonly allPlayers = computed<readonly Player[]>(
    () => this.store.matchState()?.players ?? [],
  );

  /** Mobile-only header chip (Increment 1) — plain-language phase context, never a raw enum. */
  readonly mobilePhaseLabel = computed<string>(() => {
    const state = this.store.matchState();
    if (!state) {
      return '';
    }
    const totalDiceCount = this.allPlayers().reduce((sum, p) => sum + p.diceCount, 0);
    // `reveal()` truthy is the only usable "a reveal is on screen" signal — state.phase never
    // rests at REVEAL/ROUND_END (game-engine.ts), which is why the reveal panel itself keys off
    // the same thing rather than off the phase.
    return describeMobilePhase(
      state,
      totalDiceCount,
      this.store.isMyTurn(),
      this.reveal() !== null,
    );
  });

  readonly reveal = this.store.lastReveal;

  /** The verdict is intentionally phrased around the bid, not the caller. An exact count is a
   * true bid under 5.3, so the caller loses even though the quantity matches perfectly. */
  revealOutcomeText(reveal: RoundRevealedEvent): string {
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

  /** Just who it cost, with no restatement of why — the canonical reveal card sets this directly
   * after the verdict's own explanation ("The actual count was below the claim. Mateo loses a
   * die."), so the fuller revealOutcomeText above would repeat the reasoning inline. */
  revealLossSentence(reveal: RoundRevealedEvent): string {
    return reveal.loserId === this.store.playerId()
      ? 'You lose a die.'
      : `${this.nicknameFor(reveal.loserId)} loses a die.`;
  }

  /** The most recently placed bid this round, or null once history is empty (round just ended
   * or just started) — drives the on-table bid marker (2.). Presentation-only; no game logic. */
  readonly latestBidRecord = computed<BidRecord | null>(() => {
    const history = this.store.matchState()?.round?.bidHistory;
    return history && history.length > 0 ? history[history.length - 1] : null;
  });

  /** Bid history is public-by-rule and only ever holds player ids (1.) — nicknames are a
   * client-only presentation concern, resolved here rather than in /shared. */
  nicknameFor(playerId: string): string {
    if (playerId === this.store.playerId()) {
      return 'You';
    }
    return this.allPlayers().find((p) => p.id === playerId)?.nickname ?? UNKNOWN_PLAYER_LABEL;
  }

  /** Possessive form of nicknameFor — "You's" doesn't read as English, so the local player gets
   * "Your" instead of the generic "'s" suffix. */
  private possessiveNicknameFor(playerId: string): string {
    if (playerId === this.store.playerId()) {
      return 'Your';
    }
    return `${this.nicknameFor(playerId)}'s`;
  }

  /** The wager token's caption (mobile-lantern.dc.html: "Anne's bid — your turn") — the bidder
   * is guaranteed to never be the player whose turn it currently is (placing a bid always advances
   * the turn), so "— your turn" only ever appends to someone else's bid, never doubles up with the
   * possessive "Your" case. */
  wagerCaptionFor(bidderPlayerId: string): string {
    const bid = `${this.possessiveNicknameFor(bidderPlayerId)} bid`;
    return this.isMyBiddingTurn() ? `${bid} — your turn` : bid;
  }

  /** The turn order/index exist as soon as a round starts (well before bidding), so this must
   * also gate on phase — otherwise the eventual first bidder shows a "Bidding" badge all through
   * ROUND_ROLLING, before anyone has actually bid. */
  readonly currentBidderId = computed(() => {
    const state = this.store.matchState();
    if (state?.phase !== GamePhase.BIDDING || !state.round) {
      return null;
    }
    return state.round.turnOrder[state.round.currentTurnIndex];
  });

  /** Whether it's meaningfully my turn to act — deliberately narrower than GameStore's own
   * `isMyTurn`, which is already true the instant a round's turn order is decided (well before
   * BIDDING opens, same reason currentBidderId above gates on phase). */
  readonly isMyBiddingTurn = computed(() => {
    const bidderId = this.currentBidderId();
    return bidderId !== null && bidderId === this.store.playerId();
  });

  /** Closing summary line for the mobile reveal panel — "<loser> drops to N dice · next round
   * opens with <player>", or "<loser> is out" once eliminated (5.9's win condition means there's
   * no "next round" line for that case). Reads the already-updated `matchState` rather than the
   * reveal event itself (neither field exists on it) — safe because the engine emits
   * ROUND_REVEALED and the resulting `state` snapshot together, so by the time a consumer
   * observes `reveal()` as non-null, `matchState()` already reflects the post-loss dice count and
   * (unless the match just ended) the next round's turn order — same ordering revealRows relies
   * on. Returns `null` (renders nothing) only when there's no reveal to summarize at all. */
  readonly nextRoundSummary = computed(() => {
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

  /** Per-player revealed hands for the mobile reveal panel — the same ROUND_REVEALED event
   * already drives the desktop banner and RoundLossModal, just read here for its full `dice` map
   * (public once revealed, 5.3) instead of only the aggregate outcome. */
  readonly revealRows = computed<readonly RevealRow[]>(() => {
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
}
