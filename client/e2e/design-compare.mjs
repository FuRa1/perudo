// Design-parity tooling: renders an approved design mockup and the live app side by side, so a
// comparison is made against real pixels rather than by reading hex values out of the mockup's
// source.
//
// The files under /designs are Claude design-canvas exports (`*.dc.html`). Their `_ds` style
// bundle isn't vendored here, but that doesn't matter: every phone panel in them is plain
// inline-styled markup, so they render faithfully in a browser on their own. Each panel is a
// 390x844 div, which is what `panel` targets.
//
// Usage (dev server must already be running — `npm run dev` from the repo root):
//   node e2e/design-compare.mjs panels <designFile>
//       list how many 390x844 panels a design file has
//   node e2e/design-compare.mjs design <designFile> <index> <out.png>
//       crop one design panel to a PNG
//   node e2e/design-compare.mjs live <fixtureName> <out.png> [top|bottom] [localFixture.json]
//       screenshot a live app state via the fixture loader; the optional local JSON is served in
//       place of the real fixture (for a synthetic state you don't want committed)
//   node e2e/design-compare.mjs viewports <fixtureName> <outDir> [localFixture.json]
//       screenshot one state at 320/390/768/1440 and assert no horizontal overflow at each
//   node e2e/design-compare.mjs side <out.png> <label> <img> [<label> <img> ...]
//       compose captures into one labelled side-by-side sheet
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CLIENT_URL } from './support.mjs';

const MOBILE = { width: 390, height: 844 };
const VIEWPORTS = [
  { name: '320', width: 320, height: 720 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
];

async function openDesign(browser, file) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const page = await ctx.newPage();
  // The mockups reference a style bundle that isn't vendored; its absence is expected and only
  // affects decorative canvas chrome, never the panels themselves.
  page.on('pageerror', () => {});
  await page.goto(pathToFileURL(path.resolve(file)).href, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  return { ctx, page, panels: page.locator('div[style*="width:390px"][style*="height:844px"]') };
}

/** Loads a live state through the dev-only fixture loader (see STATE_FIXTURES_AND_SAVE_PLAN.md).
 * Returns the console errors seen, so a caller can report them rather than silently screenshotting
 * a broken page. */
async function openLive(ctx, fixture, localFixture) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  if (localFixture) {
    await page.route(`**/assets/fixtures/${fixture}.json`, (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: fs.readFileSync(localFixture, 'utf8'),
      }),
    );
  }
  await page.goto(`${CLIENT_URL}/?fixture=${fixture}`);
  await page.waitForTimeout(1600);
  // The dev server can keep serving a stale compile-error overlay from a transient mid-save state
  // even after a good rebuild; it dismisses on Escape. Real breakage still surfaces through the
  // console errors returned here and through `ng build`, which is the actual gate.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  return { page, errors };
}

async function scrollContent(page, where) {
  await page.evaluate((w) => {
    const content = document.querySelector('ion-content');
    if (w === 'bottom') {
      content?.scrollToBottom(0);
    } else {
      content?.scrollToTop(0);
    }
  }, where);
  await page.waitForTimeout(250);
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  const browser = await chromium.launch();
  try {
    if (mode === 'panels') {
      const { page, panels } = await openDesign(browser, args[0]);
      console.log(`${await panels.count()} panels in ${args[0]}`);
      const labels = await page.$$eval('[data-screen-label]', (ns) =>
        ns.map((n) => n.getAttribute('data-screen-label')),
      );
      if (labels.length) {
        console.log('labels:', labels.join(' | '));
      }
      return;
    }

    if (mode === 'design') {
      const [file, index, out] = args;
      const { page, panels } = await openDesign(browser, file);
      const el = panels.nth(Number(index));
      await el.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await el.screenshot({ path: out });
      console.log('wrote', out);
      return;
    }

    if (mode === 'live') {
      const [fixture, out, where, localFixture] = args;
      const ctx = await browser.newContext({ viewport: MOBILE, deviceScaleFactor: 3 });
      const { page, errors } = await openLive(ctx, fixture, localFixture);
      await scrollContent(page, where);
      await page.screenshot({ path: out });
      console.log('wrote', out, errors.length ? `CONSOLE ERRORS: ${errors.join(' | ')}` : '');
      return;
    }

    if (mode === 'viewports') {
      const [fixture, outDir, localFixture] = args;
      let failures = 0;
      for (const vp of VIEWPORTS) {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 2,
        });
        const { page, errors } = await openLive(ctx, fixture, localFixture);
        const box = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        await page.screenshot({ path: path.join(outDir, `${fixture}-${vp.name}.png`) });
        const ok = box.scrollWidth <= box.clientWidth && errors.length === 0;
        if (!ok) {
          failures += 1;
        }
        console.log(
          `${ok ? 'PASS' : 'FAIL'} ${fixture} @${vp.name} sw=${box.scrollWidth} cw=${box.clientWidth}` +
            (errors.length ? ` ERRORS: ${errors.join(' | ')}` : ''),
        );
        await ctx.close();
      }
      process.exitCode = failures === 0 ? 0 : 1;
      return;
    }

    if (mode === 'side') {
      const [out, ...rest] = args;
      const cols = [];
      for (let i = 0; i < rest.length; i += 2) {
        cols.push([rest[i], fs.readFileSync(rest[i + 1]).toString('base64')]);
      }
      const width = 430;
      const html =
        `<body style="margin:0;background:#2b2b2b;font-family:system-ui;display:flex;gap:18px;padding:22px;align-items:flex-start">` +
        cols
          .map(
            ([label, data]) =>
              `<div style="display:flex;flex-direction:column;gap:10px;align-items:center;width:${width}px">` +
              `<div style="color:#eee;font-size:17px;font-weight:600;text-align:center">${label}</div>` +
              `<img src="data:image/png;base64,${data}" style="width:${width}px;border:1px solid #555;border-radius:6px"/></div>`,
          )
          .join('') +
        `</body>`;
      const page = await browser.newPage({
        viewport: { width: cols.length * (width + 18) + 26, height: 1000 },
        deviceScaleFactor: 2,
      });
      await page.setContent(html);
      await page.waitForTimeout(300);
      await page.locator('body').screenshot({ path: out });
      console.log('wrote', out);
      return;
    }

    console.error('Unknown mode. See this file’s header for usage.');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('DESIGN COMPARE ERROR', err);
  process.exitCode = 1;
});
