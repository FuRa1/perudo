import { aceBid, normalBid } from '@shared';
import { bidToFaceValue, cycleFace, faceValueToBid } from './bid-face.util';

describe('faceValueToBid', () => {
  it('maps die value 1 to an ace bid', () => {
    expect(faceValueToBid(1, 3)).toEqual(aceBid(3));
  });

  it('maps die values 2..6 to normal bids on that face', () => {
    expect(faceValueToBid(2, 4)).toEqual(normalBid(4, 2));
    expect(faceValueToBid(6, 1)).toEqual(normalBid(1, 6));
  });
});

describe('bidToFaceValue', () => {
  it('is the inverse of faceValueToBid', () => {
    expect(bidToFaceValue(aceBid(5))).toBe(1);
    expect(bidToFaceValue(normalBid(2, 4))).toBe(4);
  });
});

describe('cycleFace', () => {
  it('increments 1..6 and wraps back to 1', () => {
    expect(cycleFace(1, 1)).toBe(2);
    expect(cycleFace(5, 1)).toBe(6);
    expect(cycleFace(6, 1)).toBe(1);
  });

  it('decrements 6..1 and wraps back to 6', () => {
    expect(cycleFace(6, -1)).toBe(5);
    expect(cycleFace(2, -1)).toBe(1);
    expect(cycleFace(1, -1)).toBe(6);
  });
});
