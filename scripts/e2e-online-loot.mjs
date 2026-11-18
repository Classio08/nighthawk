// Two REAL browsers against a REAL server with loot on: both start with a pistol and see the same items; a pickup reaches the owner's HUD and
// disappears from the OTHER browser's 3D world; H heals (progress bar, +60 hp, medkit used); a dead player's gear drops for both.
//   needs: npm run build, `npx vite preview --port 4173` running, puppeteer-core, Chrome.     node scripts/e2e-online-loot.mjs
import puppeteer from 'puppeteer-core';
const REPO = process.env.REPO || new URL('..', import.meta.url).pathname;
const { createServer } = await import(`${REPO}server/src/index.js`);
const { MatchRoom } = await import(`${REPO}server/src/MatchRoom.js`);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const WEB = process.env.URL || 'http://127.0.0.1:4173/';
const OUT = process.env.OUT || '/tmp';
const PORT = 2569, SERVER = `ws://127.0.0.1:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const errors = [];
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) failed++; };

const server = createServer({ lobbySecs: 2, total: 4, vehicles: false, loot: true });
await server.listen(PORT);
let protect = null;
const early = setInterval(() => {
  const r = [...MatchRoom.instances][0]; if (!r?.sim) return;
  clearInterval(early); for (const f of r.sim.fighters) if (!f.human) f.brain = null;
  protect = setInterval(() => { for (const h of r.sim.humans) if (h.alive) h.hp = h.maxHp; }, 20);
}, 2);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
async function open(op, name) {
  const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  await page.evaluateOnNewDocument((n) => { try { localStorage.setItem('nh_name', n); } catch { /* */ } }, name);
  await page.goto(`${WEB}?autostart&online=${encodeURIComponent(SERVER)}&op=${op}`, { waitUntil: 'load' });
  return page;
}
const [A, B] = await Promise.all([open('roms', 'Roms'), open('shadow', 'Shadow')]);
for (const p of [A, B]) await p.waitForFunction('window.__nh && window.__nh.net && window.__nh.net.ready && window.__nh.G.lview', { timeout: 60000 });
await wait(1000);
const room = [...MatchRoom.instances][0], sim = room.sim;
const st = (page) => page.evaluate(() => { const n = window.__nh, p = n.sim.player, L = n.sim.loot;
  return { id: p.id, cur: p.cur, have: Object.entries(p.weapons).filter(([, v]) => v.have).map(([k]) => k).join(','), items: L.items.length, drawn: n.G.lview.items.size, armVis: getComputedStyle(document.getElementById('arm')).display,
    pk: document.getElementById('pk').textContent, wname: document.getElementById('wname').textContent, meds: p.meds, armor: p.armor, hp: Math.round(p.hp), healT: p.healT,
    heal: getComputedStyle(document.getElementById('heal')).display, medn: document.getElementById('medn').textContent, slotsLit: [...document.querySelectorAll('#slots div')].filter((d) => !d.className.includes('no')).length }; });
const a = await st(A), b = await st(B);
check('both browsers mirror the server\'s 120 items and draw the ones near them', a.items === sim.loot.items.length && b.items === a.items && a.drawn > 0 && b.drawn > 0, `items ${a.items}/${b.items} drawn ${a.drawn}/${b.drawn}`);
check('both land with a pistol only; HUD shows the armor bar and a greyed slot bar', a.cur === 'pistol' && a.have === 'pistol' && b.have === 'pistol' && a.armVis !== 'none' && a.slotsLit === 1, JSON.stringify(a));

clearInterval(protect);
for (const f of sim.fighters) if (!f.human && f.alive) { f.brain = null; f.rb.setTranslation({ x: 100 + f.id * 3, y: 0.9, z: 100 }, true); f.x = 100 + f.id * 3; f.z = 100; }
sim.zone.radius = 500; sim.zone.update = () => {};
const fa = sim.fighters[a.id], fb = sim.fighters[b.id];
const tp = (f, x, z) => { f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); sim.world.propagateModifiedBodyPositionsToColliders(); f.x = x; f.y = 0.9; f.z = z; };
const free = (it) => sim.fighters.every((f) => !f.alive || f === fa || f === fb || Math.hypot(f.x - it.x, f.z - it.z) > 20);
const gun = sim.loot.items.find((i) => i.type === 'weapon' && !i.gone && free(i));
tp(fb, gun.x + 40 > 100 ? gun.x - 40 : gun.x + 40, gun.z > 0 ? gun.z - 20 : gun.z + 20);     // B somewhere else, looking at the world
tp(fa, gun.x - 3, gun.z); await wait(700);
const drawnB0 = await B.evaluate((id) => window.__nh.G.lview.items.has(id), gun.id);
tp(fa, gun.x, gun.z); await wait(1300);
const a1 = await st(A);
check('A walks over a gun: it is his, equipped, a "PICKED UP" line shows and the slot bar grows', fa.weapons[gun.sub].have && a1.have.includes(gun.sub) && a1.cur === gun.sub && /PICKED UP/.test(a1.pk) && a1.slotsLit === 2, JSON.stringify(a1));
await A.screenshot({ path: `${OUT}/online-loot-pickup.png` });
const goneB = await B.evaluate((id) => ({ gone: window.__nh.sim.loot.byId.get(id)?.gone === true, drawn: window.__nh.G.lview.items.has(id) }), gun.id);
check('the item is gone from the server list and from B\'s browser (list and 3D)', gun.gone && goneB.gone && !goneB.drawn, JSON.stringify({ drawnB0, ...goneB }));

// heal with the real H key
fa.hp = 40; fa.noHurtT = -999; fa.meds = 2; fa.armor = 80; fa.armorLv = 2; await wait(700);
await A.keyboard.press('KeyH'); await wait(1300);
const a2 = await st(A);
check('H: the progress bar shows in A\'s browser while the server channels', a2.heal === 'block' && fa.healT > 0 && a2.healT > 0, JSON.stringify({ heal: a2.heal, server: fa.healT.toFixed(2), client: a2.healT }));
await wait(2800);
const a3 = await st(A);
check('after ~3 s: +60 hp, one medkit left, bar hidden, HUD says MEDKITS 1/4', a3.hp >= 95 && fa.meds === 1 && a3.heal === 'none' && /1\/4/.test(a3.medn), JSON.stringify({ hp: a3.hp, meds: a3.meds, medn: a3.medn, heal: a3.heal }));
await A.screenshot({ path: `${OUT}/online-loot-heal.png` });

// B dies somewhere quiet: his stuff lands on the ground for both
fb.armor = 60; fb.armorLv = 2; fb.meds = 1; fb.weapons.dmr = { ammo: 5, reserve: 30, have: true };
const spot = [[40, 40], [-40, 40], [40, -40], [-40, -40], [70, 0], [-70, 0]].find(([x, z]) => !sim.map.boxes.some((q) => Math.abs(x - q.x) < q.w / 2 + 3 && Math.abs(z - q.z) < q.d / 2 + 3)) ?? [40, 40];
tp(fb, spot[0], spot[1]); tp(fa, -120, -120); await wait(500);
const before = await A.evaluate(() => window.__nh.G.lview.items.size);
sim.damage(fb, 9999, fa, { cause: 'bullet', head: true }); await wait(800);
const drops = sim.loot.items.filter((i) => i.dyn && !i.gone).length;
const aAfter = await A.evaluate(() => ({ drawnAll: window.__nh.G.lview.items.size, dyn: window.__nh.sim.loot.items.filter((i) => i.dyn && !i.gone).length }));
check('a dead player\'s gear is dropped (server) and A\'s browser mirrors it', drops >= 3 && aAfter.dyn === drops, JSON.stringify({ drops, before, ...aAfter }));
check('no page errors in either browser', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close(); await server.gracefullyShutdown?.(false).catch(() => {});
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nonline loot e2e: all good');
process.exit(failed ? 1 : 0);
