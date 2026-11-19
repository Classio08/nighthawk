// Browser check for Operation RELAY UPLINK: the menu button starts it on the ground, E at the tower starts the hack, walking off cancels it, the hold opens three raider
// waves (3, 5, 7) that get bodies in the scene, staying in the circle fills the uplink, the pad finishes the operation, the debrief shows the right rows, no errors.
// The operator is made immortal for the happy path (the raiders would otherwise end it, which the unit tests cover); everything else is the real game loop.
// Needs `npx vite build` + `npx vite preview --port 4173`.
import puppeteer from 'puppeteer-core';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome', URL = process.env.URL || 'http://127.0.0.1:4173/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
let fails = 0; const errors = [];
const check = (n, ok, d = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${d}`); };
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(URL + '?loot=0', { waitUntil: 'load' });
await page.waitForSelector('#operation3btn', { timeout: 30000 });
check('the menu has a RELAY UPLINK button', (await page.$eval('#operation3btn', (b) => b.textContent)).includes('RELAY UPLINK'));
await page.click('#operation3btn');
await page.waitForFunction('window.__nh && window.__nh.sim && window.__nh.sim.mission && window.__nh.sim.time > 0.5', { timeout: 60000 });
const gameWait = (secs, capMs = 40000) => page.evaluate((s, cap) => new Promise((res) => { const t0 = window.__nh.sim.time, w0 = performance.now(); const iv = setInterval(() => { if (window.__nh.sim.time - t0 >= s || performance.now() - w0 > cap) { clearInterval(iv); res(); } }, 30); }), secs, capMs);
const tp = (x, z) => page.evaluate((x, z) => { const { sim } = window.__nh, f = sim.player; f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); sim.world.propagateModifiedBodyPositionsToColliders(); f.x = x; f.y = 0.9; f.z = z; }, x, z);
const press = async (code) => { await page.keyboard.down(code); await gameWait(0.15); await page.keyboard.up(code); await gameWait(0.2); };
const M = () => page.evaluate(() => {
  const { sim, G } = window.__nh, m = sim.mission;
  return { id: m.id, stage: m.stage, uplink: m.uplink, hackFails: m.hackFails, wave: m.waveIndex, raiders: m.raiders.length, alive: m.raidersAlive, broken: m.broken, finished: m.finished, tower: { x: m.tower.x, z: m.tower.z }, ext: { ...m.extraction },
    raiderViews: m.raiders.filter((r) => r.alive && G.views.has(r.id)).length, panel: document.getElementById('mission').innerText.replace(/\n/g, ' | '), minimap: m.mapMarkers().length };
});
const panel = () => page.evaluate(() => document.getElementById('mission').innerText.replace(/\n/g, ' | '));
await page.evaluate(() => { const { sim } = window.__nh, o = sim.damage.bind(sim); sim.damage = (t, ...a) => (t === sim.player ? undefined : o(t, ...a)); window.__hits = 0; });      // immortal operator (the raiders are real; only the player's damage is skipped)

let m = await M();
const s0 = await page.evaluate(() => { const { sim } = window.__nh; return { plane: !!sim.plane, air: sim.player.air, zone: document.getElementById('zone').textContent, guards: sim.fighters.filter((f) => f.npc).length }; });
check('RELAY UPLINK starts on the ground: no plane, no zone', !s0.plane && s0.air === 0 && s0.zone === 'OPERATION', JSON.stringify(s0));
check('the HUD panel names the operation and the first objective', /RELAY UPLINK/.test(m.panel) && /REACH THE RELAY TOWER/.test(m.panel), m.panel);
check('the map shows the tower', m.minimap >= 1);
check('a small garrison (4), no raiders yet', s0.guards === 4 && m.raiders === 0, JSON.stringify({ guards: s0.guards, raiders: m.raiders }));

// E far away does nothing; E at the tower starts the hack; walking away cancels it
await tp(m.tower.x + 25, m.tower.z); await gameWait(0.3); await press('KeyE');
check('E far from the tower does nothing', (await M()).stage === 'approach');
await tp(m.tower.x + 2, m.tower.z); await gameWait(0.3); await press('KeyE');
let a = await M(); check('E at the tower starts the hack', a.stage === 'hack', a.stage);
const p1 = await panel(); check('the panel shows the splice progress', /SPLICING/.test(p1) || /HACK/.test(p1), p1);
await page.screenshot({ path: join(tmpdir(), 'nighthawk_uplink_hack.png') });
await tp(m.tower.x + 16, m.tower.z); await gameWait(0.5);
a = await M(); check('walking away cancels the hack and counts it', a.stage === 'approach' && a.hackFails === 1, JSON.stringify({ stage: a.stage, fails: a.hackFails }));

// the real hack, then the hold
await tp(m.tower.x + 2, m.tower.z); await gameWait(0.3); await press('KeyE'); await gameWait(6.3);
a = await M(); check('six seconds later the uplink is open and wave 1 is here', a.stage === 'hold' && a.wave >= 1 && a.raiders === 3, JSON.stringify({ stage: a.stage, wave: a.wave, raiders: a.raiders }));
check('the raiders have bodies in the scene', a.raiderViews === a.alive && a.alive > 0, `${a.raiderViews}/${a.alive}`);
check('the panel shows the uplink and the wave', /UPLINK/.test(a.panel) && /WAVE/.test(a.panel), a.panel);
await page.screenshot({ path: join(tmpdir(), 'nighthawk_uplink_hold.png') });
await gameWait(38, 100000);                                                                                // the third wave is on the clock at 36 s
a = await M(); check('waves of 3, 5 and 7 have all arrived', a.wave === 3 && a.raiders === 15, JSON.stringify({ wave: a.wave, raiders: a.raiders }));
check('every living raider has a body', a.raiderViews === a.alive, `${a.raiderViews}/${a.alive}`);
await page.screenshot({ path: join(tmpdir(), 'nighthawk_uplink_waves.png') });
await gameWait(40, 120000);
a = await M(); check('staying in the circle sends the uplink', a.stage === 'extract', JSON.stringify({ stage: a.stage, uplink: +a.uplink.toFixed(1) }));
const mini = await panel(); check('the panel switches to extraction', /EXTRACT|RUN/i.test(mini), mini);
await page.screenshot({ path: join(tmpdir(), 'nighthawk_uplink_extract.png') });
await tp(a.ext.x, a.ext.z); await gameWait(4.6);
a = await M(); check('four seconds on the pad completes the operation', a.stage === 'complete' && a.finished, a.stage);
await page.waitForFunction("document.getElementById('end').classList.contains('show')", { timeout: 10000 }).catch(() => {});
const deb = await page.evaluate(() => { const d = document.getElementById('debrief'); return { shown: getComputedStyle(d).display !== 'none', grade: d.querySelector('.dgrade')?.textContent, ending: d.querySelector('.dend')?.textContent, rows: [...d.querySelectorAll('.drows div')].map((r) => r.textContent), saved: JSON.parse(localStorage.getItem('nh_campaign_v1') || 'null') }; });
check('the campaign debrief card shows a grade, a RELAY UPLINK ending and the wave rows', deb.shown && /^[SABCD]$/.test(deb.grade ?? '') && /CLEAR SIGNAL|BROKEN SIGNAL/.test(deb.ending ?? '') && deb.rows.some((r) => /WAVES.*3\/3/.test(r)), JSON.stringify({ g: deb.grade, e: deb.ending, rows: deb.rows.slice(0, 12) }));
check('the run is saved to campaign progress in this browser', deb.saved?.missions?.['relay-uplink']?.wins === 1, JSON.stringify(deb.saved).slice(0, 160));
await page.screenshot({ path: join(tmpdir(), 'nighthawk_uplink_end.png') });

await page.click('#againbtn'); await page.waitForFunction('window.__nh.sim.mission && window.__nh.sim.time < 3 && window.__nh.sim.mission.stage === "approach"', { timeout: 40000 }).catch(() => {});
check('PLAY AGAIN starts RELAY UPLINK again', (await M()).id === 'relay-uplink');

check('no browser errors', errors.length === 0, errors.slice(0, 4).join(' | '));
await browser.close(); console.log(fails ? `\n${fails} failed` : '\nrelay uplink e2e: all good'); process.exit(fails ? 1 : 0);
