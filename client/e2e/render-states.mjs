// GO STEP 6 — renders the real running app (not the static design mockup) at the required UI
// states, for visual inspection against designs/perudo-lobby-lantern.dc.html (§1a, §1a2, §2a).
// Screenshots land in client/e2e/.screenshots/ (gitignored) — not a formal pass/fail check, this
// script's job is only to produce the images; a human/agent inspection pass follows separately.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIENT_URL, ensureServersRunning, typeRoomCode } from './support.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '.screenshots');

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

async function shoot(page, name) {
  // ion-content scrolls inside its own shadow root, not the outer document — Playwright's
  // `fullPage: true` only measures document/body height, so it can't see or capture that inner
  // scroll region at all, and a plain viewport screenshot silently shows whatever the shadow
  // scroll happened to be left at (e.g. auto-scrolled to bring a bottom button into view for a
  // prior click). Reset to the top first so every capture is the same "first look" framing the
  // static mockups themselves show, at the same 390x844/1440x900 the mockup frames use.
  await page.evaluate(() => {
    const content = document.querySelector('ion-content');
    return content?.scrollToTop(0);
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  console.log('captured', name);
}

async function newPlayer(browser, viewport = MOBILE) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
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

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const dev = await ensureServersRunning();
  const browser = await chromium.launch();

  try {
    // entry-empty.png
    {
      const { ctx, page } = await newPlayer(browser);
      await page.goto(CLIENT_URL);
      await page.waitForSelector('ion-input');
      await shoot(page, 'entry-empty');
      await ctx.close();
    }

    // entry-nickname-filled.png
    {
      const { ctx, page } = await newPlayer(browser);
      await page.goto(CLIENT_URL);
      await page.getByLabel('Nickname').fill('Jack');
      await shoot(page, 'entry-nickname-filled');
      await ctx.close();
    }

    // join-code-partial.png
    {
      const { ctx, page } = await newPlayer(browser);
      await page.goto(CLIENT_URL);
      await page.getByLabel('Nickname').fill('Jack');
      await page.getByRole('button', { name: 'Join with a code' }).click();
      // ROOM_CODE_ALPHABET (entry.ts) deliberately excludes ambiguous letters (O/I/L) — use only
      // legal characters here so the OTP control doesn't silently reject one mid-string.
      await typeRoomCode(page, 'TR9');
      await shoot(page, 'join-code-partial');
      await ctx.close();
    }

    // join-code-complete.png
    {
      const { ctx, page } = await newPlayer(browser);
      await page.goto(CLIENT_URL);
      await page.getByLabel('Nickname').fill('Jack');
      await page.getByRole('button', { name: 'Join with a code' }).click();
      await typeRoomCode(page, 'TR9UY');
      await shoot(page, 'join-code-complete');
      await ctx.close();
    }

    // waiting-host-only.png
    {
      const { ctx, page } = await newPlayer(browser);
      await createTable(page, 'Jack');
      await shoot(page, 'waiting-host-only');
      await ctx.close();
    }

    // waiting-two-mixed-ready.png + waiting-guest-perspective.png
    {
      const host = await newPlayer(browser);
      const guest = await newPlayer(browser);
      const code = await createTable(host.page, 'Jack');
      await joinTable(guest.page, 'Anne', code);
      await host.page.waitForFunction(() => document.querySelectorAll('.lobby__row').length === 2);
      await guest.page.waitForFunction(() => document.querySelectorAll('.lobby__row').length === 2);
      await host.page.locator('.lobby__ready-button').click();
      await host.page.waitForFunction(() =>
        document.querySelector('.lobby__table-count')?.textContent?.includes('1 ready'),
      );
      await guest.page.waitForFunction(() =>
        document.querySelector('.lobby__table-count')?.textContent?.includes('1 ready'),
      );
      await shoot(host.page, 'waiting-two-mixed-ready');
      await shoot(guest.page, 'waiting-guest-perspective');

      // opening-roll-after-all-ready.png — guest also readies up, both leave the lobby.
      await guest.page.locator('.lobby__ready-button').click();
      await host.page.waitForFunction(() => !document.querySelector('.lobby-scroll'), {
        timeout: 15_000,
      });
      await host.page.waitForTimeout(300); // let the opening-roll view finish its own transition-in
      await shoot(host.page, 'opening-roll-after-all-ready');

      await host.ctx.close();
      await guest.ctx.close();
    }

    // waiting-three-mixed-ready.png
    {
      const host = await newPlayer(browser);
      const guestA = await newPlayer(browser);
      const guestB = await newPlayer(browser);
      const code = await createTable(host.page, 'Jack');
      await joinTable(guestA.page, 'Anne', code);
      await joinTable(guestB.page, 'Mary', code);
      await host.page.waitForFunction(() => document.querySelectorAll('.lobby__row').length === 3);
      await host.page.locator('.lobby__ready-button').click();
      await host.page.waitForFunction(() =>
        document.querySelector('.lobby__table-count')?.textContent?.includes('1 ready'),
      );
      await guestA.page.locator('.lobby__ready-button').click();
      await host.page.waitForFunction(() =>
        document.querySelector('.lobby__table-count')?.textContent?.includes('2 ready'),
      );
      await shoot(host.page, 'waiting-three-mixed-ready');
      await host.ctx.close();
      await guestA.ctx.close();
      await guestB.ctx.close();
    }

    // bidding-active-no-history.png + bidding-waiting-no-history.png +
    // bidding-active-with-wager.png + bidding-waiting-with-wager.png + bidding-1440-wide.png +
    // reveal-after-call-liar.png (GO STEP 6, mobile bid-screen history removal) — plays a
    // two-player match through opening roll, hand roll, into BIDDING, one legal bid, and a call
    // liar. Every BIDDING-phase capture happens BEFORE Call liar is clicked, and the reveal
    // capture happens strictly after — kept as separate steps so no single screenshot conflates
    // "still bidding" with "already revealed / next round's rolling UI showing underneath".
    {
      const host = await newPlayer(browser);
      const guest = await newPlayer(browser);
      const code = await createTable(host.page, 'Anne');
      await joinTable(guest.page, 'Mateo', code);
      await host.page.waitForFunction(() => document.querySelectorAll('.lobby__row').length === 2);
      await host.page.locator('.lobby__ready-button').click();
      await guest.page.locator('.lobby__ready-button').click();
      await host.page.waitForFunction(() => !document.querySelector('.lobby-scroll'), {
        timeout: 15_000,
      });
      await guest.page.waitForFunction(() => !document.querySelector('.lobby-scroll'), {
        timeout: 15_000,
      });

      await Promise.all([castUntilResolved(host.page), castUntilResolved(guest.page)]);

      for (const { page } of [host, guest]) {
        const rollBtn = page.getByRole('button', { name: 'Roll your hand' });
        await rollBtn.waitFor({ state: 'visible', timeout: 15_000 });
        await rollBtn.click();
      }
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

      const hostActive = (await host.page.locator('.bid-controls__place-btn').count()) > 0;
      const firstBidder = hostActive ? host : guest;
      const firstWaiter = hostActive ? guest : host;

      // Pre-bid: no wager token yet, so this is the round's true "empty" bidding state.
      await shoot(firstBidder.page, 'bidding-active-no-history');
      await shoot(firstWaiter.page, 'bidding-waiting-no-history');

      // Post-bid, still in BIDDING (Call liar not yet clicked): the wager token is now visible,
      // and the turn has passed — firstWaiter is now the active bidder, firstBidder is waiting.
      await firstBidder.page.locator('.bid-controls__place-btn').click();
      await firstWaiter.page.waitForFunction(
        () => document.querySelector('.bid-controls__liar-btn')?.disabled === false,
        { timeout: 10_000 },
      );
      await firstBidder.page.waitForFunction(
        () => !!document.querySelector('.mobile-wager-token'),
        {
          timeout: 10_000,
        },
      );
      await shoot(firstWaiter.page, 'bidding-active-with-wager');
      await shoot(firstBidder.page, 'bidding-waiting-with-wager');

      // Step 6's "one 1440px-wide representative screen" — the bidding screen specifically,
      // captured while still in BIDDING (not after the reveal), since that's the area this task
      // actually changed (the phone-frame-shell mixin confines it the same way the desktop
      // entry/waiting captures below confirm for other screens).
      await firstWaiter.page.setViewportSize(DESKTOP);
      await firstWaiter.page.waitForTimeout(300);
      await shoot(firstWaiter.page, 'bidding-1440-wide');
      await firstWaiter.page.setViewportSize(MOBILE);
      await firstWaiter.page.waitForTimeout(300);

      // Now call liar and capture the reveal as its own, separate screenshot.
      await firstWaiter.page.locator('.bid-controls__liar-btn').click();
      await firstBidder.page.waitForFunction(() => !!document.querySelector('.mobile-reveal'), {
        timeout: 10_000,
      });
      await shoot(firstBidder.page, 'reveal-after-call-liar');

      await host.ctx.close();
      await guest.ctx.close();
    }

    // A couple of representative desktop-viewport captures (Step 6: "at least 390x844 and one
    // desktop viewport") — the phone-frame-shell mixin (theme/_mixins.scss) is what's actually
    // under test above 768px, not a full redesign of every state.
    {
      const { ctx, page } = await newPlayer(browser, DESKTOP);
      await page.goto(CLIENT_URL);
      await shoot(page, 'entry-empty-desktop');
      await ctx.close();
    }
    {
      const { ctx, page } = await newPlayer(browser, DESKTOP);
      await createTable(page, 'Jack');
      await shoot(page, 'waiting-host-only-desktop');
      await ctx.close();
    }
  } finally {
    await browser.close();
    await dev.stop();
  }

  console.log(`\nScreenshots written to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('RENDER SCRIPT ERROR', err);
  process.exitCode = 1;
});
