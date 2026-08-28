// Phase 4 visual review, part 2 (winner state + reconnect/error state) — split into its own
// fresh browser process from phase4-visual-review.mjs; see that file's note on why.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIENT_URL, ensureServersRunning, typeRoomCode } from './support.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '.screenshots', 'phase4');
const MOBILE_375 = { width: 375, height: 812 };
const DESKTOP_1440 = { width: 1440, height: 900 };

async function shoot(page, name) {
  await page.evaluate(() => document.querySelector('ion-content')?.scrollToTop(0));
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`) });
  console.log('captured', name);
}

function attachErrorCapture(page, label, errors) {
  page.on('pageerror', (e) => errors.push(`${label} page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      errors.push(`${label} console error: ${m.text()}`);
    }
  });
}

async function newPlayer(browser, errors, viewport = MOBILE_375, label = 'p') {
  const ctx = await browser.newContext({ viewport });
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
    try {
      await rollBtn.waitFor({ state: 'visible', timeout: 20_000 });
    } catch (err) {
      const bodyText = await page
        .locator('body')
        .textContent()
        .catch(() => '<failed>');
      console.log('DIAGNOSTIC: roll-your-hand never appeared. Page body text:');
      console.log(bodyText);
      console.log('DIAGNOSTIC: page URL:', page.url());
      throw err;
    }
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

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const dev = await ensureServersRunning();
  const browser = await chromium.launch();
  const errors = [];

  try {
    // Winner state — drive a real match to GAME_OVER by always calling liar (guaranteed to
    // terminate: every call removes exactly one die from someone).
    {
      const host = await newPlayer(browser, errors, MOBILE_375, 'win-host');
      const guest = await newPlayer(browser, errors, MOBILE_375, 'win-guest');
      const code = await createTable(host.page, 'Elizabeth');
      await joinTable(guest.page, 'Jack', code);
      await host.page.waitForFunction(() => document.querySelectorAll('.lobby__row').length === 2, {
        timeout: 20_000,
      });
      await host.page.locator('.lobby__ready-button').click();
      await guest.page.locator('.lobby__ready-button').click();
      await host.page.waitForFunction(() => !document.querySelector('.lobby-scroll'), {
        timeout: 15_000,
      });
      await guest.page.waitForFunction(() => !document.querySelector('.lobby-scroll'), {
        timeout: 15_000,
      });

      let round = 0;
      while (round < 30) {
        round += 1;
        // Defensive re-check at the top too: guards against the match having ended right after
        // the previous iteration's own end-of-loop check but before this one started.
        if ((await host.page.locator('app-winner').count()) > 0) {
          break;
        }
        await reachBidding([host, guest]);
        const hostActive = (await host.page.locator('.bid-controls__place-btn').count()) > 0;
        const active = hostActive ? host : guest;
        const waiting = hostActive ? guest : host;
        await active.page.locator('.bid-controls__place-btn').click();
        await waiting.page.waitForFunction(
          () => document.querySelector('.bid-controls__liar-btn')?.disabled === false,
          { timeout: 10_000 },
        );
        await waiting.page.locator('.bid-controls__liar-btn').click();
        // Every one of these paths — the round continuing (a fresh roll stage / hand strip shows
        // up) or the match ending (the winner screen replaces the whole board) — is a valid
        // outcome of one call-liar; the loop must not fall through to another reachBidding() call
        // once `app-winner` is what actually showed up, or it waits forever for a "Roll your hand"
        // button that the now-gone board will never render again.
        for (const { page } of [host, guest]) {
          await page
            .waitForFunction(
              () =>
                !!document.querySelector('.mobile-roll-stage') ||
                !!document.querySelector('.mobile-hand-strip') ||
                !!document.querySelector('app-winner'),
              { timeout: 15_000 },
            )
            .catch(() => {});
        }
        if ((await host.page.locator('app-winner').count()) > 0) {
          break;
        }
      }
      if ((await host.page.locator('app-winner').count()) > 0) {
        await shoot(host.page, '23-winner-state-mobile');
        await host.page.setViewportSize(DESKTOP_1440);
        await shoot(host.page, '24-winner-state-desktop-1440');
      } else {
        console.log(
          'WARNING: did not reach GAME_OVER within round cap — skipping winner screenshot',
        );
      }
      await host.ctx.close();
      await guest.ctx.close();
    }

    // Reconnect/error state — invalid token falls back cleanly to Entry.
    {
      const { ctx, page } = await newPlayer(browser, errors, MOBILE_375, 'reconnect');
      await createTable(page, 'Grace');
      await page.evaluate(() => {
        localStorage.setItem(
          'perudo:session',
          JSON.stringify({ roomId: 'GHOST', token: 'not-a-real-token' }),
        );
      });
      await page.reload();
      await page.getByLabel('Nickname').waitFor({ state: 'visible', timeout: 15_000 });
      await shoot(page, '25-reconnect-invalid-token-fallback-mobile');
      await ctx.close();
    }
  } finally {
    await browser.close();
    await dev.stop();
  }

  console.log(`\nScreenshots written to ${OUT_DIR}`);
  if (errors.length > 0) {
    console.log(`\n${errors.length} console/page error(s):`);
    for (const e of errors) {
      console.log(' -', e);
    }
  } else {
    console.log('\nNo console/page errors observed.');
  }
}

main().catch((err) => {
  console.error('VISUAL REVIEW PART 2 SCRIPT ERROR', err);
  process.exitCode = 1;
});
