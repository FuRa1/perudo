// Captures real StateSnapshot/ServerEvent[] JSON straight off the wire (raw WebSocket frames,
// socket.io v4 protocol: "42" + JSON array prefix for an event frame) at several interesting
// points in a real match, and writes them to client/public/assets/fixtures/*.json — accurate
// captures rather than hand-typed guesses, that GameStore's dev-only fixture mode
// (core/fixture-loader.ts, `?fixture=<name>`) can then load directly, e.g.
// `http://localhost:4200/?fixture=reveal-true`.
//
// Not part of `npm run e2e` (no assertions here, it's a data-generation tool, not a test) — run
// it by hand (`node e2e/capture-fixtures.mjs`) whenever a fixture needs to be added or
// re-captured after a `StateSnapshot`/`ServerEvent` shape change.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { ensureServersRunning, typeRoomCode } from './support.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'public', 'assets', 'fixtures');

// Captures both 'state' (StateSnapshot) and 'events' (ServerEvent[]) frames — GameStore's reveal/
// timeout signals (lastReveal, lastTimeout, lastRevealWasSpecialRound) are derived from the
// *events* batch, not the snapshot, so a fixture needs both to reproduce a reveal-driven screen
// (see GameStore.applyEvents). Only the events batch immediately preceding the final captured
// state is kept — same "events then state, same batch" ordering the server itself sends.
function attachStateCapture(page, bucket) {
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      const text = typeof frame.payload === 'string' ? frame.payload : null;
      if (!text || !text.startsWith('42')) return;
      try {
        const arr = JSON.parse(text.slice(2));
        if (arr[0] === 'state') bucket.lastState = arr[1];
        if (arr[0] === 'events') bucket.lastEvents = arr[1];
        if (arr[0] === 'joined') bucket.playerId = arr[1].playerId;
      } catch {
        /* not a JSON event frame (ping/pong/etc.) — ignore */
      }
    });
  });
}

async function saveFixture(name, bucket) {
  if (!bucket.lastState || !bucket.playerId) {
    throw new Error(`No captured state/playerId for fixture "${name}"`);
  }
  const fixture = {
    viewerPlayerId: bucket.playerId,
    events: bucket.lastEvents ?? [],
    snapshot: bucket.lastState,
  };
  await fs.writeFile(path.join(FIXTURES_DIR, `${name}.json`), JSON.stringify(fixture, null, 2));
  console.log('saved fixture', name);
}

async function main() {
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
  const dev = await ensureServersRunning();
  const browser = await chromium.launch();
  try {
    const hostCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const guestCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const host = await hostCtx.newPage();
    const guest = await guestCtx.newPage();
    const hostBucket = {};
    const guestBucket = {};
    attachStateCapture(host, hostBucket);
    attachStateCapture(guest, guestBucket);

    await host.goto('http://localhost:4200');
    await host.getByLabel('Nickname').fill('Anne');
    await host.getByRole('button', { name: 'Start a table' }).click();
    await host.waitForSelector('.lobby__code-value', { timeout: 15000 });
    const code = ((await host.locator('.lobby__code-value').textContent()) ?? '').trim();

    await guest.goto('http://localhost:4200');
    await guest.getByLabel('Nickname').fill('Mateo');
    await guest.getByRole('button', { name: 'Join with a code' }).click();
    await typeRoomCode(guest, code);
    await guest.getByRole('button', { name: 'Join table' }).click();
    await guest.waitForSelector('.lobby__code-value', { timeout: 15000 });

    await host.waitForFunction(() => document.querySelectorAll('.lobby__row').length === 2);
    // lobby-2p fixture: both joined, host not yet ready.
    await saveFixture('lobby-2p', hostBucket);

    await host.locator('.lobby__ready-button').click();
    await guest.locator('.lobby__ready-button').click();
    await host.waitForFunction(() => !document.querySelector('.lobby-scroll'), { timeout: 15000 });
    await guest.waitForFunction(() => !document.querySelector('.lobby-scroll'), { timeout: 15000 });

    for (const p of [host, guest]) {
      for (let i = 0; i < 6; i++) {
        const castBtn = p.getByRole('button', { name: /^Cast/ });
        if ((await castBtn.count()) === 0) break;
        if (!(await castBtn.isDisabled().catch(() => true))) await castBtn.click();
        await p.waitForTimeout(400);
      }
    }
    for (const p of [host, guest]) {
      const rollBtn = p.getByRole('button', { name: 'Roll your hand' });
      await rollBtn.waitFor({ state: 'visible', timeout: 15000 });
      await rollBtn.click();
    }
    for (const p of [host, guest]) {
      await p.waitForFunction(
        () =>
          !!document.querySelector('.mobile-hand-strip') &&
          !document.querySelector('.mobile-roll-stage'),
        { timeout: 15000 },
      );
    }
    await host.waitForTimeout(300);
    await guest.waitForTimeout(300);

    const hostActive = (await host.locator('.bid-controls__place-btn').count()) > 0;
    const bidder = hostActive
      ? { page: host, bucket: hostBucket }
      : { page: guest, bucket: guestBucket };
    const waiter = hostActive
      ? { page: guest, bucket: guestBucket }
      : { page: host, bucket: hostBucket };

    await bidder.page.locator('.bid-controls__place-btn').click();
    await waiter.page.waitForFunction(
      () => document.querySelector('.bid-controls__liar-btn')?.disabled === false,
      { timeout: 10000 },
    );
    await waiter.page.waitForTimeout(200);
    // bidding-mid fixture: one bid placed, waiter's turn, nobody's called liar yet.
    await saveFixture('bidding-mid', waiter.bucket);

    await waiter.page.locator('.bid-controls__liar-btn').click();
    await bidder.page.waitForFunction(() => !!document.querySelector('.mobile-reveal'), {
      timeout: 10000,
    });
    await bidder.page.waitForTimeout(300);
    await saveFixture('reveal-true', bidder.bucket);

    await hostCtx.close();
    await guestCtx.close();
  } finally {
    await browser.close();
    await dev.stop();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
