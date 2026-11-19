import test from 'node:test';
import assert from 'node:assert/strict';
import { MissionAlertDirector } from '../src/sim/mission-alert.js';

const guard = (brain = {}) => ({ alive: true, npc: true, brain: { p: { guard: true }, visible: false, heard: null, heardT: 99, lastSeen: null, lastSeenT: 99, ...brain } });

test('mission alert rises from guard evidence without revealing hidden player position', () => {
  const director = new MissionAlertDirector();
  const guards = [guard({ heard: { x: 10, z: 12 }, heardT: 0.2 })];
  for (let i = 0; i < 20; i++) director.update(0.1, guards);
  const state = director.snapshot();
  assert.equal(state.level, 'searching');
  assert.equal(state.evidence, 'sound-investigation');
  assert.equal(state.observers, 0);
  assert.equal('player' in state, false);
});

test('visual contact escalates to crisis and counts living observers', () => {
  const director = new MissionAlertDirector();
  const target = { alive: true };
  const guards = [guard({ visible: true, target }), guard({ visible: true, target })];
  for (let i = 0; i < 6; i++) director.update(0.1, guards);
  const state = director.snapshot();
  assert.equal(state.level, 'crisis');
  assert.equal(state.observers, 2);
  assert.equal(state.evidence, 'visual-contact');
});

test('mission alert cools gradually after evidence expires', () => {
  const director = new MissionAlertDirector();
  const guards = [guard({ visible: true, target: { alive: true } })];
  for (let i = 0; i < 8; i++) director.update(0.1, guards);
  const before = director.snapshot().pressure;
  guards[0].brain.visible = false;
  guards[0].brain.target = null;
  for (let i = 0; i < 10; i++) director.update(0.1, guards);
  const after = director.snapshot().pressure;
  assert.ok(after < before);
  assert.ok(after > 0, 'alert should not vanish immediately');
});

test('dead or non-guard NPCs do not contribute to mission alert', () => {
  const director = new MissionAlertDirector();
  const dead = guard({ visible: true, target: { alive: true } }); dead.alive = false;
  const civilian = { alive: true, npc: true, brain: { p: { guard: false }, visible: true, target: { alive: true } } };
  director.update(1, [dead, civilian]);
  assert.equal(director.snapshot().level, 'routine');
  assert.equal(director.snapshot().observers, 0);
});
