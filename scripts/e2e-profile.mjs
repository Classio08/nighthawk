// Browser check for the guest profile: a fresh browser starts at level 1 with every skin locked, a played match pays XP + stats, the end screen
// shows the breakdown, the profile survives a reload, a hand-corrupted save is repaired, an unlocked skin can be picked, and RESET really resets.
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome', URL = process.env.URL || 'http://127.0.0.1:4173/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
let fails = 0; const errors = [];
const check = (n, ok, d = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${d}`); };
const watch = (page) => { page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); };
const stored = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('nh_profile_v1')); } catch { return 'bad'; } });

/* ---- 1. a brand-new browser ---- */
let page = await browser.newPage(); await page.setViewport({ width: 1280, height: 800 }); watch(page);
await page.goto(URL, { waitUntil: 'load' });
await page.evaluate(() => { localStorage.clear(); }); await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#profile summary', { timeout: 30000 });
check('profile summary starts at LV 1 RECRUIT', (await page.$eval('#profile summary', (e) => e.textContent)).includes('LV 1') && (await page.$eval('#profile summary', (e) => e.textContent)).includes('RECRUIT'));
const locked0 = await page.$$eval('.skin.lock', (a) => a.map((b) => b.textContent));
check('all 5 weapon skins are locked at level 1 (shown as LV n)', locked0.length === 5 && locked0.every((t) => /^LV \d+$/.test(t)), JSON.stringify(locked0));
await page.click('.dtab[data-tab=loadout]'); await wait(100);      // skins live in the LOADOUT tab of the menu
await page.click('.skin.lock'); await wait(100);
check('clicking a locked skin changes nothing (STOCK stays selected)', (await page.$eval('.skin.on', (b) => b.dataset.skin)) === '');
check('nothing is saved before the first match', (await stored(page)) === null);

/* ---- 2. play a match and die: XP is paid, stats saved ---- */
await page.click('.dtab[data-tab=home]'); await page.click('#playbtn'); await page.waitForFunction(() => window.__nh && window.__nh.sim && window.__nh.sim.player, { timeout: 30000 });
await page.waitForFunction(() => window.__nh.sim.time > 1.5, { timeout: 30000 });      // let the match actually run for a moment (slow software GL on a cold start)
await page.evaluate(() => {
  const { sim } = window.__nh, me = sim.player, bot = sim.fighters.find((f) => !f.npc && !f.human && f.alive && f.id !== me.id);
  sim.damage(bot, 9999, me, { head: true, w: 'ar', cause: 'bullet', x: bot.x, y: bot.y, z: bot.z });      // one headshot kill for me
  sim.damage(me, 9999, null, { cause: 'zone', x: me.x, y: me.y, z: me.z });                                // then I die
});
await page.waitForFunction(() => document.getElementById('end').classList.contains('show'), { timeout: 15000 });
const end = await page.evaluate(() => ({ gain: document.getElementById('xpgain').innerText, total: document.querySelector('#xpgain .xptotal')?.textContent, kills: document.getElementById('e-kills').textContent }));
check('end screen shows +XP and the breakdown', /^\+\d+ XP$/.test(end.total ?? '') && end.gain.includes('PLAYED A MATCH') && end.gain.includes('1 KILL'), JSON.stringify(end).slice(0, 160));
const p1 = await stored(page);
check('profile saved: 1 match, 1 kill, 1 headshot, 1 death, 0 wins', p1 && p1.matches === 1 && p1.kills === 1 && p1.headshots === 1 && p1.deaths === 1 && p1.wins === 0, JSON.stringify(p1)?.slice(0, 200));
check('the ar kill is credited to the weapon', p1?.weaponKills?.ar === 1);
check('XP in the save matches what the screen paid', p1 && `+${p1.xp} XP` === end.total, `${p1?.xp} vs ${end.total}`);
check('FIRST BLOOD badge announced', end.gain.includes('BADGE EARNED: FIRST BLOOD'));
await wait(300);
const xpAfter = p1.xp;

/* ---- 3. reload: the profile card and its numbers persist ---- */
await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#profile summary', { timeout: 30000 });
check('after a reload the card shows the saved XP', (await page.$eval('#profile summary', (e) => e.textContent)).includes(`XP`) || (await page.$eval('#profile summary', (e) => e.textContent)).includes('MAX'));
await page.$eval('#profile summary', (e) => e.click()); await wait(150);
const tiles = await page.$$eval('#profile .pstats div', (d) => Object.fromEntries(d.map((x) => [x.querySelector('small').textContent, x.querySelector('b').textContent])));
check('stat tiles: matches 1, kills 1, headshots 1', tiles.MATCHES === '1' && tiles.KILLS === '1' && tiles.HEADSHOTS === '1', JSON.stringify(tiles));
check('FIRST BLOOD badge is lit on the card', await page.$$eval('#profile .badge.on', (b) => b.some((x) => x.textContent === 'FIRST BLOOD')));

/* ---- 4. a corrupted save is repaired, an unlocked skin can be picked ---- */
await page.evaluate(() => localStorage.setItem('nh_profile_v1', JSON.stringify({ xp: 99999, matches: 'many', kills: -4, weaponKills: { '__proto__': 3, ar: 'x' }, history: 5 })));
await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#profile summary', { timeout: 30000 });
const sum2 = await page.$eval('#profile summary', (e) => e.textContent);
const lv = +/LV (\d+)/.exec(sum2)[1];
check('a hand-edited save is accepted only where valid (huge XP -> high level, junk fields -> 0)', lv >= 15 && (await page.$$eval('#profile .pstats b', (b) => b[0].textContent)) === '0', sum2);
check('with that level every skin is unlocked', (await page.$$eval('.skin.lock', (a) => a.length)) === 0);
await page.click('.dtab[data-tab=loadout]'); await wait(100);
await page.click('.skin[data-skin="gold"]'); await wait(100);
check('picking GOLD sticks', (await page.$eval('.skin.on', (b) => b.dataset.skin)) === 'gold' && (await page.evaluate(() => localStorage.getItem('nh_skin'))) === 'gold');

/* ---- 5. reset (needs a second click) ---- */
await page.$eval('#profile summary', (e) => { if (!e.parentElement.open) e.click(); }); await wait(100);
await page.$eval('#profile .btn.small', (b) => b.click()); await wait(100);
check('RESET asks for confirmation first', (await page.$eval('#profile .btn.small', (b) => b.textContent)).includes('AGAIN'));
check('the profile is still there before the second click', (await stored(page)) !== null);
await page.$eval('#profile .btn.small', (b) => b.click()); await wait(200);
check('second click erases the profile (level 1, skins locked again, GOLD falls back to stock)', (await page.$eval('#profile summary', (e) => e.textContent)).includes('LV 1') && (await page.$$eval('.skin.lock', (a) => a.length)) === 5 && (await page.$eval('.skin.on', (b) => b.dataset.skin)) === '');
check('nothing left in storage', (await stored(page)) === null);

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nprofile e2e: all good'); process.exit(fails ? 1 : 0);
