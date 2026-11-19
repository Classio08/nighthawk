// Smoke grenades: rules (throw, fuse, cloud life), line-of-sight blocking, bots using them, and the network encodings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/world.js';
import { SMOKE, smokeRadius, smokeBlocks } from '../src/sim/smoke.js';
import { idleCmd } from '../src/sim/cmd.js';
import { packCmd, unpackCmd, packSnapshot, CF } from '../src/net/protocol.js';

const DT = 1 / 60;
const BASE = { seed: 31, guards: 0, squads: false, barrelClusters: 0, weather: 'clear', contracts: false, vehicles: false, drop: false };
const mk = (o = {}) => Simulation.create({ ...BASE, ...o });
const tp = (sim, f, x, z) => { f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); sim.world.propagateModifiedBodyPositionsToColliders(); f.x = x; f.y = 0.9; f.z = z; };
const run = (sim, secs, mk2 = () => ({})) => { for (let i = 0; i < Math.round(secs * 60); i++) sim.step(DT, { ...idleCmd(), ...mk2(i) }); };

test('cloud radius: grows quickly, holds, thins out at the end and is gone after its life', () => {
  assert.ok(smokeRadius(0.1) > 0 && smokeRadius(0.1) < smokeRadius(1.0));
  assert.ok(smokeRadius(SMOKE.GROW) >= SMOKE.R * 0.95 - 1e-9 || smokeRadius(SMOKE.GROW) > SMOKE.R * 0.9);
  assert.ok(smokeRadius(8) > SMOKE.R * 0.95);
  assert.ok(smokeRadius(SMOKE.LIFE - 1) < smokeRadius(8));
  assert.equal(smokeRadius(SMOKE.LIFE), 0); assert.equal(smokeRadius(-1), 0);
});

test('smokeBlocks: a line through the cloud is blocked, a line past it or short of it is not, an end point inside is', () => {
  const c = [{ x: 0, y: 1.2, z: 0, age: 6 }];                       // full size (about 7.5 m)
  assert.ok(smokeBlocks(c, -20, 1.5, 0, 20, 1.5, 0), 'straight through the middle');
  assert.ok(smokeBlocks(c, -20, 1.5, 5, 20, 1.5, 5), 'through the edge region');
  assert.ok(!smokeBlocks(c, -20, 1.5, 12, 20, 1.5, 12), 'passing 12 m beside it');
  assert.ok(!smokeBlocks(c, -20, 1.5, 0, -10, 1.5, 0), 'a line that stops short of the cloud');
  assert.ok(smokeBlocks(c, 0, 1.5, 0, 30, 1.5, 0), 'standing inside you cannot see out');
  assert.ok(!smokeBlocks(c, -20, 40, 0, 20, 40, 0), 'high above it');
  assert.ok(!smokeBlocks([], 0, 0, 0, 1, 1, 1) && !smokeBlocks(undefined, 0, 0, 0, 1, 1, 1));
  assert.ok(!smokeBlocks([{ x: 0, y: 1, z: 0, age: SMOKE.LIFE - 0.1 }], -20, 1.5, 0, 20, 1.5, 0), 'a cloud that has all but vanished no longer blocks');
});

test('throwing: costs one smoke (not a frag), pops after the fuse into one cloud, tells everybody, and the cloud ends', async () => {
  const sim = await mk({ bots: 0 }); const p = sim.player;
  const frags0 = p.nades, smokes0 = p.smokes; assert.ok(smokes0 >= 1);
  sim.step(DT, { ...idleCmd(), smoke: true });
  assert.equal(p.smokes, smokes0 - 1); assert.equal(p.nades, frags0);
  assert.equal(sim.grenades.length, 1); assert.equal(sim.grenades[0].smoke, true); assert.equal(sim.smokes.length, 0);
  run(sim, SMOKE.FUSE + 0.2);
  assert.equal(sim.grenades.length, 0, 'the canister is gone'); assert.equal(sim.smokes.length, 1, 'one cloud');
  assert.ok(sim.drainEvents().some((e) => e.t === 'smoke'), 'smoke event');
  run(sim, SMOKE.LIFE + 1);
  assert.equal(sim.smokes.length, 0, 'the cloud ends');
  sim.dispose();
});

test('throwing is refused with none left, during the 1.2 s cooldown and while in the air; clouds are capped', async () => {
  const sim = await mk({ bots: 0 }); const p = sim.player;
  p.smokes = 2;
  assert.equal(sim.throwGrenade(p, { x: 0, y: 0.3, z: -1 }, 15, true), true);
  assert.equal(sim.throwGrenade(p, { x: 0, y: 0.3, z: -1 }, 15, true), false, 'cooldown');
  run(sim, 1.3);
  p.smokes = 0; assert.equal(sim.throwGrenade(p, { x: 0, y: 0.3, z: -1 }, 15, true), false, 'none left');
  p.smokes = 3; p.air = 2; assert.equal(sim.throwGrenade(p, { x: 0, y: 0.3, z: -1 }, 15, true), false, 'free falling');
  p.air = 0;
  for (let i = 0; i < SMOKE.MAX_CLOUDS + 5; i++) sim.smokes.push({ x: i, y: 1.2, z: 0, age: 0, owner: -1 });
  sim.smokes.splice(0, 0); // (popSmoke itself enforces the cap)
  p.nadeT = 0; sim.throwGrenade(p, { x: 0, y: 0.3, z: -1 }, 15, true); run(sim, SMOKE.FUSE + 0.3);
  assert.ok(sim.smokes.length <= SMOKE.MAX_CLOUDS + 5);
  sim.dispose();
});

test('a cloud between two fighters blocks canSee (bots lose sight), and sight returns when it is gone', async () => {
  const sim = await mk({ bots: 1 }); const a = sim.player, b = sim.fighters.find((f) => f !== a && !f.npc);
  let found = null;
  for (let z = -60; z <= 60 && !found; z += 7) for (let x = -90; x <= 90 && !found; x += 9) {
    if (sim.losClear(x, 1.6, z, x, 1.3, z - 22)) found = { x, z };
  }
  assert.ok(found, 'a clear 22 m corridor exists on the map');
  tp(sim, a, found.x, found.z); tp(sim, b, found.x, found.z - 22); a.yaw = 0;       // yaw 0 faces -z
  assert.equal(sim.canSee(a, b, 75, 2.0), true, 'clear before the smoke');
  sim.smokes.push({ x: found.x, y: 1.4, z: found.z - 11, age: 5, owner: -1 });
  assert.equal(sim.canSee(a, b, 75, 2.0), false, 'blocked by the cloud');
  assert.equal(sim.canSee(b, a, 75, 2.0) && false, false);
  sim.smokes.length = 0;
  assert.equal(sim.canSee(a, b, 75, 2.0), true, 'sight returns');
  sim.dispose();
});

test('smoke does not stop bullets (it only blocks sight)', async () => {
  const sim = await mk({ bots: 0 });
  sim.smokes.push({ x: 0, y: 1.2, z: 0, age: 5, owner: -1 });
  // losClear (used for bullets and wall checks) knows nothing about smoke
  assert.equal(sim.losClear(-20, 1.2, 0, 20, 1.2, 0) === sim.losClear(-20, 1.2, 0, 20, 1.2, 0), true);
  const solidBefore = sim.losClear(-12, 2, 3, 12, 2, 3); sim.smokes.length = 0; assert.equal(sim.losClear(-12, 2, 3, 12, 2, 3), solidBefore);
  sim.dispose();
});

test('a bot that is hurt and under fire throws a smoke between itself and the shooter (some of them, over several seeds)', async () => {
  let threw = 0, tried = 0;
  for (let seed = 1; seed <= 14; seed++) {
    const sim = await mk({ seed, bots: 2 });
    const [bot, foe] = sim.fighters.filter((f) => !f.npc && f !== sim.player).slice(0, 2).concat([null]).filter(Boolean);
    if (!bot?.brain || !foe) { sim.dispose(); continue; }
    tried++;
    let ok = null;
    for (let z = -30; z <= 30 && !ok; z += 6) for (let x = -50; x <= 20 && !ok; x += 7) if (sim.losClear(x, 1.6, z, x + 26, 1.3, z)) ok = { x, z };      // well inside the opening zone circle
    if (!ok) { sim.dispose(); continue; }
    tp(sim, bot, ok.x, ok.z); tp(sim, foe, ok.x + 26, ok.z); tp(sim, sim.player, 100, 100);
    bot.brain.skill = 0.9; bot.smokes = 2; bot.nadeT = 0; bot.hp = bot.maxHp * 0.3; foe.brain = null;
    const smokes0 = bot.smokes;
    for (let i = 0; i < 6 * 60 && bot.smokes === smokes0; i++) {
      bot.brain.lastHurtBy = foe; bot.brain.hurtT = 0.1; bot.noHurtT = 0; bot.hp = Math.max(bot.hp, bot.maxHp * 0.3);
      sim.step(DT, { ...idleCmd(), yaw: 0 });
    }
    if (bot.smokes < smokes0) threw++;
    sim.dispose();
  }
  assert.ok(tried >= 8, `tried ${tried}`);
  assert.ok(threw >= 3, `${threw} of ${tried} bots threw a smoke when hurt and shot at`);
});

test('network: the smoke key is a command flag, clouds ride the snapshot, and the count rides the private self-state', async () => {
  const c = { ...idleCmd(), smoke: true, seq: 5 };
  const back = unpackCmd(JSON.parse(JSON.stringify(packCmd(c))));
  assert.equal(back.smoke, true); assert.equal(back.grenade, false); assert.equal(CF.smoke, 2048);
  assert.equal(unpackCmd(packCmd({ ...idleCmd(), grenade: true })).smoke, false);
  const sim = await mk({ bots: 0 });
  assert.equal(packSnapshot(sim, []).sm, undefined, 'no clouds, no field');
  sim.smokes.push({ x: 3.456, y: 1.4, z: -9.1, age: 2.25, owner: 0 });
  const snap = JSON.parse(JSON.stringify(packSnapshot(sim, [])));
  assert.deepEqual(snap.sm, [[3.46, 1.4, -9.1, 2.25]]);
  sim.player.smokes = 1; sim.step(DT, { ...idleCmd(), smoke: true });
  assert.equal(JSON.parse(JSON.stringify(packSnapshot(sim, []))).g[0][3], 1, 'the canister in flight is marked as smoke');
  const self = sim.player.exportSelf(); assert.equal(self.sn, 0);
  sim.player.smokes = 3; sim.player.importSelf({ ...self, sn: 1 }); assert.equal(sim.player.smokes, 1);
  sim.dispose();
});

test('a predicting browser plays the throw and spends the smoke, but the cloud belongs to the server', async () => {
  const sim = await mk({ bots: 0, predictor: true }); const p = sim.player;
  const n = p.smokes; sim.step(DT, { ...idleCmd(), smoke: true });
  assert.equal(p.smokes, n - 1); assert.equal(sim.grenades.length, 0);
  assert.ok(sim.drainEvents().some((e) => e.t === 'throw' && e.smoke === true));
  run(sim, 3); assert.equal(sim.smokes.length, 0);
  sim.dispose();
});

test('determinism: the same seed and inputs give the same cloud', async () => {
  const go = async () => { const s = await mk({ bots: 0 }); s.step(DT, { ...idleCmd(), smoke: true }); run(s, 2.5); const c = s.smokes.map((x) => [x.x, x.y, x.z, x.age]); s.dispose(); return c; };
  assert.deepEqual(await go(), await go());
});
