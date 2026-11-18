import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/sim/rng.js';
import { WEAPONS, SLOT_ORDER, damageAt } from '../src/sim/weapons.js';
import { buildMap, pickSpawns, findCover, insideAnyBox } from '../src/sim/map.js';
import { Zone, ZONE_PHASES } from '../src/sim/zone.js';

test('rng: same seed gives the same numbers', () => {
  const a = makeRng(5), b = makeRng(5);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
});

test('weapons: damage falls off with distance and headshots multiply', () => {
  const w = WEAPONS.ar;
  assert.equal(damageAt(w, 5), w.dmg);
  assert.ok(damageAt(w, 200) < damageAt(w, 50));
  assert.ok(Math.abs(damageAt(w, 500) - w.dmg * w.minMul) < 1e-9);
  assert.equal(damageAt(w, 5, true), w.dmg * w.headMul);
  assert.equal(SLOT_ORDER.length, 6);
  for (const id of SLOT_ORDER) assert.ok(WEAPONS[id].mag > 0 && WEAPONS[id].rof > 0);
});

test('map: deterministic, has buildings, perimeter, and spawns are outside buildings', () => {
  const m1 = buildMap(7), m2 = buildMap(7);
  assert.deepEqual(m1.boxes, m2.boxes);
  assert.ok(m1.boxes.filter((b) => b.kind === 'block').length >= 8);
  assert.equal(m1.boxes.filter((b) => b.kind === 'edge').length, 4);
  assert.deepEqual(m1.landmarks.map((p) => p.id), [
    'basin-yard', 'dry-river', 'relay-ridge', 'forward-outpost', 'extraction-pad',
  ]);
  for (const poi of m1.landmarks) {
    assert.ok(Math.abs(poi.x) < m1.half && Math.abs(poi.z) < m1.half, `${poi.id} must be inside the arena`);
  }
  for (const poi of ['basin-yard', 'relay-ridge', 'forward-outpost', 'extraction-pad']) {
    assert.ok(m1.boxes.some((b) => b.poi === poi), `${poi} needs gameplay-solid POI geometry`);
  }
  assert.ok(m1.boxes.some((b) => b.kind === 'poi-mast'), 'Relay Ridge needs its communications mast');
  assert.ok(m1.boxes.some((b) => b.kind === 'poi-fence'), 'Extraction Pad needs its perimeter barriers');
  const spawns = pickSpawns(m1, 16, makeRng(3));
  assert.equal(spawns.length, 16);
  for (const s of spawns) assert.ok(!insideAnyBox(m1, s.x, s.z, 1));
});

test('cover: the cover spot is on the far side of a box from the threat', () => {
  const map = { boxes: [{ kind: 'wall', x: 10, y: 1, z: 0, w: 6, h: 2, d: 1 }] };
  const p = findCover(map, { x: 14, z: 6 }, { x: -10, z: 0 });
  assert.ok(p && p.x > 10, `cover should be east of the wall, got ${JSON.stringify(p)}`);
  assert.equal(findCover({ boxes: [] }, { x: 0, z: 0 }, { x: 5, z: 5 }), null);
});

test('zone: shrinks over time, never grows, next circle stays inside the old one', () => {
  const z = new Zone(makeRng(11));
  let prev = z.radius;
  for (let i = 0; i < 60 * 200; i++) {
    z.update(1 / 60);
    assert.ok(z.radius <= prev + 1e-9, 'radius must not grow');
    prev = z.radius;
  }
  assert.ok(z.radius < 5);
  assert.ok(z.done);
  // inside-old-circle check for every phase
  const z2 = new Zone(makeRng(4));
  let cx = z2.cx, cz = z2.cz, r = z2.radius;
  for (let i = 0; i < ZONE_PHASES.length; i++) {
    const d = Math.hypot(z2.nextX - cx, z2.nextZ - cz);
    assert.ok(d + z2.nextR <= r + 1e-6, `phase ${i}: next circle must be inside the current one`);
    cx = z2.nextX; cz = z2.nextZ; r = z2.nextR;
    z2.update(ZONE_PHASES[i].wait + 0.01); z2.update(ZONE_PHASES[i].shrink + 0.01);
  }
  assert.ok(z2.outside(200, 0) > 0 && z2.outside(z2.cx, z2.cz) < 0);
});

import { rayCapsule, raySphere } from '../src/sim/geom.js';

test('geom: ray vs vertical capsule (the fighter shape)', () => {
  // standing capsule at x=0,z=0 from y=0.4..1.4, radius .4. Shoot along -z from z=10 at chest height
  assert.ok(Math.abs(rayCapsule(0, 0.9, 10, 0, 0, -1, 0, 0.4, 0, 1.4, 0.4) - 9.6) < 1e-6);
  // too high (over the head), too wide, behind the shooter
  assert.equal(rayCapsule(0, 2.2, 10, 0, 0, -1, 0, 0.4, 0, 1.4, 0.4), -1);
  assert.equal(rayCapsule(1.0, 0.9, 10, 0, 0, -1, 0, 0.4, 0, 1.4, 0.4), -1);
  assert.equal(rayCapsule(0, 0.9, -10, 0, 0, -1, 0, 0.4, 0, 1.4, 0.4), -1);
  // from above straight down hits the rounded top (y1 + r = 1.8)
  assert.ok(Math.abs(rayCapsule(0, 5, 0, 0, -1, 0, 0, 0.4, 0, 1.4, 0.4) - 3.2) < 1e-6);
  // glancing shot at the edge of the radius still hits
  assert.ok(rayCapsule(0.39, 0.9, 10, 0, 0, -1, 0, 0.4, 0, 1.4, 0.4) > 0);
  assert.ok(raySphere(0, 0, 5, 0, 0, -1, 0, 0, 0, 1) > 0);
});
