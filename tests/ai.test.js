// Utility AI: personalities, squad radio / flanking / suppression, guards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/world.js';
import { PERSONALITIES } from '../src/sim/personality.js';
import { insideAnyBox, findFreeSpot } from '../src/sim/map.js';

const DT = 1 / 60;
const idle = () => ({ yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, fire: false, ads: false, reload: false, slot: 0, grenade: false });
let W = null;                                       // the Rapier world of the sim under test
const mk = async (opts) => { const sim = await Simulation.create(opts); W = sim.world; return sim; };
/** teleport: body AND collider (the controller reads the collider, which otherwise only catches up on the next world step) */
const tp = (f, x, z) => { f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); W.propagateModifiedBodyPositionsToColliders(); f.vy = 0; f.x = x; f.y = 0.9; f.z = z; if (f.brain) { f.brain.vehicle.position.set(x, 0, z); f.brain.px = x; f.brain.pz = z; } };
const run = (sim, secs) => { for (let i = 0; i < secs * 60; i++) sim.step(DT, idle()); };
/** clear sandbox: only the fighters the test makes alive, big zone */
async function sandbox(opts) {
  const sim = await mk({ seed: 8, guards: 0, ...opts });
  sim.zone.radius = 500; sim.zone.update = () => {};
  return sim;
}
const freeLine = (sim, len = 40, w = 12) => {
  for (let x = -88; x <= 88; x += 4) for (let z0 = 88; z0 > -88 + len; z0 -= 4) {
    let ok = true;
    for (let d = 0; d <= len && ok; d += 2) for (let dx = -w; dx <= w && ok; dx += 3) if (insideAnyBox(sim.map, x + dx, z0 - d, 2.5)) ok = false;
    if (ok) return { x, z0 };
  }
  throw new Error('no free area');
};
/** a harmless parking spot far from the action (inside the map: outside it you fall into the void) */
const park = (sim, f, x = -100, z = 100) => { const s = findFreeSpot(sim.map, sim.rng, x, z, 6, 3); tp(f, s.x, s.z); };

test('every bot has a personality and the mix is varied', async () => {
  const sim = await mk({ seed: 21, bots: 15 });
  const kinds = new Set(sim.fighters.filter((f) => f.brain && !f.npc).map((f) => f.brain.pid));
  assert.ok(kinds.size >= 3, `only ${[...kinds]} appeared`);
  for (const f of sim.fighters) if (f.brain) assert.ok(PERSONALITIES[f.brain.pid]);
  const sn = sim.fighters.find((f) => f.brain?.pid === 'sniper');
  if (sn) assert.equal(sn.brain.main, 'dmr', 'snipers carry the marksman rifle');
});

test('utility scoring: outside the zone beats everything; a visible enemy beats roaming; personalities differ', async () => {
  const sim = await sandbox({ bots: 2, humans: [{ operator: 'roms' }], squads: false });
  const [, a, b] = sim.fighters;
  a.brain.pid = 'rusher'; a.brain.p = PERSONALITIES.rusher; b.brain.pid = 'survivor'; b.brain.p = PERSONALITIES.survivor;
  const ctx = { outNow: 5, relocating: false, tgt: null, dist: 0, hpF: 1 };
  assert.equal(a.brain._decide(ctx), 'zone', 'in the red: run');
  const tgt = sim.fighters[0];
  const open = { outNow: -20, relocating: false, tgt, dist: 25, hpF: 1 };
  assert.equal(a.brain._decide(open), 'engage');
  const eR = a.brain.scores.engage; b.brain._decide(open); const eS = b.brain.scores.engage;
  assert.equal(a.brain._decide({ outNow: -20, relocating: false, tgt: null, dist: 0, hpF: 1 }), 'roam');
  assert.ok(eR > eS, `rusher (${eR.toFixed(2)}) wants the fight more than the survivor (${eS.toFixed(2)})`);
  b.brain.lastSeen = { x: 5, z: 5 }; b.brain.lastSeenT = 1; a.brain.lastSeen = { x: 5, z: 5 }; a.brain.lastSeenT = 1;
  a.brain._decide({ outNow: -20, relocating: false, tgt: null, dist: 0, hpF: 1 }); b.brain._decide({ outNow: -20, relocating: false, tgt: null, dist: 0, hpF: 1 });
  assert.ok(a.brain.scores.hunt > b.brain.scores.hunt, 'the rusher hunts harder');
});

test('a sniper finds a nest, walks there and holds it', async () => {
  const sim = await sandbox({ bots: 1, humans: [{ operator: 'roms' }], squads: false });
  const [p, b] = sim.fighters;
  b.brain.pid = 'sniper'; b.brain.p = PERSONALITIES.sniper; b.brain.main = 'dmr'; b.brain.skill = 0.8;
  park(sim, p);                                      // the human is far away and harmless
  sim.zone.radius = 90; sim.zone.cx = 0; sim.zone.cz = 0; sim.zone.nextX = 0; sim.zone.nextZ = 0; sim.zone.nextR = 80;
  run(sim, 40);
  assert.ok(b.brain.perch, 'picked a nest');
  const d = Math.hypot(b.x - b.brain.perch.x, b.z - b.brain.perch.z);
  assert.ok(d < 3, `reached the nest (${d.toFixed(1)} m away)`);
  assert.equal(b.brain.state, 'camp');
  const x0 = b.x, z0 = b.z; run(sim, 5);
  assert.ok(Math.hypot(b.x - x0, b.z - z0) < 1.2, 'and stays put');
});

test('squad radio: when one member spots an enemy, the other one hears about it and heads there', async () => {
  const sim = await sandbox({ bots: 2, humans: [{ operator: 'roms' }], squads: false });
  const [p, a, b] = sim.fighters;
  const sq = new (await import('../src/sim/squad.js')).Squad(sim, 0); sq.add(a); sq.add(b); sim.squads = [sq];
  const L = freeLine(sim);
  tp(a, L.x, L.z0); tp(b, L.x + 20, L.z0);       // squad-mate 20 m to the side
  tp(p, L.x, L.z0 - 28);                          // the enemy human stands 28 m in front of A
  a.yaw = 0; b.yaw = Math.PI;                     // B looks the other way, cannot see anything
  p.hp = p.maxHp = 1e9;
  run(sim, 0.6);
  assert.ok(a.brain.visible, 'A sees the enemy');
  run(sim, 2);
  assert.ok(sq.contact && sq.contact.by === a.id, 'blackboard has the contact');
  assert.ok(b.brain.lastSeen && Math.hypot(b.brain.lastSeen.x - p.x, b.brain.lastSeen.z - p.z) < 6, 'B got the callout by radio');
  assert.ok(sq.radioLog >= 1);
});

test('squad-mates never shoot each other, but the alliance breaks when the circle gets small', async () => {
  const sim = await sandbox({ bots: 2, humans: [{ operator: 'roms' }], squads: false });
  const [p, a, b] = sim.fighters;
  const sq = new (await import('../src/sim/squad.js')).Squad(sim, 0); sq.add(a); sq.add(b); sim.squads = [sq];
  const L = freeLine(sim);
  park(sim, p, 100, -100); p.hp = p.maxHp = 1e9;
  tp(a, L.x, L.z0); tp(b, L.x, L.z0 - 18); a.yaw = 0; b.yaw = Math.PI;
  sim.zone.phase = 0;
  a.brain._scan(); b.brain._scan();
  assert.equal(a.brain.visible, false, 'allies are not targets'); assert.equal(b.brain.visible, false);
  sim.zone.phase = 3;                                      // the circle is tiny: allies turn on each other
  a.brain._scan(); b.brain._scan();
  assert.equal(a.brain.visible, true); assert.equal(b.brain.visible, true);
});

test('flanking + suppression: the pinner pins, the other swings round to the side', async () => {
  const sim = await sandbox({ bots: 2, humans: [{ operator: 'roms' }], squads: false });
  const [p, a, b] = sim.fighters;
  const { Squad } = await import('../src/sim/squad.js');
  const sq = new Squad(sim, 0); sq.add(a); sq.add(b); sim.squads = [sq];
  const L = freeLine(sim, 50);
  tp(p, L.x, L.z0 - 40); p.hp = p.maxHp = 1e9;
  tp(a, L.x - 3, L.z0 - 14); tp(b, L.x + 6, L.z0);        // A is closer to the enemy: A pins, B flanks
  a.yaw = 0; b.yaw = 0;
  sq.contact = { id: p.id, x: p.x, z: p.z, t: sim.time, by: a.id };
  assert.equal(sq.pinner(), a);
  assert.equal(sq.flankPoint(a, insideAnyBox), null, 'the pinner does not flank');
  const fp = sq.flankPoint(b, insideAnyBox);
  assert.ok(fp, 'B gets a flank point');
  const cx = p.x, cz = p.z, bx = b.x - cx, bz = b.z - cz;
  const side = Math.abs((fp.x - cx) * bz - (fp.z - cz) * bx) / (Math.hypot(fp.x - cx, fp.z - cz) * Math.hypot(bx, bz));
  assert.ok(side > 0.3, `the flank point is off to the side of the straight line (sin angle ${side.toFixed(2)})`);
  b.brain.state = 'flank'; a.brain._decide({ outNow: -10, relocating: false, tgt: null, dist: 0, hpF: 1 });
  assert.ok(a.brain.scores.suppress > 0.6, 'the pinner lays down suppressing fire while B moves');
});

test('guards defend their post (and do not join the race)', async () => {
  const sim = await mk({ seed: 8, bots: 0, guards: 4, humans: [{ operator: 'roms' }] });
  sim.zone.radius = 500; sim.zone.update = () => {};
  const guards = sim.fighters.filter((f) => f.npc);
  assert.equal(guards.length, 4);
  assert.equal(sim.aliveCount(), 1, 'guards do not count as contestants');
  park(sim, sim.player, 100, 100);
  run(sim, 20);
  for (const g of guards) assert.ok(Math.hypot(g.x - sim.outpost.x, g.z - sim.outpost.z) < 22, `${g.name} stays at the post`);
  // an intruder who walks up to the post gets shot at (tough intruder so the match carries on)
  const sp = findFreeSpot(sim.map, sim.rng, sim.outpost.x + 12, sim.outpost.z, 3, 2);
  tp(sim.player, sp.x, sp.z); sim.player.hp = sim.player.maxHp = 5000;
  run(sim, 6);
  assert.ok(sim.player.hp < 5000, 'the intruder was shot');
  assert.ok(guards.some((g) => g.brain.state === 'engage' || g.brain.state === 'hunt'), 'the garrison reacts');
  // the intruder leaves: guards stop and walk back to their posts
  park(sim, sim.player, 100, 100); run(sim, 15);
  for (const g of guards) assert.ok(Math.hypot(g.x - sim.outpost.x, g.z - sim.outpost.z) < 22, `${g.name} went back to the post`);
  assert.equal(sim.state, 'playing');
});
