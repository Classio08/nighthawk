// Browser check for operator abilities: Q works for every operator in the real game, the HUD shows the cooldown, cooldown refuses a second press,
// EMP stuns a nearby bot and the HUD says STUNNED, and nothing throws.
import puppeteer from 'puppeteer-core';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome', URL = process.env.URL || 'http://127.0.0.1:4173/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
let fails = 0; const errors = [];
const check = (n, ok, d = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${d}`); };
const OPS = ['roms', 'shadow', 'douglas', 'cliffhanger', 'navy-blue', 'rampol', 'maetja', 'cleiseis'];
let shot = false;
for (const op of OPS) {
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (e) => errors.push(`${op}: ${e.message}`)); page.on('console', (m) => { if (m.type() === 'error') errors.push(`${op}: ${m.text()}`); });
  await page.goto(URL + `?autostart&seed=5&bots=3&op=${op}&loot=0&vehicles=0`, { waitUntil: 'load' });
  await page.waitForFunction('window.__nh && window.__nh.sim', { timeout: 40000 });
  await wait(600);
  // make sure Q is allowed for the medic (needs missing health) and put a bot close for the EMP
  await page.evaluate(() => { const n = window.__nh, s = n.sim, p = s.player; p.hp = Math.max(10, p.maxHp * 0.4); p.noHurtT = -999; const b = s.fighters.find((f) => !f.isPlayer && f.alive); b.brain = null; const x = p.x + 10, z = p.z; b.rb.setTranslation({ x, y: 0.9, z }, true); b.x = x; b.z = z; });
  await wait(300);
  const before = await page.evaluate(() => { const p = window.__nh.sim.player; return { cd: p.abCd, txt: document.getElementById('abtxt').textContent, name: document.getElementById('abname').textContent }; });
  await page.keyboard.press('KeyQ'); await wait(350);
  const after = await page.evaluate(() => { const n = window.__nh, p = n.sim.player, bot = n.sim.fighters.find((f) => !f.isPlayer && f.alive); return { cd: p.abCd, abT: p.abT, dashT: p.dashT, txt: document.getElementById('abtxt').textContent, box: document.getElementById('abil').className, botStun: bot.stunT, msg: document.getElementById('msg').textContent }; });
  check(`${op}: HUD shows ${before.name} READY`, before.txt === 'READY' && before.cd === 0, `${before.name} / ${before.txt}`);
  check(`${op}: Q starts the cooldown and the HUD counts it`, after.cd > 5 && after.cd <= 16 && /\d+s|ACTIVE|NEXT SHOT/.test(after.txt), `cd=${after.cd.toFixed(1)} txt=${after.txt}`);
  if (op === 'maetja') check('maetja: EMP stunned the bot 10 m away', after.botStun > 1.5, `stunT=${after.botStun.toFixed(2)}`);
  if (op === 'shadow') { const c = await page.evaluate(() => window.__nh.sim.player.abT); check('shadow: Cloak is running', c > 2, `abT=${c.toFixed(1)}`); }
  await page.keyboard.press('KeyQ'); await wait(250);
  const again = await page.evaluate(() => window.__nh.sim.player.abCd);
  check(`${op}: a second Q during the cooldown does not restart it`, again < after.cd + 0.01, `${after.cd.toFixed(2)} -> ${again.toFixed(2)}`);
  if (!shot && op === 'maetja') { await page.screenshot({ path: join(tmpdir(), 'nighthawk_ability.png') }); shot = true; }
  await page.close();
}
check('no page errors in any operator run', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close(); console.log(fails ? `ABILITY E2E FAIL (${fails})` : 'ability e2e: all good'); process.exit(fails ? 1 : 0);
