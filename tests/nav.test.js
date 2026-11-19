// Bot navigation: grid + A* (src/sim/nav.js) and bots walking round buildings with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/world.js';
import { NavGrid } from '../src/sim/nav.js';
import { buildMap, findFreeSpot } from '../src/sim/map.js';
import { PERSONALITIES } from '../src/sim/personality.js';

const DT = 1 / 60;
const idle = () => ({ yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, fire: false, ads: false, reload: false, slot: 0, grenade: false });
const len = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pathLen = (s, pts) => { let d = 0, p = s; for (const q of pts) { d += len(p, q); p = q; } return d; };

/** the biggest tall box that has free ground 4 m from both long sides: [A, B, box] with the straight line A-B blocked */
function acrossBuilding(map, nav) {
  const boxes = nav.solid.slice().sort((a, b) => b.w * b.d - a.w * a.d);
  for (const b of boxes) {
    const A = { x: b.x, z: b.z - b.d / 2 - 4 }, B = { x: b.x, z: b.z + b.d / 2 + 4 };
    if (Math.abs(A.z) > 100 || Math.abs(B.z) > 100) continue;
    if (nav.freePoint(A.x, A.z) && nav.freePoint(B.x, B.z) && !nav.segmentClear(A.x, A.z, B.x, B.z)) return [A, B, b];
  }
  throw new Error('no building to walk round');
}

test('grid: tall boxes block their cells (plus a margin), open ground does not, low things are ignored', () => {
  const map = { boxes: [{ kind: 'wall', x: 0, y: 1, z: 0, w: 10, h: 2, d: 2 }, { kind: 'curb', x: 30, y: 0.2, z: 0, w: 10, h: 0.4, d: 2 }] };
  const nav = new NavGrid(map);
  assert.ok(nav.blockedAt(0, 0) && nav.blockedAt(4.9, 0) && nav.blockedAt(0, 1.3), 'wall and margin');
  assert.ok(!nav.blockedAt(0, 4) && !nav.blockedAt(8, 0), 'open ground');
  assert.ok(!nav.blockedAt(30, 0), 'a curb a soldier steps over is not an obstacle');
  assert.ok(nav.blockedAt(500, 0), 'outside the grid counts as blocked');
  assert.equal(nav.freePoint(0, 1.3), false); assert.equal(nav.freePoint(0, 2), true);
});

test('A* goes round a building, in straight legs that are all clear, and is only a little longer than the straight line', () => {
  const nav = new NavGrid(buildMap(7));
  const [A, B] = acrossBuilding(null, nav);
  const path = nav.findPath(A.x, A.z, B.x, B.z);
  assert.ok(path && path.length >= 2, 'found a route with at least one corner');
  assert.deepEqual(path[path.length - 1], { x: B.x, z: B.z }, 'ends exactly at the goal');
  let p = A; for (const q of path) { assert.ok(nav.segmentClear(p.x, p.z, q.x, q.z), 'every leg is clear'); p = q; }
  const straight = len(A, B), routed = pathLen(A, path);
  assert.ok(routed > straight && routed < straight * 2.2, `detour ${routed.toFixed(1)} m vs straight ${straight.toFixed(1)} m`);
});

test('A* is deterministic and handles awkward ends: a goal inside a building walks to the nearest free spot; start = goal is trivial', () => {
  const map = buildMap(7), nav = new NavGrid(map), nav2 = new NavGrid(map);
  const [A, B, b] = acrossBuilding(map, nav);
  assert.deepEqual(nav.findPath(A.x, A.z, B.x, B.z), nav2.findPath(A.x, A.z, B.x, B.z));
  const inside = nav.findPath(A.x, A.z, b.x, b.z);                              // the middle of a building
  assert.ok(inside && inside.length >= 1, 'a route to the foot of it');
  assert.ok(nav.freePoint(inside[inside.length - 1].x, inside[inside.length - 1].z, 0.3), 'but not into the wall');
  assert.deepEqual(nav.findPath(A.x, A.z, A.x + 0.2, A.z), [{ x: A.x + 0.2, z: A.z }]);
});

test('A* between random open spots always finds a route (the map has no sealed pockets) and never walks through a tall box', () => {
  const map = buildMap(7), nav = new NavGrid(map);
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  let routes = 0;
  for (let i = 0; i < 40; i++) {
    const a = { x: (rnd() - 0.5) * 180, z: (rnd() - 0.5) * 180 }, g = { x: (rnd() - 0.5) * 180, z: (rnd() - 0.5) * 180 };
    if (!nav.freePoint(a.x, a.z, 1.2) || !nav.freePoint(g.x, g.z, 1.2)) continue;
    const path = nav.findPath(a.x, a.z, g.x, g.z); assert.ok(path, `route ${i}`); routes++;
    let p = a; for (const q of path) { assert.ok(nav.segmentClear(p.x, p.z, q.x, q.z), `leg clear (route ${i})`); p = q; }
  }
  assert.ok(routes >= 15, `${routes} routes checked`);
});

test('a bot walks round a building to its nest instead of grinding against the wall', async () => {
  const sim = await Simulation.create({ seed: 8, guards: 0, bots: 1, humans: [{ operator: 'roms' }], squads: false });
  sim.zone.radius = 500; sim.zone.update = () => {};
  const W = sim.world;
  const tp = (f, x, z) => { f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); W.propagateModifiedBodyPositionsToColliders(); f.vy = 0; f.x = x; f.y = 0.9; f.z = z; };
  const [p, b] = sim.fighters;
  const s = findFreeSpot(sim.map, sim.rng, -100, 100, 6, 3); tp(p, s.x, s.z);
  const [A, B] = acrossBuilding(sim.map, sim.nav);
  tp(b, A.x, A.z);
  b.brain.pid = 'sniper'; b.brain.p = PERSONALITIES.sniper; b.brain.main = 'dmr'; b.brain.skill = 0.8;
  sim.zone.radius = 90; sim.zone.cx = 0; sim.zone.cz = 0; sim.zone.nextX = 0; sim.zone.nextZ = 0; sim.zone.nextR = 80;
  b.brain.perch = { x: B.x, z: B.z, faceX: 0, faceZ: 0 }; b.brain.perchPhase = sim.zone.phase;     // the nest is on the far side of the building
  let sawPath = false, best = 1e9, tBest = 0;
  for (let i = 0; i < 40 * 60; i++) {
    sim.step(DT, idle()); if (b.brain.path) sawPath = true;
    const d = Math.hypot(b.x - B.x, b.z - B.z); if (d < best) { best = d; tBest = i / 60; }
    if (d < 2.5) break;
  }
  assert.ok(sawPath, 'it planned an A* route');
  assert.ok(best < 2.5, `reached the far side (closest ${best.toFixed(1)} m from the nest)`);
  assert.ok(tBest < 20, `without dawdling (${tBest.toFixed(1)} s for a ~30 m walk)`);
});

test('per-tick search budget: no more than 4 A* searches per tick however many bots want a route', async () => {
  const sim = await Simulation.create({ seed: 8, guards: 0, bots: 14, humans: [{ operator: 'roms' }], squads: false });
  let worst = 0;
  for (let i = 0; i < 600; i++) { const before = sim.nav.searches; sim.step(DT, idle()); worst = Math.max(worst, sim.nav.searches - before); }
  assert.ok(worst <= 4, `worst ${worst} searches in one tick`);
});
