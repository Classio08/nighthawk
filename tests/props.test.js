// Destructible props: crates splinter, explosive barrels go off after a fuse, chain reactions, deterministic placement, prediction stays in sync.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/world.js';
import { insideAnyBox } from '../src/sim/map.js';

const DT = 1 / 60;
const idle = () => ({ yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, fire: false, ads: false, reload: false, slot: 0, grenade: false });
let W = null;
const tp = (f, x, z) => { f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); W.propagateModifiedBodyPositionsToColliders(); f.vy = 0; f.x = x; f.y = 0.9; f.z = z; };
const run = (sim, secs, cmd = idle()) => { for (let i = 0; i < Math.round(secs * 60); i++) sim.step(DT, cmd); };
async function arena(opts = {}) {
  const sim = await Simulation.create({ seed: 6, bots: 2, guards: 0, squads: false, barrelClusters: 0, ...opts });
  W = sim.world;
  for (const f of sim.fighters) f.brain = null;
  sim.zone.radius = 500; sim.zone.update = () => {};
  sim.player.cur = 'ar';
  return sim;
}
/** open ground: shooter at (x, z0), things placed at z0 - d for d up to len */
function lane(sim, len = 30) {
  const hit = (x, z, m) => insideAnyBox(sim.map, x, z, m) || sim.crates.some((c) => { if (c.dead) return false; const t = c.body.translation(); return Math.abs(x - t.x) < m + 1 && Math.abs(z - t.z) < m + 1; });
  for (let x = -85; x <= 85; x += 5) for (let z0 = 88; z0 > -60; z0 -= 5) {
    let ok = true;
    for (let d = 0; d <= len + 4 && ok; d++) for (const dx of [-6, -3, 0, 3, 6]) if (hit(x + dx, z0 - d, 2.5)) { ok = false; break; }
    if (ok) return { x, z0 };
  }
  throw new Error('no open lane');
}
const shoot = (sim, p, dist, y = 0.55, secs = 0.1) => {
  const c = idle(); c.pitch = Math.atan2(y - 1.62, dist); c.yaw = 0; c.fire = true; run(sim, secs, c);
};

test('barrels: placed in clusters, the same on every machine (server, predictor, offline)', async () => {
  const a = await Simulation.create({ seed: 1, bots: 3, mapSeed: 7 }), b = await Simulation.create({ seed: 99, bots: 0, mapSeed: 7, predictor: true });
  assert.ok(a.barrels.length >= 10 && a.barrels.length <= 24, `${a.barrels.length} barrels`);
  assert.deepEqual(a.barrels.map((x) => [x.x.toFixed(3), x.z.toFixed(3)]), b.barrels.map((x) => [x.x.toFixed(3), x.z.toFixed(3)]));
  for (const x of a.barrels) assert.ok(!insideAnyBox(a.map, x.x, x.z, 0.3), 'no barrel inside a building');
  const c = await Simulation.create({ seed: 1, bots: 3, mapSeed: 11 });
  assert.notDeepEqual(a.barrels.map((x) => x.x), c.barrels.map((x) => x.x), 'another map = another barrel layout');
});

test('a shot barrel explodes after a short fuse; people near it are hurt, people far away are not', async () => {
  const sim = await arena(); const [p, near, far] = sim.fighters; const L = lane(sim, 30);
  tp(p, L.x, L.z0); const bar = sim._addBarrel(L.x, L.z0 - 14);
  tp(near, L.x + 3, L.z0 - 14); tp(far, L.x + (L.x > 0 ? -70 : 70), L.z0); near.maxHp = near.hp = 400; far.maxHp = far.hp = 400;
  const dmgBefore = sim.drainEvents().length; void dmgBefore;
  shoot(sim, p, 14, 0.55, 0.9);
  assert.ok(bar.hp < bar.maxHp || bar.dead, 'bullets wear the barrel down');
  run(sim, 1.5);
  assert.ok(bar.dead, 'the barrel is gone');
  const ev = sim.drainEvents();
  const ex = ev.find((e) => e.t === 'explosion' && e.w === 'barrel');
  assert.ok(ex, 'explosion event'); assert.equal(ex.r, 8);
  assert.ok(ev.some((e) => e.t === 'prop' && e.id === bar.id && e.kind === 'barrel'));
  assert.ok(near.hp < 400, `the bot next to it is hurt (${near.hp})`); assert.equal(far.hp, 400);
  assert.ok(sim.destroyed.includes(bar.id));
  assert.ok(![...sim.propByCol.values()].includes(bar), 'bullets fly through where it stood');
});

test('chain reaction: one barrel sets off its neighbours, the blast kills the bot and the shooter gets the credit', async () => {
  const sim = await arena(); const [p, bot] = sim.fighters; const L = lane(sim, 30);
  tp(p, L.x, L.z0);
  const b1 = sim._addBarrel(L.x, L.z0 - 16), b2 = sim._addBarrel(L.x + 1.6, L.z0 - 16.5), b3 = sim._addBarrel(L.x - 2.2, L.z0 - 18.5), far = sim._addBarrel(L.x + 40, L.z0 - 16);
  tp(bot, L.x + 1, L.z0 - 19); bot.maxHp = bot.hp = 90;
  shoot(sim, p, 16, 0.55, 1.2); run(sim, 2);
  assert.ok(b1.dead && b2.dead && b3.dead, 'the whole cluster went up');
  assert.ok(!far.dead, 'a barrel 40 m away did not');
  assert.ok(!bot.alive, 'the blast killed the bot');
  const kill = sim.drainEvents().find((e) => e.t === 'kill' && e.target === bot.id);
  assert.ok(kill && kill.by === p.id && kill.w === 'barrel', 'kill credited to the shooter, weapon = barrel');
});

test('crates have hit points: bullets splinter them, then you can shoot through', async () => {
  const sim = await arena(); const [p] = sim.fighters; const L = lane(sim, 30);
  tp(p, L.x, L.z0);
  const c = sim._addCrate(L.x, 0.6, L.z0 - 10); c.body.setBodyType?.(0, true);
  assert.ok(c.hp > 0 && !c.dead);
  const solidBefore = sim.solid.size;
  shoot(sim, p, 10, 0.6, 0.12); assert.ok(c.hp < c.maxHp, 'a hit chips it');
  shoot(sim, p, 10, 0.6, 2.0);
  assert.ok(c.dead, 'destroyed');
  assert.equal(sim.solid.size, solidBefore - 1);
  assert.ok(sim.drainEvents().some((e) => e.t === 'prop' && e.kind === 'crate' && e.id === c.id));
});

test('grenades break crates too (and nothing crashes when a body disappears mid-blast)', async () => {
  const sim = await arena(); const [p] = sim.fighters; const L = lane(sim, 30);
  tp(p, L.x, L.z0 - 25);
  const c = sim._addCrate(L.x, 0.6, L.z0 - 10), barrel = sim._addBarrel(L.x + 3, L.z0 - 10);
  sim._blast(L.x, 0.5, L.z0 - 10, 9, 150, p, 'grenade');
  assert.ok(c.dead, 'crate splintered'); run(sim, 1);
  assert.ok(barrel.dead, 'and the barrel next to it went off');
});

test('browsers: a predictor never breaks props by itself, but applies the server list silently', async () => {
  const srv = await arena({ propsFixed: true });
  const cli = await Simulation.create({ seed: 6, bots: 0, predictor: true, propsFixed: true, guards: 0, barrelClusters: 0 });
  const s = srv.crates[0], c = cli.crates[0];
  assert.deepEqual([s.body.translation().x, s.body.translation().z], [c.body.translation().x, c.body.translation().z], 'same crates');
  cli.damageProp(c, 9999, null); assert.ok(!c.dead, 'the predictor ignores damage');
  srv._breakProp(srv.crates[0]); srv.drainEvents();
  assert.equal(srv.destroyed.length, 2, 'a fixed stack falls apart together (the upper crate cannot float)');
  cli.syncDestroyed(srv.destroyed);
  assert.ok(cli.crates[0].dead && cli.crates[1].dead);
  assert.equal(cli.drainEvents().length, 0, 'silent');
  cli.syncDestroyed(srv.destroyed);                         // applying twice is harmless
});

test('bots shoot the barrel when an enemy stands next to it', async () => {
  const sim = await Simulation.create({ seed: 6, bots: 1, guards: 0, squads: false, barrelClusters: 0, humans: [{ operator: 'roms' }] });
  W = sim.world; sim.zone.radius = 500; sim.zone.update = () => {};
  const [h, bot] = sim.fighters; const L = lane(sim, 40);
  h.hp = h.maxHp = 400; tp(bot, L.x, L.z0); bot.yaw = 0; bot.brain.skill = 0.9;
  const barrel = sim._addBarrel(L.x + 0.5, L.z0 - 24); tp(h, L.x + 2.4, L.z0 - 24);
  run(sim, 12);
  assert.ok(barrel.dead, 'the bot took out the barrel');
  assert.ok(h.hp < 400, `the explosion hurt the enemy standing next to it (hp ${h.hp.toFixed(0)})`);
});
