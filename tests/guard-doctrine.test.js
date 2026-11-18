import test from 'node:test';
import assert from 'node:assert/strict';
import { searchWaypoint } from '../src/sim/guard-doctrine.js';

test('guard search sweep is deterministic and distributes points around contact', () => {
  const anchor = { x: 10, z: -4 };
  const points = Array.from({ length: 8 }, (_, i) => searchWaypoint(anchor, i));
  assert.deepEqual(points, Array.from({ length: 8 }, (_, i) => searchWaypoint(anchor, i)));
  for (const p of points) assert.ok(Math.abs(Math.hypot(p.x - anchor.x, p.z - anchor.z) - 5.5) < 1e-9);
  const keys = points.map((p) => [p.x.toFixed(4), p.z.toFixed(4)].join(','));
  assert.equal(new Set(keys).size, 8);
});

test('later guard search sweeps expand beyond the first ring', () => {
  const first = searchWaypoint({ x: 0, z: 0 }, 0, 5);
  const secondRing = searchWaypoint({ x: 0, z: 0 }, 8, 5);
  assert.ok(Math.hypot(secondRing.x, secondRing.z) > Math.hypot(first.x, first.z));
});
