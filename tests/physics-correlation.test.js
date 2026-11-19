import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/sim/rng.js';
import {
  MATERIALS, materialForMapKind, materialForPropKind, surfaceImpact,
  classifyHitZone, hitZoneMultiplier, blastImpulse, projectileDrop, gunshotDelay, hitPushImpulse, shrapnelDirection,
} from '../src/sim/physics-correlation.js';

test('map and prop geometry resolve to consistent physical materials', () => {
  assert.equal(materialForMapKind('poi-rock'), 'rock');
  assert.equal(materialForMapKind('poi-container'), 'metal');
  assert.equal(materialForPropKind('crate'), 'wood');
  assert.equal(materialForPropKind('barrel'), 'metal');
  assert.ok(MATERIALS.flesh.density > 1000);
});

test('thin wood and glass transmit energy while concrete stops', () => {
  assert.equal(surfaceImpact('wood').penetrates, true);
  assert.ok(surfaceImpact('wood').damageMultiplier > 0.5);
  assert.equal(surfaceImpact('glass').penetrates, true);
  assert.equal(surfaceImpact('concrete').penetrates, false);
  assert.equal(surfaceImpact('metal', 0.05).kind, 'ricochet');
});

test('hit zones and damage response distinguish head, torso and legs', () => {
  assert.equal(classifyHitZone(1.65, 0.9, false), 'head');
  assert.equal(classifyHitZone(1.05, 0.9, false), 'torso');
  assert.equal(classifyHitZone(0.2, 0, false), 'leg');
  assert.ok(hitZoneMultiplier('leg') < hitZoneMultiplier('torso'));
});

test('blast impulses are bounded, fall off quadratically and scale with mass', () => {
  const near = blastImpulse(1, 8, 1200, 1, 0, 0, 20);
  const far = blastImpulse(6, 8, 1200, 1, 0, 0, 20);
  const heavy = blastImpulse(1, 8, 1200, 1, 0, 0, 100);
  assert.ok(near.strength > far.strength);
  assert.ok(near.strength > heavy.strength);
  assert.ok(near.y > 0);
  assert.equal(blastImpulse(9, 8, 1200, 1, 0, 0).strength, 0);
});

test('projectile drop and distant gunshot delay scale with range', () => {
  assert.ok(projectileDrop(300, 900) > projectileDrop(100, 900));
  assert.ok(gunshotDelay(200) > gunshotDelay(10));
});

test('hit pushes stay small and bounded for playable character movement', () => {
  assert.ok(hitPushImpulse(34, { x: 1, z: 0 }).magnitude < 1);
  assert.ok(hitPushImpulse(500, { x: 1, z: 0 }).magnitude <= 1.8);
});

test('shrapnel directions are deterministic, normalized and evenly spread over a sphere', () => {
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 32; i++) {
    const first = shrapnelDirection(a), second = shrapnelDirection(b);
    assert.deepEqual(first, second);
    assert.ok(Math.abs(Math.hypot(first.x, first.y, first.z) - 1) < 1e-9);
  }
});
