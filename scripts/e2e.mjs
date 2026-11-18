// Optional browser end-to-end test. Needs: npm i -D puppeteer-core, a built game (npm run build), `npx vite preview --port 4173` running, and Chrome at the path below (edit it for Windows).
// End-to-end check in a real (headless) Chrome: page loads, WASM physics starts, controls move the player the right way.
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('response', (r) => { if (r.status() >= 400) errors.push('http ' + r.status() + ' ' + r.url()); });

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'load' });
await page.waitForFunction('window.__nh', { timeout: 20000 });
await new Promise((r) => setTimeout(r, 1500)); // let it settle onto the ground

const pos = () => page.evaluate(() => { const t = window.__nh.pBody.translation(); return { x: t.x, y: t.y, z: t.z }; });
const hold = async (code, ms) => { await page.keyboard.down(code); await new Promise((r) => setTimeout(r, ms)); await page.keyboard.up(code); await new Promise((r) => setTimeout(r, 200)); };
const out = {};
const p0 = await pos();
out.startY = +p0.y.toFixed(2);

await hold('KeyD', 700); const pD = await pos();
await hold('KeyA', 700); const pA = await pos();
await hold('KeyW', 700); const pW = await pos();
out.D_dx = +(pD.x - p0.x).toFixed(2);     // expect > 0  (right)
out.A_dx = +(pA.x - pD.x).toFixed(2);     // expect < 0  (left)
out.W_dz = +(pW.z - pA.z).toFixed(2);     // expect < 0  (forward = -Z)

// shoot a bot placed 4 m in front (in front of the crate pyramid)
const shot = await page.evaluate(() => {
  const n = window.__nh, t = n.pBody.translation();
  n.yaw = 0;
  const b = n.bots[0]; b.position.set(t.x, 0.9, t.z - 4); b.rb.setTranslation({ x: t.x, y: 0.9, z: t.z - 4 }, true);
  n.world.step();
  const before = b.hp; n.shoot();
  return { before, after: b.hp };
});
out.botHp = shot;

const c0 = await page.evaluate(() => window.__nh.crates.map((c) => { const t = c.body.translation(); return [t.x, t.y, t.z]; }));
await page.keyboard.press('KeyG');
await new Promise((r) => setTimeout(r, 3500));
const c1 = await page.evaluate(() => window.__nh.crates.map((c) => { const t = c.body.translation(); return [t.x, t.y, t.z]; }));
out.crateMaxMoveAfterGrenade = +Math.max(...c0.map((a, i) => Math.hypot(a[0] - c1[i][0], a[1] - c1[i][1], a[2] - c1[i][2]))).toFixed(2);
await page.screenshot({ path: '/tmp/nighthawk_e2e.png' });
console.log(JSON.stringify(out, null, 2));
console.log('errors:', errors.length ? errors : 'none');
const ok = out.D_dx > 1 && out.A_dx < -1 && out.W_dz < -1 && shot.after < shot.before && !errors.length && out.startY > 0.8 && out.startY < 1.3;
console.log(ok ? 'E2E PASS' : 'E2E FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
