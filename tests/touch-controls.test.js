import test from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/input/input.js';
import { detectTouchMode, normalizeStick } from '../src/input/touch-controls.js';

function inputStub() {
  const input = Object.create(Input.prototype);
  input.keys = new Set();
  input.pressed = new Set();
  input.touchMove = { forward: 0, strafe: 0, sprint: false };
  input.touchActions = new Set();
  input.touchPressed = new Set();
  input.mouseFire = false;
  input.mouseAds = false;
  input.dx = 0;
  input.dy = 0;
  return input;
}

test('touch mode supports explicit overrides and device capability detection', () => {
  assert.equal(detectTouchMode('?touch=1', { maxTouchPoints: 0, coarse: false }), true);
  assert.equal(detectTouchMode('?touch=0', { maxTouchPoints: 5, coarse: true }), false);
  assert.equal(detectTouchMode('', { maxTouchPoints: 2, coarse: false }), true);
  assert.equal(detectTouchMode('', { maxTouchPoints: 0, coarse: true }), true);
  assert.equal(detectTouchMode('', { maxTouchPoints: 0, coarse: false }), false);
});

test('virtual stick returns normalized forward and strafe axes', () => {
  assert.deepEqual(normalizeStick(0, -50, 50), { forward: 1, strafe: 0 });
  assert.deepEqual(normalizeStick(50, 0, 50), { forward: 0, strafe: 1 });
  const diagonal = normalizeStick(50, -50, 50);
  assert.ok(Math.abs(Math.hypot(diagonal.forward, diagonal.strafe) - 1) < 1e-9);
  assert.deepEqual(normalizeStick(10, 10, 0), { forward: 0, strafe: 0 });
});

test('touch and keyboard movement share one normalized command', () => {
  const input = inputStub();
  input.setTouchMove(0.8, 0.8, true);
  const touch = input.readMove();
  assert.ok(Math.abs(Math.hypot(touch.forward, touch.strafe) - 1) < 1e-9);
  assert.equal(touch.sprint, true);

  input.keys.add('KeyW');
  const combined = input.readMove();
  assert.ok(combined.forward > 0);
  assert.ok(Math.hypot(combined.forward, combined.strafe) <= 1.0000001);
});

test('touch actions are held while pressed and one-shot actions clear at frame end', () => {
  const input = inputStub();
  input.setTouchAction('fire', true);
  input.setTouchAction('ads', true);
  input.setTouchAction('ability', true);
  assert.equal(input.fire, true);
  assert.equal(input.ads, true);
  assert.equal(input.act('ability'), true);
  assert.equal(input.actPressed('ability'), true);
  input.endFrame();
  assert.equal(input.actPressed('ability'), false);
  assert.equal(input.act('ability'), true, 'held state remains until pointer release');

  input.setTouchAction('fire', false);
  input.setTouchAction('ads', false);
  input.setTouchAction('ability', false);
  assert.equal(input.fire, false);
  assert.equal(input.ads, false);
  assert.equal(input.act('ability'), false);
});

test('releasing touch clears movement and held actions without clearing keyboard state', () => {
  const input = inputStub();
  input.keys.add('KeyW');
  input.setTouchMove(1, 0, true);
  input.setTouchAction('fire', true);
  input.releaseTouch();
  const move = input.readMove();
  assert.equal(move.forward, 1, 'keyboard movement remains available');
  assert.equal(move.sprint, false);
  assert.equal(input.fire, false);
  assert.equal(input.touchMove.strafe, 0);
});
