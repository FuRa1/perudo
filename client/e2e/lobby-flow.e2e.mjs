// Smallest maintainable browser E2E for the entry -> waiting-room flow, built directly on the
// `playwright` package already in client/package.json (no @playwright/test test-runner added —
// this rework's own instruction was to use the existing dependency, not to introduce a new one).
// Complements, and does not replace, the Vitest component specs (entry.spec.ts / lobby.spec.ts):
// those exercise the components in isolation with a fake SocketService; this drives two real
// browser contexts against the real running server, over a real socket, the way two actual
// players would. Run with `npm run e2e` (client) or `npm run e2e` (root).
import { chromium } from 'playwright';
import {
  CLIENT_URL,
  ensureServersRunning,
  installClipboardAndShareStubs,
  makeChecker,
  typeRoomCode,
} from './support.mjs';

const { check, getFailures } = makeChecker();

async function main() {
  const dev = await ensureServersRunning();
  const browser = await chromium.launch();

  try {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    const guest = await guestCtx.newPage();
    await installClipboardAndShareStubs(host, { shareAvailable: true });
    await installClipboardAndShareStubs(guest, { shareAvailable: false });

    for (const [label, page] of [
      ['host', host],
      ['guest', guest],
    ]) {
      page.on('pageerror', (e) => console.log(`${label} page error:`, e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') {
          console.log(`${label} console error:`, m.text());
        }
      });
    }

    // 1. Host enters a nickname and creates a room.
    await host.goto(CLIENT_URL);
    await host.getByLabel('Nickname').fill('Jack');
    await host.getByRole('button', { name: 'Start a table' }).click();
    await host.waitForSelector('.lobby__code-value', { timeout: 15_000 });
    const roomCode = ((await host.locator('.lobby__code-value').textContent()) ?? '').trim();
    check('host creates a room and reaches the waiting room', roomCode.length === 5, roomCode);

    // 2. Guest enters a nickname, opens the join-code step, enters the host's code, and joins.
    await guest.goto(CLIENT_URL);
    await guest.getByLabel('Nickname').fill('Anne');
    await guest.getByRole('button', { name: 'Join with a code' }).click();
    check(
      'join-code step does not send a join before the code is entered',
      (await guest.locator('.lobby__code-value').count()) === 0,
    );
    await typeRoomCode(guest, roomCode);
    await guest.getByRole('button', { name: 'Join table' }).click();
    await guest.waitForSelector('.lobby__code-value', { timeout: 15_000 });
    const guestSawCode = ((await guest.locator('.lobby__code-value').textContent()) ?? '').trim();
    check('guest joins with the host code and reaches a waiting room', guestSawCode === roomCode);

    // 3. Both land on the same waiting room.
    await host.waitForFunction(() => document.querySelectorAll('.lobby__row').length === 2);
    await guest.waitForFunction(() => document.querySelectorAll('.lobby__row').length === 2);
    check('host and guest see the same two-player roster', true);

    // 4. Host becomes ready while guest remains not ready.
    await host.locator('.lobby__ready-button').click();
    await host.waitForFunction(() =>
      document.querySelector('.lobby__table-count')?.textContent?.includes('1 ready'),
    );

    // 5. Both clients reflect the mixed state.
    await guest.waitForFunction(() =>
      document.querySelector('.lobby__table-count')?.textContent?.includes('1 ready'),
    );
    const hostStillInLobby = (await host.locator('.lobby-scroll').count()) === 1;
    const guestStillInLobby = (await guest.locator('.lobby-scroll').count()) === 1;
    check(
      'one ready + one not-ready is reflected on both clients without starting the match',
      hostStillInLobby && guestStillInLobby,
    );

    // 6. Guest becomes ready and both clients leave the lobby through the existing transition.
    await guest.locator('.lobby__ready-button').click();
    await host.waitForFunction(() => !document.querySelector('.lobby-scroll'), { timeout: 15_000 });
    await guest.waitForFunction(() => !document.querySelector('.lobby-scroll'), {
      timeout: 15_000,
    });
    check('host left the lobby once everyone is ready', true);
    check('guest left the lobby once everyone is ready', true);

    // 7. Copy/Share UI reports only what the stubbed API actually did (deterministic, no real
    // OS clipboard/share needed) — exercised on a fresh room so the ready pill above doesn't
    // interfere.
    const shareCtx = await browser.newContext();
    const sharePage = await shareCtx.newPage();
    await installClipboardAndShareStubs(sharePage, { shareAvailable: true });
    await sharePage.goto(CLIENT_URL);
    await sharePage.getByLabel('Nickname').fill('Elizabeth');
    await sharePage.getByRole('button', { name: 'Start a table' }).click();
    await sharePage.waitForSelector('.lobby__code-value');
    const freshCode = ((await sharePage.locator('.lobby__code-value').textContent()) ?? '').trim();

    // Copy: stub succeeds -> UI must claim success and the stub must have been called with the
    // real code.
    await sharePage.locator('.lobby__room-code').click();
    await sharePage.waitForFunction(
      () => document.querySelector('.lobby__copy-status')?.textContent?.trim() === 'Copied',
    );
    const copyCallArgs = await sharePage.evaluate(() => window.__copyCalls);
    check(
      'Copy claims success only after the stub actually resolved, with the real code',
      copyCallArgs.length === 1 && copyCallArgs[0] === freshCode,
      JSON.stringify(copyCallArgs),
    );

    // Copy: stub fails -> UI must NOT claim success. The status still reads "Copied" from the
    // prior successful click at this point, so the wait condition must watch for it to change
    // away from that (a plain "non-empty" check would pass immediately on the stale text).
    await sharePage.evaluate(() => {
      window.__copyShouldFail = true;
    });
    await sharePage.locator('.lobby__room-code').click();
    await sharePage.waitForFunction(() => {
      const t = document.querySelector('.lobby__copy-status')?.textContent?.trim() ?? '';
      return t.length > 0 && t !== 'Copied';
    });
    const copyFailureText = (
      (await sharePage.locator('.lobby__copy-status').textContent()) ?? ''
    ).trim();
    check(
      'Copy never claims success when the underlying API call failed',
      copyFailureText !== 'Copied' && copyFailureText.length > 0,
      copyFailureText,
    );

    // Share: stub succeeds -> UI must claim success and the stub must have been called with text
    // that actually contains the real code.
    await sharePage.locator('.lobby__code-share').click();
    await sharePage.waitForFunction(
      () => document.querySelector('.lobby__share-status')?.textContent?.trim() === 'Shared',
    );
    const shareCallArgs = await sharePage.evaluate(() => window.__shareCalls);
    check(
      'Share invite claims success only after the stub actually resolved, with the real code',
      shareCallArgs.length === 1 && shareCallArgs[0].text?.includes(freshCode),
      JSON.stringify(shareCallArgs),
    );

    // Share: no navigator.share at all -> UI must report unavailable, never a fabricated success.
    const noShareCtx = await browser.newContext();
    const noSharePage = await noShareCtx.newPage();
    await installClipboardAndShareStubs(noSharePage, { shareAvailable: false });
    await noSharePage.goto(CLIENT_URL);
    await noSharePage.getByLabel('Nickname').fill('Barbossa');
    await noSharePage.getByRole('button', { name: 'Start a table' }).click();
    await noSharePage.waitForSelector('.lobby__code-value');
    await noSharePage.locator('.lobby__code-share').click();
    await noSharePage.waitForFunction(
      () => (document.querySelector('.lobby__share-status')?.textContent?.trim().length ?? 0) > 0,
    );
    const unavailableText = (
      (await noSharePage.locator('.lobby__share-status').textContent()) ?? ''
    ).trim();
    check(
      'Share invite reports unavailable (never a fabricated success) with no Web Share API',
      unavailableText !== 'Shared' && /isn't available/i.test(unavailableText),
      unavailableText,
    );

    await shareCtx.close();
    await noShareCtx.close();
  } finally {
    await browser.close();
    await dev.stop();
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
