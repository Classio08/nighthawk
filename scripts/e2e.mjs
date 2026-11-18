// Optional browser end-to-end test: plays the REAL game in a real (headless) Chrome and checks that it behaves.
// Needs: npm i -D puppeteer-core, `npm run build`, `npx vite preview --port 4173` running, and Chrome (edit CHROME below for Windows).
//   node scripts/e2e.mjs        (screenshots land in the system temp folder)
import puppeteer from 'puppeteer-core';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const URL = process.env.URL || 'http://127.0.0.1:4173/';
const SHOT = (n) => join(tmpdir(), `nighthawk_e2e_${n}.png`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'],
});
const results = []; const errors = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); };

async function open(query) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push('http ' + r.status() + ' ' + r.url()); });
  await page.goto(URL + query, { waitUntil: 'load' });
  await page.waitForFunction('window.__nh && window.__nh.sim', { timeout: 40000 });
  return page;
}
// tiny helpers that run inside the page
const tp = (page, who, x, z) => page.evaluate((who, x, z) => {
  const n = window.__nh, s = n.sim, f = who === 'player' ? s.player : s.fighters.filter((q) => q.brain)[who];
  f.rb.setTranslation({ x, y: 0.9, z }, true); f.x = x; f.y = 0.9; f.z = z;
  if (who === 'player') { n.G.prev = n.G.cur = { x, y: 0.9, z }; }
}, who, x, z);
const state = (page) => page.evaluate(() => {
  const n = window.__nh, s = n.sim, p = s.player, w = p.weapons[p.cur];
  return { x: p.x, y: p.y, z: p.z, hp: p.hp, cur: p.cur, ammo: w.ammo, reserve: w.reserve, reloadT: p.reloadT, ads: p.ads, nades: p.nades, kills: p.kills,
    alive: s.aliveCount(), fov: n.camera.fov, pitch: n.cmd.pitch, yaw: n.cmd.yaw, st: s.state, holes: n.G.decals.holes.filled, ragdolls: n.G.rag.list.length, particles: n.G.particles.n };
});
const hold = async (page, code, ms) => { await page.keyboard.down(code); await wait(ms); await page.keyboard.up(code); await wait(150); };

/* ---------- part 1: controls (no bots) ---------- */
{
  const page = await open('?autostart&seed=5&bots=0');
  await tp(page, 'player', 0, 60); await wait(600);
  const s0 = await state(page);
  check('player stands on the ground', s0.y > 0.8 && s0.y < 1.1, `y=${s0.y.toFixed(2)}`);
  await hold(page, 'KeyD', 800); const sD = await state(page);
  await hold(page, 'KeyA', 800); const sA = await state(page);
  await hold(page, 'KeyW', 800); const sW = await state(page);
  check('D moves RIGHT (+x)', sD.x - s0.x > 1, `dx=${(sD.x - s0.x).toFixed(2)}`);
  check('A moves LEFT (-x)', sA.x - sD.x < -1, `dx=${(sA.x - sD.x).toFixed(2)}`);
  check('W moves FORWARD (-z)', sW.z - sA.z < -1, `dz=${(sW.z - sA.z).toFixed(2)}`);

  // aim down sights
  await page.evaluate(() => { window.__nh.input.ads = true; }); await wait(1200);
  const sAds = await state(page);
  check('right-click ADS zooms the camera', sAds.ads && sAds.fov < 70, `fov=${sAds.fov.toFixed(1)} ads=${sAds.ads}`);
  await page.screenshot({ path: SHOT('ads') });
  await page.evaluate(() => { window.__nh.input.ads = false; }); await wait(1200);
  const sNo = await state(page);
  check('releasing ADS restores the field of view', sNo.fov > 74, `fov=${sNo.fov.toFixed(1)}`);

  // shoot a building: ammo goes down, recoil climbs, bullet holes appear
  await tp(page, 'player', 0, 60);
  await page.evaluate(() => { const n = window.__nh; n.cmd.yaw = 0; n.cmd.pitch = 0; });
  const sB = await state(page);
  await page.evaluate(() => { window.__nh.input.fire = true; }); await wait(900); await page.evaluate(() => { window.__nh.input.fire = false; });
  const sF = await state(page);
  check('firing uses ammo', sF.ammo < sB.ammo, `${sB.ammo} -> ${sF.ammo}`);
  check('recoil kicks the aim upward', sF.pitch > sB.pitch + 0.01, `pitch ${sB.pitch.toFixed(3)} -> ${sF.pitch.toFixed(3)}`);
  await page.screenshot({ path: SHOT('fire') });

  // weapon switch + reload
  await page.keyboard.press('Digit3'); await wait(500);
  check('key 3 switches to the shotgun', (await state(page)).cur === 'shotgun');
  await page.keyboard.press('Digit5'); await wait(500);                // back to the LMG we just fired (70/80 in the magazine)
  await page.keyboard.press('KeyR'); await wait(250);
  check('R starts a reload', (await state(page)).reloadT > 0);
  await wait(4200);
  const sR = await state(page);
  check('reload refills the magazine (tactical reload keeps the chambered round: 80 + 1)', sR.ammo === 81 && sR.reloadT === 0, `ammo=${sR.ammo}`);

  // grenade
  await tp(page, 'player', 0, 60);
  const g0 = await state(page);
  await page.keyboard.press('KeyG'); await wait(300);
  check('G throws a grenade', (await state(page)).nades === g0.nades - 1);
  // wait for the bang itself (the fuse is 2.2 s of GAME time, which runs slower than the clock on a slow software-rendered machine)
  await page.waitForFunction('window.__nh.sim.grenades.length === 0', { timeout: 20000 }).catch(() => {});
  await wait(150);
  check('grenade explodes (particles appeared)', (await state(page)).particles > 20);
  await page.screenshot({ path: SHOT('nade') });
  await page.close();
}

/* ---------- part 2: a fight (3 bots), kill them, win, play again ---------- */
{
  const page = await open('?autostart&seed=5&bots=3');
  // freeze the bots' brains so the test is deterministic (they stand still and do not shoot)
  await page.evaluate(() => {
    const s = window.__nh.sim;
    for (const b of s.fighters.filter((f) => f.brain)) { b.brain.update = (dt) => { s.moveFighter(b, 0, 0, dt, false); }; b.hp = b.maxHp = 60; }
    s.zone.radius = 300;
  });
  await tp(page, 'player', 0, 60);
  for (let i = 0; i < 3; i++) await tp(page, i, -6 + i * 6, 46 - i * 2);   // bots 14-18 m ahead, spread sideways
  await wait(400);
  // kill bot 1 (straight ahead at x=0) with the pistol: one headshot kills a 60 hp bot, and its recoil is small enough to stay on target
  await page.keyboard.press('Digit6'); await wait(600);
  await page.evaluate(() => { const n = window.__nh; n.cmd.yaw = 0; n.cmd.pitch = 0.0; });
  const before = await state(page);
  await page.evaluate(() => { window.__nh.input.fire = true; });
  await wait(2200);
  await page.evaluate(() => { window.__nh.input.fire = false; });
  const after = await state(page);
  check('shooting a bot eliminates it', after.kills >= 1 && after.alive < before.alive, `kills=${after.kills} alive=${before.alive}->${after.alive}`);
  check('a ragdoll spawned', after.ragdolls >= 1, `ragdolls=${after.ragdolls}`);
  const feed = await page.$$eval('#feed div', (d) => d.map((x) => x.textContent));
  check('kill feed shows the kill', feed.length >= 1, JSON.stringify(feed[0] ?? ''));
  await page.screenshot({ path: SHOT('kill') });

  // kill the rest by teleporting them in front of us one by one
  for (let i = 0; i < 3; i++) {
    const alive = await page.evaluate((i) => window.__nh.sim.fighters.filter((f) => f.brain)[i].alive, i);
    if (!alive) continue;
    await tp(page, i, 0, 50); await page.evaluate(() => { window.__nh.cmd.yaw = 0; window.__nh.cmd.pitch = 0; window.__nh.input.fire = true; });
    await wait(1500); await page.evaluate(() => { window.__nh.input.fire = false; });
  }
  await wait(2000);
  const fin = await state(page);
  check('killing everyone wins the match', fin.st === 'won', `state=${fin.st} alive=${fin.alive}`);
  const shown = await page.$eval('#end', (e) => e.classList.contains('show'));
  const title = await page.$eval('#endtitle', (e) => e.textContent);
  check('end screen appears with the winner title', shown && /WINNER/.test(title), title);
  await page.screenshot({ path: SHOT('win') });
  await page.click('#againbtn'); await wait(1500);
  const again = await page.evaluate(() => ({ t: window.__nh.sim.time, alive: window.__nh.sim.aliveCount(), st: window.__nh.sim.state }));
  check('PLAY AGAIN starts a fresh match', again.t < 3 && again.alive === 4 && again.st === 'playing', JSON.stringify(again));
  await page.close();
}

/* ---------- part 3: the zone hurts, and dying shows the elimination screen ---------- */
{
  const page = await open('?autostart&seed=5&bots=0');
  await page.evaluate(() => { const s = window.__nh.sim; s.zone.radius = 5; s.zone.cx = 90; s.zone.cz = 90; s.zone.phase = 3; });  // player is far outside
  await tp(page, 'player', 0, 0);
  const h0 = (await state(page)).hp; await wait(2500); const h1 = (await state(page)).hp;
  check('standing outside the zone hurts', h1 < h0 - 3, `hp ${h0.toFixed(0)} -> ${h1.toFixed(0)}`);
  await page.screenshot({ path: SHOT('zone') });
  await page.evaluate(() => { window.__nh.sim.zone.phase = 4; window.__nh.sim.player.hp = 40; });   // zone damage 12/s, little health left
  await wait(7000);
  const dead = await page.evaluate(() => ({ st: window.__nh.sim.state, show: document.getElementById('end').classList.contains('show'), title: document.getElementById('endtitle').textContent }));
  check('dying in the zone shows ELIMINATED', dead.st === 'lost' && dead.show, JSON.stringify(dead));
  await page.screenshot({ path: SHOT('dead') });
  await page.close();
}

check('no console errors / failed requests', errors.length === 0, errors.length ? '\n  ' + errors.slice(0, 5).join('\n  ') : '');
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `E2E FAIL (${failed.length} of ${results.length})` : `E2E PASS (${results.length} checks)`);
await browser.close();
process.exit(failed.length ? 1 : 0);
