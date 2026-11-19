import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMap } from '../src/sim/map.js';
import { makeRng } from '../src/sim/rng.js';
import { createMission, GhostFrequencyMission, RelayUplinkMission } from '../src/sim/operations.js';

function fakeSimulation(seed = 20261119) {
  const player = { id: 0, x: 0, z: 0, y: 0.9, alive: true, kills: 2 };
  const sim = {
    seed, map: buildMap(seed), rng: makeRng(seed), player, humans: [player], fighters: [player],
    events: [], state: 'playing', result: null, garrisonAlerts: 0, garrisonRestores: 0,
    emit(event) { this.events.push(event); },
    alertGarrison() { this.garrisonAlerts++; },
    restoreGarrison() { this.garrisonRestores++; },
  };
  return sim;
}

test('operation factory keeps DUST LANTERN and adds named story operations', () => {
  const sim = fakeSimulation();
  const dust = createMission('dust-lantern', sim);
  const relay = createMission('relay-uplink', sim);
  const ghost = createMission('ghost-frequency', sim);
  assert.equal(dust.id, 'dust-lantern');
  assert.equal(dust.name, 'DUST LANTERN');
  assert.equal(relay.id, 'relay-uplink');
  assert.equal(ghost.id, 'ghost-frequency');
  assert.equal(createMission('unknown-op', sim), null);
});

test('GHOST FREQUENCY requires all three seeded transmitters before terminal access', () => {
  const sim = fakeSimulation();
  const mission = new GhostFrequencyMission(sim);
  assert.equal(mission.clues.length, 3);
  assert.equal(mission.interact(sim.player), false, 'cannot interact with a distant transmitter');
  for (const clue of mission.clues) {
    sim.player.x = clue.x; sim.player.z = clue.z;
    assert.equal(mission.interact(sim.player), true);
  }
  assert.equal(mission.foundCount, 3);
  assert.equal(mission.stage, 'hack');
  assert.ok(sim.events.some((e) => e.phase === 'trace-unlocked'));
});

test('GHOST FREQUENCY signal trace pauses outside the terminal and unlocks extraction when complete', () => {
  const sim = fakeSimulation();
  const mission = new GhostFrequencyMission(sim);
  for (const clue of mission.clues) { sim.player.x = clue.x; sim.player.z = clue.z; mission.interact(sim.player); }
  sim.player.x = mission.target.x; sim.player.z = mission.target.z;
  assert.equal(mission.interact(sim.player), true);
  mission.update(10);
  assert.equal(mission.hackT, 10);
  sim.player.x += 50;
  mission.update(2);
  assert.ok(mission.hackT < 10);
  sim.player.x = mission.target.x; sim.player.z = mission.target.z;
  mission.update(mission.hackDuration + 1);
  assert.equal(mission.stage, 'extract');
  sim.player.x = mission.extraction.x; sim.player.z = mission.extraction.z;
  mission.update(4.1);
  assert.equal(mission.finished, true);
  assert.equal(sim.result.missionId, 'ghost-frequency');
  assert.equal(sim.state, 'won');
});

test('RELAY UPLINK starts a garrison response, requires a hold, and can be contested', () => {
  const sim = fakeSimulation();
  const mission = new RelayUplinkMission(sim);
  sim.player.x = mission.target.x; sim.player.z = mission.target.z;
  assert.equal(mission.interact(sim.player), true);
  assert.equal(mission.stage, 'hack');
  assert.equal(sim.garrisonAlerts, 1);
  mission.update(mission.hackDuration + 1);
  assert.equal(mission.stage, 'hold');

  const guard = { id: 1, npc: true, alive: true, x: mission.target.x, z: mission.target.z, brain: { p: { guard: true } } };
  sim.fighters.push(guard);
  mission.update(8);
  assert.equal(mission.holdT, 0, 'a guard inside the relay perimeter contests the hold');
  sim.fighters.pop();
  mission.update(mission.holdDuration + 1);
  assert.equal(mission.stage, 'extract');
  assert.equal(sim.garrisonRestores, 1);
  sim.player.x = mission.extraction.x; sim.player.z = mission.extraction.z;
  mission.update(4.1);
  assert.equal(mission.finished, true);
  assert.equal(sim.result.missionId, 'relay-uplink');
});
