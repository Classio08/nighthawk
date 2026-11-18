import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreTargetCandidate } from '../src/sim/bot.js';

test('nearby targets remain preferred when tactical factors are equal', () => {
  assert.ok(scoreTargetCandidate({ distance: 12 }) < scoreTargetCandidate({ distance: 24 }));
});

test('bots prioritize an enemy currently firing at them over an equally distant passive enemy', () => {
  assert.ok(scoreTargetCandidate({ distance: 24, attacking: true }) < scoreTargetCandidate({ distance: 24 }));
});

test('a weakened enemy receives a finish opportunity without overriding a large distance gap', () => {
  assert.ok(scoreTargetCandidate({ distance: 24, wounded: true }) < scoreTargetCandidate({ distance: 24 }));
  assert.ok(scoreTargetCandidate({ distance: 60, wounded: true }) > scoreTargetCandidate({ distance: 24 }));
});

test('squad focus and the enemy who last hurt the bot influence target choice', () => {
  assert.ok(scoreTargetCandidate({ distance: 30, squadFocus: true }) < scoreTargetCandidate({ distance: 30 }));
  assert.ok(scoreTargetCandidate({ distance: 30, lastHurt: true }) < scoreTargetCandidate({ distance: 30 }));
});

test('isolated opponents receive a small tactical priority', () => {
  assert.ok(scoreTargetCandidate({ distance: 30, isolated: true }) < scoreTargetCandidate({ distance: 30 }));
});
