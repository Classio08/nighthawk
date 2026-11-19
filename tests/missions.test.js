import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/world.js';

async function make(seed = 31415, guards = 0) {
  return Simulation.create({ seed, bots: 0, guards, mission: 'dust-lantern', loot: false, contracts: false });
}
const place = (f, p) => { f.x = p.x; f.z = p.z; f.rb.setTranslation({ x: p.x, y: 0.9, z: p.z }, true); };

test('DUST LANTERN: mission setup is deterministic for a seed', async () => {
  const a = await make(11), b = await make(11), c = await make(12);
  try {
    assert.equal(a.mission.targetSite.id, b.mission.targetSite.id);
    assert.deepEqual(a.mission.clues.map(({ id, x, z }) => ({ id, x, z })), b.mission.clues.map(({ id, x, z }) => ({ id, x, z })));
    assert.ok(a.mission.clues.every((q) => Number.isFinite(q.x) && Number.isFinite(q.z)));
    assert.ok(['basin-yard', 'forward-outpost'].includes(c.mission.targetSite.id));
    assert.equal(a.contracts.off, true);
  } finally { a.dispose(); b.dispose(); c.dispose(); }
});

test('DUST LANTERN: two clues unlock recovery, then E rescues the technician', async () => {
  const sim = await make();
  try {
    const m = sim.mission, p = sim.player;
    assert.equal(m.stage, 'recon');
    place(p, m.clues[0]); assert.equal(m.interact(p), true);
    assert.equal(m.foundCount, 1); assert.equal(m.stage, 'recon');
    place(p, m.clues[1]); assert.equal(m.interact(p), true);
    assert.equal(m.foundCount, 2); assert.equal(m.stage, 'recover');
    assert.equal(m.captive.visible, true);
    place(p, m.captive); assert.equal(m.interact(p), true);
    assert.equal(m.captive.rescued, true); assert.equal(m.stage, 'extract');
    assert.equal(m.interact(p), false);
  } finally { sim.dispose(); }
});

test('DUST LANTERN: extraction needs both operator and rescued technician in zone for four seconds', async () => {
  const sim = await make();
  try {
    const m = sim.mission, p = sim.player;
    m.stage = 'extract'; m.captive.rescued = true;
    place(p, { x: 56, z: 56 }); m.captive.x = 56; m.captive.z = 56;
    m.update(3.9); assert.equal(m.stage, 'extract');
    m.update(0.2); assert.equal(m.stage, 'complete');
    assert.equal(sim.state, 'won');
    assert.ok(sim.drainEvents().some((e) => e.t === 'end' && e.mission && e.won));
  } finally { sim.dispose(); }
});

test('DUST LANTERN: extraction cannot complete while the technician is separated', async () => {
  const sim = await make();
  try {
    const m = sim.mission, p = sim.player;
    m.stage = 'extract'; m.captive.rescued = true;
    place(p, { x: 56, z: 56 }); m.captive.x = -40; m.captive.z = -40;
    m.update(8); assert.equal(m.stage, 'extract');
    assert.equal(m.finished, false);
  } finally { sim.dispose(); }
});

test('DUST LANTERN: eliminating a defender does not end the one-player operation', async () => {
  const sim = await make(31415, 1);
  try {
    const defender = sim.fighters.find((f) => f.npc);
    assert.ok(defender?.alive);
    sim.damage(defender, 9999, sim.player, { cause: 'bullet' });
    assert.equal(defender.alive, false);
    assert.equal(sim.state, 'playing');
    assert.equal(sim.mission.stage, 'recon');
  } finally { sim.dispose(); }
});
