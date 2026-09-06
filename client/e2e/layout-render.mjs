// Dashboard-switching verification tooling (plans/board-dashboard-switching.md, Phases 2-3):
// nothing today can reach a non-default board layout except tapping the switcher pill or setting
// `localStorage['perudo:boardLayout']` by hand, so this seeds that key via `addInitScript`, loads
// an existing BIDDING fixture (synthesizing extra players for the counts that exercise a
// dashboard's scaling formulas), and screenshots the result — modelled on design-compare.mjs's own
// `openLive()` helper.
//
// Usage (dev server must already be running — `npm run dev` from the repo root):
//   node e2e/layout-render.mjs <layout> [outDir]
//     layout: linear | clockwise | default
//     outDir: defaults to e2e/.screenshots/layout-render
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { CLIENT_URL } from './support.mjs';

const MOBILE = { width: 390, height: 844 };
const PLAYER_COUNTS = [2, 4, 8, 12];
const BASE_FIXTURE = JSON.parse(
  fs.readFileSync(
    path.resolve(import.meta.dirname, '../public/assets/fixtures/bidding-mid.json'),
    'utf8',
  ),
);

const NAMES = [
  'Anne',
  'Mateo',
  'Isabel',
  'Tobias',
  'Gus',
  'Hana',
  'Ines',
  'Jo',
  'Kit',
  'Lena',
  'Omar',
  'Priya',
];

/** Builds a synthetic BIDDING-phase fixture with exactly `count` players — the local viewer plus
 * `count - 1` opponents — reusing bidding-mid.json's own bid/turn-timer shape so every dashboard's
 * usual BIDDING assumptions (a standing bid, an active turn timer) still hold at every count. */
function fixtureFor(count) {
  const viewerId = 'viewer';
  const players = Array.from({ length: count }, (_, i) => ({
    id: i === 0 ? viewerId : `p${i}`,
    nickname: NAMES[i] ?? `Player${i}`,
    isReady: true,
    diceCount: 5,
    dice: i === 0 ? [6, 3, 6, 1, 3] : [],
    consecutivePureStalls: 0,
  }));
  const turnOrder = players.map((p) => p.id);
  const bidderId = turnOrder[0];
  const currentTurnIndex = 1 % turnOrder.length;
  return {
    viewerPlayerId: viewerId,
    events: [
      { type: 'BID_PLACED', playerId: bidderId, bid: { kind: 'NORMAL', quantity: 1, face: 2 } },
    ],
    snapshot: {
      ...BASE_FIXTURE.snapshot,
      players,
      completedStartRoll: null,
      startRoll: null,
      round: {
        roundNumber: 1,
        turnOrder,
        currentTurnIndex,
        bidHistory: [{ playerId: bidderId, bid: { kind: 'NORMAL', quantity: 1, face: 2 } }],
        isSpecialRoundDeclared: false,
        pendingRolls: [],
      },
      turnTimer: { ...BASE_FIXTURE.snapshot.turnTimer, playerId: turnOrder[currentTurnIndex] },
    },
  };
}

async function shoot(browser, layout, count, outDir) {
  const ctx = await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript((l) => localStorage.setItem('perudo:boardLayout', l), layout);
  await page.route('**/assets/fixtures/bidding-mid.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(fixtureFor(count)) }),
  );
  await page.goto(`${CLIENT_URL}/?fixture=bidding-mid`);
  await page.waitForTimeout(1200);
  const out = path.join(outDir, `${layout}-${count}p.png`);
  await page.screenshot({ path: out });
  console.log(`wrote ${out}`, errors.length ? `CONSOLE ERRORS: ${errors.join(' | ')}` : '');
  await ctx.close();
  return errors;
}

async function main() {
  const [
    layout = 'linear',
    outDir = path.resolve(import.meta.dirname, '.screenshots/layout-render'),
  ] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  let totalErrors = 0;
  try {
    for (const count of PLAYER_COUNTS) {
      totalErrors += (await shoot(browser, layout, count, outDir)).length;
    }
  } finally {
    await browser.close();
  }
  process.exitCode = totalErrors === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('LAYOUT RENDER ERROR', err);
  process.exitCode = 1;
});
