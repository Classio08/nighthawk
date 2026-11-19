// Browser check for Operation DUST LANTERN (offline mission mode): the menu button starts it, there is no plane / no shrinking zone, E gathers clues, the
// second clue identifies the site, E rescues the technician, extraction needs both of you in the zone and a 4 s hold, the debrief shows, no errors.
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome', URL = process.env.URL || 'http://127.0.0.1:4173/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
let fails = 0; const errors = [];
const check = (n, ok, d = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${d}`); };
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(URL + '?loot=0', { waitUntil: 'load' });
await page.waitForSelector('#operationbtn', { timeout: 30000 });
await page.click('#operationbtn');
await page.waitForFunction('window.__nh && window.__nh.sim && window.__nh.sim.mission && window.__nh.sim.time > 0.5', { timeout: 60000 });
const gameWait = (secs, pg = page) => pg.evaluate((s) => new Promise((res) => { const t0 = window.__nh.sim.time, w0 = performance.now(); const iv = setInterval(() => { if (window.__nh.sim.time - t0 >= s || performance.now() - w0 > 25000) { clearInterval(iv); res(); } }, 30); }), secs);
const tp = (x, z) => page.evaluate((x, z) => { const { sim } = window.__nh, f = sim.player; f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); sim.world.propagateModifiedBodyPositionsToColliders(); f.x = x; f.y = 0.9; f.z = z; }, x, z);
const press = async (code) => { await page.keyboard.down(code); await gameWait(0.15); await page.keyboard.up(code); await gameWait(0.2); };
const M = () => page.evaluate(() => { const m = window.__nh.sim.mission; return { stage: m.stage, found: m.foundCount, rescued: m.captive.rescued, extractT: m.extractT, finished: m.finished, clues: m.clues.map((c) => ({ x: c.x, z: c.z, found: c.found })), captive: { x: m.captive.x, z: m.captive.z }, ext: m.extraction, site: m.targetSite.name }; });
await page.evaluate(() => { const { sim } = window.__nh, o = sim.damage.bind(sim); sim.damage = (t, ...a) => (t === sim.player ? undefined : o(t, ...a)); });      // eight guards at the compound would end the happy-path run in a second: the player is invulnerable here (the failure path is tested below)

let m = await M();
const s0 = await page.evaluate(() => { const { sim } = window.__nh, el = document.getElementById('mission'); return { plane: !!sim.plane, air: sim.player.air, zoneText: document.getElementById('zone').textContent, panel: el ? el.innerText : '', guards: sim.fighters.filter((f) => f.npc).length, others: sim.fighters.filter((f) => !f.npc && !f.human).length, zoneStart: sim.zoneStart }; });
check('operation mode starts on the ground: no plane, no drop', !s0.plane && s0.air === 0 && s0.zoneStart === 0, JSON.stringify({ plane: s0.plane, air: s0.air }));
check('no shrinking zone: the zone label says OPERATION', s0.zoneText === 'OPERATION', s0.zoneText);
check('the mission panel shows the recon objective (0/2 clues)', /RECON/.test(s0.panel) && /0\/2/.test(s0.panel), s0.panel.replace(/\n/g, ' | ').slice(0, 90));
check('no battle-royale bots, only the garrison guards', s0.others === 0 && s0.guards >= 4, `guards=${s0.guards} bots=${s0.others}`);
check('mission starts in the recon stage', m.stage === 'recon' && m.found === 0);

await tp(m.clues[0].x + 30, m.clues[0].z + 30); await press('KeyE');
m = await M(); check('E far from any clue finds nothing', m.found === 0);
await tp(m.clues[0].x + 1, m.clues[0].z); await press('KeyE');
m = await M(); check('E next to a clue picks it up (1/2) and the stage stays recon', m.found === 1 && m.stage === 'recon');
await gameWait(0.3);
check('the HUD counts the clue', /1\/2/.test(await page.$eval('#mission', (e) => e.innerText)));
await tp(m.clues[1].x + 1, m.clues[1].z); await press('KeyE');
m = await M(); check('the second clue identifies the site and unlocks recovery', m.found === 2 && m.stage === 'recover');
await gameWait(0.3);
check('the HUD now names the compound to search', (await page.$eval('#mission', (e) => e.innerText)).toUpperCase().includes(m.site), m.site);

await tp(m.captive.x + 2, m.captive.z); await press('KeyE');
m = await M(); check('E next to the technician rescues them (extract stage)', m.rescued && m.stage === 'extract');

// extraction needs BOTH the operator and the technician inside the zone
await tp(m.ext.x, m.ext.z); await gameWait(6);
m = await M(); check('standing in the extraction zone alone does NOT complete the mission', !m.finished && m.stage === 'extract', `extractT=${m.extractT.toFixed(1)}`);
await page.evaluate(() => { const mm = window.__nh.sim.mission; mm.captive.x = mm.extraction.x + 1; mm.captive.z = mm.extraction.z + 1; });      // the technician catches up
await gameWait(5.5);
m = await M(); check('with the technician in the zone the 4 s hold completes the operation', m.finished && m.stage === 'complete', `stage=${m.stage}`);
await page.waitForFunction("document.getElementById('end').classList.contains('show')", { timeout: 15000 }).catch(() => {});
const end = await page.evaluate(() => ({ shown: document.getElementById('end').classList.contains('show'), title: document.getElementById('endtitle').textContent, sub: document.getElementById('endsub').textContent }));
check('the debrief screen says OPERATION COMPLETE', end.shown && end.title === 'OPERATION COMPLETE', JSON.stringify(end).slice(0, 120));

/* ---- failure: dying ends the operation with the failure screen ---- */
await page.close();
const page2 = await browser.newPage(); await page2.setViewport({ width: 1280, height: 720 });
page2.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page2.goto(URL + '?loot=0', { waitUntil: 'load' }); await page2.waitForSelector('#operationbtn'); await page2.click('#operationbtn');
await page2.waitForFunction('window.__nh && window.__nh.sim && window.__nh.sim.mission && window.__nh.sim.time > 0.5', { timeout: 60000 });
await page2.evaluate(() => { const { sim } = window.__nh; sim.damage(sim.player, 9999, null, { cause: 'bullet', x: sim.player.x, y: sim.player.y, z: sim.player.z }); });
await page2.waitForFunction("document.getElementById('end').classList.contains('show')", { timeout: 15000 }).catch(() => {});
const fail = await page2.evaluate(() => ({ shown: document.getElementById('end').classList.contains('show'), title: document.getElementById('endtitle').textContent, stage: window.__nh.sim.mission.stage }));
check('dying fails the operation (OPERATION FAILED screen, stage failed)', fail.shown && fail.title === 'OPERATION FAILED' && fail.stage === 'failed', JSON.stringify(fail));
check('no browser errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(fails === 0 ? '\nmission e2e: all good' : `\n${fails} FAILED`); process.exit(fails ? 1 : 0);
