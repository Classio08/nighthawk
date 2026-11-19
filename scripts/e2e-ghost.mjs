// Browser check for Operation GHOST FREQUENCY: the menu button / ?mission= starts it on the ground (no plane, no zone), the HUD panel and minimap markers
// come from the mission, E starts a held relay task, walking off cancels it, three relays unlock extraction, the debrief shows, no errors.
// Needs `npx vite build` + `npx vite preview --port 4173`.
import puppeteer from 'puppeteer-core';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome', URL = process.env.URL || 'http://127.0.0.1:4173/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
let fails = 0; const errors = [];
const check = (n, ok, d = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${d}`); };
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(URL + '?loot=0', { waitUntil: 'load' });
await page.waitForSelector('#operation2btn', { timeout: 30000 });
check('the menu has a GHOST FREQUENCY button', (await page.$eval('#operation2btn', (b) => b.textContent)).includes('GHOST FREQUENCY'));
await page.click('#operation2btn');
await page.waitForFunction('window.__nh && window.__nh.sim && window.__nh.sim.mission && window.__nh.sim.time > 0.5', { timeout: 60000 });
const gameWait = (secs) => page.evaluate((s) => new Promise((res) => { const t0 = window.__nh.sim.time, w0 = performance.now(); const iv = setInterval(() => { if (window.__nh.sim.time - t0 >= s || performance.now() - w0 > 40000) { clearInterval(iv); res(); } }, 30); }), secs);
const tp = (x, z) => page.evaluate((x, z) => { const { sim } = window.__nh, f = sim.player; f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); sim.world.propagateModifiedBodyPositionsToColliders(); f.x = x; f.y = 0.9; f.z = z; }, x, z);
const press = async (code) => { await page.keyboard.down(code); await gameWait(0.15); await page.keyboard.up(code); await gameWait(0.2); };
const M = () => page.evaluate(() => { const m = window.__nh.sim.mission; return { id: m.id, stage: m.stage, done: m.doneCount, active: m.active?.id ?? null, progress: m.active?.progress ?? 0, nodes: m.nodes.map((n) => ({ id: n.id, x: n.x, z: n.z, done: n.done })), ext: m.extraction, trace: m.trace, finished: m.finished }; });
await page.evaluate(() => { const { sim } = window.__nh, o = sim.damage.bind(sim); sim.damage = (t, ...a) => (t === sim.player ? undefined : o(t, ...a)); });      // the garrison would end the happy path in seconds (the cancel-on-hit path is a unit test)

let m = await M();
const s0 = await page.evaluate(() => { const { sim } = window.__nh; return { plane: !!sim.plane, air: sim.player.air, zone: document.getElementById('zone').textContent, panel: document.getElementById('mission').innerText, guards: sim.fighters.filter((f) => f.npc).length }; });
check('GHOST FREQUENCY starts on the ground: no plane, no zone', !s0.plane && s0.air === 0 && s0.zone === 'OPERATION', JSON.stringify({ plane: s0.plane, air: s0.air, zone: s0.zone }));
check('the HUD panel names the operation, the objective and the trace timer', /GHOST FREQUENCY/.test(s0.panel) && /JAM THE RELAY NODES \(0\/3\)/.test(s0.panel) && /TRACE 8:00|TRACE 7:5/.test(s0.panel), s0.panel.replace(/\n/g, ' | '));
check('a garrison guards the far relay', s0.guards === 8, `${s0.guards}`);

// start a task, walk away: it cancels
await tp(m.nodes[0].x + 1.5, m.nodes[0].z); await gameWait(0.3); await press('KeyE');
let a = await M(); check('E near a relay starts the task', a.active === m.nodes[0].id, JSON.stringify({ active: a.active }));
const panel1 = await page.evaluate(() => document.getElementById('mission').innerText); check('the panel shows the splice progress', /SPLICING/.test(panel1), panel1.replace(/\n/g, ' | '));
await page.screenshot({ path: join(tmpdir(), 'nighthawk_ghost_task.png') });
await tp(m.nodes[0].x + 14, m.nodes[0].z); await gameWait(0.5);
a = await M(); check('walking away cancels the task', a.active === null && a.done === 0);

// finish all three
for (let i = 0; i < 3; i++) {
  const n = m.nodes[i]; await tp(n.x + 1.5, n.z); await gameWait(0.3); await press('KeyE'); await gameWait(5.3);
  a = await M(); check(`relay ${i + 1} jammed`, a.done === i + 1 && a.nodes[i].done, `${a.done}/3`);
}
check('three relays unlock extraction', a.stage === 'extract');
const mini = await page.evaluate(() => document.getElementById('mission').innerText); check('the panel switches to extraction', /EXTRACT/i.test(mini), mini.replace(/\n/g, ' | '));
await page.screenshot({ path: join(tmpdir(), 'nighthawk_ghost_extract.png') });
await tp(a.ext.x, a.ext.z); await gameWait(4.6);
a = await M(); check('four seconds on the pad completes the operation', a.stage === 'complete' && a.finished, a.stage);
await page.waitForFunction("document.getElementById('end').classList.contains('show')", { timeout: 10000 }).catch(() => {});
const end = await page.evaluate(() => ({ shown: document.getElementById('end').classList.contains('show'), title: document.getElementById('endtitle').textContent, sub: document.getElementById('endsub').textContent }));
check('the debrief shows OPERATION COMPLETE with the relay summary', end.shown && /COMPLETE/.test(end.title) && /relays/i.test(end.sub), `${end.title} / ${end.sub}`);

const snap = await page.evaluate(() => { const i = document.getElementById('snapimg'); return { shown: getComputedStyle(document.getElementById('snapwrap')).display !== 'none', png: i.src.startsWith('data:image/png'), w: i.naturalWidth, h: i.naturalHeight }; });
check('the end screen shows a snapshot card (a PNG of the final frame with a caption)', snap.shown && snap.png && snap.w === 960 && snap.h === 540, JSON.stringify(snap));
await page.evaluate(() => { const i = document.getElementById('snapimg'); const a = document.createElement('a'); a.href = i.src; a.id = '__snaplink'; document.body.appendChild(a); });
await page.screenshot({ path: join(tmpdir(), 'nighthawk_ghost_end.png') });
await page.evaluate(() => { const c = document.createElement('canvas'); const i = document.getElementById('snapimg'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); window.__snapData = c.toDataURL('image/png'); });
const snapBytes = await page.evaluate(() => { const b = atob(window.__snapData.split(',')[1]); return b.length; });
await (await import('node:fs/promises')).writeFile(join(tmpdir(), 'nighthawk_snapcard.png'), Buffer.from(await page.evaluate(() => window.__snapData.split(',')[1]), 'base64'));
check('the card is a real image, not an empty canvas', snapBytes > 20000, `${snapBytes} bytes`);

// PLAY AGAIN restarts the same operation, not the other one
await page.click('#againbtn'); await page.waitForFunction('window.__nh.sim.mission && window.__nh.sim.time < 3 && window.__nh.sim.mission.stage === "tasks"', { timeout: 40000 }).catch(() => {});
check('PLAY AGAIN starts GHOST FREQUENCY again', (await M()).id === 'ghost-frequency');

check('no browser errors', errors.length === 0, errors.slice(0, 4).join(' | '));
await browser.close(); console.log(fails ? `\n${fails} failed` : '\nghost frequency e2e: all good'); process.exit(fails ? 1 : 0);
