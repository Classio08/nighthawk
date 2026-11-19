// Browser check: DRAW-CALL BUDGET. With a full 16-fighter match and loot on the map, four fixed camera views must stay under budget.
// (Draw calls are what hurt phones and weak GPUs; this fails if someone adds per-object meshes back.) Needs `npx vite build` + `npx vite preview --port 4173`.
// Numbers are GPU-independent (renderer.info counts calls, not time). It does NOT measure frame time: software rendering cannot.
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const URL = process.env.URL || 'http://127.0.0.1:4173/';
const BUDGET = +(process.env.CALL_BUDGET || 280);                 // per view; measured worst case after the Stage 18 merge was 236
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL + '?autostart&bots=15&loot=1&drop=0&seed=7', { waitUntil: 'load' });
await page.waitForFunction('window.__nh && window.__nh.sim && window.__nh.sim.time > 2', { timeout: 90000 });
const r = await page.evaluate(() => {
  const { G, camera, renderer } = window.__nh, scene = G.scene, calls = [];
  for (const [x, y, z, yaw] of [[0, 1.7, 0, 0], [60, 1.7, 40, 2], [-50, 1.7, -30, 4], [20, 30, 20, 1]]) {   // ground level in three places + one high view
    camera.position.set(x, y, z); camera.rotation.set(0, yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
    G.lview?.update(0.016, camera.position);
    renderer.info.reset(); renderer.render(scene, camera); calls.push(renderer.info.render.calls);
  }
  return { calls, tris: renderer.info.render.triangles, fighters: G.sim.fighters.length };
});
let bad = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? ' ' + extra : '')); if (!ok) bad++; };
console.log(JSON.stringify(r));
check('a full match is on screen', r.fighters >= 16, `${r.fighters} fighters`);
check(`draw calls stay under ${BUDGET} in every view`, Math.max(...r.calls) <= BUDGET, `worst ${Math.max(...r.calls)} of ${r.calls.join('/')}`);
check('triangles stay modest (low-poly look)', r.tris < 60000, `${r.tris}`);
check('no browser errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(bad ? `${bad} CHECK(S) FAILED` : '\nAll draw-call checks passed');
process.exit(bad ? 1 : 0);
