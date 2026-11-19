// Browser check for smoke grenades: X throws one (the HUD count drops), the canister pops into a cloud after 1.5 s, the cloud is drawn, standing in it
// fills the screen with haze, it blocks a bot's sight line, it ends after about 16 s, and nothing throws.
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome', URL = process.env.URL || 'http://127.0.0.1:4173/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
let fails = 0; const errors = [];
const check = (n, ok, d = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${d}`); };
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(URL + '?autostart&bots=4&loot=0&drop=0', { waitUntil: 'load' });
await page.waitForFunction('window.__nh && window.__nh.sim && window.__nh.sim.player && window.__nh.sim.time > 0.8', { timeout: 60000 });
const gameWait = (secs) => page.evaluate((s) => new Promise((res) => { const t0 = window.__nh.sim.time, w0 = performance.now(); const iv = setInterval(() => { if (window.__nh.sim.time - t0 >= s || performance.now() - w0 > 40000) { clearInterval(iv); res(); } }, 30); }), secs);
await page.evaluate(() => { const { sim } = window.__nh; const o = sim.damage.bind(sim); sim.damage = (t, ...a) => (t === sim.player ? undefined : o(t, ...a)); for (const f of sim.fighters) if (f.brain) f.brain = null; });      // nobody interferes
const st = () => page.evaluate(() => { const { sim, G } = window.__nh, p = sim.player; return { smokes: p.smokes, nades: p.nades, flying: sim.grenades.filter((g) => g.smoke).length, clouds: sim.smokes.length, hud: document.getElementById('nades').textContent, vig: +document.getElementById('smokevig').style.opacity || 0, views: G.sview.clouds.size, sprites: [...G.sview.clouds.values()].reduce((n, v) => n + v.puffs.length, 0), x: p.x, z: p.z }; });

let s = await st();
check('the HUD shows the smoke count next to the grenades', /SMOKE\s+2/.test(s.hud) && /GRENADES\s+2/.test(s.hud), s.hud);
await page.keyboard.down('KeyX'); await gameWait(0.12); await page.keyboard.up('KeyX'); await gameWait(0.3);
s = await st();
check('X throws a smoke canister: one smoke spent, no frag grenade spent', s.smokes === 1 && s.nades === 2 && s.flying === 1, JSON.stringify({ smokes: s.smokes, nades: s.nades, flying: s.flying }));
check('the HUD count follows', /SMOKE\s+1/.test(s.hud), s.hud);
await gameWait(1.6);
s = await st();
check('after the 1.5 s fuse the canister is gone and one cloud stands', s.flying === 0 && s.clouds === 1, JSON.stringify({ flying: s.flying, clouds: s.clouds }));
await gameWait(0.4);
s = await st();
check('the cloud is drawn (one cloud view with its puffs)', s.views === 1 && s.sprites >= 12, JSON.stringify({ views: s.views, sprites: s.sprites }));

// move the cloud onto the player: the screen fills with haze
await page.evaluate(() => { const { sim } = window.__nh, c = sim.smokes[0], p = sim.player; c.x = p.x; c.z = p.z; c.y = 1.4; c.age = 6; });
await gameWait(0.4);
s = await st();
check('standing inside the cloud fills the screen with haze', s.vig > 0.5, `opacity ${s.vig}`);

// a bot behind the cloud cannot see me; without it, it can
const sight = await page.evaluate(() => {
  const { sim } = window.__nh, a = sim.player, b = sim.fighters.find((f) => f !== a && !f.npc);
  let spot = null;
  for (let z = -30; z <= 30 && !spot; z += 6) for (let x = -50; x <= 20 && !spot; x += 7) if (sim.losClear(x, 1.6, z, x, 1.3, z - 22)) spot = { x, z };
  const tp = (f, x, z) => { f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); sim.world.propagateModifiedBodyPositionsToColliders(); f.x = x; f.y = 0.9; f.z = z; };
  tp(a, spot.x, spot.z); tp(b, spot.x, spot.z - 22); a.yaw = 0; b.yaw = Math.PI;
  const c = sim.smokes[0]; c.x = spot.x; c.z = spot.z - 11; c.age = 6;
  const blocked = !sim.canSee(b, a, 75, 6.3);
  sim.smokes.length = 0;
  const clear = sim.canSee(b, a, 75, 6.3);
  return { blocked, clear };
});
check('the cloud blocks a bot\'s line of sight, and sight returns without it', sight.blocked && sight.clear, JSON.stringify(sight));

// a fresh throw ends by itself
await page.evaluate(() => { const { sim } = window.__nh; sim.player.nadeT = 0; });
await page.keyboard.down('KeyX'); await gameWait(0.12); await page.keyboard.up('KeyX');
await gameWait(2);
s = await st(); check('the second smoke makes a cloud too', s.clouds === 1 && s.smokes === 0, JSON.stringify({ clouds: s.clouds, smokes: s.smokes }));
await page.keyboard.down('KeyX'); await gameWait(0.12); await page.keyboard.up('KeyX'); await gameWait(0.3);
check('with none left X does nothing (and says so)', (await st()).flying === 0 && (await page.evaluate(() => document.getElementById('msg')?.textContent ?? '')).includes('NO SMOKE'));
await gameWait(16);
s = await st();
check('the cloud ends by itself after about 16 s and its view is removed', s.clouds === 0 && s.views === 0, JSON.stringify({ clouds: s.clouds, views: s.views }));
check('no page errors or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(fails === 0 ? '\nsmoke e2e: all good' : `\n${fails} FAILED`); process.exit(fails ? 1 : 0);
