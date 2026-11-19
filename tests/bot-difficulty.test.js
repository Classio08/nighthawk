// Bot difficulty: harder bots react faster and aim better; nobody cheats; a duel between a brutal and an easy bot favours the brutal one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/world.js';
import { insideAnyBox } from '../src/sim/map.js';
import { DIFFICULTY_IDS } from '../src/sim/difficulty.js';

const DT = 1 / 60;
const idle = () => ({ yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, fire: false, ads: false, reload: false, slot: 0, grenade: false });
const lerp = (a, b, t) => a + (b - a) * t;

test('a match created with a difficulty gives every bot the matching reaction time and aim error', async () => {
  const brains = {};
  for (const id of DIFFICULTY_IDS) {
    const sim = await Simulation.create({ seed: 5, bots: 6, humans: [{ operator: 'roms' }], guards: 0, squads: false, difficulty: id });
    brains[id] = sim.fighters.filter((f) => f.brain).map((f) => f.brain);
    assert.ok(brains[id].every((b) => b.diff.id === id));
  }
  const avg = (id, k) => brains[id].reduce((s, b) => s + b[k], 0) / brains[id].length;
  for (const k of ['reaction', 'aimErr']) for (let i = 1; i < DIFFICULTY_IDS.length; i++) assert.ok(avg(DIFFICULTY_IDS[i], k) < avg(DIFFICULTY_IDS[i - 1], k), `${k}: ${DIFFICULTY_IDS[i]} < ${DIFFICULTY_IDS[i - 1]}`);
  for (let i = 1; i < DIFFICULTY_IDS.length; i++) assert.ok(avg(DIFFICULTY_IDS[i], 'turnSpeed') > avg(DIFFICULTY_IDS[i - 1], 'turnSpeed'), 'harder bots turn faster');
});

test('normal is exactly the tuned behaviour; setDifficulty re-derives from the same base skill (no drift when switching back and forth)', async () => {
  const sim = await Simulation.create({ seed: 5, bots: 2, humans: [{ operator: 'roms' }], guards: 0, squads: false });
  const b = sim.fighters.find((f) => f.brain).brain;
  assert.equal(b.diff.id, 'normal');
  assert.equal(b.reaction, lerp(1.0, 0.4, b.skill)); assert.equal(b.aimErr, lerp(0.11, 0.035, b.skill)); assert.equal(b.trickRate, 1);
  const r0 = b.reaction, a0 = b.aimErr, s0 = b.skill;
  b.setDifficulty('brutal'); b.setDifficulty('easy'); b.setDifficulty('normal');
  assert.deepEqual([b.reaction, b.aimErr, b.skill], [r0, a0, s0]);
  b.setDifficulty('bogus'); assert.equal(b.diff.id, 'normal');
  b.setDifficulty('brutal'); assert.ok(b.skill > s0 && b.skill <= 0.99);
  b.setDifficulty('easy'); assert.ok(b.skill < s0 && b.skill >= 0.1);
});

/** one bot of each level, 22 m apart in the open, both with the same gun; returns [damage dealt by brutal, damage dealt by easy] after `secs` */
async function duel(seed, secs = 14) {
  const sim = await Simulation.create({ seed, bots: 2, humans: [{ operator: 'roms' }], guards: 0, squads: false, loot: false, vehicles: false });
  sim.zone.radius = 500; sim.zone.update = () => {};
  const [p, a, b] = sim.fighters, W = sim.world;
  const tp = (f, x, z) => { f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); W.propagateModifiedBodyPositionsToColliders(); f.vy = 0; f.x = x; f.y = 0.9; f.z = z; };
  let spot = null;                                            // an open 30 m line
  for (let x = -80; x <= 80 && !spot; x += 5) for (let z = 80; z > -50 && !spot; z -= 5) {
    let ok = true; for (let d = 0; d <= 26 && ok; d += 2) for (let dx = -8; dx <= 8 && ok; dx += 4) if (insideAnyBox(sim.map, x + dx, z - d, 2.5)) ok = false;
    if (ok) spot = { x, z };
  }
  tp(p, 100, 100); p.hp = p.maxHp = 1e9;
  for (const f of [a, b]) { f.weapons.ar = { ammo: 30, reserve: 300, have: true }; f.cur = 'ar'; f.brain.main = 'ar'; f.hp = f.maxHp = 400; }
  a.brain.setDifficulty('brutal'); b.brain.setDifficulty('easy');
  tp(a, spot.x, spot.z); tp(b, spot.x, spot.z - 22); a.yaw = Math.PI; b.yaw = 0;
  let dmgA = 0, dmgB = 0;
  for (let i = 0; i < secs * 60; i++) { sim.step(DT, idle()); }
  dmgA = b.maxHp - Math.max(0, b.hp); dmgB = a.maxHp - Math.max(0, a.hp);
  return [dmgA, dmgB];
}

test('in a face-to-face duel the brutal bot out-damages the easy bot (over several seeds)', async () => {
  let wins = 0, losses = 0, totA = 0, totB = 0; const log = [];
  for (const seed of [11, 12, 13, 14, 15]) { const [a, b] = await duel(seed); totA += a; totB += b; log.push(`${a.toFixed(0)}:${b.toFixed(0)}`); if (a > b) wins++; else if (b > a) losses++; }
  assert.equal(losses, 0, `the easy bot never won a duel (${log.join(' ')})`);
  assert.ok(wins >= 3, `brutal out-damaged easy in ${wins}/5 duels (${log.join(' ')}); the rest were stand-offs where nobody landed a shot`);
  assert.ok(totA > totB * 3, `and by a clear margin (${totA.toFixed(0)} vs ${totB.toFixed(0)})`);
});
