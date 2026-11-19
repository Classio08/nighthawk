// Stage 14: the drop-in (plane, free fall, parachute). Rules only (no graphics), so the browser, the server and the predictor agree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/world.js';
import { AIR, DROP, makePlane, planeAt } from '../src/sim/drop.js';
import { idleCmd } from '../src/sim/cmd.js';
import { MAP_HALF } from '../src/sim/map.js';
import { packFighter, unpackFighterInto, FF } from '../src/net/protocol.js';

const DT = 1 / 60;
const BASE = { seed: 21, guards: 0, squads: false, barrelClusters: 0, weather: 'clear', contracts: false, vehicles: false, drop: true };
const solo = (o = {}) => Simulation.create({ ...BASE, bots: 0, ...o });
const cmd = (sim, o = {}) => ({ ...idleCmd(), yaw: sim.plane.yaw, ...o });
const run = (sim, secs, mk = () => ({})) => { for (let i = 0; i < Math.round(secs * 60); i++) sim.step(DT, cmd(sim, mk(i))); };
const until = (sim, pred, max = 60, mk = () => ({})) => { for (let i = 0; i < max * 60 && !pred(); i++) sim.step(DT, cmd(sim, mk(i))); return pred(); };
/** release the jump key for a moment, then press it once */
const tapJump = (sim) => { run(sim, 0.1); sim.step(DT, cmd(sim, { jump: true })); sim.step(DT, cmd(sim, { jump: false })); };

test('plane: deterministic from the seed, crosses the whole map close to the middle, flies for about 14 s', () => {
  const a = makePlane(5), b = makePlane(5), c = makePlane(6);
  assert.deepEqual(a, b); assert.notDeepEqual(a, c);
  for (let seed = 1; seed < 40; seed++) {
    const pl = makePlane(seed), s = planeAt(pl, 0), e = planeAt(pl, pl.T), mid = planeAt(pl, pl.T / 2);
    assert.ok(Math.hypot(s.x, s.z) > MAP_HALF + 5 && Math.hypot(e.x, e.z) > MAP_HALF + 5, 'enters and leaves from outside the map');
    assert.ok(Math.hypot(mid.x, mid.z) <= 26, `passes near the centre (${Math.hypot(mid.x, mid.z).toFixed(1)} m)`);
    assert.ok(Math.abs(Math.hypot(pl.dx, pl.dz) - 1) < 1e-9);
    assert.ok(pl.T > 12 && pl.T < 16 && pl.Te < pl.T && pl.Te > 10, 'a ~14 s line; passengers are thrown out a little before the far edge');
  }
  assert.deepEqual(planeAt(a, 999), planeAt(a, a.T), 'the plane stops at the end of its line');
});

test('start: everybody but the garrison is in the plane, nobody is on the ground', async () => {
  const sim = await Simulation.create({ ...BASE, bots: 6, guards: 2, squads: true });
  const boarded = sim.fighters.filter((f) => !f.npc), guards = sim.fighters.filter((f) => f.npc);
  assert.equal(guards.length, 2); assert.ok(boarded.length >= 7);
  assert.ok(boarded.every((f) => f.air === AIR.PLANE && Math.abs(f.y - DROP.ALT) < 1e-6), 'all boarded at altitude');
  assert.ok(guards.every((f) => f.air === AIR.NONE && f.y < 3), 'guards stay at their post');
  assert.ok(sim.zoneStart > sim.plane.Te + 12, 'the zone waits for the landing');
  sim.dispose();
});

test('without the option nothing changes: fighters start on the ground, the zone starts at once', async () => {
  const sim = await solo({ drop: false });
  assert.equal(sim.plane, null); assert.equal(sim.player.air, 0); assert.ok(sim.player.y < 3); assert.equal(sim.zoneStart, 0);
  sim.dispose();
});

test('riding: the plane carries you along its line; a key already held at the start does not jump', async () => {
  const sim = await solo(); const p = sim.player;
  run(sim, 2, () => ({ jump: true }));                                             // holding Space from the first tick
  assert.equal(p.air, AIR.PLANE, 'a held key is not a press');
  const e = planeAt(sim.plane, p.airT);
  assert.ok(Math.hypot(p.x - e.x, p.z - e.z) < 0.01 && Math.abs(p.y - DROP.ALT) < 0.01);
  assert.ok(Math.abs(p.speedH - DROP.SPEED) < 1e-6);
  sim.dispose();
});

test('jumping: a press leaves the plane with its momentum; with no press you are thrown out before the far edge', async () => {
  const sim = await solo(); const p = sim.player;
  run(sim, 3); tapJump(sim);
  assert.equal(p.air, AIR.FALL);
  assert.ok(Math.abs(Math.hypot(p.avx, p.avz) - DROP.SPEED) < 3, 'keeps (most of) the plane speed');
  assert.ok(sim.drainEvents().some((e) => e.t === 'eject' && e.by === p.id));
  const lazy = await solo({ seed: 22 });
  assert.ok(until(lazy, () => lazy.player.air === AIR.FALL, 20), 'auto-eject');
  assert.ok(Math.abs(lazy.time - lazy.plane.Te) < 0.1, `auto-ejected before the far edge (t=${lazy.time.toFixed(2)})`);
  sim.dispose(); lazy.dispose();
});

test('free fall: reaches terminal speed, diving is faster across the ground than falling straight', async () => {
  const dive = await solo(), flat = await solo();
  for (const [s, fwd] of [[dive, 1], [flat, 0]]) {
    run(s, 1); tapJump(s);
    run(s, 2.2, () => ({ forward: fwd }));
  }
  assert.equal(dive.player.air, AIR.FALL); assert.ok(dive.player.vy < -45 && dive.player.vy >= DROP.FALL_VY - 1e-9, `vy ${dive.player.vy}`);
  assert.ok(Math.hypot(dive.player.avx, dive.player.avz) > DROP.DRIFT + 8, 'diving builds horizontal speed');
  assert.ok(Math.hypot(flat.player.avx, flat.player.avz) <= DROP.SPEED && Math.hypot(flat.player.avx, flat.player.avz) < Math.hypot(dive.player.avx, dive.player.avz));
  dive.dispose(); flat.dispose();
});

test('parachute: opens by itself at 60 m, slows you to a gentle sink, lands without a scratch', async () => {
  const sim = await solo(); const p = sim.player, hp0 = p.hp;
  run(sim, 1); tapJump(sim);
  assert.ok(until(sim, () => p.air === AIR.CHUTE, 15, () => ({ forward: 1 })), 'canopy opens');
  assert.ok(p.y <= DROP.DEPLOY_Y + 3, `opened at ${p.y.toFixed(1)} m`);
  assert.ok(sim.drainEvents().some((e) => e.t === 'chute' && e.by === p.id));
  run(sim, 1.5, () => ({ forward: 1 }));
  assert.ok(Math.abs(p.vy - DROP.CHUTE_VY) < 0.05, `sink rate ${p.vy.toFixed(2)}`);
  assert.ok(until(sim, () => p.air === AIR.NONE, 20, () => ({ forward: 1 })), 'lands');
  assert.equal(p.hp, hp0, 'no fall damage');
  assert.equal(p.alive, true); assert.ok(p.grounded && p.y < 3);
  assert.ok(sim.drainEvents().some((e) => e.t === 'land' && e.by === p.id));
  sim.dispose();
});

test('Space opens the chute early (not in the first 0.8 s) and steering with the canopy moves you', async () => {
  const sim = await solo(); const p = sim.player;
  run(sim, 1); tapJump(sim);
  run(sim, 0.3); sim.step(DT, cmd(sim, { jump: true })); sim.step(DT, cmd(sim, { jump: false }));
  assert.equal(p.air, AIR.FALL, 'too early: ignored');
  run(sim, 0.6); const y0 = p.y;
  sim.step(DT, cmd(sim, { jump: true })); sim.step(DT, cmd(sim, { jump: false }));
  assert.equal(p.air, AIR.CHUTE); assert.ok(p.y > DROP.DEPLOY_Y + 20 && p.y < y0 + 0.1, 'opened high');
  const x0 = p.x, z0 = p.z; run(sim, 3, () => ({ forward: 1 }));
  assert.ok(Math.hypot(p.x - x0, p.z - z0) > 15, 'glided forward');
  sim.dispose();
});

test('nothing can hurt you in the air: bullets, blasts and the zone are ignored; no shooting, no looting', async () => {
  const sim = await solo({ loot: true, bots: 0 }); const p = sim.player, hp = p.hp;
  sim.damage(p, 50, null, { cause: 'bullet' }); sim.damage(p, 50, null, { cause: 'explosion' }); sim.damage(p, 50, null, { cause: 'zone' });
  assert.equal(p.hp, hp);
  const ammo = p.weapons[p.cur].ammo; run(sim, 1, () => ({ fire: true }));
  assert.equal(p.weapons[p.cur].ammo, ammo, 'no shooting from the plane'); assert.equal(p.air, AIR.PLANE);
  tapJump(sim); sim.damage(p, 50, null, { cause: 'bullet' }); assert.equal(p.hp, hp, 'free fall: still safe');
  assert.ok(until(sim, () => p.air === AIR.NONE, 30)); sim.damage(p, 20, null, { cause: 'bullet' }); assert.ok(p.hp < hp, 'on the ground: hurt like anybody');
  sim.dispose();
});

test('the zone waits for the landing', async () => {
  const sim = await solo(); const z = sim.zone;
  run(sim, 5); assert.equal(z.t, 0);
  run(sim, sim.zoneStart - sim.time + 2); assert.ok(z.t > 1.5 && z.t < 2.6, `zone clock ${z.t}`);
  sim.dispose();
});

test('bots: every one of them jumps, lands unharmed, and lands near where it was heading', async () => {
  const sim = await Simulation.create({ ...BASE, bots: 15, guards: 4, squads: true });
  const people = sim.fighters.filter((f) => !f.npc);
  const ejected = new Set(), landed = new Set(); let maxT = 0;
  for (let i = 0; i < 60 * (sim.plane.Te + 30) && people.some((f) => f.air); i++) {
    sim.step(DT, { [sim.player.id]: cmd(sim, { forward: 1 }) });
    for (const e of sim.drainEvents()) {
      if (e.t === 'eject') ejected.add(e.by);
      if (e.t === 'land') { landed.add(e.by); const f = sim.fighters[e.by]; assert.equal(f.hp, f.maxHp, `${f.name} touched down unharmed`); }
    }
    maxT = sim.time;
  }
  assert.equal(people.filter((f) => f.air).length, 0, `everybody is down by t=${maxT.toFixed(1)}`);
  assert.equal(ejected.size, people.length); assert.equal(landed.size, people.length);
  assert.ok(people.every((f) => Math.abs(f.x) < MAP_HALF + 8 && Math.abs(f.z) < MAP_HALF + 8), 'all landed on the map');
  const bots = people.filter((f) => f.brain);
  const near = bots.filter((f) => f.brain.dropTo && Math.hypot(f.x - f.brain.dropTo.x, f.z - f.brain.dropTo.z) < 30).length;
  assert.ok(near >= bots.length * 0.75, `${near}/${bots.length} bots landed within 30 m of their target`);
  assert.ok(sim.time < sim.plane.Te + 28, 'the whole drop takes under ~42 s');
  const spread = new Set(bots.map((f) => Math.round(f.x / 25) + ',' + Math.round(f.z / 25))).size; assert.ok(spread >= 5, 'bots spread out over the map');
  sim.dispose();
});

test('bots keep thinking after the landing: they move on their own once down', async () => {
  const sim = await Simulation.create({ ...BASE, bots: 5, guards: 0, squads: false });
  const bots = sim.fighters.filter((f) => f.brain);
  for (let i = 0; i < 60 * (sim.plane.Te + 40); i++) sim.step(DT, { [sim.player.id]: cmd(sim) });
  assert.ok(bots.every((f) => f.air === 0));
  const before = bots.map((f) => [f.x, f.z]); for (let i = 0; i < 60 * 8; i++) sim.step(DT, { [sim.player.id]: { ...idleCmd(), yaw: 0 } });
  const moved = bots.filter((f, i) => f.alive && Math.hypot(f.x - before[i][0], f.z - before[i][1]) > 2).length;
  assert.ok(moved >= 2, `${moved} of ${bots.filter((f) => f.alive).length} living bots walked somewhere after landing (the rest were camping)`);
  assert.ok(bots.every((f) => !f.alive || (f.brain.px === f.x || Math.abs(f.brain.px - f.x) < 3)), 'the brain follows its body (no teleporting back to the spawn point)');
  sim.dispose();
});

test('same seed, same drop: two simulations land every bot on the same spot', async () => {
  const land = async () => {
    const sim = await Simulation.create({ ...BASE, bots: 8, guards: 0, squads: true });
    for (let i = 0; i < 60 * (sim.plane.Te + 28); i++) sim.step(DT, { [sim.player.id]: cmd(sim) });
    const r = sim.fighters.map((f) => [f.id, +f.x.toFixed(3), +f.z.toFixed(3), f.air]); sim.dispose(); return r;
  };
  assert.deepEqual(await land(), await land());
});

test('squad mates land together', async () => {
  const sim = await Simulation.create({ ...BASE, bots: 15, guards: 0, squads: true });
  for (let i = 0; i < 60 * (sim.plane.Te + 28); i++) sim.step(DT, { [sim.player.id]: cmd(sim) });
  assert.ok(sim.squads.length >= 2);
  for (const sq of sim.squads) {
    const m = sq.members, lead = m[0];
    for (const o of m.slice(1)) assert.ok(Math.hypot(o.x - lead.x, o.z - lead.z) < 45, `squad ${sq.id}: mate ${Math.hypot(o.x - lead.x, o.z - lead.z).toFixed(0)} m from the leader`);
  }
  sim.dispose();
});

test('multiplayer: the predictor (browser) follows the server through plane, fall and parachute, and importSelf resumes mid-air exactly', async () => {
  const server = await Simulation.create({ ...BASE, bots: 0, humans: [{ operator: 'roms' }, { operator: 'shadow' }], propsFixed: true });
  const pred = await Simulation.create({ ...BASE, bots: 0, humans: [{ operator: 'roms' }], propsFixed: true, predictor: true });
  const me = server.humans[0], mine = pred.player;
  const feed = (i) => ({ forward: i > 300 ? 1 : 0, strafe: i > 500 && i < 560 ? 1 : 0, jump: i === 200 || i === 330 });
  for (let i = 0; i < 60 * 50; i++) {
    const c = cmd(server, feed(i)); server.step(DT, new Map([[me.id, c], [server.humans[1].id, cmd(server)]])); pred.step(DT, c);
    if (i % 120 === 0 || me.air === 0) assert.ok(Math.hypot(me.x - mine.x, me.y - mine.y, me.z - mine.z) < 1e-6 && me.air === mine.air, `tick ${i}: ${me.air}/${mine.air}`);
    if (me.air === 0 && i > 400) break;
  }
  assert.equal(me.air, AIR.NONE); assert.ok(me.grounded);
  // resume: a fresh predictor adopts the server's state half way down and stays in lock-step
  const s2 = await Simulation.create({ ...BASE, bots: 0, humans: [{ operator: 'roms' }, { operator: 'shadow' }], propsFixed: true });
  const p2 = await Simulation.create({ ...BASE, bots: 0, humans: [{ operator: 'roms' }], propsFixed: true, predictor: true });
  const m2 = s2.humans[0];
  for (let i = 0; i < 60 * 9; i++) s2.step(DT, new Map([[m2.id, cmd(s2, { forward: 1, jump: i === 90 })], [s2.humans[1].id, cmd(s2)]]));
  assert.ok(m2.air === AIR.FALL || m2.air === AIR.CHUTE, 'caught mid-air');
  p2.player.importSelf(m2.exportSelf());
  for (let i = 0; i < 60 * 3; i++) { const c = cmd(s2, { forward: 1 }); s2.step(DT, new Map([[m2.id, c], [s2.humans[1].id, cmd(s2)]])); p2.step(DT, c); }
  assert.ok(Math.hypot(m2.x - p2.player.x, m2.y - p2.player.y, m2.z - p2.player.z) < 1e-4 && m2.air === p2.player.air, 'lock-step after importSelf');
  for (const s of [server, pred, s2, p2]) s.dispose();
});

test('network: the air state travels in the fighter flags (2 bits) next to the old flags', async () => {
  const sim = await solo(); const p = sim.player;
  for (const air of [0, 1, 2, 3]) {
    p.air = air; p.crouch = air === 2; p.grounded = air === 0;
    const wire = JSON.parse(JSON.stringify(packFighter(p))), o = {};
    unpackFighterInto(o, wire);
    assert.equal(o.air, air); assert.equal(o.crouch, air === 2); assert.equal(o.grounded, air === 0); assert.equal(o.alive, true);
    assert.ok(wire[7] < 2048);
  }
  assert.equal(FF.airShift, 9);
  sim.dispose();
});

test('regression: a LETHAL landing (fall damage above your health) kills you cleanly instead of crashing the physics', async () => {
  const sim = await solo({ drop: false }); const p = sim.player;
  p.rb.setTranslation({ x: 0, y: 60, z: 0 }, true); p.rb.setNextKinematicTranslation({ x: 0, y: 60, z: 0 }); p.x = 0; p.y = 60; p.z = 0;
  for (let i = 0; i < 300; i++) sim.step(DT, idleCmd());
  assert.equal(p.alive, false); assert.equal(p.hp, 0);
  assert.ok(sim.drainEvents().some((e) => e.t === 'kill' && e.target === p.id && e.cause === 'fall'));
  sim.dispose();
});

test('regression: in a drop match the opening zone covers the whole map, so nobody takes zone damage for landing in a corner', async () => {
  const sim = await solo({ bots: 4 });
  const corner = Math.hypot(MAP_HALF, MAP_HALF);
  assert.ok(sim.zone.radius >= corner, `radius ${sim.zone.radius} reaches the corner ${corner.toFixed(0)}`);
  for (const [x, z] of [[MAP_HALF, MAP_HALF], [-MAP_HALF, MAP_HALF], [MAP_HALF, -MAP_HALF], [-MAP_HALF, -MAP_HALF]]) assert.ok(sim.zone.outside(x, z) < 0);
  // park every fighter in the corner after landing: not a single point of zone damage until the zone clock has started and the circle has shrunk
  for (const f of sim.fighters) { if (f.air) { f.air = 0; f.vy = -1; } }
  const hp0 = new Map(sim.fighters.map((f) => [f.id, f.hp]));
  for (const f of sim.fighters) { f.rb.setTranslation({ x: MAP_HALF - 6, y: 0.9, z: MAP_HALF - 6 }, true); f.rb.setNextKinematicTranslation({ x: MAP_HALF - 6, y: 0.9, z: MAP_HALF - 6 }); f.x = f.z = MAP_HALF - 6; f.y = 0.9; if (f.brain) f.brain.update = () => {}; }
  run(sim, 5);
  assert.ok(sim.zone.timeLeft > 20 && !sim.zone.shrinking, 'the zone clock has not started yet');
  for (const f of sim.fighters) if (f.alive) assert.ok(f.hp >= hp0.get(f.id) - 0.01, `fighter ${f.id} untouched`);
  sim.dispose();
});

test('the next circle after a drop-in opening circle stays on the map, and normal matches keep their 100 m opening circle', async () => {
  for (let seed = 1; seed < 60; seed++) {
    const sim = await solo({ seed, bots: 0 }), z = sim.zone;
    assert.ok(Math.abs(z.nextX) <= MAP_HALF - 20 + 1e-9 && Math.abs(z.nextZ) <= MAP_HALF - 20 + 1e-9, `seed ${seed}: next circle centre ${z.nextX.toFixed(0)}, ${z.nextZ.toFixed(0)}`);
    sim.dispose();
  }
  const plain = await solo({ drop: false, bots: 0 });
  assert.equal(plain.zone.radius, 100);
  plain.dispose();
});

test('the zone clock (and its damage) waits for the drop: it starts only after the plane has emptied and everyone has had time to land', async () => {
  const sim = await solo({ bots: 3 });
  assert.equal(sim.zoneStart, sim.plane.Te + DROP.ZONE_DELAY);
  run(sim, 8);
  assert.equal(sim.zone.t, 0, 'still waiting');
  const startAt = sim.zoneStart;
  until(sim, () => sim.time > startAt + 1, startAt + 5);
  assert.ok(sim.zone.t > 0.5 && sim.zone.t < 1.5, `zone clock running after the start (${sim.zone.t.toFixed(2)})`);
  sim.dispose();
});
