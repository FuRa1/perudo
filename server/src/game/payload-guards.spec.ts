import { parseBid, parseIsReady, parseNickname, parseRoomCode } from './payload-guards';

describe('payload guards — the client is never trusted (4.2)', () => {
  it.each([null, undefined, 42, 'str', [], {}, { nickname: '' }, { nickname: '   ' }])(
    'rejects nickname payload %p',
    (body) => {
      expect(parseNickname(body)).toBeNull();
    },
  );

  it('trims nicknames and caps their length', () => {
    expect(parseNickname({ nickname: '  Jack  ' })).toBe('Jack');
    expect(parseNickname({ nickname: 'x'.repeat(21) })).toBeNull();
  });

  it('normalizes room codes to upper case and rejects foreign characters', () => {
    expect(parseRoomCode({ roomId: 'abcde' })).toBe('ABCDE');
    expect(parseRoomCode({ roomId: 'ABCD0' })).toBeNull();
    expect(parseRoomCode({ roomId: 'ABC' })).toBeNull();
  });

  it('requires a real boolean for ready', () => {
    expect(parseIsReady({ isReady: true })).toBe(true);
    expect(parseIsReady({ isReady: 'true' })).toBeNull();
  });

  it('accepts well-formed bids and strips unknown fields', () => {
    expect(parseBid({ bid: { kind: 'ACE', quantity: 2, face: 4, extra: 1 } })).toEqual({
      kind: 'ACE',
      quantity: 2,
    });
    expect(parseBid({ bid: { kind: 'NORMAL', quantity: 3, face: 6 } })).toEqual({
      kind: 'NORMAL',
      quantity: 3,
      face: 6,
    });
  });

  it.each([
    { bid: { kind: 'NORMAL', quantity: 3, face: 1 } },
    { bid: { kind: 'NORMAL', quantity: 3, face: 7 } },
    { bid: { kind: 'NORMAL', quantity: 0, face: 3 } },
    { bid: { kind: 'NORMAL', quantity: 1.5, face: 3 } },
    { bid: { kind: 'ACE', quantity: -1 } },
    { bid: { kind: 'WILD', quantity: 2 } },
    { bid: null },
    {},
  ])('rejects malformed bid %p', (body) => {
    expect(parseBid(body)).toBeNull();
  });
});
