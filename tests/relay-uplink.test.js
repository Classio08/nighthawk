import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, MISSION_FIGHTER_CAP } from '../src/sim/world.js';
import { MISSIONS, MISSION_IDS, createMission } from '../src/sim/missions.js';
import { RelayUplinkMission, UPLINK, WAVES, RAIDER, compassOf } from '../src/sim/relay-uplink.js';
import { PERSONALITIES } from '../src/sim/personality.js';
import { idleCmd } from '../src/sim/cmd.js';

const make = (seed = 777, extra = {}) => Simulation.create({ seed, bots: 0, guards: 4, mission: 'relay-uplink', loot: false, contracts: false, ...extra });
const place = (f, p) => { f.x = p.x; f.z = p.z; f.rb.setTranslation({ x: p.x, y: 0.9, z: p.z }, true); };
const step = (sim, secs, cmd) => { for (let i = 0; i < Math.round(secs * 60); i++) sim.step(1 / 60, { ...idleCmd(), yaw: sim.player.yaw, ...cmd }); };
const mEvents = (sim, phase) => sim.drainEvents().filter((e) => e.t === 'mission' && (!phase || e.phase === phase));
const startHack = (sim) => { const m = sim.mission; place(sim.player, { x: m.tower.x + 2, z: m.tower.z }); step(sim, 0.1, { use: true }); return m; };
const intoHold = (sim) => { const m = startHack(sim); step(sim, UPLINK.HACK_T + 0.3); return m; };

test('registry: RELAY UPLINK is a real operation, built from the seed deterministically', async () => {
  assert.ok(MISSION_IDS.includes('relay-uplink')); assert.equal(MISSIONS['relay-uplink'].name, 'RELAY UPLINK');
  const a = await make(5), b = await make(5), c = await make(6);
  assert.ok(a.mission instanceof RelayUplinkMission); assert.equal(createMission('relay-uplink', a).id, 'relay-uplink');
  assert.deepEqual(a.mission.tower, b.mission.tower); assert.deepEqual(a.mission.bearings, b.mission.bearings); assert.deepEqual(a.mission.insertion, b.mission.insertion);
  assert.notDeepEqual(a.mission.bearings, c.mission.bearings, 'a different seed brings the raiders from different lines');
  assert.equal(a.mission.stage, 'approach'); assert.equal(a.stealth.viperEnabled, false, 'VIPER belongs to SIGNAL BLACKOUT only'); assert.equal(a.stealth.lightsEnabled, false);
  assert.ok(Math.hypot(a.mission.guardPost.x - a.mission.tower.x, a.mission.guardPost.z - a.mission.tower.z) > 40, 'the garrison does not sit on the tower');
});

test('the owner numbers: 60 s hold, waves of three, five, seven', () => {
  assert.equal(UPLINK.HOLD_T, 60); assert.deepEqual(WAVES.map((w) => w.guns.length), [3, 5, 7]);
  assert.ok(WAVES.every((w, i) => i === 0 || w.at > WAVES[i - 1].at), 'waves are in time order');
  assert.ok(WAVES[2].at + UPLINK.RING / RAIDER.SPEED < UPLINK.HOLD_T, 'the last wave arrives while the hold is still running');
});

test('the hack: E must be at the tower, a hit or walking off cancels it, finishing it opens the hold', async () => {
  const sim = await make(); const m = sim.mission, p = sim.player;
  place(p, { x: m.tower.x + 30, z: m.tower.z }); step(sim, 0.1, { use: true }); assert.equal(m.stage, 'approach', 'too far: E does nothing');
  const m2 = startHack(sim); assert.equal(m2.stage, 'hack'); assert.ok(mEvents(sim, 'hack').length === 1);
  step(sim, 1); place(p, { x: m.tower.x + 15, z: m.tower.z }); step(sim, 0.2);
  assert.equal(m.stage, 'approach'); assert.equal(m.hackFails, 1); assert.equal(mEvents(sim, 'hackfail')[0]?.reason, 'moved');
  startHack(sim); step(sim, 1); p.hp -= 10; step(sim, 0.1);
  assert.equal(m.hackFails, 2); assert.equal(m.stage, 'approach'); assert.equal(mEvents(sim, 'hackfail').pop()?.reason, 'hit'); p.hp = p.maxHp;
  startHack(sim); step(sim, UPLINK.HACK_T + 0.3);
  assert.equal(m.stage, 'hold'); assert.equal(m.hackFails, 2); assert.equal(mEvents(sim, 'uplink').length, 1);
});

test('waves: three, then five, then seven raiders from three lines, spawned only through the audited path', async () => {
  const sim = await make(); const m = intoHold(sim); const p = sim.player;
  const before = sim.fighters.length;
  assert.equal(m.waveIndex, 1, 'wave 1 is on the clock at 0'); assert.equal(m.raiders.length, 3);
  const ring = m.raiders.map((r) => Math.hypot(r.x - m.tower.x, r.z - m.tower.z));       // measured at the moment they appear
  assert.ok(ring.every((d) => d > 20), `they start well away from the tower (${ring.map((d) => d.toFixed(0))})`);
  const w1 = mEvents(sim, 'wave'); assert.equal(w1.length, 1); assert.equal(w1[0].count, 3); assert.equal(w1[0].dirs.length, 3, 'three different directions');
  p.hp = p.maxHp = 1e6; step(sim, WAVES[1].at - m.holdClock + 0.2); assert.equal(m.raiders.length, 8); assert.equal(m.waveIndex, 2);
  step(sim, WAVES[2].at - m.holdClock + 0.2); assert.equal(m.raiders.length, 15); assert.equal(m.waveIndex, 3);
  assert.equal(sim.fighters.length, before + 12, 'only mission fighters were added, and every old id and index is untouched');
  sim.fighters.forEach((f, i) => assert.equal(f.id, i, 'ids stay equal to their index'));
  for (const r of m.raiders) {
    assert.equal(r.npc, true); assert.equal(r.brain.p, PERSONALITIES.raider); assert.equal(r.brain.p.guard, true, 'a guard-type brain: raiders and garrison never shoot each other');
    assert.equal(r.maxHp, RAIDER.HP); assert.equal(r.brain.post.x, m.tower.x);
  }
  assert.equal(sim.aliveCount(), 1, 'raiders are NPCs: they do not count as players');
});

test('the garrison alert never hijacks raiders, and a raider body gives no disguise', async () => {
  const sim = await make(); const m = intoHold(sim); const r = m.raiders[0];
  sim.alertGarrison({ x: 0, z: 0 }, 1);
  assert.equal(r.brain.post.x, m.tower.x); assert.equal(r.brain.alertHome, undefined, 'raiders keep the tower as their post');
  const g = sim.fighters.find((f) => f.npc && f.brain?.p.guard && !f.brain.p.raider); assert.ok(g.brain.alertHome, 'while the garrison does redeploy');
  r.hp = 0; sim._kill(r, sim.player, { w: 'ar' }); place(sim.player, { x: r.x + 1, z: r.z });
  assert.equal(sim.stealth.takeUniform(sim.player), false); assert.equal(sim.player.disguiseT, 0);
});

test('a stolen garrison jacket never fools a raider (they are sent for the operator), while it still fools the garrison', async () => {
  const { disguiseFools } = await import('../src/sim/disguise.js');
  const live = { alive: true, disguiseT: 20 }, raider = { brain: { p: { guard: true, raider: true } } }, guard = { brain: { p: { guard: true } } };
  assert.equal(disguiseFools(guard, live, 30, 'routine'), true); assert.equal(disguiseFools(raider, live, 30, 'routine'), false);
});

test('the hold: progress only counts inside the circle, leaving stalls then bleeds it back, coming back resumes (one break per departure)', async () => {
  const sim = await make(); const m = intoHold(sim); const p = sim.player; p.hp = p.maxHp = 1e6; m.raiders.forEach((r) => { r.hp = 0; sim._kill(r, p, { w: 'ar' }); });
  place(p, { x: m.tower.x + 3, z: m.tower.z }); const u0 = m.uplink; step(sim, 10);
  assert.ok(Math.abs(m.uplink - u0 - 10) < 0.2, `10 s inside = 10 s of uplink (got ${m.uplink - u0})`); assert.equal(m.holdBreaks, 0);
  place(p, { x: m.tower.x + UPLINK.CIRCLE + 8, z: m.tower.z }); const u1 = m.uplink; step(sim, 1);
  assert.equal(m.broken, false, 'a short step out is inside the grace window'); assert.ok(Math.abs(m.uplink - u1) < 0.05, 'and the upload just pauses');
  step(sim, 4); assert.equal(m.broken, true); assert.equal(m.holdBreaks, 1); assert.ok(m.uplink < u1, 'then it bleeds back'); assert.ok(m.uplink > u1 - 4, 'slower than it fills');
  step(sim, 3); assert.equal(m.holdBreaks, 1, 'staying out is still one break');
  place(p, { x: m.tower.x + 3, z: m.tower.z }); step(sim, 0.2); assert.equal(m.broken, false); assert.equal(mEvents(sim, 'holdresume').length, 1);
  assert.ok(m.holdClock > 18, `the wave clock never paused while you were out (${m.holdClock.toFixed(1)})`);
});

test('a full run with an immortal, auto-aiming operator reaches the pad: hold, send, run, extract, win', { timeout: 120000 }, async () => {
  const sim = await make(11); const m = startHack(sim); const p = sim.player;
  p.hp = p.maxHp = 1e6;
  step(sim, UPLINK.HACK_T + 0.3); assert.equal(m.stage, 'hold');
  for (let i = 0; i < 60 * 80 && m.stage === 'hold'; i++) {                                    // aim at the nearest living raider and shoot; stay on the tower
    p.hp = p.maxHp;
    const t = m.raiders.filter((r) => r.alive).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    const cmd = t ? { yaw: Math.atan2(-(t.x - p.x), -(t.z - p.z)), pitch: Math.atan2(t.y + 0.4 - p.eyeY, Math.max(1, Math.hypot(t.x - p.x, t.z - p.z))), fire: true } : { yaw: p.yaw };
    sim.step(1 / 60, { ...idleCmd(), ...cmd });
  }
  assert.equal(m.stage, 'extract', 'the uplink completed'); assert.equal(m.uplink, UPLINK.HOLD_T); assert.equal(m.waveIndex, 3);
  assert.ok(m.raidersKilled > 0, 'the waves are killable'); assert.equal(m.holdBreaks, 0);
  assert.equal(mEvents(sim, 'sent').length, 1);
  place(p, { x: m.extraction.x, z: m.extraction.z }); step(sim, UPLINK.EXTRACT_T + 0.5);
  assert.equal(m.stage, 'complete'); assert.equal(sim.state, 'won'); assert.equal(sim.result.missionId, 'relay-uplink');
  const s = m.stats(true); assert.equal(s.won, true); assert.equal(s.wavesSpawned, 3); assert.equal(s.raidersTotal, 15); assert.equal(s.taskFails, 0); assert.equal(s.found, 2);
  assert.ok(Object.values(s).every((v) => typeof v !== 'number' || Number.isFinite(v)), 'no NaN in the stats');
});

test('the window closing, and the operator being lost, both end the operation as a failure', async () => {
  const sim = await make(); const m = sim.mission; m.elapsed = UPLINK.TIME_LIMIT - 0.05; step(sim, 0.2);
  assert.equal(m.finished, true); assert.equal(m.reason, 'time'); assert.equal(sim.state, 'lost'); assert.equal(sim.result.reason, 'time'); assert.equal(m.stats(false).won, false);
  const sim2 = await make(); intoHold(sim2); const p = sim2.player; p.hp = 1; step(sim2, 20);
  assert.equal(p.alive, false, 'an idle operator does not survive the first waves'); assert.equal(sim2.state, 'lost');
});

test('snapshot: plain numbers and strings only, same shape in every stage', async () => {
  const sim = await make(); const keys = Object.keys(sim.mission.snapshot()).sort();
  for (const stage of ['approach', 'hack', 'hold', 'extract']) {
    sim.mission.stage = stage; const snap = sim.mission.snapshot();
    assert.deepEqual(Object.keys(snap).sort(), keys); assert.doesNotThrow(() => JSON.parse(JSON.stringify(snap)));
    const hud = sim.mission.hudInfo(sim.player); assert.equal(typeof hud.objective, 'string'); assert.ok(hud.bar >= 0 && hud.bar <= 1, `${stage} bar ${hud.bar}`);
  }
  for (const phase of ['hack', 'hackfail', 'uplink', 'holdbreak', 'holdresume', 'sent', 'timewarn']) assert.ok(sim.mission.eventMessage({ t: 'mission', phase, secs: 10, reason: 'hit' })?.text, phase);
  assert.ok(sim.mission.eventMessage({ t: 'mission', phase: 'wave', n: 2, count: 5, dirs: ['N', 'SE'] }).text.includes('FROM N, SE'));
});

test('spawnMissionFighter: the single audited spawn path refuses outside an operation, and past the cap', async () => {
  const plain = await Simulation.create({ seed: 3, bots: 2, guards: 0, loot: false, contracts: false });
  const n = plain.fighters.length;
  assert.equal(plain.spawnMissionFighter({ id: 'x', name: 'X', color: '#fff', hp: 100, speed: 9, weapon: 'smg' }, { x: 0, z: 0 }), null, 'a normal / online-style match can never gain a fighter this way');
  assert.equal(plain.fighters.length, n);
  const sim = await make(); const op = { id: 'x', name: 'X', color: '#fff', hp: 100, speed: 9, weapon: 'smg' };
  const f = sim.spawnMissionFighter(op, { x: 10, z: 10 }); assert.ok(f); assert.equal(f.npc, true); assert.equal(sim.fighters.at(-1), f);
  while (sim.fighters.length < MISSION_FIGHTER_CAP) sim.spawnMissionFighter(op, { x: 10, z: 10 });
  assert.equal(sim.spawnMissionFighter(op, { x: 10, z: 10 }), null); assert.equal(sim.fighters.length, MISSION_FIGHTER_CAP);
});

test('compassOf: north is -z, east is +x', () => {
  const o = { x: 0, z: 0 };
  assert.equal(compassOf(o, { x: 0, z: -10 }), 'N'); assert.equal(compassOf(o, { x: 10, z: 0 }), 'E'); assert.equal(compassOf(o, { x: 0, z: 10 }), 'S');
  assert.equal(compassOf(o, { x: -10, z: 0 }), 'W'); assert.equal(compassOf(o, { x: 10, z: -10 }), 'NE'); assert.equal(compassOf(o, { x: -10, z: 10 }), 'SW');
});
