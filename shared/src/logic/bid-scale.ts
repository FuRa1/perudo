import type { Bid, NormalBid, NormalFace } from '../types/bid.types';
import { isSameBidShape } from '../types/bid.types';

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

/** 5.8 hint: the cheapest possible legal raise in the current mode (same face/kind, +1 quantity). */
export function cheapestLegalBid(context: BidScaleContext): Bid {
  const { lastBid } = context;
  if (!lastBid) {
    return { kind: 'NORMAL', quantity: 1, face: 2 };
  }
  if (lastBid.kind === 'ACE') {
    return { kind: 'ACE', quantity: lastBid.quantity + 1 };
  }
  return { kind: 'NORMAL', quantity: lastBid.quantity + 1, face: lastBid.face };
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
