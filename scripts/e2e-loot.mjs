// Browser check for Stage 8 (loot): you start with only a pistol, items are drawn on the ground, walking over a gun picks it up (toast + HUD + slot bar),
// armor and medkits show on the HUD, H heals over 3 s with a progress bar, getting shot cancels it, the mouse wheel skips guns you do not have,
// and ?loot=0 gives you every gun again.
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
await page.goto(URL + '?autostart&bots=3&seed=5&weather=clear&gore=0&cstart=999&vehicles=0', { waitUntil: 'load' });
await page.waitForFunction('window.__nh && window.__nh.sim && window.__nh.G.lview', { timeout: 45000 });
await new Promise((r) => setTimeout(r, 900));

const a = await page.evaluate(() => {
  const n = window.__nh, s = n.sim, p = s.player; for (const f of s.fighters) if (!f.isPlayer) { f.brain = null; f.rb.setTranslation({ x: -100, y: 0.9, z: 100 }, true); f.rb.setNextKinematicTranslation({ x: -100, y: 0.9, z: 100 }); f.x = -100; f.z = 100; }
  s.world.propagateModifiedBodyPositionsToColliders();
  const on = [...document.querySelectorAll('#slots div')].map((d) => d.className.includes('no') ? 0 : 1).join('');
  return { items: s.loot.items.length, drawn: n.G.lview.items.size, cur: p.cur, have: Object.entries(p.weapons).filter(([, v]) => v.have).map(([k]) => k).join(','), slots: on, armVis: getComputedStyle(document.getElementById('arm')).display, armn: document.getElementById('armn').textContent };
});
check('a loot match starts with a pistol only', a.cur === 'pistol' && a.have === 'pistol', JSON.stringify(a));
check('HUD greys out the guns you do not have; armor bar visible', a.slots.split('').filter((c) => c === '1').length === 1 && a.armVis !== 'none' && /NO ARMOR/.test(a.armn), JSON.stringify(a));
check('there are 100+ items on the ground (3D models exist for those in range)', a.items >= 100 && a.drawn >= 1, JSON.stringify(a));

// walk onto the closest rifle-class gun
const b = await page.evaluate(async () => {
  const n = window.__nh, s = n.sim, p = s.player, w = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = s.loot.items.filter((i) => i.type === 'weapon' && !i.gone).sort((q, r) => (q.x * q.x + q.z * q.z) - (r.x * r.x + r.z * r.z))[0];
  const tp = (x, z) => { p.rb.setTranslation({ x, y: 0.9, z }, true); p.rb.setNextKinematicTranslation({ x, y: 0.9, z }); s.world.propagateModifiedBodyPositionsToColliders(); p.x = x; p.z = z; p.y = 0.9; };
  tp(g.x + 6, g.z); n.cmd.yaw = Math.PI / 2; await w(700);               // look at it from a few metres
  const shot = { x: g.x, z: g.z };
  tp(g.x, g.z); await w(900);
  return { sub: g.sub, gone: g.gone, have: p.weapons[g.sub].have, cur: p.cur, wname: document.getElementById('wname').textContent, pk: document.getElementById('pk').textContent, slots: [...document.querySelectorAll('#slots div')].map((d) => d.className.includes('no') ? 0 : 1).join(''), shot };
});
check('walking over a gun picks it up and equips it', b.gone && b.have && b.cur === b.sub, JSON.stringify(b));
check('a "PICKED UP" line shows and the slot bar lights up', /PICKED UP/.test(b.pk) && b.slots.split('').filter((c) => c === '1').length === 2, JSON.stringify(b));
await page.screenshot({ path: `${OUT}/loot-pickup.png` });

// armor + medkit on the HUD, then heal
const c = await page.evaluate(async () => {
  const n = window.__nh, s = n.sim, p = s.player, w = (ms) => new Promise((r) => setTimeout(r, ms));
  p.armor = 80; p.armorLv = 2; p.meds = 2; p.hp = 30; p.noHurtT = -999; await w(300);
  const hud1 = { armn: document.getElementById('armn').textContent, medn: document.getElementById('medn').textContent, bar: document.getElementById('armbar').style.width };
  n.input.pressed.add('KeyH'); await w(1200);
  const mid = { healT: +p.healT.toFixed(2), vis: getComputedStyle(document.getElementById('heal')).display, w: document.querySelector('#heal i').style.width };
  await w(2400);
  return { hud1, mid, hp: Math.round(p.hp), meds: p.meds, healT: p.healT, vis: getComputedStyle(document.getElementById('heal')).display };
});
check('HUD shows armor (LV2 · 80) and medkits (2/4)', /LV2/.test(c.hud1.armn) && /2\/4/.test(c.hud1.medn), JSON.stringify(c.hud1));
check('H starts a heal: progress bar visible mid-way', c.mid.healT > 0.8 && c.mid.vis === 'block' && parseFloat(c.mid.w) > 20, JSON.stringify(c.mid));
check('after ~3 s: +60 hp, one medkit used, bar hidden', c.hp >= 85 && c.meds === 1 && c.healT === 0 && c.vis === 'none', JSON.stringify(c));
await page.screenshot({ path: `${OUT}/loot-heal.png` });

const d = await page.evaluate(async () => {
  const n = window.__nh, s = n.sim, p = s.player, w = (ms) => new Promise((r) => setTimeout(r, ms));
  p.hp = 40; p.noHurtT = -999; n.input.pressed.add('KeyH'); await w(600); const during = p.healT;
  s.damage(p, 5, s.fighters[1], { cause: 'bullet', head: true }); await w(300);
  return { during: +during.toFixed(2), after: p.healT, meds: p.meds, msg: document.getElementById('msg').textContent };
});
check('getting shot cancels a heal and keeps the medkit', d.during > 1 && d.after === 0 && d.meds === 1 && /INTERRUPTED/.test(d.msg), JSON.stringify(d));

const e = await page.evaluate(async () => {
  const n = window.__nh, s = n.sim, p = s.player, w = (ms) => new Promise((r) => setTimeout(r, ms));
  p.weapons.smg = { ammo: 30, reserve: 90, have: true }; p.cur = 'pistol'; await w(100);
  const owned = Object.entries(p.weapons).filter(([, v]) => v.have).map(([k]) => k);
  const seen = []; for (let i = 0; i < 5; i++) { n.input.wheel = 1; await w(250); seen.push(p.cur); }
  const order = Object.keys(p.weapons), missing = order.findIndex((k) => !p.weapons[k].have), before = p.cur;
  n.input.pressed.add('Digit' + (missing + 1)); await w(300);
  return { owned: owned.join(','), seen: seen.join(','), allOwned: seen.every((k) => owned.includes(k)), distinct: new Set(seen).size, missing: order[missing], before, after: p.cur, msg: document.getElementById('msg').textContent };
});
check('mouse wheel only cycles through guns you carry', e.allOwned && e.distinct >= 2, JSON.stringify(e));
check('pressing the slot of a gun you do not have says so and changes nothing', e.after === e.before && /HAVEN'T FOUND/.test(e.msg), JSON.stringify(e));

// items drawn near the player, then check what happens when one is removed
const f = await page.evaluate(async () => {
  const n = window.__nh, s = n.sim, p = s.player, w = (ms) => new Promise((r) => setTimeout(r, ms));
  const near = s.loot.items.filter((i) => !i.gone && Math.hypot(i.x - p.x, i.z - p.z) < 60), before = n.G.lview.items.size;
  const it = s.loot.items.find((i) => !i.gone && n.G.lview.items.has(i.id)); s.loot._remove(it); await w(300);
  return { near: near.length, before, after: n.G.lview.items.size, gone: !n.G.lview.items.has(it.id) };
});
check('a picked-up item disappears from the 3D world', f.gone && f.after === f.before - 1, JSON.stringify(f));

// ?loot=0 -> every gun
const page2 = await browser.newPage(); await page2.setViewport({ width: 1280, height: 720 });
await page2.goto(URL + '?autostart&bots=2&seed=5&weather=clear&gore=0&cstart=999&vehicles=0&loot=0', { waitUntil: 'load' });
await page2.waitForFunction('window.__nh && window.__nh.sim', { timeout: 45000 }); await new Promise((r) => setTimeout(r, 700));
const g = await page2.evaluate(() => { const s = window.__nh.sim, p = s.player; return { have: Object.values(p.weapons).every((v) => v.have), items: s.loot.items.length, armVis: getComputedStyle(document.getElementById('arm')).display }; });
check('?loot=0: every gun from the start, no items, no armor bar', g.have && g.items === 0 && g.armVis === 'none', JSON.stringify(g));

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nloot e2e: all good');
process.exit(failed ? 1 : 0);
