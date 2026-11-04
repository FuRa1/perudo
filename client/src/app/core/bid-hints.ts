import {
  aceBid,
  cheapestLegalBid,
  isLegalBid,
  minimumAceSwitchBid,
  minimumNormalSwitchBid,
  normalBid,
  type Bid,
  type BidScaleContext,
  type DiceValue,
  type NormalFace,
} from '@shared';

export const NORMAL_FACES: readonly NormalFace[] = [2, 3, 4, 5, 6];
export const ALL_FACES: readonly DiceValue[] = [1, 2, 3, 4, 5, 6];

export interface FaceSwitchHint {
  readonly face: NormalFace;
  readonly bid: Bid | null;
}

/** The one-click hints of 5.8 — every value comes from the same shared functions the server uses. */
export interface BidHints {
  readonly minimum: Bid;
  /** Null when switching to aces isn't possible right now; the UI still shows it, disabled. */
  readonly toAces: Bid | null;
  /** Per target face; all null unless the current bid is on aces. */
  readonly fromAces: readonly FaceSwitchHint[];
}

export function computeBidHints(context: BidScaleContext): BidHints {
  return {
    minimum: cheapestLegalBid(context),
    toAces: minimumAceSwitchBid(context),
    fromAces: NORMAL_FACES.map((face) => ({ face, bid: minimumNormalSwitchBid(context, face) })),
  };
}

/** Free input → a bid. Face 1 means aces (5.4). */
export function bidFromInput(quantity: number, face: DiceValue): Bid {
  return face === 1 ? aceBid(quantity) : normalBid(quantity, face);
}

export function faceOf(bid: Bid): DiceValue {
  return bid.kind === 'ACE' ? 1 : bid.face;
}

/** Client pre-check (5.8) — instant, local, and identical to the server's authoritative check. */
export function isInputLegal(quantity: number, face: DiceValue, context: BidScaleContext): boolean {
  return Number.isInteger(quantity) && isLegalBid(bidFromInput(quantity, face), context);
}

/** [singular, plural] per face, aces at 1. */
const FACE_NAMES: Readonly<Record<DiceValue, readonly [string, string]>> = {
  1: ['ace', 'aces'],
  2: ['two', 'twos'],
  3: ['three', 'threes'],
  4: ['four', 'fours'],
  5: ['five', 'fives'],
  6: ['six', 'sixes'],
};

export function describeBid(bid: Bid): string {
  const [singular, plural] = FACE_NAMES[faceOf(bid)];
  return `${bid.quantity} × ${bid.quantity === 1 ? singular : plural}`;
}
