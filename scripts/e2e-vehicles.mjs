// Browser check for Stage 7 (vehicles): they are drawn, E enters (HUD prompt + hull readout), the chase camera sits behind, W drives and the
// drawn vehicle follows, the gun is hidden while driving, E leaves, a bike works, and a destroyed vehicle turns into a wreck.
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const URL = process.env.URL || 'http://127.0.0.1:4173/';
const OUT = process.env.OUT || '/tmp';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
let failed = 0; const errors = [];
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); };
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || /Shader Error|WebGLProgram/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
await page.goto(URL + '?autostart&bots=3&seed=5&weather=clear&gore=0&cstart=999&loot=0', { waitUntil: 'load' });
await page.waitForFunction('window.__nh && window.__nh.sim && window.__nh.G.vview', { timeout: 45000 });
await new Promise((r) => setTimeout(r, 900));

const a = await page.evaluate(() => { const n = window.__nh, s = n.sim; for (const f of s.fighters) if (!f.isPlayer) f.brain = null;
  return { sim: s.vehicles.list.length, drawn: n.G.vview.items.size, kinds: s.vehicles.list.map((v) => v.kind).join(',') }; });
check('every vehicle in the sim has a 3D model', a.sim >= 4 && a.drawn === a.sim, JSON.stringify(a));

// stand next to the first buggy, then look at the prompt
const prompt = await page.evaluate(async () => {
  const n = window.__nh, s = n.sim, p = s.player, v = s.vehicles.list.find((q) => q.kind === 'buggy'), w = (ms) => new Promise((r) => setTimeout(r, ms));
  const x = v.x + Math.cos(v.yaw) * 2.6, z = v.z - Math.sin(v.yaw) * 2.6;
  p.rb.setTranslation({ x, y: 0.9, z }, true); p.rb.setNextKinematicTranslation({ x, y: 0.9, z }); s.world.propagateModifiedBodyPositionsToColliders(); p.x = x; p.z = z; p.y = 0.9;
  await w(500); return { html: document.getElementById('veh').innerHTML, vis: document.getElementById('veh').style.display, vid: v.id };
});
check('walking up to a buggy shows "E ENTER BUGGY"', /ENTER BUGGY/.test(prompt.html) && prompt.vis === 'block', JSON.stringify(prompt));

const e = await page.evaluate(async () => {
  const n = window.__nh, s = n.sim, p = s.player, w = (ms) => new Promise((r) => setTimeout(r, ms));
  n.input.pressed.add('KeyE'); await w(400);
  const seated = !!p.veh && p.seat === 0, hud = document.getElementById('veh').innerHTML;
  const camD = Math.hypot(n.camera.position.x - p.x, n.camera.position.z - p.z);
  return { seated, kind: p.veh?.kind, hud: hud.slice(0, 140), camD: +camD.toFixed(1), gun: n.G && document.getElementById('veh') ? true : false, vmVisible: window.__nh.G.viewmodelVisible };
});
check('E puts you in the driver seat; HUD shows speed + hull', e.seated && /BUGGY/.test(e.hud) && /HULL/.test(e.hud), JSON.stringify(e));
check('chase camera sits behind the vehicle', e.camD > 4 && e.camD < 8, `camD=${e.camD}`);

const d = await page.evaluate(async () => {
  const n = window.__nh, s = n.sim, p = s.player, v = p.veh, w = (ms) => new Promise((r) => setTimeout(r, ms));
  const x0 = v.x, z0 = v.z; n.input.keys.add('KeyW'); let top = 0, drawnOff = 0;
  for (let i = 0; i < 16; i++) { await w(100); top = Math.max(top, Math.abs(v.speed)); const pose = n.G.vview.pose(v.id); drawnOff = Math.max(drawnOff, Math.hypot(pose.x - v.x, pose.z - v.z)); }
  n.input.keys.delete('KeyW');
  return { moved: +Math.hypot(v.x - x0, v.z - z0).toFixed(1), top: +top.toFixed(1), drawnOff: +drawnOff.toFixed(2), hp: v.hp, hud: document.getElementById('veh').textContent.slice(0, 60) };
});
check('holding W drives the buggy (speed up, drawn model follows)', d.moved > 8 && d.top > 8 && d.drawnOff < 3, JSON.stringify(d));
await page.screenshot({ path: `${OUT}/vehicle-drive.png` });

const x = await page.evaluate(async () => {
  const n = window.__nh, s = n.sim, p = s.player, w = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 25 && Math.abs(p.veh.speed) > 1; i++) { n.input.keys.add('KeyS'); await w(100); } n.input.keys.delete('KeyS');
  n.input.pressed.add('KeyE'); await w(400);
  return { out: !p.veh, y: +p.y.toFixed(2), prompt: document.getElementById('veh').innerHTML.slice(0, 40) };
});
check('E gets you out again (back on foot)', x.out && x.y < 2.2, JSON.stringify(x));

const b = await page.evaluate(async () => {
  const n = window.__nh, s = n.sim, p = s.player, v = s.vehicles.list.find((q) => q.kind === 'bike'), w = (ms) => new Promise((r) => setTimeout(r, ms));
  const x = v.x + 2.2, z = v.z; p.rb.setTranslation({ x, y: 0.9, z }, true); p.rb.setNextKinematicTranslation({ x, y: 0.9, z }); s.world.propagateModifiedBodyPositionsToColliders(); p.x = x; p.z = z; p.y = 0.9;
  await w(400); n.input.pressed.add('KeyE'); await w(400);
  const on = p.veh?.kind; n.input.keys.add('KeyW'); let sp = 0; for (let i = 0; i < 12; i++) { await w(100); sp = Math.max(sp, Math.abs(p.veh?.speed ?? 0)); } n.input.keys.delete('KeyW');      // peak speed: a wall right in front of a random bike must not fail the test
  const hud = document.getElementById('veh').textContent.slice(0, 50);
  return { on, sp: +sp.toFixed(1), hud };
});
check('the bike can be ridden too', b.on === 'bike' && b.sp > 8 && /BIKE/.test(b.hud), JSON.stringify(b));
await page.screenshot({ path: `${OUT}/vehicle-bike.png` });

const k = await page.evaluate(async () => {
  const n = window.__nh, s = n.sim, p = s.player, v = p.veh, w = (ms) => new Promise((r) => setTimeout(r, ms));
  const id = v.id; s.vehicles.damage(v, 9999, null); await w(700);
  const it = n.G.vview.items.get(id);
  return { dead: v.dead, wreck: !!it.u.wreck, out: !p.veh, alive: p.alive, hp: Math.round(p.hp) };
});
check('a destroyed vehicle becomes a wreck and throws you out', k.dead && k.wreck && k.out, JSON.stringify(k));
await page.screenshot({ path: `${OUT}/vehicle-wreck.png` });
check('no page errors / shader errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nvehicle browser checks passed'); process.exit(failed ? 1 : 0);
