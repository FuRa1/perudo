// Small shared helpers for the plain-`playwright` E2E scripts in this folder (lobby-flow.e2e.mjs,
// render-states.mjs) — kept minimal on purpose, not a framework: see lobby-flow.e2e.mjs's header
// comment for why this doesn't use @playwright/test.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const CLIENT_URL = 'http://localhost:4200';
export const SERVER_URL = 'http://localhost:3000';

async function isUp(url) {
  try {
    const res = await fetch(url);
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitUntilUp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUp(url)) {
      return true;
    }
    await sleep(500);
  }
  return false;
}

/** Starts `npm run dev` (root script: builds shared, then server + client together) only if
 * nothing is already listening — reuses an already-running dev setup instead of double-starting
 * it, and only tears down what it itself started. */
export async function ensureServersRunning() {
  const alreadyUp = (await isUp(SERVER_URL)) && (await isUp(CLIENT_URL));
  if (alreadyUp) {
    return { stop: async () => {} };
  }
  const child = spawn('npm', ['run', 'dev'], {
    cwd: REPO_ROOT,
    shell: true,
    stdio: 'ignore',
  });
  const serverReady = await waitUntilUp(SERVER_URL, 120_000);
  const clientReady = await waitUntilUp(CLIENT_URL, 120_000);
  if (!serverReady || !clientReady) {
    child.kill();
    throw new Error(
      `Dev servers did not become ready in time (server=${serverReady}, client=${clientReady}).`,
    );
  }
  return {
    stop: async () => {
      child.kill();
    },
  };
}

/** Deterministic Clipboard/Web-Share stubs — installed before any app script runs, so
 * lobby.ts's real copyRoomCode()/shareRoomCode() call these instead of the real OS APIs. Each
 * exposes what was actually called on `window`, so a test can assert the UI's success/failure
 * claim matches what the stub actually did, rather than trusting the UI blindly. */
export async function installClipboardAndShareStubs(page, { shareAvailable }) {
  await page.addInitScript((shareAvailable) => {
    window.__copyCalls = [];
    window.__copyShouldFail = false;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text) => {
          window.__copyCalls.push(text);
          return window.__copyShouldFail
            ? Promise.reject(new Error('stub-clipboard-denied'))
            : Promise.resolve();
        },
      },
    });
    if (shareAvailable) {
      window.__shareCalls = [];
      window.__shareShouldFail = false;
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (data) => {
          window.__shareCalls.push(data);
          return window.__shareShouldFail
            ? Promise.reject(new Error('stub-share-denied'))
            : Promise.resolve();
        },
      });
    } else {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    }
  }, shareAvailable);
}

export async function typeRoomCode(page, code) {
  await page.locator('ion-input-otp').click();
  await page.keyboard.type(code, { delay: 20 });
}

export function makeChecker() {
  let failures = 0;
  function check(label, condition, detail = '') {
    const ok = !!condition;
    console.log(`${ok ? 'PASS' : 'FAIL'} - ${label}${detail ? ' :: ' + detail : ''}`);
    if (!ok) {
      failures += 1;
    }
  }
  return { check, getFailures: () => failures };
}
