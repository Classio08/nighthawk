import test from 'node:test';
import assert from 'node:assert/strict';
import { FactionIntelligence } from '../src/sim/faction-intel.js';

function guard(id, x) {
  return {
    id, x, y: 0.9, z: 0, alive: true, npc: true,
    get eyeY() { return 1.62; },
    received: [],
    brain: {
      p: { guard: true },
      radioIn(contact, delay) { this.received.push({ contact, delay }); },
    },
  };
}

function setup(canSee = () => true) {
  const witness = guard(0, 0);
  const receiver = guard(1, 5);
  const body = { id: 2, x: 4, y: 0.9, z: 0, alive: false, npc: false };
  const sim = {
    time: 0,
    fighters: [witness, receiver, body],
    events: [],
    rng() { return 0.5; },
    canSee(a, b) { return canSee(a, b); },
    emit(event) { this.events.push(event); },
  };
  return { sim, witness, receiver, body, intel: new FactionIntelligence(sim) };
}

test('a guard discovers a nearby dead body only with line of sight', () => {
  const { sim, witness, intel } = setup((a) => a.id === 0);
  intel.update(0.6);
  assert.equal(intel.snapshot().discoveries, 1);
  assert.equal(intel.snapshot().pending, 1);
  assert.equal(sim.events[0].kind, 'body-found');
  assert.equal(sim.events[0].by, witness.id);
});

test('body discovery does not occur through walls', () => {
  const { sim, intel } = setup(() => false);
  intel.update(0.6);
  assert.equal(intel.snapshot().discoveries, 0);
  assert.equal(intel.snapshot().pending, 0);
  assert.equal(sim.events.length, 0);
});

test('a body report is delayed and the radio location is approximate', () => {
  const { sim, receiver, body, intel } = setup((a) => a.id === 0);
  intel.update(0.6);
  assert.equal(receiver.brain.received.length, 0);
  assert.equal(intel.snapshot().pending, 1);
  sim.time = 2;
  intel.update(0.6);
  assert.equal(receiver.brain.received.length, 1);
  const contact = receiver.brain.received[0].contact;
  const error = Math.hypot(contact.x - body.x, contact.z - body.z);
  assert.ok(error >= 1.8 && error <= 5.2);
  assert.equal(contact.kind, 'body');
  assert.ok(contact.confidence < 1);
});

test('a discovered body is not repeatedly reported by every nearby guard', () => {
  const { sim, intel } = setup(() => true);
  intel.update(0.6);
  sim.time = 2;
  intel.update(0.6);
  assert.equal(intel.snapshot().discoveries, 1);
  assert.equal(sim.events.filter((event) => event.kind === 'body-found').length, 1);
});

test('dead guards and non-guard NPCs do not receive reports', () => {
  const { sim, intel } = setup((a) => a.id === 0);
  sim.fighters[1].alive = false;
  sim.fighters.push({ id: 3, x: 1, y: 0.9, z: 0, alive: true, npc: true, brain: { p: { guard: false }, radioIn() { throw new Error('non-guard received radio'); } } });
  intel.update(0.6);
  sim.time = 2;
  intel.update(0.6);
  assert.equal(intel.snapshot().delivered, 0);
});
