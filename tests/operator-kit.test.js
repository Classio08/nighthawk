import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATOR_KITS,
  operatorKitFor,
  operatorKitSummary,
  buildOperatorBodyParts,
  buildOperatorLegParts,
  buildOperatorArmParts,
} from '../src/render/operator-kit.js';

const operatorIds = ['roms', 'shadow', 'douglas', 'cliffhanger', 'navy-blue', 'rampol', 'maetja', 'cleiseis'];

test('all eight original operators have a distinct named equipment profile', () => {
  assert.deepEqual(Object.keys(OPERATOR_KITS).sort(), operatorIds.slice().sort());
  const profiles = operatorKitSummary();
  assert.equal(profiles.length, 8);
  assert.equal(new Set(profiles.map((p) => p.pack)).size >= 4, true);
  for (const id of operatorIds) assert.ok(operatorKitFor(id).label.length > 3);
});

test('unknown operator ids safely use the Roms equipment fallback', () => {
  assert.equal(operatorKitFor('not-a-real-operator'), operatorKitFor('roms'));
});

test('every operator has baked body, leg and arm parts with finite positive dimensions', () => {
  for (const id of operatorIds) {
    const body = buildOperatorBodyParts('#aabbcc', 0x8d5a3a, id);
    const legs = buildOperatorLegParts(id);
    const arms = buildOperatorArmParts('#aabbcc', id);
    assert.ok(body.length >= 20, `${id} should have a detailed carrier and mission kit`);
    assert.ok(legs.length >= 4);
    assert.ok(arms.length >= 4);
    for (const parts of [body, legs, arms]) for (const [w, h, d, x, y, z] of parts) {
      assert.ok([w, h, d, x, y, z].every(Number.isFinite), `${id} contains non-finite geometry values`);
      assert.ok(w > 0 && h > 0 && d > 0, `${id} contains a zero-sized gear part`);
    }
  }
});

test('medic, demolitions, signals and reconnaissance kits have their role equipment', () => {
  assert.equal(operatorKitFor('douglas').medic, true);
  assert.equal(operatorKitFor('cliffhanger').explosive, true);
  assert.equal(operatorKitFor('maetja').tablet, true);
  assert.equal(operatorKitFor('navy-blue').pack, 'recon');
});
