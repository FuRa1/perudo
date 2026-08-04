import { aceBid, normalBid, type Bid, type DiceValue } from '@shared';

/** Domain mapping for the UI only (5.4, 5.8): the picker's die face 1 is always the ace, 2..6
 * are the matching normal face — kept out of /shared since it's a rendering concern, not a rule. */
export function bidToFaceValue(bid: Bid): DiceValue {
  return bid.kind === 'ACE' ? 1 : bid.face;
}

export function faceValueToBid(face: DiceValue, quantity: number): Bid {
  return face === 1 ? aceBid(quantity) : normalBid(quantity, face);
}

/** Wraps 1..6 in either direction — the picker's face control never lands outside that range. */
export function cycleFace(face: DiceValue, direction: 1 | -1): DiceValue {
  return (((face - 1 + direction + 6) % 6) + 1) as DiceValue;
}
