import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/world.js';
import { insideAnyBox } from '../src/sim/map.js';
import { MISSIONS, MISSION_IDS, createMission, SignalBlackoutMission, TASK, TRACE_T } from '../src/sim/missions.js';

const make = (seed = 777, guards = 0) => Simulation.create({ seed, bots: 0, guards, mission: 'signal-blackout', loot: false, contracts: false });
const place = (f, p) => { f.x = p.x; f.z = p.z; f.rb.setTranslation({ x: p.x, y: 0.9, z: p.z }, true); };
const events = (sim) => sim.drainEvents().filter((e) => e.t === 'mission');
const tick = (m, secs) => { for (let i = 0; i < Math.round(secs * 60); i++) m.update(1 / 60); };

test('registry: both operations are registered, unknown ids give no mission, ids on the objects match', async () => {
  assert.deepEqual(MISSION_IDS.sort(), ['dust-lantern', 'signal-blackout']);
  for (const id of MISSION_IDS) assert.equal(MISSIONS[id].id, id);
  assert.equal(createMission('nope', {}), null); assert.equal(createMission(undefined, {}), null);
  const a = await make(), b = await Simulation.create({ seed: 5, bots: 0, guards: 0, mission: 'dust-lantern', loot: false, contracts: false });
  try {
    assert.equal(a.mission.id, 'signal-blackout'); assert.ok(a.mission instanceof SignalBlackoutMission); assert.equal(b.mission.id, 'dust-lantern');
    for (const sim of [a, b]) {                            // every operation offers the same UI surface
      const info = sim.mission.hudInfo(sim.player);
      assert.ok(info.title && info.objective && info.detail && info.progress && info.bar >= 0 && info.bar <= 1, JSON.stringify(info));
      assert.ok(Array.isArray(sim.mission.mapMarkers(sim.player)));
      assert.equal(typeof sim.mission.debrief(true), 'string'); assert.equal(typeof sim.mission.debrief(false), 'string');
      assert.ok(Number.isInteger(sim.mission.objectivesDone));
    }
    assert.equal(a.contracts.off, true);
  } finally { a.dispose(); b.dispose(); }
});

test('SIGNAL BLACKOUT: setup is deterministic per seed; three relays on three different sites, all on open ground, you land away from them', async () => {
  const a = await make(11), b = await make(11), c = await make(12), d = await make(13);
  try {
    const sig = (s) => JSON.stringify(s.mission.nodes.map(({ id, x, z, site }) => ({ id, x, z, site })));
    assert.equal(sig(a), sig(b));
    assert.ok([sig(a), sig(c), sig(d)].some((x, i, all) => x !== all[0]), 'different seeds can pick different relays');
    for (const s of [a, c, d]) {
      const m = s.mission;
      assert.equal(m.nodes.length, 3); assert.equal(new Set(m.nodes.map((n) => n.site)).size, 3);
      for (const n of [...m.nodes, m.insertion, m.guardPost]) { assert.ok(Number.isFinite(n.x) && Number.isFinite(n.z)); assert.ok(!insideAnyBox(s.map, n.x, n.z, 1), `inside a building: ${n.x},${n.z}`); }
      assert.ok(Math.hypot(s.player.x - m.insertion.x, s.player.z - m.insertion.z) < 3, 'the player spawns at the insertion point');
      assert.ok(m.nodes.every((n) => Math.hypot(n.x - m.insertion.x, n.z - m.insertion.z) > 25), 'no relay right where you land');
    }
  } finally { for (const s of [a, b, c, d]) s.dispose(); }
});

test('SIGNAL BLACKOUT: E only starts a task near an unfinished relay; a far press falls through (to vehicles)', async () => {
  const sim = await make();
  try {
    const m = sim.mission, p = sim.player;
    place(p, { x: m.nodes[0].x + 30, z: m.nodes[0].z }); assert.equal(m.interact(p), false); assert.equal(m.active, null);
    place(p, { x: m.nodes[0].x + 2, z: m.nodes[0].z }); assert.equal(m.interact(p), true); assert.equal(m.active, m.nodes[0]);
    const ev = events(sim); assert.ok(ev.some((e) => e.phase === 'task' && e.id === m.nodes[0].id));
    assert.equal(m.interact(p), true, 'a second press while splicing is swallowed'); assert.equal(events(sim).length, 0, 'and does not restart the task');
    p.alive = false; assert.equal(m.interact(p), false); p.alive = true;
  } finally { sim.dispose(); }
});

test('SIGNAL BLACKOUT: a task needs TASK.T seconds in range; walking off or being hit cancels it and loses the progress', async () => {
  const sim = await make();
  try {
    const m = sim.mission, p = sim.player, n = m.nodes[0];
    place(p, { x: n.x + 1, z: n.z }); m.interact(p); events(sim);
    tick(m, TASK.T - 0.5); assert.ok(m.active && m.active.progress > TASK.T - 0.7 && !n.done, 'not done a half second early');
    place(p, { x: n.x + TASK.HOLD_RANGE + 2, z: n.z }); tick(m, 0.05);
    assert.equal(m.active, null); assert.equal(n.progress, 0); assert.ok(events(sim).some((e) => e.phase === 'taskfail' && e.reason === 'moved'));
    place(p, { x: n.x + 1, z: n.z }); m.interact(p); tick(m, 2);
    p.hp -= 10; tick(m, 0.05);
    assert.equal(m.active, null); assert.equal(n.progress, 0); assert.ok(events(sim).some((e) => e.phase === 'taskfail' && e.reason === 'hit'));
    p.hp = p.maxHp;
    place(p, { x: n.x + 1, z: n.z }); m.interact(p); tick(m, TASK.T + 0.1);
    assert.ok(n.done && m.active === null && m.doneCount === 1);
    const ev = events(sim); assert.ok(ev.some((e) => e.phase === 'taskdone' && e.count === 1 && e.name === n.name));
    assert.equal(m.interact(p), false, 'a finished relay is not a task any more');
  } finally { sim.dispose(); }
});

test('SIGNAL BLACKOUT: starting a second task cancels the first; healing does not count as being hit', async () => {
  const sim = await make();
  try {
    const m = sim.mission, p = sim.player, [a, b] = m.nodes;
    place(p, { x: a.x + 1, z: a.z }); m.interact(p); tick(m, 2);
    p.hp = Math.max(1, p.hp - 30); m.lastHp = p.hp; p.hp += 20; tick(m, 0.05); assert.equal(m.active, a, 'gaining hp is fine');
    place(p, { x: b.x + 1, z: b.z }); m.interact(p);
    assert.equal(m.active, b); assert.equal(a.progress, 0);
  } finally { sim.dispose(); }
});

test('SIGNAL BLACKOUT: three relays unlock extraction; extraction needs four seconds on the pad; then the operation is won', async () => {
  const sim = await make();
  try {
    const m = sim.mission, p = sim.player;
    for (const n of m.nodes) { place(p, { x: n.x + 1, z: n.z }); assert.equal(m.interact(p), true); tick(m, TASK.T + 0.1); }
    assert.equal(m.doneCount, 3); assert.equal(m.stage, 'extract');
    assert.ok(events(sim).some((e) => e.phase === 'unlocked'));
    place(p, { x: m.extraction.x - 40, z: m.extraction.z }); tick(m, 6); assert.equal(m.stage, 'extract', 'not at the pad');
    place(p, m.extraction); tick(m, 3.9); assert.equal(m.stage, 'extract'); tick(m, 0.3);
    assert.equal(m.stage, 'complete'); assert.equal(sim.state, 'won');
    const end = sim.drainEvents().find((e) => e.t === 'end'); assert.ok(end && end.won && end.mission && end.clues === 3);
    assert.match(m.debrief(true), /3|all relays/i);
  } finally { sim.dispose(); }
});

test('SIGNAL BLACKOUT: the trace locking on fails the operation even if the operator is alive, and warns first', async () => {
  const sim = await make();
  try {
    const m = sim.mission, p = sim.player;
    place(p, { x: m.insertion.x, z: m.insertion.z });
    tick(m, TRACE_T - 59.5);
    assert.ok(events(sim).some((e) => e.phase === 'trace' && e.secs === 60), 'a 60 second warning');
    assert.equal(m.finished, false);
    tick(m, 61);
    assert.equal(m.finished, true); assert.equal(m.stage, 'failed'); assert.equal(m.reason, 'trace'); assert.equal(sim.state, 'lost'); assert.ok(p.alive);
    const end = sim.drainEvents().find((e) => e.t === 'end'); assert.ok(end && end.won === false && end.reason === 'trace');
    assert.match(m.debrief(false), /trace/i);
    const snap = m.snapshot(); assert.equal(snap.id, 'signal-blackout'); assert.equal(snap.trace, 0);
    JSON.stringify(snap);
  } finally { sim.dispose(); }
});

test('SIGNAL BLACKOUT: jamming a relay is loud (the garrison is sent to it) and finishing one sweeps the guards to the next', async () => {
  const sim = await make(777, 4);
  try {
    const m = sim.mission, p = sim.player, [a, b] = m.nodes, guard = sim.fighters.find((f) => f.npc && f.brain?.p.guard);
    assert.ok(guard);
    place(p, { x: a.x + 1, z: a.z }); m.interact(p);
    assert.ok(Math.hypot(guard.brain.post.x - a.x, guard.brain.post.z - a.z) < 1, 'the garrison post moved to the relay being jammed');
    tick(m, TASK.T + 0.1);
    assert.ok(Math.hypot(guard.brain.post.x - b.x, guard.brain.post.z - b.z) < 1, 'and then to the next unfinished relay');
  } finally { sim.dispose(); }
});

test('SIGNAL BLACKOUT: eliminating a defender does not end the operation; the operator dying does', async () => {
  const sim = await make(777, 2);
  try {
    const g = sim.fighters.find((f) => f.npc); sim.damage(g, 9999, sim.player, { cause: 'bullet' });
    assert.equal(sim.state, 'playing'); assert.equal(sim.mission.stage, 'tasks');
    sim.damage(sim.player, 9999, null, { cause: 'bullet' });
    assert.notEqual(sim.state, 'playing');
  } finally { sim.dispose(); }
});
