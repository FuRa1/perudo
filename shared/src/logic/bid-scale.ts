import type { Bid, NormalBid, NormalFace } from '@shared/types/bid.types';
import { isSameBidShape } from '@shared/types/bid.types';

/**
 * Everything needed to judge a candidate bid against the round so far (CLAUDE.md 5.4).
 * `lastNormalBid` is the most recent NORMAL-face bid this round — it may be older than
 * `lastBid` (if the round is currently on an aces streak) or equal to it. Tracking this one
 * extra reference is the documented minimum needed to correctly handle returning from aces.
 */
export interface BidScaleContext {
  readonly lastBid: Bid | null;
  readonly lastNormalBid: NormalBid | null;
  readonly isSpecialRound: boolean;
}

/** aces quantity = ceil(normal_quantity / 2) — CLAUDE.md 5.4, "normal face → aces". */
export function minimumAceQuantity(normalQuantity: number): number {
  return Math.ceil(normalQuantity / 2);
}

/**
 * base normal quantity = aces_quantity × 2 for any target face, with the conditional sixes
 * bump: only when the base would exactly reproduce an already-made six bid, since six has no
 * higher face to escape to (CLAUDE.md 5.4, "aces → normal face").
 */
export function minimumNormalQuantityFromAces(
  acesQuantity: number,
  targetFace: NormalFace,
  lastNormalBid: NormalBid | null,
): number {
  const base = acesQuantity * 2;
  const collidesOnSix =
    targetFace === 6 && lastNormalBid?.quantity === base && lastNormalBid.face === 6;
  return collidesOnSix ? (acesQuantity + 1) * 2 : base;
}

/** Standard normal-vs-normal raise: strictly more of any face, or the same amount of a higher face. */
function isNormalRaise(candidate: NormalBid, reference: NormalBid): boolean {
  if (candidate.quantity > reference.quantity) {
    return true;
  }
  return candidate.quantity === reference.quantity && candidate.face > reference.face;
}

function isLegalSpecialRoundBid(candidate: Bid, lastBid: Bid): boolean {
  return isSameBidShape(candidate, lastBid) && candidate.quantity > lastBid.quantity;
}

/** Authoritative bid legality check — the single function imported by both client (pre-validation,
 * 5.8) and server (the real check on submit). Never call the RNG or mutate state here. */
export function isLegalBid(candidate: Bid, context: BidScaleContext): boolean {
  if (candidate.quantity < 1) {
    return false;
  }

  const { lastBid, lastNormalBid, isSpecialRound } = context;

  if (!lastBid) {
    return true;
  }

  if (isSpecialRound) {
    return isLegalSpecialRoundBid(candidate, lastBid);
  }

  if (lastBid.kind === 'ACE' && candidate.kind === 'ACE') {
    return candidate.quantity > lastBid.quantity;
  }

  if (lastBid.kind === 'NORMAL' && candidate.kind === 'NORMAL') {
    return isNormalRaise(candidate, lastBid);
  }

  if (lastBid.kind === 'NORMAL' && candidate.kind === 'ACE') {
    return candidate.quantity >= minimumAceQuantity(lastBid.quantity);
  }

  // lastBid.kind === 'ACE' && candidate.kind === 'NORMAL'
  if (lastBid.kind !== 'ACE' || candidate.kind !== 'NORMAL') {
    return false;
  }
  const floor = minimumNormalQuantityFromAces(lastBid.quantity, candidate.face, lastNormalBid);
  return candidate.quantity >= floor && (!lastNormalBid || isNormalRaise(candidate, lastNormalBid));
}

const NORMAL_FACES: readonly NormalFace[] = [2, 3, 4, 5, 6];

function isCheaperNormal(a: NormalBid, b: NormalBid): boolean {
  return a.quantity < b.quantity || (a.quantity === b.quantity && a.face < b.face);
}

/** The lowest normal bid reachable from an aces bid: base aces × 2 on the lowest face that still
 * beats the normal bid made before the aces (and the sixes rule) — via the same switch rule the
 * "from aces" hint uses, so the two can never disagree. */
function cheapestReturnFromAces(context: BidScaleContext): Bid {
  let best: NormalBid | null = null;
  for (const face of NORMAL_FACES) {
    const candidate = minimumNormalSwitchBid(context, face);
    if (candidate?.kind === 'NORMAL' && (!best || isCheaperNormal(candidate, best))) {
      best = candidate;
    }
  }
  return best ?? { kind: 'ACE', quantity: (context.lastBid?.quantity ?? 0) + 1 };
}

/**
 * 5.8 hint: the cheapest possible legal raise given the current bid order. For a normal-vs-normal
 * raise the same quantity at the next-higher face is strictly cheaper than bumping the quantity
 * (5.4/5.8's bid order climbs face-first) — six has no higher face to climb to, so from six the
 * only legal step is quantity+1 back at the lowest face. After aces, the cheapest step is back to
 * a normal face (see {@link cheapestReturnFromAces}) — confirmed by the user: 3 threes → 2 aces →
 * 4 twos; 4 fours → 2 aces → 4 fives. A special round fixes the face for the whole round (5.5),
 * so there the only legal step is ever quantity+1 on the same face/kind.
 */
export function cheapestLegalBid(context: BidScaleContext): Bid {
  const { lastBid, isSpecialRound } = context;
  if (!lastBid) {
    return { kind: 'NORMAL', quantity: 1, face: 2 };
  }
  if (isSpecialRound) {
    return lastBid.kind === 'ACE'
      ? { kind: 'ACE', quantity: lastBid.quantity + 1 }
      : { kind: 'NORMAL', quantity: lastBid.quantity + 1, face: lastBid.face };
  }
  if (lastBid.kind === 'ACE') {
    return cheapestReturnFromAces(context);
  }
  return lastBid.face < 6
    ? { kind: 'NORMAL', quantity: lastBid.quantity, face: (lastBid.face + 1) as NormalFace }
    : { kind: 'NORMAL', quantity: lastBid.quantity + 1, face: 2 };
}

/** 5.8 hint: minimum legal bid if switching from the current normal-face bid to aces, or `null`
 * if that switch isn't currently available (no bid yet, already on aces, or a special round). */
export function minimumAceSwitchBid(context: BidScaleContext): Bid | null {
  const { lastBid, isSpecialRound } = context;
  if (isSpecialRound || !lastBid || lastBid.kind !== 'NORMAL') {
    return null;
  }
  return { kind: 'ACE', quantity: minimumAceQuantity(lastBid.quantity) };
}

/** 5.8 hint: minimum legal bid if switching from aces to `targetFace`, respecting the sixes
 * rule, or `null` if that switch isn't currently available. */
export function minimumNormalSwitchBid(
  context: BidScaleContext,
  targetFace: NormalFace,
): Bid | null {
  const { lastBid, lastNormalBid, isSpecialRound } = context;
  if (isSpecialRound || !lastBid || lastBid.kind !== 'ACE') {
    return null;
  }
  const floor = minimumNormalQuantityFromAces(lastBid.quantity, targetFace, lastNormalBid);
  const quantity =
    lastNormalBid && targetFace <= lastNormalBid.face
      ? Math.max(floor, lastNormalBid.quantity + 1)
      : floor;
  return { kind: 'NORMAL', quantity, face: targetFace };
}
