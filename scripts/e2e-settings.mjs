// Browser check for the settings menu: opens from the start screen, sliders and key rebinding persist, and a saved layout really drives the game
// (rebound forward key, FOV, bot difficulty, mouse sensitivity).
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome', URL = process.env.URL || 'http://127.0.0.1:4173/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
let fails = 0; const errors = [];
const check = (n, ok, d = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${d}`); };
const watch = (page) => { page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); };

/* ---- 1. the menu itself, from the start screen ---- */
let page = await browser.newPage(); await page.setViewport({ width: 1280, height: 800 }); watch(page);
await page.goto(URL, { waitUntil: 'load' });
await page.waitForSelector('#startsettings', { timeout: 30000 });
check('start screen has a SETTINGS button', true);
await page.click('#startsettings'); await wait(200);
check('SETTINGS opens the overlay', await page.$eval('#settings', (e) => e.classList.contains('show')));
const rows = await page.$$eval('#settingsbody .srow', (r) => r.length), keyBtns = await page.$$eval('#settingsbody .keybtn', (r) => r.length);
check('6 setting rows and 17 key buttons', rows === 6 && keyBtns === 17, `rows=${rows} keys=${keyBtns}`);
// slider + select + checkbox
await page.$eval('#settingsbody input[aria-label="FIELD OF VIEW"]', (e) => { e.value = 95; e.dispatchEvent(new Event('input', { bubbles: true })); });
await page.$eval('#settingsbody select[aria-label="BOT DIFFICULTY"]', (e) => { e.value = 'hard'; e.dispatchEvent(new Event('change', { bubbles: true })); });
await page.$eval('#settingsbody select[aria-label="GRAPHICS"]', (e) => { e.value = 'low'; e.dispatchEvent(new Event('change', { bubbles: true })); });
// rebind "Move forward" to Z
const fwd = (await page.$$('#settingsbody .keybtn'))[0];
check('forward shows W by default', (await fwd.evaluate((e) => e.textContent)) === 'W');
await fwd.click(); await wait(100);
check('clicking a key button waits for a key', (await fwd.evaluate((e) => e.textContent)).includes('press'));
await page.keyboard.press('KeyZ'); await wait(150);
check('pressing Z binds it', (await fwd.evaluate((e) => e.textContent)) === 'Z');
// binding a key that another action owns swaps them: bind "Move back" to Z -> forward gets S
const back = (await page.$$('#settingsbody .keybtn'))[1];
await back.click(); await page.keyboard.press('KeyZ'); await wait(150);
check('re-using a key swaps the two actions', (await fwd.evaluate((e) => e.textContent)) === 'S' && (await back.evaluate((e) => e.textContent)) === 'Z', `${await fwd.evaluate((e) => e.textContent)}/${await back.evaluate((e) => e.textContent)}`);
check('the swap is explained', (await page.$eval('.knote', (e) => e.textContent)).includes('swapped'));
// a reserved key is refused
await back.click(); await page.keyboard.press('Digit3'); await wait(150);
check('reserved keys (1-6) are refused with a message', (await page.$eval('.knote', (e) => e.textContent)).includes('cannot be used') && (await back.evaluate((e) => e.textContent)) === 'Z');
// Escape while waiting cancels, a second Escape closes the menu
await back.click(); await page.keyboard.press('Escape'); await wait(100);
check('Esc cancels a pending rebind and keeps the menu open', (await back.evaluate((e) => e.textContent)) === 'Z' && await page.$eval('#settings', (e) => e.classList.contains('show')));
await page.keyboard.press('Escape'); await wait(150);
check('Esc again closes the menu', !(await page.$eval('#settings', (e) => e.classList.contains('show'))));
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nh_settings_v1') || 'null'));
check('everything was saved to the browser', saved && saved.fov === 95 && saved.difficulty === 'hard' && saved.quality === 'low' && saved.keys.back === 'KeyZ' && saved.keys.forward === 'KeyS', JSON.stringify(saved && { fov: saved.fov, d: saved.difficulty, q: saved.quality }));
await page.screenshot({ path: '/tmp/nighthawk_settings.png' });
await page.close();

/* ---- 2. a saved layout drives the real game ---- */
page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 }); watch(page);
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('nh_settings_v1', JSON.stringify({ fov: 100, sens: 2, difficulty: 'brutal', quality: 'medium', volume: 0.2, keys: { forward: 'KeyZ', back: 'KeyX', left: 'KeyN', right: 'KeyM' } })); } catch {} });
await page.goto(URL + '?autostart&seed=5&bots=4&loot=0&vehicles=0', { waitUntil: 'load' });
await page.waitForFunction('window.__nh && window.__nh.sim', { timeout: 40000 });
await wait(900);
const g = await page.evaluate(() => { const n = window.__nh, b = n.sim.fighters.find((f) => f.brain); return { fov: n.camera.fov, diff: b.brain.diff.id, vol: n.audio.volume, pr: n.G && true }; });
check('saved FOV is used (camera fov ~100)', Math.abs(g.fov - 100) < 2, `fov=${g.fov.toFixed(1)}`);
check('saved difficulty reaches the bots', g.diff === 'brutal', g.diff);
check('saved volume reaches the audio engine', Math.abs(g.vol - 0.2) < 1e-6, String(g.vol));
const pos = () => page.evaluate(() => { const p = window.__nh.sim.player; return { x: p.x, z: p.z, yaw: window.__nh.cmd.yaw }; });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
await page.evaluate(() => { const n = window.__nh, p = n.sim.player; n.cmd.yaw = 0; });
let a = await pos(); await page.keyboard.down('KeyW'); await wait(700); await page.keyboard.up('KeyW'); let b = await pos();
check('the old forward key (W) does nothing now', dist(a, b) < 0.4, `moved ${dist(a, b).toFixed(2)} m`);
a = await pos(); await page.keyboard.down('KeyZ'); await wait(900); await page.keyboard.up('KeyZ'); b = await pos();
check('the rebound key (Z) walks forward', dist(a, b) > 1.5, `moved ${dist(a, b).toFixed(2)} m`);
// mouse sensitivity: the same mouse delta turns the view twice as far as at sens 1
const turn = await page.evaluate(() => { const n = window.__nh; n.input.dx = 100; const l = n.input.readLook(1 / 60, 1); return l.yaw; });
check('sensitivity 2x doubles the turn rate', Math.abs(turn - (-100 * 0.0022 * 2)) < 1e-6, `yaw delta ${turn.toFixed(4)}`);
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close(); console.log(fails ? `SETTINGS E2E FAIL (${fails})` : 'settings e2e: all good'); process.exit(fails ? 1 : 0);
