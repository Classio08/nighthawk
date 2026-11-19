import test from 'node:test';
import assert from 'node:assert/strict';
import { suppression, SUPPRESS_R } from '../src/fx/suppress.js';

// shooter at the origin firing along +z, 40 m long; the listener's head is at (x, 1.6, 20)
const near = (x) => suppression(0, 1.6, 0, 0, 1.6, 40, x, 1.6, 20);

test('suppression: a bullet that passes close is stronger the closer it passes', () => {
  assert.ok(near(0.5) > near(1.2) && near(1.2) > 0);
  assert.ok(near(0.5) <= 1 && near(1.2) < 1);
});
test('suppression: far misses, point-blank hits and exact hits do nothing', () => {
  assert.equal(near(SUPPRESS_R + 0.5), 0, 'too far to notice');
  assert.equal(near(0.05), 0, 'basically a hit: it has its own feedback');
  assert.equal(suppression(0, 1.6, 0, 0, 1.6, 2.5, 0.6, 1.6, 1.5), 0, 'closer than 3 m to the shooter');
});
test('suppression: a shot that ended before reaching you, or fired away from you, does not count', () => {
  assert.equal(suppression(0, 1.6, 0, 0, 1.6, 12, 0.6, 1.6, 20), 0, 'it hit a wall at 12 m, you are at 20 m');
  assert.equal(suppression(0, 1.6, 0, 0, 1.6, -40, 0.6, 1.6, 20), 0, 'fired the other way');
  assert.equal(suppression(1, 1, 1, 1, 1, 1, 0, 0, 0), 0, 'zero-length shot');
});
test('suppression: height counts (over your head or at your feet is a smaller scare)', () => {
  assert.ok(suppression(0, 1.6, 0, 0, 1.6, 40, 0.4, 1.6, 20) > suppression(0, 1.6, 0, 0, 1.6, 40, 0.4, 0.4, 20));
});
