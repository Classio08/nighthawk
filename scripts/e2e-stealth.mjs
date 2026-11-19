// Browser check for the stealth layer (src/sim/stealth.js) in SIGNAL BLACKOUT: E over a downed guard puts on the uniform (HUD tag + message),
// firing tears it off, reaching ALERT brings VIPER (a real view is created, no errors), the extraction searchlights are drawn and a lit operator is reported.
// Needs `npx vite build` + `npx vite preview --port 4173`.
import puppeteer from 'puppeteer-core';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome', URL = process.env.URL || 'http://127.0.0.1:4173/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
let fails = 0; const errors = [];
const check = (n, ok, d = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${d}`); };
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(URL + '?loot=0', { waitUntil: 'load' });
await page.waitForSelector('#operation2btn', { timeout: 30000 });
await page.click('#operation2btn');
await page.waitForFunction('window.__nh && window.__nh.sim && window.__nh.sim.mission && window.__nh.sim.time > 0.5', { timeout: 60000 });
const gameWait = (secs) => page.evaluate((s) => new Promise((res) => { const t0 = window.__nh.sim.time, w0 = performance.now(); const iv = setInterval(() => { if (window.__nh.sim.time - t0 >= s || performance.now() - w0 > 30000) { clearInterval(iv); res(); } }, 30); }), secs);
const tp = (x, z) => page.evaluate((x, z) => { const { sim } = window.__nh, f = sim.player; f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); sim.world.propagateModifiedBodyPositions?.(); f.x = x; f.z = z; }, x, z);
const press = async (code) => { await page.keyboard.down(code); await gameWait(0.15); await page.keyboard.up(code); await gameWait(0.2); };
const panel = () => page.evaluate(() => document.getElementById('mission').innerText.replace(/\n/g, ' | '));
// the player must survive the happy path: the garrison is not the thing under test
await page.evaluate(() => { const { sim } = window.__nh, o = sim.damage.bind(sim); sim.damage = (t, src, ...a) => (t === sim.player ? undefined : o(t, src, ...a)); });

// 1. uniform: a guard goes down far from the rest of the garrison (the landing zone), the operator strips the body
const g0 = await page.evaluate(() => {
  const { sim } = window.__nh, m = sim.mission, g = sim.fighters.find((f) => f.npc && f.brain?.p.guard && !f.brain.p.hunter);
  sim.damage(g, 9999, sim.player, { cause: 'bullet' });
  g.x = m.insertion.x + 4; g.z = m.insertion.z;                          // (the body lies at the landing zone, far from the garrison)
  m.alert.pressure = 0; m.alert.level = 'routine'; m.alert.maxIndex = 0;
  return { x: g.x, z: g.z };
});
await tp(g0.x - 1.2, g0.z + 0.4); await gameWait(0.4); await press('KeyE');
let d = await page.evaluate(() => ({ t: window.__nh.sim.player.disguiseT, level: window.__nh.sim.mission.alert.level }));
check('E over a downed guard puts on the uniform', d.t > 40 && d.t <= 45, JSON.stringify(d));
const p1 = await panel(); check('the mission panel shows the disguise timer', /DISGUISED \d+s/.test(p1), p1);
await page.screenshot({ path: join(tmpdir(), 'nighthawk_stealth_disguise.png') });

// 2. firing tears it off
const ammo0 = await page.evaluate(() => { const p = window.__nh.sim.player; return p.weapons[p.cur].ammo; });
await page.mouse.down(); await gameWait(0.3); await page.mouse.up(); await gameWait(0.2);
const ammo1 = await page.evaluate(() => { const p = window.__nh.sim.player; return p.weapons[p.cur].ammo; }); check('(the mouse really fired a round)', ammo1 < ammo0, `${ammo0} -> ${ammo1}`);
d = await page.evaluate(() => window.__nh.sim.player.disguiseT); check('a shot tears the uniform off', d === 0, `${d}`);
const p2 = await panel(); check('the panel drops the disguise tag', !/DISGUISED/.test(p2), p2);

// 3. VIPER at ALERT
const ins = await page.evaluate(() => ({ x: window.__nh.sim.mission.insertion.x, z: window.__nh.sim.mission.insertion.z })); await tp(ins.x, ins.z);
const before = await page.evaluate(() => ({ n: window.__nh.sim.fighters.length, views: window.__nh.G.views?.size ?? -1, viper: !!window.__nh.sim.stealth.viper }));
check('no VIPER before the garrison reaches ALERT', before.viper === false, JSON.stringify(before));
await page.evaluate(() => { window.__nh.sim.mission.alert.maxIndex = 3; });
await gameWait(1.0);
const v = await page.evaluate(() => { const { sim } = window.__nh; const f = sim.stealth.viper; return { has: !!f, name: f?.name, n: sim.fighters.length, view: !!window.__nh.G.views?.get(f?.id), status: sim.stealth.viperStatus() }; });
check('reaching ALERT deploys exactly one VIPER', v.has && v.name === 'VIPER' && v.n === before.n + 1, JSON.stringify(v));
check('VIPER has a body in the scene (a view was created)', v.view === true, JSON.stringify({ view: v.view, before: before.views }));
const p3 = await panel(); check('the panel says VIPER HUNTING', /VIPER HUNTING/.test(p3), p3);
await gameWait(2);

// 4. searchlights at extraction
await page.evaluate(() => { const m = window.__nh.sim.mission; m.nodes.forEach((n) => { n.done = true; n.progress = 8; }); m.stage = 'extract'; });
await gameWait(0.5);
const lights = await page.evaluate(() => window.__nh.sim.stealth.snapshot().lights);
check('the extraction searchlights switch on', lights.on === true && lights.spots.length === 2, JSON.stringify(lights));
const drawn = await page.evaluate(() => { const sv = window.__nh.G.stview; return sv ? sv.lamps.map((l) => l.cone.visible && l.pool.visible) : null; });
check('both searchlight beams are drawn', Array.isArray(drawn) && drawn.length === 2 && drawn.every(Boolean), JSON.stringify(drawn));
await page.screenshot({ path: join(tmpdir(), 'nighthawk_stealth_lights.png') });
// stand in a pool for ~1.8 s: reported, and the panel says so
const spotted0 = await page.evaluate(() => window.__nh.sim.stealth.spotted);
let sawTag = false;
for (let i = 0; i < 12; i++) { const s = await page.evaluate(() => window.__nh.sim.stealth.spots()[0]); await tp(s.x, s.z); await gameWait(0.15); if (/IN THE LIGHT/.test(await panel())) sawTag = true; }
const spotted1 = await page.evaluate(() => window.__nh.sim.stealth.spotted);
check('standing in a light for a second reports you', spotted1 === spotted0 + 1, JSON.stringify({ spotted0, spotted1 }));
check('the panel says IN THE LIGHT while you are lit', sawTag);
check('no browser errors', errors.length === 0, errors.slice(0, 3).join(' || '));
console.log(fails ? `\n${fails} failed` : '\nstealth e2e: all good');
await browser.close(); process.exit(fails ? 1 : 0);
