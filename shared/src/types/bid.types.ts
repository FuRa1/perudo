/** A normal (non-ace) claimable face. Aces (1) are modeled separately — see {@link AceBid}. */
export type NormalFace = 2 | 3 | 4 | 5 | 6;

export interface NormalBid {
  readonly kind: 'NORMAL';
  readonly quantity: number;
  readonly face: NormalFace;
}

export interface AceBid {
  readonly kind: 'ACE';
  readonly quantity: number;
}

/** A bid is either a claim on a normal face or a claim on aces (5.3, 5.4). */
export type Bid = NormalBid | AceBid;

export function normalBid(quantity: number, face: NormalFace): NormalBid {
  return { kind: 'NORMAL', quantity, face };
}

export function aceBid(quantity: number): AceBid {
  return { kind: 'ACE', quantity };
}

export function isSameBidShape(a: Bid, b: Bid): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  return a.kind === 'NORMAL' && b.kind === 'NORMAL' ? a.face === b.face : true;
}
