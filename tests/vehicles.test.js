// Vehicles: deterministic placement, seats, arcade driving, crashes, roadkill, destruction, bots that steal and drive them, wire format.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/world.js';
import { VehicleSystem, VEHICLE_TYPES } from '../src/sim/vehicles.js';
import { PERSONALITIES } from '../src/sim/personality.js';
import { insideAnyBox } from '../src/sim/map.js';
import { packSnapshot, packCmd, unpackCmd } from '../src/net/protocol.js';

const DT = 1 / 60;
const idle = () => ({ yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, fire: false, ads: false, reload: false, slot: 0, grenade: false, mortar: false, use: false });
let W = null;
const tp = (f, x, z) => { f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); W.propagateModifiedBodyPositionsToColliders(); f.vy = 0; f.x = x; f.y = 0.9; f.z = z; };
const run = (sim, secs, cmd = idle()) => { for (let i = 0; i < Math.round(secs * 60); i++) sim.step(DT, cmd); };
async function arena(opts = {}) {
  const sim = await Simulation.create({ seed: 31, bots: 3, guards: 0, squads: false, barrelClusters: 0, weather: 'clear', contracts: false, vehicles: ['buggy', 'bike'], ...opts });
  W = sim.world;
  for (const f of sim.fighters) { f.brain = null; f.maxHp = f.hp = 400; }
  sim.zone.radius = 500; sim.zone.update = () => {};
  sim.player.cur = 'ar';
  return sim;
}
function lane(sim, len = 60) {
  const hit = (x, z, m) => insideAnyBox(sim.map, x, z, m) || sim.crates.some((c) => { if (c.dead) return false; const t = c.body.translation(); return Math.abs(x - t.x) < m + 1 && Math.abs(z - t.z) < m + 1; });
  for (let x = -85; x <= 85; x += 5) for (let z0 = 95; z0 > -30; z0 -= 5) {
    let ok = true;
    for (let d = 0; d <= len + 4 && ok; d += 2) for (const dx of [-5, 0, 5]) if (hit(x + dx, z0 - d, 3)) { ok = false; break; }
    if (ok) return { x, z0 };
  }
  throw new Error('no open lane');
}
/** park vehicle v at (x,z) facing -z (yaw 0), stationary, and send everybody else far away */
const put = (sim, v, x, z, yaw = 0) => { v.x = x; v.z = z; v.yaw = yaw; v.speed = 0; sim.vehicles._sync(v); };
/** an empty proving ground for the driving tests: no buildings or crates in the way of OUR vehicle physics (the map edge stays) */
const field = (sim) => { sim.map.boxes = sim.map.boxes.filter((b) => b.kind === 'edge'); for (const c of sim.crates) sim._breakProp(c, true); return { x: 0, z0: 85 }; };
const away = (sim, ...fs) => fs.forEach((f, i) => tp(f, [-100, 100, -100][i % 3], [-100, -100, 100][i % 3]));

test('vehicles: the same layout on the server and in a browser predictor; none inside a building; spread out', async () => {
  const a = await Simulation.create({ seed: 5, bots: 3, mapSeed: 7 }), b = await Simulation.create({ seed: 5, bots: 0, mapSeed: 7, predictor: true });
  assert.equal(a.vehicles.list.length, 5);
  assert.deepEqual(a.vehicles.list.map((v) => [v.kind, v.x.toFixed(3), v.z.toFixed(3), v.yaw.toFixed(3)]), b.vehicles.list.map((v) => [v.kind, v.x.toFixed(3), v.z.toFixed(3), v.yaw.toFixed(3)]));
  for (const v of a.vehicles.list) assert.ok(!insideAnyBox(a.map, v.x, v.z, 1.5), 'not inside a building');
  for (const v of a.vehicles.list) for (const o of a.vehicles.list) if (v !== o) assert.ok(Math.hypot(v.x - o.x, v.z - o.z) > 25);
  const off = await Simulation.create({ seed: 5, bots: 1, vehicles: false }); assert.equal(off.vehicles.list.length, 0);
});

test('seats: E gets you in (driver first, then passenger), nobody else fits, E again puts you beside it', async () => {
  const sim = await arena({ vehicles: ['buggy', 'bike'] }); const [p, b1, b2] = sim.fighters; const [bug, bike] = sim.vehicles.list; const L = lane(sim, 30);
  put(sim, bug, L.x, L.z0 - 10); put(sim, bike, L.x + 12, L.z0 - 10); away(sim, b2);
  tp(p, L.x + 2.5, L.z0 - 10); tp(b1, L.x - 2.5, L.z0 - 11); run(sim, 0.1);
  const c = idle(); c.use = true; sim.step(DT, c);
  assert.equal(p.veh, bug); assert.equal(p.seat, 0); assert.equal(bug.driver, p.id);
  assert.ok(sim.drainEvents().some((e) => e.t === 'vehicle' && e.phase === 'enter' && e.by === p.id && e.seat === 0));
  assert.equal(sim.vehicles.enter(b1), true); assert.equal(b1.seat, 1); assert.equal(bug.pass, b1.id);
  assert.equal(sim.vehicles.enter(b2, bug), false, 'a buggy has two seats');
  tp(b2, bike.x + 1, bike.z); assert.equal(sim.vehicles.enter(b2), true); assert.equal(sim.vehicles.nearest(sim.fighters[3] ?? b2), null, 'the bike is full now');
  run(sim, 0.2); assert.ok(Math.hypot(p.x - bug.x, p.z - bug.z) < 1, 'occupants ride with the vehicle');
  const c2 = idle(); c2.use = true; sim.step(DT, c2);
  assert.equal(p.veh, null); assert.equal(bug.driver, -1); assert.ok(Math.hypot(p.x - bug.x, p.z - bug.z) > 1.8, 'put down next to it, not inside'); assert.ok(!insideAnyBox(sim.map, p.x, p.z, 0.3));
  run(sim, 0.3); assert.ok(Number.isFinite(p.x + p.z) && p.alive);
});

test('driving: it accelerates, tops out, steers (D turns right), the handbrake stops it, an empty vehicle rolls to a halt', async () => {
  const sim = await arena({ vehicles: ['buggy'] }); const [p, b1, b2, b3] = sim.fighters; const bug = sim.vehicles.list[0]; const L = field(sim);
  away(sim, b1, b2, b3); put(sim, bug, L.x, L.z0 - 2); tp(p, L.x + 2.5, L.z0 - 2); sim.vehicles.enter(p);
  const c = idle(); c.forward = 1; run(sim, 1.5, c);
  assert.ok(bug.speed > 15 && bug.speed < VEHICLE_TYPES.buggy.maxSpeed + 0.1, `speed ${bug.speed.toFixed(1)}`); assert.ok(bug.z < L.z0 - 12, 'moved forward (-z)');
  const yaw0 = bug.yaw; c.strafe = 1; run(sim, 0.8, c); assert.ok(bug.yaw < yaw0 - 0.2, `D turns right: yaw ${yaw0.toFixed(2)} -> ${bug.yaw.toFixed(2)}`);
  c.forward = 0; c.strafe = 0; c.jump = true; run(sim, 1.2, c); assert.ok(Math.abs(bug.speed) < 1, `handbrake stopped it (${bug.speed.toFixed(1)})`);
  c.jump = false; c.forward = -1; run(sim, 2.5, c); assert.ok(bug.speed < -3 && bug.speed >= -VEHICLE_TYPES.buggy.rev, 'reverse is slow');
  sim.vehicles.leave(p); bug.speed = 14; run(sim, 5); assert.ok(Math.abs(bug.speed) < 1, 'empty vehicle coasts to a stop');
});

test('crash: a wall stops it, hurts it, never lets it inside; hard hits hurt the people in it', async () => {
  const sim = await arena({ vehicles: ['buggy'] }); const [p, b1, b2, b3] = sim.fighters; const bug = sim.vehicles.list[0]; const L = field(sim);
  away(sim, b1, b2, b3); const wall = { x: L.x, z: L.z0 - 42, w: 24, d: 4, h: 5, y: 2.5, kind: 'block' }; sim.map.boxes.push(wall);
  put(sim, bug, L.x, L.z0 - 2); tp(p, L.x + 2.5, L.z0 - 2); sim.vehicles.enter(p); p.hp = p.maxHp = 400;
  const c = idle(); c.forward = 1; c.sprint = true; let minD = 99;
  for (let i = 0; i < 60 * 4; i++) { sim.step(DT, c); minD = Math.min(minD, bug.z - (wall.z + wall.d / 2)); }
  assert.ok(bug.hp < bug.maxHp, `the crash hurt the buggy (${bug.hp})`); assert.ok(minD > 0.5, `never inside the wall (${minD.toFixed(2)})`); assert.ok(Math.abs(bug.speed) < 6, 'stopped');
  assert.ok(p.hp < 400, `and the driver (${Math.round(p.hp)})`);
  assert.ok(sim.drainEvents().some((e) => e.t === 'vehicle' && e.phase === 'crash'));
});

test('roadkill: running somebody over hurts / kills them and the driver gets the credit; slow rolling does nothing', async () => {
  const sim = await arena({ vehicles: ['buggy'] }); const [p, b1, b2, b3] = sim.fighters; const bug = sim.vehicles.list[0]; const L = field(sim);
  away(sim, b2, b3); put(sim, bug, L.x, L.z0 - 2); tp(p, L.x + 2.5, L.z0 - 2); sim.vehicles.enter(p);
  b1.maxHp = b1.hp = 100; tp(b1, L.x, L.z0 - 45);
  const c = idle(); c.forward = 1; sim.drainEvents(); const ev = [];
  for (let i = 0; i < 60 * 5; i++) { sim.step(DT, c); ev.push(...sim.drainEvents()); if (!b1.alive) break; }
  assert.equal(b1.alive, false, 'flattened'); const k = ev.find((e) => e.t === 'kill' && e.target === b1.id);
  assert.ok(k && k.by === p.id && k.w === 'vehicle', JSON.stringify(k)); assert.equal(p.kills, 1);
  const sim2 = await arena({ vehicles: ['bike'] }); const [q, r1, r2, r3] = sim2.fighters; const bk = sim2.vehicles.list[0]; const M = field(sim2);
  away(sim2, r2, r3); put(sim2, bk, M.x, M.z0 - 2); tp(q, M.x + 1.5, M.z0 - 2); sim2.vehicles.enter(q); tp(r1, M.x, M.z0 - 6);
  bk.speed = 2.5; const c2 = idle(); run(sim2, 0.5, c2); assert.equal(r1.hp, 400, 'a slow bike does not hurt');
});

test('shooting: bullets hurt a vehicle; at 0 hp it explodes, throws the riders out, hurts them and the wreck stops blocking', async () => {
  const sim = await arena({ vehicles: ['buggy'] }); const [p, b1, b2, b3] = sim.fighters; const bug = sim.vehicles.list[0]; const L = lane(sim, 50);
  away(sim, b3); put(sim, bug, L.x, L.z0 - 25); tp(p, L.x, L.z0); run(sim, 0.2);
  const c = idle(); c.pitch = Math.atan2(0.7 - 1.62, 25); c.fire = true; run(sim, 0.7, c); c.fire = false; run(sim, 0.2);
  assert.ok(bug.hp < bug.maxHp, `bullets damaged it (${bug.hp})`);
  tp(b1, L.x + 40, L.z0 - 25); tp(b2, L.x - 40, L.z0 - 25); sim.vehicles.enter(b1, bug, 0); sim.vehicles.enter(b2, bug, 1); b1.hp = b2.hp = 400; sim.drainEvents();
  sim.vehicles.damage(bug, 9999, p); const ev = sim.drainEvents();
  assert.ok(ev.some((e) => e.t === 'vehicle' && e.phase === 'boom')); assert.ok(ev.some((e) => e.t === 'explosion' && e.w === 'vehicle' && e.r === 9));
  assert.ok(bug.dead && !b1.veh && !b2.veh && bug.driver === -1, 'riders were thrown out'); assert.ok(b1.hp < 400 && b2.hp < 400, `riders hurt ${b1.hp.toFixed(0)}/${b2.hp.toFixed(0)}`);
  assert.equal(bug.col, null); assert.equal(sim.vehicles.byCol.size, 0, 'no collider left: bullets and people pass through the wreck');
  run(sim, 1); assert.equal(sim.vehicles.nearest(p, 100), null, 'cannot be entered any more');
});

test('ramming an explosive barrel sets it off (and the blast hurts the vehicle)', async () => {
  const sim = await arena({ vehicles: ['buggy'] }); const [p, b1, b2, b3] = sim.fighters; const bug = sim.vehicles.list[0]; const L = field(sim);
  away(sim, b1, b2, b3); put(sim, bug, L.x, L.z0 - 2); tp(p, L.x + 2.5, L.z0 - 2); sim.vehicles.enter(p);
  const bar = sim._addBarrel(L.x, L.z0 - 40); const c = idle(); c.forward = 1; const ev = [];
  for (let i = 0; i < 60 * 5; i++) { sim.step(DT, c); ev.push(...sim.drainEvents()); }
  assert.ok(bar.dead, 'the barrel went off'); assert.ok(ev.some((e) => e.t === 'explosion' && e.w === 'barrel')); assert.ok(bug.hp < bug.maxHp);
});

test('a bot that wants to relocate walks to a free buggy, drives towards the next circle and gets out near it', async () => {
  const sim = await arena({ vehicles: ['buggy'], bots: 1 }); const [p, bot] = sim.fighters; const bug = sim.vehicles.list[0]; const L = field(sim);
  tp(p, -100, 100); bot.brain = (await Simulation.create({ seed: 1, bots: 1, guards: 0, vehicles: false })).fighters[1].brain; // a fresh BotBrain
  bot.brain.sim = sim; bot.brain.f = bot; bot.brain.p = PERSONALITIES.rusher; bot.brain.skill = 0.6;
  put(sim, bug, L.x, L.z0 - 30); tp(bot, L.x, L.z0 - 5);
  const z = sim.zone; z.cx = z.cz = 0; z.radius = 500; z.nextX = L.x; z.nextZ = L.z0 - 140 > -110 ? L.z0 - 140 : -105; z.nextR = 18; z.shrinking = true; z.phase = 2;
  let entered = false, startZ = bug.z, left = false;
  for (let i = 0; i < 60 * 45 && !left; i++) { sim.step(DT, idle()); if (bot.veh) entered = true; if (entered && !bot.veh) left = true; }
  assert.ok(entered, 'the bot got into the buggy'); assert.ok(Math.abs(bug.z - startZ) > 25 || left, `and drove it (${Math.abs(bug.z - startZ).toFixed(0)} m)`);
  assert.ok(bot.alive && Number.isFinite(bot.x + bot.z));
});

test('wire format: vehicles survive a snapshot round trip into a predictor; the use key survives packCmd', async () => {
  const sim = await arena({ vehicles: ['buggy', 'bike'] }); const [p] = sim.fighters; const [bug] = sim.vehicles.list; const L = lane(sim, 30);
  put(sim, bug, L.x, L.z0 - 10, 1.2); tp(p, L.x + 2.5, L.z0 - 10); sim.vehicles.enter(p); bug.speed = 9.4; bug.hp = 201;
  const snap = JSON.parse(JSON.stringify(packSnapshot(sim, []))); assert.equal(snap.vh.length, 2);
  const pred = await Simulation.create({ seed: 31, bots: 0, vehicles: ['buggy', 'bike'], predictor: true, propsFixed: true });
  pred.vehicles.applyState(snap.vh);
  const pv = pred.vehicles.list[0]; assert.ok(Math.abs(pv.x - bug.x) < 0.02 && Math.abs(pv.yaw - 1.2) < 0.02 && pv.speed === 9.4 && pv.hp === 201 && pv.driver === p.id);
  pred.vehicles.applyState([[0, 0, 0, 0, 0, 0, 0, -1, -1, 1, 0]]); assert.equal(pred.vehicles.list[0].dead, true); assert.equal(pred.vehicles.byCol.size, 1);
  const c = idle(); c.use = true; assert.equal(unpackCmd(packCmd({ seq: 1, vt: 2, ...c })).use, true); assert.equal(unpackCmd(packCmd({ seq: 1, vt: 2, ...idle() })).use, false);
  const e = p.exportSelf(); assert.equal(e.sv, bug.id); assert.equal(e.ss, 0);
});
