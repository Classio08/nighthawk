import test from 'node:test';
import assert from 'node:assert/strict';
import { moveVector } from '../src/input/move.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('W moves forward (-Z) when yaw = 0', () => {
  const v = moveVector(0, 1, 0);
  near(v.x, 0); near(v.z, -1);
});

test('D moves RIGHT (+X) and A moves LEFT (-X) when yaw = 0  [regression: v0.2 had these swapped]', () => {
  near(moveVector(0, 0, 1).x, 1);
  near(moveVector(0, 0, -1).x, -1);
});

test('after turning left 90 degrees, forward is -X and right is -Z', () => {
  const f = moveVector(Math.PI / 2, 1, 0);
  near(f.x, -1); near(f.z, 0);
  const r = moveVector(Math.PI / 2, 0, 1);
  near(r.x, 0); near(r.z, -1);
});

test('diagonal movement is not faster than straight movement', () => {
  const v = moveVector(0.7, 1, 1);
  near(Math.hypot(v.x, v.z), 1);
});
