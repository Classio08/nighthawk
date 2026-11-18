import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSquadOrder } from '../src/sim/squad.js';

test('united squads fall back together when badly hurt and in contact', () => {
  assert.equal(chooseSquadOrder({ contactFresh: true, averageHealth: 0.2, isPinner: true }), 'fallback');
});

test('healthy squad pinner suppresses while other members flank', () => {
  assert.equal(chooseSquadOrder({ contactFresh: true, averageHealth: 0.8, isPinner: true }), 'suppress');
  assert.equal(chooseSquadOrder({ contactFresh: true, averageHealth: 0.8, isPinner: false }), 'flank');
});

test('squad patrols without a fresh contact', () => {
  assert.equal(chooseSquadOrder({ contactFresh: false, averageHealth: 0.8 }), 'patrol');
});

test('alliance break returns members to independent doctrine', () => {
  assert.equal(chooseSquadOrder({ contactFresh: true, averageHealth: 0.1, united: false }), 'independent');
});
