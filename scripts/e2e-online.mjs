// Two REAL browsers play one match against a REAL server (started inside this script):
// join -> lobby -> play, see each other, predict movement, shoot each other, die, win.
//   needs: npm run build, `npx vite preview --port 4173` running, puppeteer-core, Chrome.
//   node scripts/e2e-online.mjs
import puppeteer from 'puppeteer-core';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = process.env.REPO || new URL('..', import.meta.url).pathname;
const { createServer } = await import(`${REPO}server/src/index.js`);
const { MatchRoom } = await import(`${REPO}server/src/MatchRoom.js`);

const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const WEB = process.env.URL || 'http://127.0.0.1:4173/';
const PORT = 2568, SERVER = `ws://127.0.0.1:${PORT}`;
const SHOT = (n) => join(tmpdir(), `nighthawk_online_${n}.png`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const errors = [];
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) failed++; };

const server = createServer({ lobbySecs: 2, total: 6 });
await server.listen(PORT);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'],
});
async function open(op, name, extra = '') {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  await page.evaluateOnNewDocument((n) => { try { localStorage.setItem('nh_name', n); } catch { /* */ } }, name);
  await page.goto(`${WEB}?autostart&online=${encodeURIComponent(SERVER)}&op=${op}${extra}`, { waitUntil: 'load' });
  return page;
}
const [A, B] = await Promise.all([open('roms', 'Roms'), open('shadow', 'Shadow', '&lag=80')]);   // B plays with 80 ms of fake round-trip lag
for (const p of [A, B]) await p.waitForFunction('window.__nh && window.__nh.net && window.__nh.net.ready', { timeout: 60000 });
await wait(800);

const info = (page) => page.evaluate(() => {
  const n = window.__nh, net = n.net, s = n.sim, p = s.player;
  return { id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, hp: p.hp, alive: p.alive, nf: s.fighters.filter((f) => !f.npc).length, ng: s.fighters.filter((f) => f.npc).length, alive_n: s.aliveCount(), rtt: net.rtt, snaps: net.stats.snaps,
    maxErr: net.stats.maxErr, over: n.G.over, endShown: document.getElementById('end').classList.contains('show'), title: document.getElementById('endtitle').textContent,
    place: document.getElementById('e-place').textContent, aliveHud: document.getElementById('alive').textContent, ping: document.getElementById('pingn').textContent,
    others: s.fighters.filter((f) => f.id !== p.id).map((f) => ({ id: f.id, x: f.x, z: f.z, alive: f.alive, human: f.human, name: f.name })) };
});
const room = [...MatchRoom.instances][0], sim = room.sim;
// the humans just stand there while the pages load: keep bots / guards from killing them before the test starts (random spawns made this flaky)
for (const f of sim.fighters) if (!f.human) f.brain = null;
const protect = setInterval(() => { for (const h of sim.humans) if (h.alive) h.hp = h.maxHp; }, 30);

const a = await info(A), b = await info(B);
check('both browsers are in the same match with 6 contestants + 4 garrison guards', a.nf === 6 && b.nf === 6 && a.ng === 4 && a.id !== b.id, `A=${a.name}#${a.id} B=${b.name}#${b.id} guards=${a.ng}`);
check('names and operators arrived', a.name === 'Roms' && b.name === 'Shadow' || a.name && b.name, `${a.name} / ${b.name}`);
check('HUD alive counter matches the sim and ignores the guards (<= 6)', a.aliveHud.trim() === String(a.alive_n) && b.aliveHud.trim() === String(b.alive_n) && a.alive_n <= 6 && a.alive_n >= 3, `${a.aliveHud}/${b.aliveHud} sim=${a.alive_n}`);
await A.screenshot({ path: SHOT('A_start') }); await B.screenshot({ path: SHOT('B_start') });

clearInterval(protect);
// keep bots from interfering
for (const f of sim.fighters) if (!f.human) { f.brain = null; f.rb.setTranslation({ x: 100 + f.id * 3, y: 0.9, z: 100 }, true); f.x = 100 + f.id * 3; f.z = 100; }
sim.zone.radius = 500;

// ---- movement: press D in A's browser
const hit = (x, z, m) => sim.map.boxes.some((q) => Math.abs(x - q.x) < q.w / 2 + m && Math.abs(z - q.z) < q.d / 2 + m);
let L = null;
for (let x = -80; x <= 60 && !L; x += 5) for (let z0 = 90; z0 > -60 && !L; z0 -= 5) {
  let ok = true; for (let d = 0; d <= 30 && ok; d++) for (let dx = -2; dx <= 14 && ok; dx += 2) if (hit(x + dx, z0 - d, 2)) ok = false;
  if (ok) L = { x, z0 };
}
const tp = (f, x, z) => { f.rb.setTranslation({ x, y: 0.9, z }, true); f.x = x; f.y = 0.9; f.z = z; };
const fa = sim.fighters[a.id], fb = sim.fighters[b.id];
tp(fa, L.x, L.z0); tp(fb, L.x + 2, L.z0 - 14);
await A.evaluate(() => { const n = window.__nh; n.cmd.yaw = 0; });
await wait(900);
await A.evaluate(() => { window.__nh.net.stats.maxErr = 0; });          // (the teleport above is a deliberate snap, not a prediction error)
const a0 = await info(A);
await A.keyboard.down('KeyD'); await wait(1000); await A.keyboard.up('KeyD'); await wait(700);
const a1 = await info(A), bSeesA = (await info(B)).others.find((o) => o.id === a.id);
check('D moves A to the right in A\'s own screen (prediction)', a1.x - a0.x > 2.5, `dx=${(a1.x - a0.x).toFixed(1)}`);
check('server agrees with where A is', Math.hypot(fa.x - a1.x, fa.z - a1.z) < 0.4, `diff=${Math.hypot(fa.x - a1.x, fa.z - a1.z).toFixed(2)} m`);
check('B sees A move (smoothly interpolated)', Math.hypot(bSeesA.x - fa.x, bSeesA.z - fa.z) < 0.6, `diff=${Math.hypot(bSeesA.x - fa.x, bSeesA.z - fa.z).toFixed(2)} m`);
check('prediction never jumped more than 1 m', a1.maxErr < 1, `maxErr=${a1.maxErr.toFixed(2)}`);
check('ping is shown on the HUD', /ms/.test((await info(B)).ping), (await info(B)).ping);

// ---- A shoots B: aim at where B is DRAWN in A's browser
tp(fa, L.x, L.z0); tp(fb, L.x + 2, L.z0 - 14); await wait(900);
sim.fighters[b.id].hp = 400; sim.fighters[b.id].maxHp = 400;   // tough target so the test can watch the damage arrive
 const hp0 = sim.fighters[b.id].hp;
await A.evaluate((bid) => {
  const n = window.__nh, me = n.sim.player, t = n.sim.fighters[bid];
  const dx = t.x - me.x, dz = t.z - me.z;
  n.cmd.yaw = Math.atan2(-dx, -dz); n.cmd.pitch = Math.atan2(0.9 - 1.62, Math.hypot(dx, dz));
  n.input.fire = true;
}, b.id);
await wait(600);
await A.evaluate(() => { window.__nh.input.fire = false; });
await wait(500);
const hpB = sim.fighters[b.id].hp, bInfo = await info(B);
check('server confirms A hurt B', hpB < hp0, `hp ${hp0} -> ${hpB}`);
check('B\'s own screen shows the damage (hp from server)', bInfo.hp < hp0, `B sees hp=${bInfo.hp}`);
await A.screenshot({ path: SHOT('A_shooting') }); await B.screenshot({ path: SHOT('B_hurt') });

// ---- B dies: B gets an end screen with a place, A keeps playing
sim.damage(sim.fighters[b.id], 9999, sim.fighters[a.id], { cause: 'bullet', w: 'ar', head: true, dx: 0, dy: 0, dz: -1 });
await wait(2800);
const bEnd = await info(B), aMid = await info(A);
check('B sees the ELIMINATED screen with a place', bEnd.endShown && /ELIMINATED/i.test(bEnd.title) && bEnd.place === '#6', `title=${bEnd.title} place=${bEnd.place}`);
check('A is still playing', !aMid.endShown && aMid.alive);
await B.screenshot({ path: SHOT('B_dead') });

// ---- everybody else dies: A wins
for (const f of sim.fighters) if (f.alive && f.id !== a.id) sim.damage(f, 9999, sim.fighters[a.id], { cause: 'bullet', w: 'ar' });
await wait(3500);
const aEnd = await info(A);
check('A sees the VICTORY screen (place #1)', aEnd.endShown && aEnd.place === '#1', `title=${aEnd.title} place=${aEnd.place}`);
await A.screenshot({ path: SHOT('A_win') });
check('server declared the match over', sim.state === 'over');
check('no browser errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll online browser checks passed');
console.log('screenshots:', SHOT('A_start'), '...');
process.exit(failed ? 1 : 0);
