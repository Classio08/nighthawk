// Browser check for Stage 6: every weather renders without shader errors (screenshots in /tmp), airdrop/hardpoint markers + HUD list,
// the mortar key calls a strike with a visible marker + shells + explosions, flashlight at night, gore toggle default.
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const URL = process.env.URL || 'http://127.0.0.1:4173/';
const OUT = process.env.OUT || '/tmp';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
let failed = 0; const errors = [];
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); };
const w = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(q) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || /Shader Error|WebGLProgram/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(URL + '?autostart&' + q, { waitUntil: 'load' });
  await page.waitForFunction('window.__nh && window.__nh.sim && window.__nh.G.atmo', { timeout: 45000 });
  await w(900);
  return page;
}

for (const wx of ['clear', 'rain', 'fog', 'night', 'storm']) {
  const page = await open(`bots=4&seed=3&weather=${wx}&gore=0`);
  const r = await page.evaluate(() => { const n = window.__nh; return { id: n.sim.weather.id, light: !!n.G.atmo.light, rain: !!n.G.atmo.rain, gore: document.getElementById('goretoggle').checked, fog: n.G.scene.fog.far }; });
  check(`weather ${wx}`, r.id === wx && r.light === (wx === 'night' || wx === 'storm') && r.rain === (wx === 'rain' || wx === 'storm') && r.gore === false, JSON.stringify(r));
  if (wx === 'storm') { await page.evaluate(() => { window.__nh.G.atmo.nextBolt = 0; }); await w(120); }
  await page.screenshot({ path: `${OUT}/wx-${wx}.png` });
  await page.close();
}

{ // contracts + mortar in a clear match
  const page = await open('bots=6&seed=9&weather=clear&cstart=1&gore=0');
  await w(3500);
  const a = await page.evaluate(() => { const n = window.__nh, s = n.sim; return { list: s.contracts.list.map((c) => c.type), items: n.G.cview.items.size, hud: document.getElementById('ct').textContent, vis: document.getElementById('ct').style.display }; });
  check('first contract spawns and shows in the HUD list + 3D', a.list.length >= 1 && a.items >= 1 && a.vis === 'block' && /AIRDROP|HARDPOINT|BOUNTY/.test(a.hud), JSON.stringify(a));
  await page.screenshot({ path: `${OUT}/contract-hud.png` });
  const m = await page.evaluate(async () => {
    const n = window.__nh, s = n.sim, p = s.player, out = {};
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const f of s.fighters) if (!f.isPlayer && f.brain) f.brain = null;                 // keep still while we look
    const hitBox = (x, z) => s.map.boxes.some((b) => Math.abs(x - b.x) < b.w / 2 + 2.5 && Math.abs(z - b.z) < b.d / 2 + 2.5);
    let L = null;
    for (let x = -85; x <= 85 && !L; x += 5) for (let z0 = 88; z0 > -30 && !L; z0 -= 5) { let ok = true; for (let d = 0; d <= 60 && ok; d += 2) for (const dx of [-4, 0, 4]) if (hitBox(x + dx, z0 - d)) ok = false; if (ok) L = { x, z0 }; }
    p.rb.setTranslation({ x: L.x, y: 0.9, z: L.z0 }, true); p.rb.setNextKinematicTranslation({ x: L.x, y: 0.9, z: L.z0 }); s.world.propagateModifiedBodyPositionsToColliders(); p.x = L.x; p.z = L.z0; p.y = 0.9;
    await w(300);
    p.mortar = 1; n.cmd.yaw = 0; n.cmd.pitch = -Math.atan2(1.62, 45);
    n.cmd.mortar = true; await w(250);
    out.mortarLeft = p.mortar; out.marker = n.G.cview.fx.filter((f) => f.kind === 'mark').length;
    let shells = 0, boom = 0;
    for (let i = 0; i < 70; i++) { await w(100); shells = Math.max(shells, n.G.cview.fx.filter((f) => f.kind === 'shell').length); if (n.G.particles.n > 40) boom++; }
    out.shells = shells; out.boom = boom; out.strikes = s.strikes.length;
    return out;
  });
  check('mortar key spends the charge, drops a red marker, shells fall, explosions go off', m.mortarLeft === 0 && m.marker >= 1 && m.shells >= 1 && m.boom > 0, JSON.stringify(m));
  await page.screenshot({ path: `${OUT}/mortar.png` });
  await page.close();
}

{ // night flashlight toggles
  const page = await open('bots=3&seed=3&weather=night');
  const r = await page.evaluate(() => { const a = window.__nh.G.atmo, v0 = a.light.visible; const on = a.toggleFlashlight(); return { v0, on, v1: a.light.visible }; });
  check('flashlight toggles at night', r.v0 === true && r.on === false && r.v1 === false, JSON.stringify(r));
  await page.close();
}
check('no console / shader errors', errors.length === 0, errors.slice(0, 4).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED'); process.exit(failed ? 1 : 0);
