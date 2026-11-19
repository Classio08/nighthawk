// Two REAL browsers against a REAL server (started inside this script) with the parachute drop-in switched on:
// both start in the plane on their own screens, A jumps and B sees him fall, A's chute opens and he lands harmlessly, B is thrown out by the server
// if he never jumps, and the zone countdown shows the drop's extra time.
//   needs: npm run build, `npx vite preview --port 4173` running, puppeteer-core, Chrome.
import puppeteer from 'puppeteer-core';

const REPO = process.env.REPO || new URL('..', import.meta.url).pathname;
const { createServer } = await import(`${REPO}server/src/index.js`);
const { MatchRoom } = await import(`${REPO}server/src/MatchRoom.js`);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome', WEB = process.env.URL || 'http://127.0.0.1:4173/';
const PORT = 2570, SERVER = `ws://127.0.0.1:${PORT}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const errors = [];
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) failed++; };

const server = createServer({ lobbySecs: 2, total: 6, vehicles: false, loot: false, drop: true });
await server.listen(PORT);
let protect = null;
const early = setInterval(() => {
  const r = [...MatchRoom.instances][0]; if (!r?.sim) return;
  clearInterval(early); protect = setInterval(() => { for (const h of r.sim.humans) if (h.alive) h.hp = h.maxHp; }, 20);
}, 2);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
async function open(op, name, extra = '') {
  const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  await page.evaluateOnNewDocument((n) => { try { localStorage.setItem('nh_name', n); } catch { /* */ } }, name);
  await page.goto(`${WEB}?autostart&online=${encodeURIComponent(SERVER)}&op=${op}${extra}`, { waitUntil: 'load' });
  return page;
}
const [A, B] = await Promise.all([open('roms', 'Roms'), open('shadow', 'Shadow', '&lag=60')]);
for (const p of [A, B]) await p.waitForFunction('window.__nh && window.__nh.net && window.__nh.net.ready', { timeout: 60000 });
await wait(600);
const room = [...MatchRoom.instances][0], sim = room.sim;
const view = (page) => page.evaluate(() => {
  const { sim: s, G } = window.__nh, p = s.player, a = document.getElementById('air');
  return { id: p.id, air: p.air, y: p.y, x: p.x, z: p.z, hp: p.hp, maxHp: p.maxHp, vy: p.vy, plane: !!G.pview?.root.visible, airText: a.style.display === 'none' ? '' : a.innerText,
    zone: document.getElementById('zone').textContent, others: Object.fromEntries(s.fighters.filter((f) => f.id !== p.id).map((f) => [f.id, f.air])), gun: window.__nh.viewmodel.root.visible };
});
const press = async (page, ms = 250) => { await page.keyboard.down('Space'); await wait(ms); await page.keyboard.up('Space'); };

let a = await view(A), b = await view(B);
check('both browsers start in the plane (air = 1) at plane height', a.air === 1 && b.air === 1 && a.y > 150 && b.y > 150, `A air=${a.air} y=${a.y.toFixed(0)}; B air=${b.air} y=${b.y.toFixed(0)}`);
check('both screens show the plane and the PRESS SPACE prompt, with no gun in hand', a.plane && b.plane && /PRESS SPACE TO JUMP/.test(a.airText) && /PRESS SPACE TO JUMP/.test(b.airText) && a.gun === false && b.gun === false);
const zsec = (t) => { const m = /(\d+):(\d\d)/.exec(t); return m ? +m[1] * 60 + +m[2] : -1; };
check('the zone countdown includes the drop time (well over the 22 s first wait)', /NEXT ZONE/.test(a.zone) && zsec(a.zone) > 25, JSON.stringify(a.zone));
check('each browser sees the others as passengers too', Object.values(a.others).filter((v) => v >= 1).length >= 4, JSON.stringify(a.others));

/* A jumps */
await press(A);
await A.waitForFunction('window.__nh.sim.player.air === 2 || window.__nh.sim.player.air === 3', { timeout: 15000 });
await wait(800);
a = await view(A); b = await view(B);
check('A is falling on his own screen, in free fall with the HUD text', (a.air === 2 || a.air === 3) && /FREE FALL|PARACHUTE/.test(a.airText) && a.vy < -10, `air=${a.air} vy=${a.vy.toFixed(1)} text=${a.airText.replace(/\n/g, ' | ').slice(0, 40)}`);
check('B sees A fall, while B himself is still aboard', b.air === 1 && (b.others[a.id] === 2 || b.others[a.id] === 3), `B air=${b.air}, B sees A as ${b.others[a.id]}`);
check('the server agrees (A airborne, uninjured)', sim.fighters[a.id].air >= 2 && sim.fighters[a.id].hp === sim.fighters[a.id].maxHp, `server air=${sim.fighters[a.id].air}`);

/* A lands */
await A.waitForFunction('window.__nh.sim.player.air === 0', { timeout: 60000, polling: 100 });
await wait(400);
a = await view(A);
check('A landed on the ground, unhurt, gun back, prompt gone', a.air === 0 && a.y < 14 &&   /* may land on a rooftop */ a.hp === a.maxHp && a.gun === true && a.airText === '', `y=${a.y.toFixed(2)} hp=${a.hp}/${a.maxHp}`);
check('server and A agree where A is standing', Math.hypot(sim.fighters[a.id].x - a.x, sim.fighters[a.id].z - a.z) < 1.5, `gap ${Math.hypot(sim.fighters[a.id].x - a.x, sim.fighters[a.id].z - a.z).toFixed(2)} m`);

/* B never jumps: the server throws him out before the plane leaves the map */
await B.waitForFunction('window.__nh.sim.player.air !== 1', { timeout: 60000, polling: 100 });
b = await view(B);
check('B, who never pressed Space, was thrown out inside the map', (b.air === 2 || b.air === 3) && Math.abs(b.x) < 400 && Math.abs(b.z) < 400, `air=${b.air} x=${b.x.toFixed(0)} z=${b.z.toFixed(0)}`);
await B.waitForFunction('window.__nh.sim.player.air === 0', { timeout: 60000, polling: 100 });
b = await view(B);
check('B landed unhurt too', b.air === 0 && b.hp === b.maxHp && b.y < 3, `hp=${b.hp}/${b.maxHp}`);

clearInterval(protect);
check('no browser errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll online drop checks passed');
process.exit(failed ? 1 : 0);
