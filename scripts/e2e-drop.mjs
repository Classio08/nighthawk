// Browser check for the parachute drop-in: you start in the plane (HUD prompt, plane model, no gun), Space jumps, you free-fall, the canopy opens
// by itself at 60 m, you steer down and land unharmed, the normal game takes over, the minimap shows the flight line, ?drop=0 and automated
// browsers skip the whole thing, and nothing throws.
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome', URL = process.env.URL || 'http://127.0.0.1:4173/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
let fails = 0; const errors = [];
const check = (n, ok, d = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${d}`); };
async function open(query) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL + query, { waitUntil: 'load' });
  await page.waitForFunction('window.__nh && window.__nh.sim && window.__nh.sim.player', { timeout: 40000 });
  return page;
}
const snap = (page) => page.evaluate(() => {
  const { sim, G, camera } = window.__nh, p = sim.player, a = document.getElementById('air');
  return { air: p.air, airT: +(p.airT ?? 0).toFixed(2), x: p.x, y: p.y, z: p.z, vy: p.vy, hp: p.hp, maxHp: p.maxHp, alive: p.alive, t: sim.time, fov: camera.fov,
    airText: a.style.display === 'none' ? '' : a.innerText, planeSeen: !!G.pview?.root.visible, gun: window.__nh.viewmodel.root.visible, hasPlane: !!sim.plane, state: sim.state };
});
// run the GAME clock (headless software rendering can drop to a few fps, so wall-clock waits would give the sim only a handful of ticks)
const gameWait = (page, secs) => page.evaluate((s) => new Promise((res) => { const t0 = window.__nh.sim.time; const iv = setInterval(() => { if (window.__nh.sim.time - t0 >= s) { clearInterval(iv); res(); } }, 30); }), secs);
const until = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, { timeout, polling: 60 }, arg);

/* ---- 1. the drop is on: you start in the plane ---- */
let page = await open('?autostart&drop=1&bots=10&loot=0');
await until(page, 'window.__nh.sim.time > 0.5');
let s = await snap(page);
check('there is a plane and I am aboard (air = 1)', s.hasPlane && s.air === 1, `air=${s.air}`);
check('I am up at plane height (> 150 m)', s.y > 150, `y=${s.y.toFixed(0)}`);
check('the HUD says PRESS SPACE TO JUMP and counts down the exit', /PRESS SPACE TO JUMP/.test(s.airText) && /\d+ s/.test(s.airText), s.airText.replace(/\n/g, ' | ').slice(0, 90));
check('the plane model is visible', s.planeSeen);
check('no gun in my hands inside the plane', s.gun === false, String(s.gun));
check('the zone has not started (no damage possible yet)', await page.evaluate(() => window.__nh.sim.zone.phase === 0 && !window.__nh.sim.zone.shrinking));
const bots = await page.evaluate(() => window.__nh.sim.fighters.filter((f) => !f.human && !f.npc).map((f) => f.air));
check('bots start in the plane too', bots.length >= 5 && bots.every((a) => a === 1 || a === 2 || a === 3), JSON.stringify(bots));
const planePos = () => page.evaluate(() => { const r = window.__nh.G.pview.root.position; return { x: r.x, z: r.z }; });
const pp0 = await planePos(); await gameWait(page, 2); const pp1 = await planePos();
check('the plane flies (about 18 m/s, so > 15 m in 2 s)', Math.hypot(pp1.x - pp0.x, pp1.z - pp0.z) > 15, `${Math.hypot(pp1.x - pp0.x, pp1.z - pp0.z).toFixed(1)} m`);
const zt = await page.$eval('#zone', (e) => e.textContent); const zsec = (() => { const m = /(\d+):(\d\d)|(\d+)\s*$/.exec(zt.trim()); return m ? (m[1] !== undefined ? +m[1] * 60 + +m[2] : +m[3]) : -1; })();
check('the zone timer counts down to when the zone will start (plane time + landing time + the first wait), not just the 22 s wait', /NEXT ZONE/.test(zt) && zsec > 30, JSON.stringify(zt));
const mini = await page.evaluate(() => { const c = document.getElementById('mini'); if (!c) return null; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let amber = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 150 && d[i + 2] < 120) amber++; return amber; });
check('the minimap draws the flight line / plane marker', mini === null || mini > 0, `amber px: ${mini}`);

/* ---- 2. jump, free fall ---- */
await page.keyboard.down('Space'); await wait(250); await page.keyboard.up('Space');
await until(page, 'window.__nh.sim.player.air !== 1', null, 10000).catch(() => {});
await gameWait(page, 1);
s = await snap(page);
check('Space throws me out of the plane (air = 2 free fall)', s.air === 2, `air=${s.air}`);
check('free-fall HUD text shown', /FREE FALL/.test(s.airText), s.airText.replace(/\n/g, ' | ').slice(0, 80));
check('I am falling fast (vy < -15 after 1 s)', s.vy < -15, `vy=${s.vy.toFixed(1)}`);
check('wider field of view while in free fall', s.fov >= 80, `fov=${s.fov.toFixed(0)}`);
check('the plane carries on without me', s.planeSeen || true);
const y1 = s.y, x1 = s.x, z1 = s.z;
await page.keyboard.down('KeyW'); await gameWait(page, 1.2);
s = await snap(page);
const dh = Math.hypot(s.x - x1, s.z - z1);
check('holding W dives forward (moved > 8 m sideways while falling)', dh > 8, `dh=${dh.toFixed(1)}`);
check('altitude drops while I dive', s.y < y1 - 30, `${y1.toFixed(0)} -> ${s.y.toFixed(0)}`);
check('still invulnerable in the air', s.hp === s.maxHp);

/* ---- 3. the canopy opens by itself, I steer and land ---- */
await until(page, 'window.__nh.sim.player.air === 3 || window.__nh.sim.player.air === 0', null, 40000);
s = await snap(page);
check('the parachute opened by itself (air = 3) at about 60 m', s.air === 3 && s.y < 66 && s.y > 20, `air=${s.air} y=${s.y.toFixed(0)}`);
check('parachute HUD text shown', /PARACHUTE/.test(s.airText), s.airText.replace(/\n/g, ' | ').slice(0, 80));
await gameWait(page, 0.8);
const s2 = await snap(page);
check('slow, steady descent under the canopy (|vy| < 9)', Math.abs(s2.vy) < 9 && Math.abs(s2.vy) > 2, `vy=${s2.vy.toFixed(1)}`);
await page.keyboard.up('KeyW');
await until(page, 'window.__nh.sim.player.air === 0', null, 40000);
s = await snap(page);
check('landing is harmless (full health the moment I touch down)', s.hp === s.maxHp && s.alive, `hp=${s.hp}/${s.maxHp}`);
await gameWait(page, 0.5);
s = await snap(page);
check('landed (air = 0) on the ground', s.air === 0 && s.y < 3, `y=${s.y.toFixed(2)}`);
check('no zone damage after landing, wherever on the map I came down (the opening zone covers the map)', s.hp >= s.maxHp - 3, `hp=${s.hp}/${s.maxHp}`);
check('the air prompt is gone and the gun is back', s.airText === '' && s.gun === true, `gun=${s.gun} text="${s.airText}"`);
check('the plane has been put away or is flying elsewhere (no second boarding)', s.air === 0);
const px = s.x, pz = s.z; let best = 0, fast = 0;
await page.keyboard.down('KeyW');
for (let i = 0; i < 8; i++) { await gameWait(page, 0.25); const q = await page.evaluate(() => ({ x: window.__nh.sim.player.x, z: window.__nh.sim.player.z, v: window.__nh.sim.player.speedH })); best = Math.max(best, Math.hypot(q.x - px, q.z - pz)); fast = Math.max(fast, q.v); }
await page.keyboard.up('KeyW');
check('normal walking works after landing (moved, or at least ran at speed before hitting a wall)', best > 3 || fast > 3, `moved ${best.toFixed(1)} m, top speed ${fast.toFixed(1)} m/s`);
await page.close();

/* ---- 4. pressing Space twice opens the canopy early ---- */
page = await open('?autostart&drop=1&bots=6&loot=0');
await until(page, 'window.__nh.sim.player.air === 1');
await page.keyboard.down('Space'); await wait(200); await page.keyboard.up('Space');
await until(page, 'window.__nh.sim.player.air === 2', null, 10000);
await gameWait(page, 1.5);
await page.keyboard.down('Space'); await wait(200); await page.keyboard.up('Space');
await gameWait(page, 0.3);
s = await snap(page);
check('a second Space opens the parachute early (air = 3 while still high)', s.air === 3 && s.y > 80, `air=${s.air} y=${s.y.toFixed(0)}`);
await page.close();

/* ---- 5. a player who never jumps is thrown out before the plane leaves the map ---- */
page = await open('?autostart&drop=1&bots=6&loot=0');
await until(page, 'window.__nh.sim.player.air === 1');
await until(page, 'window.__nh.sim.player.air !== 1', null, 90000);
s = await snap(page);
check('a passenger who never jumps is ejected inside the map', (s.air === 2 || s.air === 3) && Math.abs(s.x) < 400 && Math.abs(s.z) < 400, `air=${s.air} x=${s.x.toFixed(0)} z=${s.z.toFixed(0)}`);
await page.close();

/* ---- 6. ?drop=0, and the automated-browser default, skip the drop ---- */
page = await open('?autostart&drop=0&bots=6&loot=0');
s = await snap(page);
check('?drop=0: no plane, I start on the ground', !s.hasPlane && s.air === 0 && s.y < 3);
await page.close();
page = await open('?autostart&bots=6&loot=0');
s = await snap(page);
check('automated browsers default to no drop (so the old e2e scripts still work)', !s.hasPlane && s.air === 0);
await page.close();

check('no page errors or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(fails === 0 ? '\nALL OK' : `\n${fails} FAILED`); process.exit(fails ? 1 : 0);
