// Headless tests of the real game rules (no browser, no graphics): Rapier physics + Yuka bots + weapons + zone.
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { Simulation } from '../src/sim/world.js';

const DT = 1 / 60;
const idle = () => ({ yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, fire: false, ads: false, reload: false, slot: 0, grenade: false });
const tp = (f, x, z) => { f.rb.setTranslation({ x, y: 0.9, z }, true); f.x = x; f.y = 0.9; f.z = z; };
const run = (sim, secs, cmd = idle()) => { for (let i = 0; i < secs * 60; i++) sim.step(DT, cmd); };
/** a quiet arena: nobody has a brain, the zone is huge, so only what the test does matters */
async function arena(bots = 2) {
  const sim = await Simulation.create({ seed: 3, bots });
  for (const f of sim.fighters) f.brain = null;
  sim.zone.radius = 500;
  return sim;
}
/** find a straight north-going lane (shooter at z0, target at z0-len) with no building or crate anywhere near it */
function lane(sim, len = 30) {
  const hit = (x, z, m) => sim.map.boxes.some((b) => Math.abs(x - b.x) < b.w / 2 + m && Math.abs(z - b.z) < b.d / 2 + m)
    || sim.crates.some((c) => { const t = c.body.translation(); return Math.abs(x - t.x) < m + 1 && Math.abs(z - t.z) < m + 1; });
  for (let x = -80; x <= 80; x += 5) for (let z0 = 90; z0 > -60; z0 -= 5) {
    let ok = true;
    for (let d = 0; d <= len + 4 && ok; d += 1) if (hit(x, z0 - d, 2.5) || hit(x + 1.5, z0 - d, 1.5) || hit(x - 1.5, z0 - d, 1.5)) ok = false;
    if (ok) return { x, z0 };
  }
  throw new Error('no free lane on this map');
}

test('line of sight: a wall blocks it, removing the wall opens it', async () => {
  const sim = await arena(1); const [p, b] = sim.fighters;
  const L = lane(sim, 30);
  tp(p, L.x, L.z0); tp(b, L.x, L.z0 - 20); p.yaw = 0; b.yaw = Math.PI;       // facing each other, 20 m apart
  sim.world.step();
  const clear = sim.canSee(p, b, 75, 3);
  const wall = sim.world.createCollider(RAPIER.ColliderDesc.cuboid(5, 3, 0.5).setTranslation(L.x, 3, L.z0 - 10));
  sim.solid.add(wall.handle); sim.world.step();
  const blocked = sim.canSee(p, b, 75, 3);
  sim.world.removeCollider(wall, true); sim.solid.delete(wall.handle); sim.world.step();
  const again = sim.canSee(p, b, 75, 3);
  // if a map building happens to sit between those points the first assert would fail, which is also worth knowing
  assert.equal(clear, true, 'open ground: should see'); assert.equal(blocked, false, 'wall: must not see'); assert.equal(again, true, 'wall gone: sees again');
});

test('field of view: a target behind you is not seen (unless very close)', async () => {
  const sim = await arena(1); const [p, b] = sim.fighters;
  const L = lane(sim, 30); const behind = L.z0 + 20 < 100 ? L.z0 + 20 : null;
  tp(p, L.x, L.z0); p.yaw = 0;               // looking towards -z
  tp(b, L.x, L.z0 - 20); sim.world.step();   // 20 m ahead
  assert.equal(sim.canSee(p, b, 75, 1.9), true);
  p.yaw = Math.PI; sim.world.step();         // now turned around: the same bot is 20 m BEHIND
  assert.equal(sim.canSee(p, b, 75, 1.9), false);
  tp(b, L.x, L.z0 - 5); sim.world.step();    // 5 m behind: noticed anyway
  assert.equal(sim.canSee(p, b, 75, 1.9), true);
  void behind;
});

test('shooting: a hit hurts, a headshot hurts more, ammo drops, empty weapon reloads', async () => {
  const sim = await arena(1); const [p, b] = sim.fighters;
  const L = lane(sim, 30); tp(p, L.x, L.z0); tp(b, L.x, L.z0 - 10); sim.world.step();
  p.cur = 'pistol'; b.maxHp = b.hp = 500;
  const cmd = idle(); cmd.yaw = 0; cmd.pitch = 0;      // eye height 1.62 -> head
  const a0 = p.weapons.pistol.ammo;
  cmd.fire = true; run(sim, 0.05, cmd); cmd.fire = false; run(sim, 0.3, cmd);
  const head = 500 - b.hp;
  assert.ok(head > 50, `pistol headshot should do ~61, did ${head}`);
  assert.equal(p.weapons.pistol.ammo, a0 - 1);
  b.hp = 500; b.noHurtT = -1e9;
  cmd.pitch = -0.045; cmd.fire = true; run(sim, 0.05, cmd); cmd.fire = false; run(sim, 0.3, cmd);   // aim at the chest
  const body = 500 - b.hp;
  assert.ok(body > 20 && body < head, `body ${body} should be less than head ${head}`);
  // empty -> auto reload
  p.weapons.pistol.ammo = 0; cmd.fire = true; run(sim, 0.1, cmd); cmd.fire = false;
  assert.ok(p.reloadT > 0, 'trigger on empty starts the reload'); run(sim, 1.5, cmd);
  assert.equal(p.weapons.pistol.ammo, 15);
});

test('kills: the killer gets the kill, the victim becomes a corpse, the match is won at last survivor', async () => {
  const sim = await arena(1); const [p, b] = sim.fighters;
  const L = lane(sim, 30); tp(p, L.x, L.z0); tp(b, L.x, L.z0 - 10); sim.world.step(); p.cur = 'dmr'; b.hp = 50;
  const cmd = idle(); cmd.fire = true; run(sim, 0.1, cmd); cmd.fire = false; run(sim, 0.2, cmd);
  const ev = sim.drainEvents();
  assert.ok(ev.some((e) => e.t === 'kill' && e.by === p.id && e.target === b.id), 'kill event');
  assert.equal(b.alive, false); assert.equal(p.kills, 1);
  assert.equal(sim.state, 'won'); assert.equal(sim.result.placement, 1);
  assert.ok(ev.some((e) => e.t === 'end' && e.won));
});

test('zone: standing outside hurts, standing inside does not', async () => {
  const sim = await arena(1); const [p, b] = sim.fighters;
  sim.zone.radius = 20; sim.zone.cx = 0; sim.zone.cz = 0; sim.zone.phase = 2;     // 5 damage per second
  tp(p, 0, 0); tp(b, 90, 90); sim.world.step();
  p.maxHp = b.maxHp = 1000; p.hp = b.hp = 1000;
  run(sim, 4);
  assert.ok(p.hp > 990, 'inside is safe');
  assert.ok(b.hp < 1000 - 12 && b.hp > 1000 - 28, `outside lost ${1000 - b.hp} hp in 4 s`);
});

test('grenade: hurts a bot in the blast radius, ignores one far away, shoves crates', async () => {
  const sim = await arena(2); const [p, near, far] = sim.fighters;
  const L = lane(sim, 30);
  tp(p, L.x, L.z0); tp(near, L.x, L.z0 - 22); tp(far, L.x > 0 ? L.x - 80 : L.x + 80, L.z0); sim.world.step();
  near.maxHp = near.hp = 400; far.maxHp = far.hp = 400;
  const crate = sim.crates[0]; crate.body.setTranslation({ x: L.x + 3, y: 0.6, z: L.z0 - 22 }, true); const c0 = crate.body.translation();
  const cmd = idle(); cmd.grenade = true; cmd.pitch = 0.5; cmd.yaw = 0;
  run(sim, 4, cmd);
  assert.ok(near.hp < 400, `near bot should be hurt (hp ${near.hp})`);
  assert.equal(far.hp, 400);
  const c1 = crate.body.translation();
  assert.ok(Math.hypot(c1.x - c0.x, c1.y - c0.y, c1.z - c0.z) > 0.3, 'crate moved');
  assert.ok(sim.drainEvents().some((e) => e.t === 'explosion'));
});

test('hearing: a bot that is far away and cannot see you still turns towards gunfire', async () => {
  const sim = await Simulation.create({ seed: 4, bots: 1 }); const [p, b] = sim.fighters;
  sim.zone.radius = 500; b.brain.skill = 1;
  tp(p, 0, 80); tp(b, 0, 40); sim.world.step();                  // 40 m apart (inside the 60 m noise of the AR)
  const cmd = idle(); cmd.fire = true; p.cur = 'ar';
  let heard = false;
  for (let i = 0; i < 300 && !heard; i++) { sim.step(DT, cmd); heard = !!b.brain.heard || b.brain.state === 'engage'; }
  assert.ok(heard, 'bot reacted to the gunfire');
});

test('bots fight each other, nobody falls through the world, nothing becomes NaN', async () => {
  const sim = await Simulation.create({ seed: 8, bots: 15 });
  sim.player.hp = sim.player.maxHp = 1e9;
  const cmd = idle(); let kills = 0, shots = 0;
  for (let i = 0; i < 60 * 90; i++) {
    sim.step(DT, cmd);
    for (const e of sim.drainEvents()) { if (e.t === 'kill') kills++; if (e.t === 'shot') shots++; }
    if (i % 60 === 0) for (const f of sim.fighters) if (f.alive) {
      assert.ok(Number.isFinite(f.x + f.y + f.z), `${f.name} position is NaN`);
      assert.ok(f.y > -1 && Math.abs(f.x) < 130 && Math.abs(f.z) < 130, `${f.name} left the map: ${f.x},${f.y},${f.z}`);
    }
  }
  assert.ok(kills >= 4, `bots should kill each other (kills=${kills})`);
  assert.ok(shots > 300);
});

test('determinism: same seed + same inputs = same match (needed for multiplayer)', async () => {
  const snap = async () => {
    const sim = await Simulation.create({ seed: 21, bots: 8 }); const cmd = idle(); cmd.forward = 1; cmd.fire = true;
    for (let i = 0; i < 60 * 15; i++) sim.step(DT, cmd);
    return sim.fighters.map((f) => [f.name, f.alive, +f.x.toFixed(4), +f.z.toFixed(4), +f.hp.toFixed(3)]);
  };
  assert.deepEqual(await snap(), await snap());
});
