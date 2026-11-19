// Browser check for the start-screen dashboard and its ECONOMY tab, against REAL game servers (started here, one process each, same origin as the page):
//   A) default build: economy CLOSED -> the tab says so and offers no wallet button
//   B) NIGHTHAWK_ECONOMY=sandbox -> CONNECT WALLET with a FAKE wallet (window.ethereum is a stub that makes genuine secp256k1 personal_sign signatures
//      from a throwaway key), faucet, balance, self-exclusion; plus: no wallet installed -> a plain error, never a crash
// Also checks the static parts: tabs, KPI cards, operation cards (2 playable + planned), the key art loads, the existing play buttons still work.
// NOT a test with a real MetaMask or a real chain. Needs `npx vite build` (serves dist/). Usage: node scripts/e2e-dashboard.mjs [closed|sandbox]
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { signPersonal, addressOfPublicKey } from '../src/economy/wallet.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'closed';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const PORT = mode === 'sandbox' ? 2581 : 2580;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const errors = [];
const check = (n, ok, d = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${d}`); };

const db = resolve(tmpdir(), `nh-e2e-dashboard-${mode}-${process.pid}.json`);
const economyEnv = JSON.stringify(mode === 'sandbox' ? { NIGHTHAWK_ECONOMY: 'sandbox', ECONOMY_DB: db } : { ECONOMY_DB: db });
const server = spawn(process.execPath, ['-e', `import('${resolve(root, 'server/src/index.js')}').then(async (m) => { const s = await m.createServer({ lobbySecs: 3, total: 2, vehicles: false, loot: false, drop: false, economyEnv: ${economyEnv} }); await s.listen(${PORT}); console.log('UP'); })`], { cwd: root, env: { ...process.env, STATIC_DIR: resolve(root, 'dist') }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('server did not start')), 20000); server.stdout.on('data', (d) => { if (String(d).includes('UP')) { clearTimeout(t); res(); } }); server.stderr.on('data', (d) => { if (/EADDRINUSE|Error/.test(String(d))) { clearTimeout(t); rej(new Error(String(d).slice(0, 200))); } }); });

server.stderr.on('data', (d) => process.env.DEBUG_SERVER && console.log('   [server stderr]', String(d).slice(0, 400)));
server.stdout.on('data', (d) => process.env.DEBUG_SERVER && console.log('   [server]', String(d).slice(0, 200)));
const keyBytes = secp256k1.utils.randomSecretKey(), key = bytesToHex(keyBytes);                          // throwaway test key: exists only in this process
const address = addressOfPublicKey(secp256k1.getPublicKey(keyBytes, false));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  if (process.env.DEBUG_SERVER) page.on('requestfailed', (r) => console.log('   [requestfailed]', r.method(), r.url(), r.failure()?.errorText));
  await page.exposeFunction('__sign', (message) => signPersonal(message, key));
  await page.evaluateOnNewDocument((addr) => {
    window.__ethCalls = [];
    if (new URLSearchParams(location.search).has('nowallet')) return;
    window.ethereum = { request: async ({ method, params }) => { window.__ethCalls.push(method); if (method === 'eth_requestAccounts') return [addr]; if (method === 'eth_chainId') return '0xaa36a7'; if (method === 'personal_sign') return window.__sign(params[0]); throw new Error('unexpected wallet method ' + method); } };
  }, address);
  await page.goto(`http://127.0.0.1:${PORT}/?loot=0`, { waitUntil: 'load' });
  await page.waitForSelector('#dashops .opcard', { timeout: 30000 });

  // ---- static dashboard parts
  const home = await page.evaluate(() => ({
    kpis: [...document.querySelectorAll('#dashkpis .kpi')].map((k) => k.textContent), cards: [...document.querySelectorAll('#dashops .opcard')].map((c) => ({ t: c.querySelector('h3').textContent, s: c.classList.contains('playable') ? 'playable' : 'planned', btn: !!c.querySelector('button') })),
    art: (() => { const i = document.querySelector('.dash-art'); return { ok: i.complete && i.naturalWidth > 1000, w: i.naturalWidth }; })(), tabs: [...document.querySelectorAll('.dtab')].map((t) => t.textContent),
    playVisible: ['playbtn', 'onlinebtn', 'operationbtn', 'operation2btn', 'operation3btn', 'startsettings', 'navplay'].every((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.width > 0 && r.height > 0; }),
  }));
  check('four KPI cards (operations, best grade, ribbons, level)', home.kpis.length === 4 && /0\/3/.test(home.kpis[0]) && /LV 1/.test(home.kpis[3]), JSON.stringify(home.kpis));
  check('three PLAYABLE operation cards carry the real start buttons, the rest are PLANNED without one', home.cards.filter((c) => c.s === 'playable').length === 3 && home.cards.filter((c) => c.s === 'planned').length >= 6 && home.cards.filter((c) => c.btn).length === 3, JSON.stringify(home.cards.map((c) => `${c.t}:${c.s}`)));
  check('the key art loaded (a real image, not a broken one)', home.art.ok, `w=${home.art.w}`);
  check('HOME shows every play button and SETTINGS without scrolling to another tab', home.playVisible);
  check('tabs: HOME LOADOUT ECONOMY CONTROLS', home.tabs.join() === 'HOME,LOADOUT,ECONOMY,CONTROLS', home.tabs.join());
  await page.click('.dtab[data-tab=loadout]'); await wait(150);
  const lo = await page.evaluate(() => ({ panel: document.querySelector('.dpanel.on').dataset.panel, name: !!document.getElementById('namebox').offsetParent, op: !!document.getElementById('operatorbox').offsetParent, home: !!document.getElementById('playbtn').offsetParent }));
  check('LOADOUT tab shows callsign + operator and hides the play buttons', lo.panel === 'loadout' && lo.name && lo.op && !lo.home, JSON.stringify(lo));
  await page.click('.dtab[data-tab=controls]'); await wait(100);
  check('CONTROLS tab lists the keys', /crouch/i.test(await page.$eval('.dpanel.on', (e) => e.textContent)));

  // ---- economy tab
  await page.click('.dtab[data-tab=economy]'); await page.waitForFunction(() => document.getElementById('dasheco').textContent.length > 20 && !/CHECKING FOR/i.test(document.getElementById('dasheco').textContent), { timeout: 15000 });
  const eco = () => page.evaluate(() => ({ head: document.querySelector('#dasheco .ecohead')?.textContent ?? '', text: document.getElementById('dasheco').innerText, buttons: [...document.querySelectorAll('#dasheco button')].map((b) => b.textContent) }));
  let e = await eco();
  if (mode === 'closed') {
    check('default build: the ECONOMY tab says ECONOMY CLOSED', /ECONOMY CLOSED/.test(e.head), e.head);
    check('closed: no wallet, faucet or staking button is offered', e.buttons.length === 0, e.buttons.join());
    const st = await page.evaluate(async () => (await fetch('/economy/status')).json());
    check('the server itself reports mode off with every feature false', st.mode === 'off' && Object.values(st.features).every((v) => v === false), JSON.stringify(st.features));
    const ch = await page.evaluate(async () => (await fetch('/economy/wallet/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"address":"0x' + 'ab'.repeat(20) + '","chainId":11155111}' })).status);
    check('closed: the wallet challenge route refuses (403)', ch === 403, String(ch));
  } else {
    check('sandbox: the tab says SANDBOX · PLAY MONEY ONLY and warns it is a prototype', /SANDBOX/.test(e.head) && /not yet tried with a real wallet/i.test(e.text), e.head);
    check('sandbox: CONNECT WALLET is offered, no staking button before sign-in', e.buttons.includes('CONNECT WALLET') && !e.buttons.some((b) => /STAKED/.test(b)), e.buttons.join());
    await page.click('#dasheco button.btn');
    await page.waitForFunction(() => /Signed in as/.test(document.getElementById('dasheco').textContent), { timeout: 15000 });
    e = await eco();
    const calls = await page.evaluate(() => window.__ethCalls);
    check('sign-in used the wallet only to get an account, the network and a SIGNATURE', calls.join() === 'eth_requestAccounts,eth_chainId,personal_sign', calls.join());
    check('signed in as the fake wallet address, 0 PLAY to start', e.text.includes(address.slice(0, 6)) && /0 PLAY/.test(e.text), e.text.slice(0, 160));
    check('after sign-in: faucet, staked quick play and self-exclusion are offered (play money)', e.buttons.some((b) => /CLAIM FREE PLAY MONEY/.test(b)) && e.buttons.some((b) => /STAKED QUICK PLAY \(PLAY MONEY\)/.test(b)) && e.buttons.some((b) => /SELF-EXCLUDE/.test(b)), e.buttons.join());
    await page.evaluate(() => [...document.querySelectorAll('#dasheco button')].find((b) => /CLAIM FREE/.test(b.textContent)).click());
    await page.waitForFunction(() => /^[1-9]\d* PLAY$/.test(document.querySelector('#dasheco .econum')?.textContent ?? ''), { timeout: 15000 });
    e = await eco(); check('the faucet paid play money (balance shown)', /[1-9]\d* PLAY/.test(e.text), JSON.stringify(e.text.slice(0, 400)));
    const stored = await page.evaluate(() => ({ session: sessionStorage.getItem('nh_econ_session'), local: Object.keys(localStorage).filter((k) => /econ|wallet|token/i.test(k)) }));
    check('the session token is in sessionStorage only (nothing wallet-related in localStorage)', !!stored.session && stored.local.length === 0 && !/0x[0-9a-f]{64}/i.test(stored.session), JSON.stringify(stored.local));
    await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#dashops .opcard'); await page.click('.dtab[data-tab=economy]');
    await page.waitForFunction(() => /^[1-9]\d* PLAY$/.test(document.querySelector('#dasheco .econum')?.textContent ?? ''), { timeout: 15000 });
    check('a reload in the same tab keeps the session (balance still shown)', /[1-9]\d* PLAY/.test((await eco()).text));
    // staked quick play from the menu (play money): the stake is locked while you wait in the lobby, and leaving before the match starts refunds it
    const tok = await page.evaluate(() => JSON.parse(sessionStorage.getItem('nh_econ_session')).token);
    const bal = async () => (await (await fetch(`http://127.0.0.1:${PORT}/economy/me`, { headers: { authorization: `Bearer ${tok}` } })).json()).balance;
    const before = await bal();
    await page.evaluate(() => [...document.querySelectorAll('#dasheco button')].find((b) => /STAKED QUICK PLAY/.test(b.textContent)).click());
    await page.waitForFunction(() => document.getElementById('lobby').classList.contains('show') || window.__nh?.sim, { timeout: 20000 });
    await wait(1500);
    check('the lobby screen is up while the stake is held', await page.evaluate(() => document.getElementById('lobby').classList.contains('show') && /in the lobby/.test(document.getElementById('lobbytxt').textContent)));
    const locked = await bal();
    check('staked quick play: the stake (100 PLAY, the minimum) is locked while waiting', before - locked === 100, `${before} -> ${locked}`);
    await page.goto(`http://127.0.0.1:${PORT}/health`);                                  // leave the page (same origin, so the tab keeps its session) before the match starts
    let now = locked; for (let i = 0; i < 12 && now !== before; i++) { await wait(3000); now = await bal(); }        // a dropped connection gets the server's 12 s reconnect window first, then the stake is refunded (poll gently: the server rate-limits /economy/* to 40 requests a minute per address)
    check('leaving before the match starts refunds the stake in full (after the reconnect window)', now === before, `${now} vs ${before}`);
    await page.goto(`http://127.0.0.1:${PORT}/?loot=0`, { waitUntil: 'load' }); await page.waitForSelector('#dashops .opcard'); await page.click('.dtab[data-tab=economy]');
    await page.waitForFunction(() => /Signed in as/.test(document.getElementById('dasheco').textContent), { timeout: 15000 }).catch(async (err) => { console.log('   debug after return:', JSON.stringify(await page.evaluate(() => ({ ss: sessionStorage.getItem('nh_econ_session')?.slice(0, 60), eco: document.getElementById('dasheco').innerText.slice(0, 200), url: location.href }))), 'now(s)=', Math.floor(Date.now() / 1000)); throw err; });
    await page.evaluate(() => [...document.querySelectorAll('#dasheco button')].find((b) => /SELF-EXCLUDE/.test(b.textContent)).click());
    await page.waitForFunction(() => /Self-exclusion set/.test(document.getElementById('dasheco').textContent), { timeout: 15000 }).catch(async (err) => { console.log('   debug self-exclude:', JSON.stringify(await page.evaluate(() => document.getElementById('dasheco').innerText.slice(0, 400)))); throw err; });
    check('self-exclusion confirms in plain words', /staked play is blocked/.test((await eco()).text));
    // no wallet installed -> plain error
    const p2 = await browser.newPage(); await p2.setViewport({ width: 1280, height: 720 });
    p2.on('pageerror', (er) => errors.push('pageerror(p2): ' + er.message));
    await p2.evaluateOnNewDocument(() => { delete window.ethereum; });
    await p2.goto(`http://127.0.0.1:${PORT}/?nowallet=1&loot=0`, { waitUntil: 'load' }); await p2.waitForSelector('#dashops .opcard'); await p2.click('.dtab[data-tab=economy]');
    await p2.waitForFunction(() => document.querySelector('#dasheco button.btn'), { timeout: 15000 }); await p2.click('#dasheco button.btn');
    await p2.waitForFunction(() => /No browser wallet/.test(document.getElementById('dasheco').textContent), { timeout: 10000 });
    check('no wallet installed: a plain explanation, the menu keeps working', true); await p2.close();
  }
  // the existing start button still starts the game from the new menu
  await page.click('.dtab[data-tab=home]'); await page.click('#playbtn');
  await page.waitForFunction('window.__nh && window.__nh.sim && window.__nh.sim.player', { timeout: 60000 });
  check('PLAY SOLO from the new menu starts a match', true);
} finally {
  check('no browser errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close(); server.kill('SIGTERM');
}
console.log(fails === 0 ? `\ndashboard e2e (${mode}): all good` : `\n${fails} FAILED`); process.exit(fails ? 1 : 0);
