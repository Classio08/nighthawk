// Browser check for realistic movement: slide (sprint + C), the head-bob camera, and the ?bob=0 accessibility switch. Needs `npx vite build` + `npx vite preview --port 4173`.
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome', URL = process.env.URL || 'http://127.0.0.1:4173/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
let fails = 0; const errors = [];
const check = (n, ok, d = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${d}`); };

async function session(query, fn) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL + '?autostart&seed=5&bots=0&loot=0&drop=0&' + query, { waitUntil: 'load' });
  await page.waitForFunction('window.__nh && window.__nh.sim', { timeout: 40000 });
  await wait(800);
  try { await fn(page); } finally { await page.close(); }
}
// y = the view-motion offset the game adds to the eye height (headbob.js). Record one entry per rendered frame (swiftshader runs this at a few fps, so a wall-clock timer would miss most of the motion)
const startRec = (page) => page.evaluate(() => { const n = window.__nh; window.__rec = []; if (window.__recOn) return; window.__recOn = true; const f = () => { const p = n.sim.player; window.__rec.push({ y: n.G.vmo.y, camY: n.camera.position.y, sliding: !!p.sliding, fov: n.camera.fov, roll: n.camera.rotation.z, speed: p.speedH }); requestAnimationFrame(f); }; requestAnimationFrame(f); });
const clearRec = (page) => page.evaluate(() => { window.__rec.length = 0; });
async function walkRange(page) {
  await startRec(page); await page.keyboard.down('KeyW');
  await page.waitForFunction('window.__rec.filter((r) => r.speed > 2).length > 5', { timeout: 20000 }).catch(() => {});
  await clearRec(page);
  await page.waitForFunction('window.__rec.filter((r) => r.speed > 2).length >= 40', { timeout: 40000 }).catch(() => {});
  const rec = (await page.evaluate(() => window.__rec)).filter((r) => r.speed > 2); await page.keyboard.up('KeyW');
  const ys = rec.map((r) => r.y); return { range: Math.max(...ys) - Math.min(...ys), frames: rec.length };
}

await session('bob=1', async (page) => {
  const w = await walkRange(page); await wait(300);
  check('walking: the first-person camera bobs', w.frames >= 20 && w.range > 0.015 && w.range < 0.15, `range ${w.range.toFixed(3)} m over ${w.frames} frames`);

  // slide: hold sprint + W, then C. (swiftshader runs this at a few fps, so record every rendered frame instead of polling on a timer)
  await clearRec(page);
  await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft'); await wait(1200);
  await page.keyboard.down('KeyC');
  await page.waitForFunction('window.__rec.some((r) => r.sliding)', { timeout: 8000 }).catch(() => {});
  await wait(500);
  await page.keyboard.up('KeyC'); await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
  const rec = await page.evaluate(() => window.__rec), sl = rec.filter((r) => r.sliding);
  check('sprint + C starts a slide', sl.length > 0, `${sl.length} frames`);
  const baseFov = await page.evaluate(() => window.__nh.settings?.fov ?? 78);
  check('the slide widens the field of view and rolls the camera', sl.length > 0 && Math.max(...sl.map((s) => s.fov)) > 81 && Math.max(...sl.map((s) => Math.abs(s.roll))) > 0.03, `fov up to ${Math.max(...sl.map((s) => s.fov)).toFixed(1)}, roll up to ${Math.max(...sl.map((s) => Math.abs(s.roll))).toFixed(3)}`);
  await page.waitForFunction('!window.__nh.sim.player.sliding', { timeout: 8000 }).catch(() => {});
  check('the slide ends by itself', await page.evaluate(() => !window.__nh.sim.player.sliding));
});

await session('bob=0', async (page) => {
  const w = await walkRange(page);
  check('?bob=0: no head bob (accessibility)', w.frames >= 20 && w.range === 0, `range ${w.range.toFixed(4)} m over ${w.frames} frames`);
});

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close(); process.exit(fails ? 1 : 0);
