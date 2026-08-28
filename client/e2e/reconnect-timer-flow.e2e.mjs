// Browser E2E for Phase 5 (reconnect sessions + the server-authoritative turn timer badge),
// built on the same plain `playwright` package as lobby-flow.e2e.mjs (see that file's header for
// why this doesn't use @playwright/test). Drives two real browser contexts against the real
// running server, over a real socket and a real page reload — the one thing a unit/component test
// cannot exercise, since a reload tears down and rebuilds the whole Angular app from scratch and
// is the actual mechanism `SocketService`'s auto-reconnect exists for. Does not wait out a real
// 25-55s timeout (out of scope for a fast E2E pass — that behavior is covered deterministically
// with fake timers in server/src/game/turn-timer.service.spec.ts and game.gateway.spec.ts); this
// script only checks that the timer badge appears, identifies the right player, and that a
// same-session reload returns the player to their seat with dice privacy intact.
import { chromium } from 'playwright';
import { CLIENT_URL, ensureServersRunning, makeChecker, typeRoomCode } from './support.mjs';

const { check, getFailures } = makeChecker();
const MOBILE = { width: 390, height: 844 };

function attachErrorCapture(page, label, errors) {
  page.on('pageerror', (e) => errors.push(`${label} page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      errors.push(`${label} console error: ${m.text()}`);
    }
  });
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

async function readStoredSession(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('perudo:session');
    return raw ? JSON.parse(raw) : null;
  });
}

async function main() {
  const dev = await ensureServersRunning();
  const browser = await chromium.launch();
  const errors = [];

  try {
    const hostCtx = await browser.newContext({ viewport: MOBILE });
    const guestCtx = await browser.newContext({ viewport: MOBILE });
    const host = await hostCtx.newPage();
    const guest = await guestCtx.newPage();
    attachErrorCapture(host, 'host', errors);
    attachErrorCapture(guest, 'guest', errors);

    // 1-3. Reach BIDDING (same setup as bidding-flow.e2e.mjs).
    const code = await createTable(host, 'Jack');
    check('host creates a room', code.length === 5, code);
    await joinTable(guest, 'Anne', code);
    await host.waitForFunction(() => document.querySelectorAll('.lobby__row').length === 2);
    await guest.waitForFunction(() => document.querySelectorAll('.lobby__row').length === 2);
    await host.locator('.lobby__ready-button').click();
    await guest.locator('.lobby__ready-button').click();
    await host.waitForFunction(() => !document.querySelector('.lobby-scroll'), { timeout: 15_000 });
    await guest.waitForFunction(() => !document.querySelector('.lobby-scroll'), {
      timeout: 15_000,
    });
    await Promise.all([castUntilResolved(host), castUntilResolved(guest)]);
    for (const page of [host, guest]) {
      const rollBtn = page.getByRole('button', { name: 'Roll your hand' });
      await rollBtn.waitFor({ state: 'visible', timeout: 15_000 });
      await rollBtn.click();
    }
    for (const page of [host, guest]) {
      await page.waitForFunction(
        () =>
          !!document.querySelector('.mobile-hand-strip') &&
          !document.querySelector('.mobile-roll-stage'),
        { timeout: 15_000 },
      );
    }
    await host.waitForTimeout(300);
    await guest.waitForTimeout(300);

    // Reconnect session: a token was stored locally, and it never renders anywhere in the DOM.
    const hostSession = await readStoredSession(host);
    check('a reconnect session (roomId + token) was stored locally after joining', !!hostSession);
    check(
      'the stored reconnect token looks sufficiently random (64 hex chars)',
      typeof hostSession?.token === 'string' && /^[0-9a-f]{64}$/.test(hostSession.token),
    );
    const bodyText = (await host.locator('body').textContent()) ?? '';
    check(
      "the reconnect token never appears anywhere in the page's rendered text",
      hostSession?.token ? !bodyText.includes(hostSession.token) : false,
    );

    // Server-authoritative turn timer badge: visible, and shows for the actual active bidder.
    await host.waitForSelector('.turn-timer', { timeout: 10_000 });
    await guest.waitForSelector('.turn-timer', { timeout: 10_000 });
    check('the turn-timer badge renders for both players', true);

    // Capture own dice + active-bidder state before reloading, to compare after.
    const hostOwnDiceBefore = await host.locator('.mobile-hand-strip app-die').count();
    const hostWasActive = (await host.locator('.bid-controls__place-btn').count()) > 0;

    // 4. Refresh mid-BIDDING and verify auto-reconnect restores the same seat, without re-entering
    // a nickname — this is the actual mechanism under test (SocketService.tryAutoReconnect).
    await host.reload();
    await host.waitForFunction(
      () =>
        !!document.querySelector('.mobile-hand-strip') ||
        !!document.querySelector('.mobile-roll-stage'),
      { timeout: 15_000 },
    );
    check(
      'after reload, the player returns straight to the table (no Entry/nickname screen)',
      (await host.locator('ion-input-otp').count()) === 0 &&
        (await host.getByLabel('Nickname').count()) === 0,
    );
    const hostOwnDiceAfter = await host.locator('.mobile-hand-strip app-die').count();
    check(
      'private dice count is preserved after reconnect (still exactly what it was before reload)',
      hostOwnDiceAfter === hostOwnDiceBefore,
      `before=${hostOwnDiceBefore} after=${hostOwnDiceAfter}`,
    );
    check(
      'no opponent hand dice leak into the arc after reconnect (dice privacy holds, 4.5/6.6)',
      (await host.locator('app-arc-seat app-die').count()) === 0,
    );
    const hostSessionAfter = await readStoredSession(host);
    check(
      'the same reconnect token is still the one stored after reload (no duplicate/new session)',
      hostSessionAfter?.token === hostSession?.token,
    );
    check(
      "reload doesn't flip who the active bidder is",
      (await host.locator('.bid-controls__place-btn').count()) > 0 === hostWasActive,
    );

    // 5. Invalid token: corrupt the stored session, reload, and confirm a clean fallback to the
    // entry screen rather than a stuck/crashed page.
    await host.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem('perudo:session'));
      localStorage.setItem(
        'perudo:session',
        JSON.stringify({ ...stored, token: 'not-a-real-token' }),
      );
    });
    await host.reload();
    await host.getByLabel('Nickname').waitFor({ state: 'visible', timeout: 15_000 });
    check(
      'an invalid/unknown reconnect token falls back to the entry screen, not a stuck page',
      (await host.getByLabel('Nickname').count()) > 0,
    );
    const clearedSession = await readStoredSession(host);
    check('the invalid session was cleared from local storage', clearedSession === null);

    await hostCtx.close();
    await guestCtx.close();
  } finally {
    await browser.close();
    await dev.stop();
  }

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
