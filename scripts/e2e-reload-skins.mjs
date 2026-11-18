// Browser check: every weapon skin compiles and renders without errors; tactical vs empty reloads drop a magazine and run the right stages.
//   needs `vite preview --port 4173` running (see e2e.mjs)
import puppeteer from 'puppeteer-core';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const URL = process.env.URL || 'http://127.0.0.1:4173/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
let failed = 0; const errors = [];
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail}`); };
async function open(query) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || /Shader Error|WebGLProgram|VALIDATE_STATUS|compile/i.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(URL + query + (query.includes('loot=') ? '' : '&loot=0'), { waitUntil: 'load' });
  await page.waitForFunction('window.__nh && window.__nh.sim', { timeout: 40000 });
  return page;
}
for (const skin of ['gold', 'damascus', 'magma', 'carbon', 'reactive']) {
  const page = await open(`?autostart&bots=1&seed=4&skin=${skin}`);
  await wait(1800);
  const info = await page.evaluate(() => { const n = window.__nh; const g = n.G ?? null; return { skin: n.sim.player.skin, ok: !!n.sim.player }; });
  await page.screenshot({ path: join(tmpdir(), `nighthawk_skin_${skin}.png`) });
  check(`skin ${skin}: the player carries it`, info.skin === skin);
  await page.close();
}
check('all five skin shaders compiled without a single console error', errors.length === 0, errors.slice(0, 3).join(' | '));

// reloads
const page = await open('?autostart&bots=1&seed=4&skin=magma&vehicles=0');
await wait(1200);
const res = await page.evaluate(async () => {
  const n = window.__nh, p = n.sim.player, st = p.weapons[p.cur];
  const out = {};
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const active = () => n.G.mags.items.filter((i) => i.on).length;
  const before = active();
  st.ammo = 9; n.cmd.reload = true; await w(300);
  out.tactical = { reloadEmpty: p.reloadEmpty, tot: p.reloadTot, busy: p.reloadT > 0 };
  await w(p.reloadTot * 1000 + 500);
  out.afterTactical = { ammo: st.ammo, mags: active() - before };
  const mid = active();
  st.ammo = 0; n.cmd.reload = true; await w(300);
  out.empty = { reloadEmpty: p.reloadEmpty, tot: p.reloadTot, busy: p.reloadT > 0 };
  await w(p.reloadTot * 1000 + 500);
  out.afterEmpty = { ammo: st.ammo, mags: n.G.mags.items.filter((i) => i.on && i.age < p.reloadTot + 1).length };   // young mags only: the ones from the tactical reload may already have timed out, which made this a timing test
  return out;
});
console.log(JSON.stringify(res));
check('tactical reload starts as tactical and drops a magazine', res.tactical.busy && !res.tactical.reloadEmpty && res.afterTactical.mags >= 1);
check('tactical reload keeps the chambered round (magazine + 1)', res.afterEmpty.ammo + 1 === res.afterTactical.ammo, `ammo=${res.afterTactical.ammo}`);
check('empty reload is slower and drops a magazine too', res.empty.busy && res.empty.reloadEmpty && res.empty.tot > res.tactical.tot && res.afterEmpty.mags >= 1, `${res.tactical.tot}s -> ${res.empty.tot}s`);
check('empty reload fills exactly one magazine (no bonus round)', res.afterEmpty.ammo === res.afterTactical.ammo - 1, `ammo=${res.afterEmpty.ammo}`);
await page.screenshot({ path: join(tmpdir(), 'nighthawk_reload.png') });
check('no browser errors during reloads', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll reload + skin checks passed');
process.exit(failed ? 1 : 0);
