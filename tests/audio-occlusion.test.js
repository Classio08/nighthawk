import test from 'node:test';
import assert from 'node:assert/strict';
import { soundOcclusionGain } from '../src/fx/audio.js';

test('audio occlusion gain is clamped and defaults to clear air', () => {
  assert.equal(soundOcclusionGain(1), 1);
  assert.equal(soundOcclusionGain(0.24), 0.24);
  assert.equal(soundOcclusionGain(0), 0.04);
  assert.equal(soundOcclusionGain(-4), 0.04);
  assert.equal(soundOcclusionGain(5), 1);
  assert.equal(soundOcclusionGain(Number.NaN), 1);
  assert.equal(soundOcclusionGain(undefined), 1);
});
