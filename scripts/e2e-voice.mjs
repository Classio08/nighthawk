// Browser check for the radio voices: an operation opens with the KESTREL/SABLE/... line as a subtitle, the voice request reaches an <audio> element,
// subtitles obey Settings and ?subs=0, a kill produces a line, and nothing throws. (Headless Chrome cannot prove you HEAR it; it proves the pipeline runs.)
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome', URL = process.env.URL || 'http://127.0.0.1:4173/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,720'] });
let fails = 0; const errors = [];
const check = (n, ok, d = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${d}`); };

async function open(query) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.evaluateOnNewDocument(() => { window.__played = []; const P = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { window.__played.push(this.src.split('/').pop()); return P.call(this); }; });
  await page.goto(URL + query, { waitUntil: 'load' });
  await page.waitForSelector('#operationbtn', { timeout: 30000 });
  await page.click('#operationbtn');
  await page.waitForFunction('window.__nh && window.__nh.sim && window.__nh.sim.mission && window.__nh.sim.time > 0.5', { timeout: 60000 });
  return page;
}
const sub = (page) => page.evaluate(() => { const e = document.getElementById('subtitle'); return { text: e.innerText, shown: getComputedStyle(e).opacity !== '0', n: e.children.length }; });

const a = await open('?loot=0');
await wait(2600);
const s1 = await sub(a), played1 = await a.evaluate(() => window.__played);
check('the operation opens with a radio line as a subtitle', s1.shown && s1.text.length > 8 && s1.n === 2, JSON.stringify(s1));
check('the same line was sent to an audio element (an owner mp3 under /audio/voice/)', played1.length >= 1 && played1[0].endsWith('.mp3'), JSON.stringify(played1));
const mp3ok = await a.evaluate(async (f) => (await fetch(`./audio/voice/${f}`)).ok, played1[0] ?? 'x');
check('that mp3 exists in the build', mp3ok, played1[0]);

// wait for the opening line to finish (one voice at a time: an equal-priority line must not talk over it), then a real kill by the player through the simulation
await wait(3800);
await a.evaluate(() => { const { sim } = window.__nh; const g = sim.fighters.find((f) => f.npc && f.hp > 0); sim.damage(g, 9999, sim.player, { w: 'ar', head: true }); });
await wait(5200);
const played2 = await a.evaluate(() => window.__played);
check('a first kill after the opening line produces another line (first blood / headshot)', played2.length >= 2, JSON.stringify(played2));
await a.close();

const b = await open('?loot=0&subs=0');
await wait(2600);
const s2 = await sub(b), played3 = await b.evaluate(() => window.__played);
check('?subs=0 hides subtitles but the voice still plays', !s2.shown && played3.length >= 1, JSON.stringify({ s2, played3 }));
await b.close();

const c = await open('?loot=0&voice=0');
await wait(2600);
const s3 = await sub(c), played4 = await c.evaluate(() => window.__played);
check('?voice=0 keeps the subtitle and plays nothing', s3.shown && played4.length === 0, JSON.stringify({ s3, played4 }));
await c.close();

check('no browser errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\nvoice e2e FAIL (${fails})` : '\nvoice e2e: all good');
process.exit(fails ? 1 : 0);
