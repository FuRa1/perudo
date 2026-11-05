// Synthetic game states for visual checks, shared by the browser matrix and device-render.mjs.
// Each builder returns a fixture in core/fixture-loader.ts's shape: { viewerPlayerId, events,
// snapshot }. The viewer is always 'viewer' ("You"); the last seat is "NeverLose" on 5 dice.

const NAMES = [
  'You',
  'Will',
  'Anne',
  'Nick',
  'Fiona',
  'Rosa',
  'Gus',
  'Hana',
  'Ines',
  'Kit',
  'Lena',
  'NeverLose',
];
const HAND = [6, 3, 6, 1, 3];

function players(n, dice = 5) {
  return Array.from({ length: n }, (_, i) => ({
    id: i === 0 ? 'viewer' : `p${i}`,
    nickname: NAMES[i],
    isReady: i % 3 !== 2,
    diceCount: i === n - 1 ? 5 : dice,
    dice: i === 0 ? HAND.slice(0, dice) : [],
    consecutivePureStalls: 0,
    eliminatedInRound: null,
  }));
}

function base(phase, ps, extra = {}) {
  return {
    phase,
    roomId: 'ABCDE',
    players: ps,
    startRoll: null,
    completedStartRoll: null,
    round: null,
    winnerId: null,
    turnTimer: null,
    ...extra,
  };
}

function bidding(n, { myTurn = true, special = false } = {}) {
  const ps = players(n);
  const order = ps.map((p) => p.id);
  const bid = { kind: 'NORMAL', quantity: 3, face: 4 };
  const current = myTurn ? 0 : 2 % n;
  const bidder = order[(current - 1 + n) % n];
  return {
    viewerPlayerId: 'viewer',
    events: [{ type: 'BID_PLACED', playerId: bidder, bid }],
    snapshot: base('BIDDING', ps, {
      round: {
        roundNumber: 3,
        turnOrder: order,
        currentTurnIndex: current,
        bidHistory: [{ playerId: bidder, bid }],
        isSpecialRoundDeclared: special,
        pendingRolls: [],
      },
    }),
  };
}

function reveal(n, { viewerLoses = true } = {}) {
  const ps = players(n);
  const order = ps.map((p) => p.id);
  const dice = Object.fromEntries(
    order.map((id, i) => [id, i === 0 ? HAND : [((i * 7) % 6) + 1, 4, 1, 2, ((i * 5) % 6) + 1]]),
  );
  const bid = { kind: 'NORMAL', quantity: 4, face: 4 };
  const counted = Object.values(dice)
    .flat()
    .filter((v) => v === 4 || v === 1).length;
  const loser = viewerLoses ? 'viewer' : order[1];
  return {
    viewerPlayerId: 'viewer',
    events: [
      { type: 'LIAR_CALLED', callerId: loser },
      {
        type: 'ROUND_REVEALED',
        dice,
        claimedBid: bid,
        bidderId: order[n - 1],
        actualQuantity: counted,
        outcome: 'CALLER_LOSES',
        loserId: loser,
      },
      { type: 'PLAYER_LOST_DIE', playerId: loser, reason: 'LIAR_OUTCOME', remainingDice: 4 },
      { type: 'ROUND_STARTED', roundNumber: 4, firstPlayerId: loser },
    ],
    snapshot: base(
      'ROUND_ROLLING',
      ps.map((p) => ({ ...p, dice: [], diceCount: p.id === loser ? 4 : p.diceCount })),
      {
        round: {
          roundNumber: 4,
          turnOrder: order,
          currentTurnIndex: 0,
          bidHistory: [],
          isSpecialRoundDeclared: false,
          pendingRolls: order,
        },
      },
    ),
  };
}

function opening(n) {
  const ps = players(n);
  const order = ps.map((p) => p.id);
  return {
    viewerPlayerId: 'viewer',
    events: [],
    snapshot: base('START_ROLL', ps, {
      startRoll: { pendingPlayerIds: order.filter((_, i) => i !== 1), rolls: { [order[1]]: 5 } },
    }),
  };
}

function lobby(n) {
  return {
    viewerPlayerId: 'viewer',
    events: [],
    snapshot: base(
      'LOBBY',
      players(n).map((p) => ({ ...p, dice: [] })),
    ),
  };
}

function rolling(n) {
  const ps = players(n, 2).map((p) => ({ ...p, dice: [] }));
  const order = ps.map((p) => p.id);
  return {
    viewerPlayerId: 'viewer',
    events: [],
    snapshot: base('ROUND_ROLLING', ps, {
      round: {
        roundNumber: 1,
        turnOrder: order,
        currentTurnIndex: 0,
        bidHistory: [],
        isSpecialRoundDeclared: false,
        pendingRolls: ['viewer'],
      },
    }),
  };
}

export const STATES = {
  'rolling-12': () => rolling(12),
  'bid-mine-3': () => bidding(3),
  'bid-mine-6': () => bidding(6),
  'bid-mine-12': () => bidding(12),
  'bid-wait-6': () => bidding(6, { myTurn: false }),
  'bid-special-3': () => bidding(3, { special: true }),
  'reveal-6': () => reveal(6),
  'reveal-other-6': () => reveal(6, { viewerLoses: false }),
  'opening-6': () => opening(6),
  'lobby-6': () => lobby(6),
  'lobby-12': () => lobby(12),
};

/** Text that only appears once that state has actually rendered — device-render.mjs waits for it
 * (a blank, still-booting WebView must never count as a pass). */
export const STATE_MARKERS = {
  'rolling-12': 'Roll your hand',
  'bid-mine-3': 'Place bid',
  'bid-mine-6': 'Place bid',
  'bid-mine-12': 'Place bid',
  'bid-wait-6': 'weighs their wager',
  'bid-special-3': 'Special round',
  'reveal-6': 'You lost this round',
  'reveal-other-6': 'Truth revealed',
  'opening-6': 'Cast',
  'lobby-6': '6 of 12',
  'lobby-12': '12 of 12',
};
