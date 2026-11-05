// Render game states directly on every connected Android device/emulator — no server, no match.
//
//   node e2e/device-render.mjs [--states a,b,…] [--devices serial,…] [--install] [--out dir]
//
// How it works: the states in fixture-states.mjs are served from this machine on :4300; each
// device gets `adb reverse tcp:4300`, then the app is cold-started with the deep link
// `perudo://fixture?src=http://localhost:4300/<state>.json` (core/fixture-loader.ts), so it
// renders that exact state. Devices run in parallel; states run in order per device.
//
// Output: screenshots in <out>/<device>/<state>.png (default e2e/.screenshots/device-render), and
// one running text log per device in e2e/.device-log/<device>.log recording the date, the commit
// the run was made from (and whether the tree was dirty), the APK's build time, and every state's
// result (PASS: state marker seen; WARN: marker unreadable but the screen has content — check the
// screenshot; FAIL: blank screen or crash) — so you can see what each emulator last tested, and
// against which code.
//
// Needs: adb on PATH (or ANDROID_HOME), the debug APK installed (or pass --install after
// `npx cap sync android && cd android && gradlew assembleDebug`).
import { execFileSync, execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { STATE_MARKERS, STATES } from './fixture-states.mjs';

const run = promisify(execFile);
const HERE = import.meta.dirname;
const PORT = 4300;
const BLANK_SCREENSHOT_BYTES = 150_000;
const APP_ID = 'com.perudo.app';
const APK = path.resolve(HERE, '../android/app/build/outputs/apk/debug/app-debug.apk');
const ADB = process.env.ANDROID_HOME
  ? path.join(
      process.env.ANDROID_HOME,
      'platform-tools',
      process.platform === 'win32' ? 'adb.exe' : 'adb',
    )
  : 'adb';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

const adb = (serial, ...args) => run(ADB, ['-s', serial, ...args], { maxBuffer: 1 << 26 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listDevices() {
  return execFileSync(ADB, ['devices'], { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim().split('\t'))
    .filter(([s, st]) => s && st === 'device')
    .map(([s]) => s);
}

async function deviceName(serial) {
  const { stdout } = await adb(serial, 'shell', 'getprop', 'ro.product.model');
  return `${stdout.trim().replace(/[^\w.-]+/g, '_')}@${serial.replace(/[^\w.-]+/g, '_')}`;
}

function gitInfo() {
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8', cwd: HERE }).trim();
  const dirty = git('status', '--porcelain', '--', '.', '../../shared').length > 0;
  return `${git('rev-parse', '--short', 'HEAD')} (${git('rev-parse', '--abbrev-ref', 'HEAD')})${dirty ? ' + uncommitted changes' : ''}`;
}

function serveStates() {
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent((req.url ?? '').replace(/^\//, '').replace(/\.json$/, ''));
    const build = STATES[name];
    if (!build) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(build()));
  });
  return new Promise((resolve) => server.listen(PORT, '0.0.0.0', () => resolve(server)));
}

async function renderOne(serial, state, file) {
  await adb(serial, 'shell', 'am', 'force-stop', APP_ID);
  const link = `perudo://fixture?src=http://localhost:${PORT}/${state}.json`;
  await adb(
    serial,
    'shell',
    'am',
    'start',
    '-W',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    `'${link}'`,
    APP_ID,
  );
  // Wait for the state's own marker text in the accessibility tree — a fixed sleep let blank,
  // still-booting WebViews pass when nine devices cold-started at once.
  const marker = STATE_MARKERS[state];
  const deadline = Date.now() + +arg('timeout', 60000);
  let found = false;
  while (!found && Date.now() < deadline) {
    await sleep(1000);
    // Delete first: a failed dump otherwise leaves the previous state's tree on disk, and states
    // that share a marker (the spectate-* trio) then "pass" on a blank screen.
    await adb(serial, 'shell', 'rm', '-f', '/sdcard/perudo-ui.xml').catch(() => null);
    await adb(serial, 'shell', 'uiautomator', 'dump', '/sdcard/perudo-ui.xml').catch(() => null);
    const { stdout: xml } = await adb(serial, 'shell', 'cat', '/sdcard/perudo-ui.xml').catch(
      () => ({
        stdout: '',
      }),
    );
    found = !marker || xml.includes(marker);
  }
  await sleep(600); // let entrance animations settle before the screenshot
  const { stdout: pid } = await adb(serial, 'shell', 'pidof', APP_ID).catch(() => ({ stdout: '' }));
  const { stdout: png } = await run(ADB, ['-s', serial, 'exec-out', 'screencap', '-p'], {
    encoding: 'buffer',
    maxBuffer: 1 << 26,
  });
  fs.writeFileSync(file, png);
  if (!pid.trim()) return 'CRASHED (app not running after launch)';
  if (found) return 'ok';
  // uiautomator occasionally returns an empty tree on emulators even when the screen is fine, so
  // a missing marker on a screenshot with real content is a WARN (check it by eye), not a FAIL.
  // A blank, still-booting WebView compresses to a few dozen KB.
  return png.length > BLANK_SCREENSHOT_BYTES
    ? `WARN marker "${marker}" not readable — screenshot has content, check it`
    : `did not render (blank screen, no "${marker}")`;
}

async function runDevice(serial, states, outDir, commit) {
  const name = await deviceName(serial);
  const dir = path.join(outDir, name);
  fs.mkdirSync(dir, { recursive: true });
  if (arg('install')) await adb(serial, 'install', '-r', APK);
  await adb(serial, 'shell', 'input', 'keyevent', '224');
  await adb(serial, 'shell', 'wm', 'dismiss-keyguard');
  await adb(serial, 'reverse', `tcp:${PORT}`, `tcp:${PORT}`);
  const results = [];
  for (const state of states) {
    const result = await renderOne(serial, state, path.join(dir, `${state}.png`)).catch(
      (e) => `ERROR ${e.message.split('\n')[0]}`,
    );
    const status = result === 'ok' ? 'PASS' : result.startsWith('WARN') ? 'WARN' : 'FAIL';
    const detail = result === 'ok' ? '' : ` — ${result.replace(/^WARN /, '')}`;
    results.push(`  ${status}  ${state}${detail}`);
  }
  await adb(serial, 'shell', 'am', 'force-stop', APP_ID);
  const apkTime = fs.existsSync(APK) ? fs.statSync(APK).mtime.toISOString() : 'unknown';
  const entry = [
    `== ${new Date().toISOString()}  commit ${commit}`,
    `   apk built ${apkTime}${arg('install') ? ' (installed this run)' : ''}`,
    `   screenshots ${dir}`,
    ...results,
    '',
  ].join('\n');
  const logDir = path.join(HERE, '.device-log');
  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(path.join(logDir, `${name}.log`), entry + '\n');
  return `${name}\n${results.join('\n')}`;
}

async function main() {
  const wanted = arg('states');
  const states = typeof wanted === 'string' ? wanted.split(',') : Object.keys(STATES);
  const unknown = states.filter((s) => !STATES[s]);
  if (unknown.length) throw new Error(`unknown states: ${unknown.join(', ')}`);
  const only = arg('devices');
  const devices = listDevices().filter(
    (s) => typeof only !== 'string' || only.split(',').includes(s),
  );
  if (!devices.length) throw new Error('no devices — check `adb devices`');
  const outDir = path.resolve(
    typeof arg('out') === 'string' ? arg('out') : path.join(HERE, '.screenshots/device-render'),
  );
  const commit = gitInfo();
  const server = await serveStates();
  console.log(`rendering ${states.length} states on ${devices.length} devices from ${commit}`);
  try {
    const reports = await Promise.all(devices.map((d) => runDevice(d, states, outDir, commit)));
    console.log(reports.join('\n\n'));
    process.exitCode = reports.some((r) => r.includes('FAIL')) ? 1 : 0;
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error('DEVICE RENDER ERROR', e.message);
  process.exitCode = 1;
});
