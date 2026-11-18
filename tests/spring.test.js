import test from 'node:test';
import assert from 'node:assert/strict';
import { Spring } from '../src/render/spring.js';

test('spring settles on its target', () => {
  const s = new Spring(120, 14); s.target = 1;
  for (let i = 0; i < 240; i++) s.step(1 / 60);
  assert.ok(Math.abs(s.x - 1) < 1e-3, `x=${s.x}`);
  assert.ok(Math.abs(s.v) < 1e-2);
});

test('impulse kicks the spring then it returns (recoil)', () => {
  const s = new Spring(150, 11); s.impulse(2);
  let peak = 0;
  for (let i = 0; i < 30; i++) { s.step(1 / 60); peak = Math.max(peak, s.x); }
  assert.ok(peak > 0.02, 'it must move away first');
  for (let i = 0; i < 300; i++) s.step(1 / 60);
  assert.ok(Math.abs(s.x) < 1e-3, 'and come back');
});

test('under-damped spring overshoots, over-damped does not', () => {
  const a = new Spring(200, 6); a.target = 1; let maxA = 0;
  const b = new Spring(200, 60); b.target = 1; let maxB = 0;
  for (let i = 0; i < 120; i++) { maxA = Math.max(maxA, a.step(1 / 60)); maxB = Math.max(maxB, b.step(1 / 60)); }
  assert.ok(maxA > 1.05);
  assert.ok(maxB <= 1.001);
});

test('stays finite even after a 2 second lag spike', () => {
  const s = new Spring(300, 8); s.target = 5; s.impulse(100);
  for (let i = 0; i < 5; i++) s.step(2);
  assert.ok(Number.isFinite(s.x) && Number.isFinite(s.v));
  assert.ok(Math.abs(s.x) < 100);
});
