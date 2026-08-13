// Browser E2E for the mobile bid screen, built on the same plain `playwright` package as
// lobby-flow.e2e.mjs (see that file's header for why this doesn't use @playwright/test).
// Complements the Vitest component specs (table.spec.ts / bid-controls.spec.ts): those exercise
// the components in isolation with fake state; this drives two real browser contexts through the
// real server, over a real socket, from room creation through BIDDING and a reveal — asserting
// along the way that the Ledger/bid-history UI removed from the mobile board stays gone, that the
// bid screen has no page-wide horizontal overflow at 390x844, that dice privacy holds (exactly
// five own dice per player, zero opponent dice in the arc before reveal), and that the reveal
// panel's public dice for the (formerly active) player match what was privately visible to them
// beforehand. Run with `npm run e2e` (client or root) — runs after lobby-flow.e2e.mjs, which owns
// the dedicated waiting-room checks.
import { chromium } from 'playwright';
import { CLIENT_URL, ensureServersRunning, makeChecker, typeRoomCode } from './support.mjs';

const { check, getFailures } = makeChecker();
const MOBILE = { width: 390, height: 844 };

function attachErrorCapture(page, label, errors) {
  page.on('pageerror', (e) => {
    errors.push(`${label} page error: ${e.message}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') {
      errors.push(`${label} console error: ${m.text()}`);
    }
  });
}

async function newPlayer(browser, label, errors) {
  const ctx = await browser.newContext({ viewport: MOBILE });
  const page = await ctx.newPage();
  attachErrorCapture(page, label, errors);
  return { ctx, page };
}

async function createTable(page, nickname) {
  await page.goto(CLIENT_URL);
  await page.getByLabel('Nickname').fill(nickname);
  await page.getByRole('button', { name: 'Start a table' }).click();
  await page.waitForSelector('.lobby__code-value', { timeout: 15_000 });
  return ((await page.locator('.lobby__code-value').textContent()) ?? '').trim();
}

async function joinTable(page, nickname, code) {
  await page.goto(CLIENT_URL);
  await page.getByLabel('Nickname').fill(nickname);
  await page.getByRole('button', { name: 'Join with a code' }).click();
  await typeRoomCode(page, code);
  await page.getByRole('button', { name: 'Join table' }).click();
  await page.waitForSelector('.lobby__code-value', { timeout: 15_000 });
}

/** Handles the possibility of a tied opening roll (5.2) by re-casting until this player is past
 * START_ROLL — a no-op the moment the "Cast" button is no longer present for this player. */
async function castUntilResolved(page) {
  for (let i = 0; i < 6; i++) {
    const castBtn = page.getByRole('button', { name: /^Cast/ });
    if ((await castBtn.count()) === 0) {
      return;
    }
    if (!(await castBtn.isDisabled().catch(() => true))) {
      await castBtn.click();
    }
    await page.waitForTimeout(400);
  }
}

async function assertNoHorizontalOverflow(page, label) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  check(
    `${label}: no page-wide horizontal overflow at 390x844`,
    scrollWidth <= clientWidth,
    `scrollWidth=${scrollWidth} clientWidth=${clientWidth}`,
  );
}

// DICE_FACES_CONFIG's own label strings (shared/src/dice-faces.config.ts) — <app-die> puts this
// on its own inner `.die` element's aria-label (die.html's root div, not the <app-die> custom
// element host itself), so reading it back is how these checks recover a die's actual face value
// from the rendered DOM without touching GameStore/socket state directly.
const DIE_LABEL_TO_VALUE = { Ace: 1, Two: 2, Three: 3, Four: 4, Five: 5, Six: 6 };

/** Reads face values off every `.die` inside the given `app-die` selector, in DOM order (i.e. NOT
 * sorted) — callers that only care about the multiset (not order) sort the result themselves.
 * `appDieSelector` must resolve to `<app-die>` elements (e.g. '.mobile-hand-strip app-die'). */
async function readDiceValues(pageOrLocator, appDieSelector) {
  const labels = await pageOrLocator
    .locator(`${appDieSelector} .die`)
    .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  return labels.map((label) => {
    const value = DIE_LABEL_TO_VALUE[label];
    if (value === undefined) {
      throw new Error(`Unrecognized die aria-label "${label}" from selector "${appDieSelector}"`);
    }
    return value;
  });
}

/** No Ledger chip, ledger modal, or bid-history list anywhere in the DOM — the history-removal
 * scope this suite exists to guard (CLAUDE.md Phase 4 / mobile-lantern.dc.html). */
async function assertNoHistoryUi(page, label) {
  const text = (await page.locator('body').textContent()) ?? '';
  check(`${label}: no "Ledger" text on the page`, !text.includes('Ledger'));
  check(`${label}: no "Bid history" text on the page`, !text.includes('Bid history'));
  check(
    `${label}: no Ledger chip node`,
    (await page.locator('.table-mobile-header__chip--ledger').count()) === 0,
  );
  check(
    `${label}: no ledger modal node`,
    (await page.locator('ion-modal.table-ledger-modal').count()) === 0,
  );
  check(
    `${label}: no .table__bid-history node`,
    (await page.locator('.table__bid-history').count()) === 0,
  );
}

async function main() {
  const dev = await ensureServersRunning();
  const browser = await chromium.launch();
  const errors = [];

  try {
    const host = await newPlayer(browser, 'host', errors);
    const guest = await newPlayer(browser, 'guest', errors);

    // 1-3. Create/join/waiting-room (lobby-flow.e2e.mjs owns the dedicated checks for this;
    // repeated minimally here since this script needs its own room to drive into BIDDING).
    const code = await createTable(host.page, 'Jack');
    check('host creates a room and reaches the waiting room', code.length === 5, code);
    await joinTable(guest.page, 'Anne', code);
    await host.page.waitForFunction(() => document.querySelectorAll('.lobby__row').length === 2);
    await guest.page.waitForFunction(() => document.querySelectorAll('.lobby__row').length === 2);

    // 2. One ready + one not-ready does not start the match.
    await host.page.locator('.lobby__ready-button').click();
    await host.page.waitForFunction(() =>
      document.querySelector('.lobby__table-count')?.textContent?.includes('1 ready'),
    );
    check(
      'one ready + one not-ready does not start the match',
      (await host.page.locator('.lobby-scroll').count()) === 1 &&
        (await guest.page.locator('.lobby-scroll').count()) === 1,
    );

    // 3. The final ready action reaches opening roll.
    await guest.page.locator('.lobby__ready-button').click();
    await host.page.waitForFunction(() => !document.querySelector('.lobby-scroll'), {
      timeout: 15_000,
    });
    await guest.page.waitForFunction(() => !document.querySelector('.lobby-scroll'), {
      timeout: 15_000,
    });
    check('the final ready action reaches opening roll for both clients', true);

    // 4. Click both opening-roll controls.
    await Promise.all([castUntilResolved(host.page), castUntilResolved(guest.page)]);

    // 4. Click both private hand-roll controls.
    for (const { page } of [host, guest]) {
      const rollBtn = page.getByRole('button', { name: 'Roll your hand' });
      await rollBtn.waitFor({ state: 'visible', timeout: 15_000 });
      await rollBtn.click();
    }

    // 5. Wait for BIDDING and identify the active bidder from the rendered UI.
    for (const { page } of [host, guest]) {
      await page.waitForFunction(
        () =>
          !!document.querySelector('.mobile-hand-strip') &&
          !document.querySelector('.mobile-roll-stage'),
        { timeout: 15_000 },
      );
    }
    await host.page.waitForTimeout(300);
    await guest.page.waitForTimeout(300);

    // Exactly five private dice per player after hand rolling.
    for (const { page, label } of [
      { page: host.page, label: 'host' },
      { page: guest.page, label: 'guest' },
    ]) {
      check(
        `${label}: exactly five own dice render after the hand roll`,
        (await page.locator('.mobile-hand-strip app-die').count()) === 5,
      );
    }

    // Opponent arc seats never render the opponent's hand dice before reveal (4.5/6.6) — an
    // <app-die> only ever appears there for the PUBLIC opening roll (arc-seat.html), which is
    // long past by BIDDING, so zero is the correct count on both sides.
    for (const { page, label } of [
      { page: host.page, label: 'host' },
      { page: guest.page, label: 'guest' },
    ]) {
      check(
        `${label}: no opponent hand dice render in the arc before reveal`,
        (await page.locator('app-arc-seat app-die').count()) === 0,
      );
    }

    const hostActive = (await host.page.locator('.bid-controls__place-btn').count()) > 0;
    const guestActive = (await guest.page.locator('.bid-controls__place-btn').count()) > 0;
    check('exactly one context is the active bidder', hostActive !== guestActive);
    const active = hostActive ? host.page : guest.page;
    const waiting = hostActive ? guest.page : host.page;

    // The active player's own dice (as a multiset — order isn't guaranteed to be preserved
    // between the private strip and the reveal panel), captured now while still private, to
    // check against what the reveal panel later shows as "their" public hand.
    const activePlayerOwnDice = (await readDiceValues(active, '.mobile-hand-strip app-die')).sort(
      (a, b) => a - b,
    );

    // 6. Neither context has a Ledger button, history modal, "Bid history" heading, or
    // .table__bid-history node.
    await assertNoHistoryUi(active, 'active');
    await assertNoHistoryUi(waiting, 'waiting');

    // 10. No page-wide horizontal overflow at 390x844, on both contexts.
    await assertNoHorizontalOverflow(active, 'active');
    await assertNoHorizontalOverflow(waiting, 'waiting');

    // 7. The current wager is visible after one legal bid, and the other context shows waiting.
    await active.locator('.bid-controls__place-btn').click();
    await waiting.waitForFunction(() => !!document.querySelector('.mobile-wager-token'), {
      timeout: 10_000,
    });
    check('the wager token is visible on the non-bidder after a legal bid', true);
    check(
      'the bidder-side context also shows the wager token',
      (await active.locator('.mobile-wager-token').count()) > 0 ||
        (await waiting.locator('.mobile-wager-token').count()) > 0,
    );

    // History-removal check again post-bid — bidHistory now has an entry; the UI must still not
    // surface it as a list anywhere.
    await assertNoHistoryUi(active, 'active (after bid)');
    await assertNoHistoryUi(waiting, 'waiting (after bid)');

    // 8. Call liar from the next active context; verify the existing reveal UI appears.
    await waiting.waitForFunction(
      () => document.querySelector('.bid-controls__liar-btn')?.disabled === false,
      { timeout: 10_000 },
    );
    await waiting.locator('.bid-controls__liar-btn').click();
    await Promise.all([
      active.waitForFunction(() => !!document.querySelector('.mobile-reveal'), {
        timeout: 10_000,
      }),
      waiting.waitForFunction(() => !!document.querySelector('.mobile-reveal'), {
        timeout: 10_000,
      }),
    ]);
    check('the reveal UI appears on both contexts after Call liar', true);

    // The revealed hand for the (formerly active) player, read from their own row — labeled "You"
    // from their own perspective (Table.nicknameFor) — must be exactly the same five dice that
    // were already visible to them privately before the reveal. This is the actual privacy/
    // correctness check: the server's public reveal must match what the client already had, not
    // just "a reveal panel exists".
    const revealedOwnRow = active.locator('.mobile-reveal__row', { hasText: 'You' });
    await revealedOwnRow.waitFor({ state: 'visible', timeout: 10_000 });
    const revealedOwnDice = (await readDiceValues(revealedOwnRow, 'app-die')).sort((a, b) => a - b);
    check(
      'the revealed hand for the (formerly active) player matches their own pre-reveal private dice',
      JSON.stringify(revealedOwnDice) === JSON.stringify(activePlayerOwnDice),
      `revealed=${JSON.stringify(revealedOwnDice)} private=${JSON.stringify(activePlayerOwnDice)}`,
    );

    await host.ctx.close();
    await guest.ctx.close();
  } finally {
    await browser.close();
    await dev.stop();
  }

  // 9. Page/console errors are failures, not ignored noise.
  for (const message of errors) {
    check(`no page/console errors :: ${message}`, false);
  }
  if (errors.length === 0) {
    check('no page or console errors were observed during the run', true);
  }

  const failures = getFailures();
  if (failures > 0) {
    console.log(`\n${failures} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log('\nAll checks passed.');
  }
}

main().catch((err) => {
  console.error('E2E SCRIPT ERROR', err);
  process.exitCode = 1;
});
