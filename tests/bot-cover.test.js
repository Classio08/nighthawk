import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSeekCover } from '../src/sim/bot.js';

test('bots seek cover after taking meaningful damage', () => {
  assert.equal(shouldSeekCover({ hurtBadly: true }), true);
});

test('bots seek cover shortly after an enemy hits them, before critical health', () => {
  assert.equal(shouldSeekCover({ underFire: true }), true);
});

test('bots can choose cover while reloading in a nearby fight', () => {
  assert.equal(shouldSeekCover({ reloadFight: true }), true);
});

test('bots do not seek cover without a defensive trigger', () => {
  assert.equal(shouldSeekCover({}), false);
});
