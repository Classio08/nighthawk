import test from 'node:test';
import assert from 'node:assert/strict';
import { integrateBallisticStep, reflectBallisticVelocity } from '../src/sim/ballistics.js';

test('ballistic step integrates gravity using the fixed simulation timestep', () => {
  const projectile = { x: 0, y: 10, z: 0, vx: 100, vy: 0, vz: 0, dragCoefficient: 0 };
  const step = integrateBallisticStep(projectile, 1 / 60);
  assert.equal(step.from.x, 0);
  assert.ok(Math.abs(projectile.x - (100 / 60)) < 1e-9);
  assert.ok(projectile.y < 10);
  assert.ok(projectile.vy < 0);
  assert.ok(step.distance > 0);
  assert.equal(projectile.ageTicks, 1);
});

test('ballistic drag reduces velocity without introducing non-finite values', () => {
  const projectile = { x: 0, y: 0, z: 0, vx: 500, vy: 0, vz: 0, dragCoefficient: 0.00001 };
  const before = Math.hypot(projectile.vx, projectile.vy, projectile.vz);
  integrateBallisticStep(projectile, 1 / 60);
  const after = Math.hypot(projectile.vx, projectile.vy, projectile.vz);
  assert.ok(after < before);
  assert.ok(Number.isFinite(projectile.x + projectile.y + projectile.z + projectile.vx + projectile.vy + projectile.vz));
});

test('ballistic step rejects invalid time increments', () => {
  assert.throws(() => integrateBallisticStep({}, 0));
  assert.throws(() => integrateBallisticStep({}, 0.2));
});

test('ricochet reflects around the surface normal and retains bounded speed', () => {
  const reflected = reflectBallisticVelocity({ x: 100, y: -20, z: 0 }, { x: 0, y: 1, z: 0 }, 0.72);
  assert.ok(Math.abs(reflected.x - 72) < 1e-9);
  assert.ok(Math.abs(reflected.y - 14.4) < 1e-9);
  assert.equal(reflected.z, 0);
  assert.ok(Math.hypot(reflected.x, reflected.y, reflected.z) < Math.hypot(100, -20, 0));
});
