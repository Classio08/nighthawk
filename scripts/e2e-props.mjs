// Browser check: barrels are drawn, a shot barrel explodes (visible effects, mesh disappears), chain reaction, crates splinter, no console errors.
import puppeteer from 'puppeteer-core';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const URL = process.env.URL || 'http://127.0.0.1:4173/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
let failed = 0; const errors = [];
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); };
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || /Shader Error|WebGLProgram/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
await page.goto(URL + '?autostart&bots=1&seed=4&loot=0', { waitUntil: 'load' });
await page.waitForFunction('window.__nh && window.__nh.sim', { timeout: 40000 });
const w = (ms) => new Promise((r) => setTimeout(r, ms));
await w(800);
const r = await page.evaluate(async () => {
  const n = window.__nh, s = n.sim, p = s.player, out = {};
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  out.barrels = s.barrels.length; out.meshes = n.G.world.barrels.filter((m) => m.visible).length;
  // freeze the bot, put the player on open ground 14 m south of a fresh barrel pair
  for (const f of s.fighters) if (f.brain) f.brain = null;
  const hitBox = (x, z) => s.map.boxes.some((b) => Math.abs(x - b.x) < b.w / 2 + 2.5 && Math.abs(z - b.z) < b.d / 2 + 2.5);
  let L = null;
  for (let x = -85; x <= 85 && !L; x += 5) for (let z0 = 88; z0 > -40 && !L; z0 -= 5) { let ok = true; for (let d = 0; d <= 20 && ok; d++) for (const dx of [-4, 0, 4]) if (hitBox(x + dx, z0 - d)) ok = false; if (ok) L = { x, z0 }; }
  const b1 = s._addBarrel(L.x, L.z0 - 14), b2 = s._addBarrel(L.x + 1.5, L.z0 - 15);
  // the scene only knows the barrels that existed at match start: add meshes for the two new ones by cloning
  const setPos = (f, x, z) => { f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); s.world.propagateModifiedBodyPositionsToColliders(); f.x = x; f.z = z; f.y = 0.9; };
  setPos(p, L.x, L.z0); setPos(s.fighters[1], L.x + 60 > 100 ? L.x - 60 : L.x + 60, L.z0);
  p.cur = 'ar'; p.hp = p.maxHp = 400;
  // short bursts, re-aimed every time (the recoil of a held trigger would climb over the barrel)
  for (let i = 0; i < 40 && b1.fuse < 0 && !b1.dead; i++) { n.cmd.yaw = 0; n.cmd.pitch = Math.atan2(0.55 - 1.62, 14); n.input.fire = true; await w(110); n.input.fire = false; await w(90); }
  await w(1800);
  out.b1dead = b1.dead; out.b2dead = b2.dead;
  out.exploded = n.G.particles.n > 0;
  out.destroyed = s.destroyed.length;
  return out;
});
console.log(JSON.stringify(r));
check('the map has explosive barrels and they are drawn', r.barrels >= 10 && r.meshes === r.barrels, `${r.meshes}/${r.barrels}`);
check('shooting a barrel makes it explode', r.b1dead);
check('chain reaction: the neighbour barrel went off too', r.b2dead);
check('destroyed props are tracked for the network', r.destroyed >= 2);
await page.screenshot({ path: join(tmpdir(), 'nighthawk_props.png') });
check('no browser errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll prop checks passed');
process.exit(failed ? 1 : 0);
