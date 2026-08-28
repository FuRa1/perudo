// Phase 4 visual review — screenshot capture only (not a pass/fail suite), modeled on
// render-states.mjs. Drives the real running app through the states/viewports named in the
// Phase 4 task, for inspection against the Claude design references in /designs. Screenshots
// land in client/e2e/.screenshots/phase4/ (gitignored, same convention as render-states.mjs).
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIENT_URL, ensureServersRunning, typeRoomCode } from './support.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '.screenshots', 'phase4');

const MOBILE_320 = { width: 320, height: 720 };
const MOBILE_375 = { width: 375, height: 812 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP_1024 = { width: 1024, height: 768 };
const DESKTOP_1440 = { width: 1440, height: 900 };

const consoleErrors = [];

async function shoot(page, name) {
  await page.evaluate(() => document.querySelector('ion-content')?.scrollToTop(0));
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  console.log('captured', name);
}

function attachErrorCapture(page, label) {
  page.on('pageerror', (e) => consoleErrors.push(`${label} page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      consoleErrors.push(`${label} console error: ${m.text()}`);
    }
  });
}

async function newPlayer(browser, viewport = MOBILE_375, label = 'p') {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  attachErrorCapture(page, label);
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

async function castUntilResolved(page) {
  for (let i = 0; i < 20; i++) {
    const castBtn = page.getByRole('button', { name: /^Cast/ });
    if ((await castBtn.count()) === 0) {
      return;
    }
    if (!(await castBtn.isDisabled().catch(() => true))) {
      await castBtn.click();
    }
    await page.waitForTimeout(350);
  }
}

async function reachBidding(players) {
  await Promise.all(players.map((p) => castUntilResolved(p.page)));
  for (const { page } of players) {
    const rollBtn = page.getByRole('button', { name: 'Roll your hand' });
    await rollBtn.waitFor({ state: 'visible', timeout: 20_000 });
    await rollBtn.click();
  }
  for (const { page } of players) {
    await page.waitForFunction(
      () =>
        !!document.querySelector('.mobile-hand-strip') &&
        !document.querySelector('.mobile-roll-stage'),
      { timeout: 20_000 },
    );
  }
  await Promise.all(players.map((p) => p.page.waitForTimeout(300)));
}

async function setupRoom(browser, nicknames, viewport = MOBILE_375) {
  const players = [];
  for (const nickname of nicknames) {
    players.push({ nickname, ...(await newPlayer(browser, viewport, nickname)) });
  }
  const code = await createTable(players[0].page, players[0].nickname);
  for (let i = 1; i < players.length; i++) {
    await joinTable(players[i].page, players[i].nickname, code);
  }
  for (const { page } of players) {
    await page.waitForFunction(
      (n) => document.querySelectorAll('.lobby__row').length === n,
      players.length,
    );
  }
  for (const { page } of players) {
    await page.locator('.lobby__ready-button').click();
  }
  for (const { page } of players) {
    await page.waitForFunction(() => !document.querySelector('.lobby-scroll'), {
      timeout: 20_000,
    });
  }
  return { code, players };
}

async function closeAll(players) {
  for (const { ctx } of players) {
    await ctx.close();
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const dev = await ensureServersRunning();
  const browser = await chromium.launch();

  try {
    // 1. Entry states.
    {
      const { ctx, page } = await newPlayer(browser, MOBILE_375, 'entry');
      await page.goto(CLIENT_URL);
      await page.waitForSelector('ion-input');
      await shoot(page, '01-entry-empty-mobile');
      await page.getByLabel('Nickname').fill('Jack the Cartographer With a Very Long Name');
      await shoot(page, '02-entry-long-nickname-mobile');
      await ctx.close();
    }
    {
      const { ctx, page } = await newPlayer(browser, DESKTOP_1440, 'entry-desktop');
      await page.goto(CLIENT_URL);
      await shoot(page, '03-entry-empty-desktop-1440');
      await ctx.close();
    }

    // 2. One-player lobby (mobile + desktop) — long nickname, explains match can't start yet.
    {
      const { ctx, page } = await newPlayer(browser, MOBILE_375, 'lobby-solo');
      await createTable(page, 'Jack the Cartographer With a Very Long Name');
      await shoot(page, '04-lobby-one-player-mobile');
      await ctx.close();
    }
    {
      const { ctx, page } = await newPlayer(browser, DESKTOP_1440, 'lobby-solo-desktop');
      await createTable(page, 'Jack');
      await shoot(page, '05-lobby-one-player-desktop-1440');
      await ctx.close();
    }

    // 3. Two-player lobby, mixed ready state.
    {
      const host = await newPlayer(browser, MOBILE_375, 'host');
      const guest = await newPlayer(browser, MOBILE_375, 'guest');
      const code = await createTable(host.page, 'Anne');
      await joinTable(guest.page, 'Mateo', code);
      await host.page.waitForFunction(() => document.querySelectorAll('.lobby__row').length === 2, {
        timeout: 20_000,
      });
      await guest.page.waitForFunction(
        () => document.querySelectorAll('.lobby__row').length === 2,
        {
          timeout: 20_000,
        },
      );
      await host.page.locator('.lobby__ready-button').click();
      await host.page.waitForFunction(() =>
        document.querySelector('.lobby__table-count')?.textContent?.includes('1 ready'),
      );
      await shoot(host.page, '06-lobby-two-player-mixed-ready-mobile');
      await shoot(guest.page, '07-lobby-two-player-guest-view-mobile');
      await host.page.setViewportSize(DESKTOP_1440);
      await shoot(host.page, '08-lobby-two-player-mixed-ready-desktop-1440');
      await host.page.setViewportSize(MOBILE_375);

      await guest.page.locator('.lobby__ready-button').click();
      await host.page.waitForFunction(() => !document.querySelector('.lobby-scroll'), {
        timeout: 15_000,
      });
      await guest.page.waitForFunction(() => !document.querySelector('.lobby-scroll'), {
        timeout: 15_000,
      });
      await host.page.waitForTimeout(300);
      await shoot(host.page, '09-opening-roll-mobile');

      await reachBidding([host, guest]);
      const hostActive = (await host.page.locator('.bid-controls__place-btn').count()) > 0;
      const active = hostActive ? host : guest;
      const waiting = hostActive ? guest : host;

      await shoot(active.page, '10-table-hidden-dice-active-mobile');
      await shoot(waiting.page, '11-table-hidden-dice-waiting-mobile');
      await shoot(active.page, '12-bid-selector-default-mobile');

      // Viewport sweep on the bidding screen.
      for (const [label, vp] of [
        ['320', MOBILE_320],
        ['768-tablet', TABLET],
        ['1024-desktop', DESKTOP_1024],
        ['1440-desktop', DESKTOP_1440],
      ]) {
        await active.page.setViewportSize(vp);
        await active.page.waitForTimeout(250);
        await shoot(active.page, `13-bidding-viewport-${label}`);
        const overflow = await active.page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        console.log(`  overflow-check[${label}]:`, JSON.stringify(overflow));
      }
      await active.page.setViewportSize(MOBILE_375);
      await active.page.waitForTimeout(250);

      // Place a bid, capture the current-bid badge / wager token.
      await active.page.locator('.bid-controls__place-btn').click();
      await waiting.page.waitForFunction(() => !!document.querySelector('.mobile-wager-token'), {
        timeout: 10_000,
      });
      await shoot(waiting.page, '14-current-bid-badge-mobile');
      await shoot(active.page, '15-current-bid-badge-waiting-side-mobile');

      // Raise (switch to aces suggestion if available, else place cheapest legal).
      await waiting.page.waitForFunction(
        () => document.querySelector('.bid-controls__liar-btn')?.disabled === false,
        { timeout: 10_000 },
      );
      await shoot(waiting.page, '16-bid-selector-active-turn-mobile');

      // Call liar -> reveal.
      await waiting.page.locator('.bid-controls__liar-btn').click();
      await Promise.all([
        active.page.waitForFunction(() => !!document.querySelector('.mobile-reveal'), {
          timeout: 10_000,
        }),
        waiting.page.waitForFunction(() => !!document.querySelector('.mobile-reveal'), {
          timeout: 10_000,
        }),
      ]);
      await shoot(active.page, '17-reveal-state-mobile');
      await shoot(waiting.page, '18-reveal-state-other-side-mobile');
      await host.page.setViewportSize(DESKTOP_1440);
      await shoot(host.page, '19-reveal-state-desktop-1440');
      await host.page.setViewportSize(MOBILE_375);

      // Next round should reset bid/history and show the correct active player.
      for (const { page } of [host, guest]) {
        await page.waitForFunction(
          () =>
            !!document.querySelector('.mobile-roll-stage') ||
            !!document.querySelector('.mobile-hand-strip'),
          { timeout: 15_000 },
        );
      }
      await shoot(host.page, '20-next-round-transition-mobile');

      await closeAll([host, guest]);
    }

    // 4. 8-player and 12-player table states.
    for (const count of [8, 12]) {
      const nicknames = Array.from({ length: count }, (_, i) => `P${i + 1}`);
      const { players } = await setupRoom(browser, nicknames, MOBILE_375);
      await reachBidding(players);
      await shoot(players[0].page, `21-table-${count}-players-mobile`);
      await players[0].page.setViewportSize(DESKTOP_1440);
      await players[0].page.waitForTimeout(300);
      await shoot(players[0].page, `22-table-${count}-players-desktop-1440`);
      await closeAll(players);
    }

    // Winner state and reconnect/error state are captured by phase4-visual-review-part2.mjs, in
    // their own fresh browser process — chaining ~25 sequential contexts through one Chromium
    // instance (this script already does entry/lobby/2-player/8-player/12-player above) was
    // occasionally starving later navigations of resources, which read as the app hanging when
    // it was actually the browser instance under load. Splitting the run, not the app, fixed it.
  } finally {
    await browser.close();
    await dev.stop();
  }

  console.log(`\nScreenshots written to ${OUT_DIR}`);
  if (consoleErrors.length > 0) {
    console.log(`\n${consoleErrors.length} console/page error(s):`);
    for (const e of consoleErrors) {
      console.log(' -', e);
    }
  } else {
    console.log('\nNo console/page errors observed.');
  }
}

main().catch((err) => {
  console.error('VISUAL REVIEW SCRIPT ERROR', err);
  process.exitCode = 1;
});
