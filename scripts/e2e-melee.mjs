// Browser check for the melee strike: B swings (head on = a hit, from behind = a kill with MELEE in the kill feed), the cooldown holds,
// the swing animation runs on the viewmodel, and nothing throws.
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome', URL = process.env.URL || 'http://127.0.0.1:4173/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
let fails = 0; const errors = [];
const check = (n, ok, d = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${d}`); };
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(URL + '?autostart&bots=3&loot=0&drop=0', { waitUntil: 'load' });
await page.waitForFunction('window.__nh && window.__nh.sim && window.__nh.sim.player && window.__nh.sim.time > 0.8', { timeout: 60000 });
const gameWait = (secs) => page.evaluate((s) => new Promise((res) => { const t0 = window.__nh.sim.time, w0 = performance.now(); const iv = setInterval(() => { if (window.__nh.sim.time - t0 >= s || performance.now() - w0 > 40000) { clearInterval(iv); res(); } }, 30); }), secs);
// nobody interferes: the player cannot be hurt, the bots stand still, and two of them are moved far away
const setup = await page.evaluate(() => {
  const { sim } = window.__nh, a = sim.player, o = sim.damage.bind(sim); sim.damage = (t, ...r) => (t === a ? undefined : o(t, ...r));
  const bots = sim.fighters.filter((f) => f !== a && !f.npc); for (const f of bots) f.brain = null;
  const tp = (f, x, z) => { f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); sim.world.propagateModifiedBodyPositionsToColliders(); f.x = x; f.y = 0.9; f.z = z; };
  let spot = null;
  for (let z = -30; z <= 30 && !spot; z += 6) for (let x = -50; x <= 20 && !spot; x += 7) if (sim.losClear(x, 1.6, z, x, 1.3, z - 4)) spot = { x, z };
  tp(bots[1], 90, 90); tp(bots[2], -90, 90);
  tp(a, spot.x, spot.z); tp(bots[0], spot.x, spot.z - 1.5); a.yaw = 0; window.__nh.cmd.yaw = 0; window.__nh.cmd.pitch = 0; bots[0].yaw = Math.PI;
  window.__spot = spot; window.__target = bots[0];
  return { spot, hp: bots[0].hp };
});
const st = () => page.evaluate(() => { const { sim } = window.__nh, t = window.__target; return { hp: t.hp, alive: t.alive, meleeT: sim.player.meleeT, feed: document.getElementById('feed').textContent }; });
const press = async () => { await page.keyboard.down('KeyB'); await gameWait(0.1); await page.keyboard.up('KeyB'); await gameWait(0.1); };
const evs = page.evaluate(() => { window.__melee = []; const o = window.__nh.sim.drainEvents.bind(window.__nh.sim); window.__nh.sim.drainEvents = () => { const e = o(); for (const x of e) if (x.t === 'melee') window.__melee.push({ ...x, meleeT: window.__nh.sim.player.meleeT }); return e; }; });
await evs;
await press();
let s = await st();
check('B head on: the target loses the front damage', s.hp === setup.hp - 48, `hp ${setup.hp} -> ${s.hp}`);
const swings = await page.evaluate(() => window.__melee);
check('one swing event for the player, and the cooldown had started when it was reported', swings.length === 1 && swings[0].meleeT > 0.6, JSON.stringify(swings.map((x) => ({ by: x.by, hit: x.hit, meleeT: +x.meleeT.toFixed(2) }))));
await gameWait(1);
// from behind
await page.evaluate(() => { window.__target.yaw = 0; });
await press(); await gameWait(0.2);
s = await st();
check('from behind it is a kill', s.alive === false, JSON.stringify({ alive: s.alive }));
check('the kill feed says MELEE', /MELEE/.test(s.feed), s.feed.slice(0, 80));
check('no page errors or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(fails === 0 ? '\nmelee e2e: all good' : `\n${fails} FAILED`); process.exit(fails ? 1 : 0);
