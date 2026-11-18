// Stage 9b: crouch (C) and fall damage. Same rules for the browser, the server and the predictor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/world.js';
import { packCmd, unpackCmd, packFighter, unpackFighterInto, FF } from '../src/net/protocol.js';
import { sanitizeCmd, idleCmd } from '../src/sim/cmd.js';
import { insideAnyBox } from '../src/sim/map.js';

const DT = 1 / 60;
let W = null;
const idle = () => ({ ...idleCmd(), yaw: 0 });
const tp = (f, x, y, z) => { f.rb.setTranslation({ x, y, z }, true); f.rb.setNextKinematicTranslation({ x, y, z }); W.propagateModifiedBodyPositionsToColliders(); f.vy = 0; f.x = x; f.y = y; f.z = z; f.grounded = y < 1; };
const run = (sim, secs, cmd = idle()) => { for (let i = 0; i < Math.round(secs * 60); i++) sim.step(DT, cmd); };
async function arena(opts = {}) {
  const sim = await Simulation.create({ seed: 12, bots: 3, guards: 0, squads: false, barrelClusters: 0, weather: 'clear', contracts: false, vehicles: false, ...opts });
  W = sim.world;
  for (const f of sim.fighters) { f.brain = null; f.maxHp = f.hp = 200; }
  sim.zone.radius = 500; sim.zone.update = () => {};
  return sim;
}
function lane(sim, len = 40) {
  const hit = (x, z, m) => insideAnyBox(sim.map, x, z, m) || sim.crates.some((c) => { if (c.dead) return false; const t = c.body.translation(); return Math.abs(x - t.x) < m + 1 && Math.abs(z - t.z) < m + 1; });
  for (let x = -85; x <= 85; x += 5) for (let z0 = 95; z0 > -40; z0 -= 5) {
    let ok = true;
    for (let d = 0; d <= len + 4 && ok; d += 2) for (const dx of [-4, 0, 4]) if (hit(x + dx, z0 - d, 2.5)) { ok = false; break; }
    if (ok) return { x, z0 };
  }
  throw new Error('no open lane');
}
const away = (...fs) => fs.forEach((f, i) => { const L = [[-100, -100], [100, -100], [-100, 100], [100, 100]][i % 4]; tp(f, L[0], 0.9, L[1]); });

test('crouch: half speed, lower eyes, no sprint, no jump', async () => {
  const sim = await arena(); const [p, ...o] = sim.fighters; away(...o); const L = lane(sim, 40);
  tp(p, L.x, 0.9, L.z0); run(sim, 0.3);
  const c = { ...idle(), forward: 1 }; run(sim, 0.8, c); const walk = p.speedH;
  const eyeStand = p.eyeY;
  run(sim, 0.4, { ...c, crouch: true }); const crouched = p.speedH;
  assert.ok(Math.abs(crouched / walk - 0.5) < 0.06, `crouch speed ${crouched.toFixed(2)} vs walk ${walk.toFixed(2)}`);
  assert.ok(p.crouch && eyeStand - p.eyeY > 0.45, `eyes ${eyeStand.toFixed(2)} -> ${p.eyeY.toFixed(2)}`);
  run(sim, 0.4, { ...c, crouch: true, sprint: true }); assert.equal(p.sprinting, false, 'cannot sprint crouched');
  const y0 = p.y; run(sim, 0.15, { ...idle(), crouch: true, jump: true }); assert.ok(p.y - y0 < 0.05, 'cannot jump crouched');
  run(sim, 0.2, idle()); assert.equal(p.crouch, false, 'releasing C stands up');
});

test('crouch: a crouching target is a smaller target (a shot at standing head height flies over), a standing one is hit', async () => {
  const sim = await arena(); const [p, t, ...o] = sim.fighters; away(...o); const L = lane(sim, 40);
  sim.switchWeapon(p, 'dmr'); tp(p, L.x, 0.9, L.z0); tp(t, L.x, 0.9, L.z0 - 20); run(sim, 0.6);
  const shoot = (pitch) => { p.weapons.dmr.ammo = 10; p.fireT = 0; p.wasFiring = false; sim.step(DT, { ...idle(), pitch, fire: true, ads: true }); sim.step(DT, { ...idle(), pitch, ads: true }); };
  t.hp = t.maxHp = 400; const pitchHead = Math.atan2(1.55 - p.eyeY, 20);
  run(sim, 0.7, { ...idle(), ads: true });
  shoot(pitchHead); assert.ok(t.hp < 400, 'standing: the head-height shot lands');
  t.hp = 400; t.crouch = true; run(sim, 1.0, { ...idle(), ads: true }); t.crouch = true;
  // (the bot-less target keeps the flag we set; the history records it each tick)
  shoot(pitchHead); assert.equal(t.hp, 400, 'crouching: the same shot misses');
});

test('crouch: steadier aim (spread x0.78) and the flag is on the wire (cmd, snapshot flag, own state)', async () => {
  const c = { ...idle(), crouch: true, seq: 1 };
  assert.equal(unpackCmd(packCmd(c)).crouch, true); assert.equal(unpackCmd(packCmd({ ...c, crouch: false })).crouch, false);
  assert.equal(sanitizeCmd({ ...c, crouch: 1 }).crouch, true); assert.equal(sanitizeCmd({ ...c, crouch: undefined }).crouch, false);
  const sim = await arena(); const [p, ...o] = sim.fighters; away(...o); tp(p, 0, 0.9, 60);
  p.crouch = true; const a = packFighter(p); assert.ok(a[7] & FF.crouch); assert.equal(unpackFighterInto({}, a).crouch, true);
  const self = JSON.parse(JSON.stringify(p.exportSelf())); const f2 = (await arena()).fighters[0]; f2.rb = null; f2.importSelf(self); assert.equal(f2.crouch, true);
});

test('fall damage: a 3 m drop is free, a 10 m drop hurts, a 25 m drop is nearly fatal, jumping is free, armor does not help', async () => {
  const sim = await arena(); const [p, ...o] = sim.fighters; away(...o); const L = lane(sim, 10);
  const drop = (h) => { tp(p, L.x, 0.9 + h, L.z0); p.grounded = false; p.hp = p.maxHp = 400; p.armor = 100; p.armorLv = 3; run(sim, 3.5); return 400 - p.hp; };
  assert.equal(drop(3), 0, '3 m');
  const d10 = drop(10); assert.ok(d10 > 45 && d10 < 80, `10 m cost ${d10.toFixed(0)} HP`);
  const d25 = drop(25); assert.ok(d25 > 120 && d25 < 200, `25 m cost ${d25.toFixed(0)} HP`);
  assert.equal(p.armor, 100, 'armor is not used up by a fall');
  tp(p, L.x, 0.9, L.z0); p.hp = 400; run(sim, 0.3); for (let n = 0; n < 5; n++) { run(sim, 0.1, { ...idle(), jump: true }); run(sim, 1.2); } assert.equal(p.hp, 400, 'repeated jumps never hurt');
});

test('fall damage: a predicting browser never applies it (the server decides)', async () => {
  const sim = await arena({ predictor: true }); const [p, ...o] = sim.fighters; away(...o); const L = lane(sim, 10);
  tp(p, L.x, 20, L.z0); p.grounded = false; p.hp = 200; run(sim, 3.5); assert.equal(p.hp, 200);
});
