// Phase 4 verification (plans/board-dashboard-switching.md): "adds page.emulateMedia({
// reducedMotion: 'reduce' }) coverage asserting the handoff lands instantly with no intermediate
// animated frame." Checks the actual computed CSS (not just that the class toggles — the class
// binding fires regardless of motion preference, per clockwise-dashboard.ts's own design; it's
// the stylesheet's `@media (prefers-reduced-motion: reduce)` block that must neutralize it).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { CLIENT_URL } from './support.mjs';

const BASE_FIXTURE = JSON.parse(
  fs.readFileSync(
    path.resolve(import.meta.dirname, '../public/assets/fixtures/bidding-mid.json'),
    'utf8',
  ),
);

function fixtureFor() {
  const players = [
    {
      id: 'viewer',
      nickname: 'Anne',
      isReady: true,
      diceCount: 5,
      dice: [6, 3, 6, 1, 3],
      consecutivePureStalls: 0,
    },
    {
      id: 'p1',
      nickname: 'Mateo',
      isReady: true,
      diceCount: 5,
      dice: [],
      consecutivePureStalls: 0,
    },
    {
      id: 'p2',
      nickname: 'Isabel',
      isReady: true,
      diceCount: 5,
      dice: [],
      consecutivePureStalls: 0,
    },
  ];
  return {
    viewerPlayerId: 'viewer',
    events: [
      { type: 'BID_PLACED', playerId: 'viewer', bid: { kind: 'NORMAL', quantity: 1, face: 2 } },
    ],
    snapshot: {
      ...BASE_FIXTURE.snapshot,
      players,
      completedStartRoll: null,
      startRoll: null,
      round: {
        roundNumber: 1,
        turnOrder: players.map((p) => p.id),
        currentTurnIndex: 1,
        bidHistory: [{ playerId: 'viewer', bid: { kind: 'NORMAL', quantity: 1, face: 2 } }],
        isSpecialRoundDeclared: false,
        pendingRolls: [],
      },
      turnTimer: { ...BASE_FIXTURE.snapshot.turnTimer, playerId: 'p1' },
    },
  };
}

async function checkLayout(browser, layout, heroSelector) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/assets/fixtures/bidding-mid.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(fixtureFor()) }),
  );
  const page = await ctx.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((l) => localStorage.setItem('perudo:boardLayout', l), layout);
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${CLIENT_URL}/?fixture=bidding-mid`);
  await page.waitForTimeout(600);
  // The `--enter` class is transient (self-clearing after ~320ms) regardless of motion
  // preference — the app's own signal drives it either way. What must differ under reduced
  // motion is the stylesheet's own `animation` declaration for that class, so apply it directly
  // rather than racing the app's timeout.
  const animationName = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return undefined;
    el.classList.add(`${sel.slice(1)}--enter`);
    const name = getComputedStyle(el).animationName;
    el.classList.remove(`${sel.slice(1)}--enter`);
    return name;
  }, heroSelector);
  await ctx.close();
  const ok = animationName === 'none' && errors.length === 0;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${layout}: reduced-motion animationName="${animationName}"` +
      (errors.length ? ` ERRORS: ${errors.join(' | ')}` : ''),
  );
  return ok;
}

async function main() {
  const browser = await chromium.launch();
  let allOk = true;
  try {
    allOk &&= await checkLayout(browser, 'linear', '.linear-spotlight');
    allOk &&= await checkLayout(browser, 'clockwise', '.clockwise-hero');
  } finally {
    await browser.close();
  }
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error('REDUCED MOTION CHECK ERROR', err);
  process.exitCode = 1;
});
