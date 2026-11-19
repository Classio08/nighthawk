// Melee strike: reach, cone, wall check, cooldown, backstab kills, predictor behaviour, bots using it, and the network encodings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/world.js';
import { MELEE } from '../src/sim/melee.js';
import { idleCmd, sanitizeCmd } from '../src/sim/cmd.js';
import { packCmd, unpackCmd, CF } from '../src/net/protocol.js';

const DT = 1 / 60;
const BASE = { seed: 41, guards: 0, squads: false, barrelClusters: 0, weather: 'clear', contracts: false, vehicles: false, drop: false };
const mk = (o = {}) => Simulation.create({ ...BASE, ...o });
const tp = (sim, f, x, z) => { f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); sim.world.propagateModifiedBodyPositionsToColliders(); f.x = x; f.y = 0.9; f.z = z; };
const run = (sim, secs, c = {}) => { for (let i = 0; i < Math.round(secs * 60); i++) sim.step(DT, { ...idleCmd(), ...c }); };
/** two fighters 1.5 m apart on open ground: `a` (the player) at the origin of the spot facing -z, `b` in front of him */
async function duel(opts = {}) {
  const sim = await mk({ bots: 1, ...opts }); const a = sim.player, b = sim.fighters.find((f) => f !== a && !f.npc);
  b.brain = null; run(sim, 0.1);                                           // (the physics world answers ray queries only after its first step)
  let spot = null;
  for (let z = -30; z <= 30 && !spot; z += 6) for (let x = -50; x <= 20 && !spot; x += 7) if (sim.losClear(x, 1.6, z, x, 1.3, z - 4)) spot = { x, z };
  assert.ok(spot, 'open ground exists');
  tp(sim, a, spot.x, spot.z); tp(sim, b, spot.x, spot.z - 1.5); a.yaw = 0; a.pitch = 0;
  return { sim, a, b, spot };
}

test('head on: one hit for the front damage, a swing event naming the target, and the cooldown starts', async () => {
  const { sim, a, b } = await duel(); b.yaw = Math.PI;                       // b faces a
  const hp = b.hp;
  assert.equal(sim.melee(a), true);
  assert.equal(b.hp, hp - MELEE.FRONT); assert.ok(a.meleeT > 0.8);
  const ev = sim.drainEvents(); const m = ev.find((e) => e.t === 'melee');
  assert.deepEqual([m.by, m.hit, m.back], [a.id, b.id, false]);
  const h = ev.find((e) => e.t === 'hit'); assert.equal(h.cause, 'melee'); assert.equal(h.target, b.id);
  assert.equal(sim.melee(a), false, 'cooldown');
  run(sim, MELEE.COOLDOWN + 0.05); assert.equal(a.meleeT, 0);
  assert.equal(sim.melee(a), true, 'ready again'); sim.dispose();
});

test('from behind it is a kill, even through armour', async () => {
  const { sim, a, b } = await duel(); b.yaw = 0; b.armor = 100; b.armorLv = 3;          // b looks the same way as a: his back is to a
  sim.melee(a);
  assert.equal(b.alive, false); const ev = sim.drainEvents();
  assert.equal(ev.find((e) => e.t === 'melee').back, true);
  const k = ev.find((e) => e.t === 'kill'); assert.equal(k.by, a.id); assert.equal(k.w, 'melee'); assert.equal(k.cause, 'melee');
  sim.dispose();
});

test('reach, cone and walls: too far, behind me, or through a wall is a miss (but the swing still happens)', async () => {
  const { sim, a, b, spot } = await duel(); b.yaw = Math.PI;
  tp(sim, b, spot.x, spot.z - (MELEE.REACH + 1.5)); const hp = b.hp;
  assert.equal(sim.melee(a), true); assert.equal(b.hp, hp, 'too far'); sim.drainEvents();
  run(sim, 1);
  tp(sim, b, spot.x, spot.z + 1.5); assert.equal(sim.melee(a), true); assert.equal(b.hp, hp, 'behind me'); run(sim, 1);
  tp(sim, b, spot.x + 1.5, spot.z + 0.2); assert.equal(sim.melee(a), true); assert.equal(b.hp, hp, 'beside me, outside the cone'); run(sim, 1);
  tp(sim, b, spot.x, spot.z - 1.5); const los = sim.losClear.bind(sim); sim.losClear = () => false;
  assert.equal(sim.melee(a), true); assert.equal(b.hp, hp, 'a wall in between'); sim.losClear = los; run(sim, 1);
  assert.equal(sim.melee(a), true); assert.equal(b.hp, hp - MELEE.FRONT, 'and the same spot works with a clear line');
  sim.dispose();
});

test('the nearest fighter in front is the one who is hit', async () => {
  const { sim, a, b, spot } = await duel({ bots: 2 }); b.yaw = Math.PI;
  const c = sim.fighters.find((f) => f !== a && f !== b && !f.npc);
  assert.ok(c, 'a third fighter exists');
  { c.brain = null; tp(sim, c, spot.x + 0.3, spot.z - 2.1); c.yaw = Math.PI; const hpC = c.hp; sim.melee(a); assert.equal(c.hp, hpC, 'the farther one is untouched'); }
  assert.ok(b.hp < b.maxHp);
  sim.dispose();
});

test('no swing in the air, when dead, in a vehicle seat, and swinging cancels a medkit', async () => {
  const { sim, a } = await duel();
  a.air = 2; assert.equal(sim.melee(a), false); a.air = 0;
  a.veh = {}; assert.equal(sim.melee(a), false); a.veh = null;
  a.meds = 1; a.hp = 50; a.healT = 2; assert.equal(sim.melee(a), true); assert.equal(a.healT, 0);
  a.alive = false; a.meleeT = 0; assert.equal(sim.melee(a), false); a.alive = true;
  sim.dispose();
});

test('the key goes through a cmd: stepping with melee swings once, and not again until the cooldown is over', async () => {
  const { sim, a, b } = await duel(); b.yaw = Math.PI; const hp = b.hp;
  sim.step(DT, { ...idleCmd(), melee: true }); assert.equal(b.hp, hp - MELEE.FRONT);
  for (let i = 0; i < 30; i++) sim.step(DT, { ...idleCmd(), melee: true });     // key held down: still on cooldown
  assert.equal(b.hp, hp - MELEE.FRONT);
  sim.dispose();
});

test('a predicting browser plays the swing and starts the cooldown but never decides who is hit', async () => {
  const sim = await mk({ bots: 1, predictor: true }); const a = sim.player;
  assert.equal(sim.melee(a), true); assert.ok(a.meleeT > 0);
  const m = sim.drainEvents().find((e) => e.t === 'melee'); assert.deepEqual([m.by, m.hit], [a.id, -1]);
  sim.dispose();
});

test('a bot with someone right in front of it strikes (over several seeds, most do)', async () => {
  let struck = 0, tried = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const { sim, a, b } = await duel({ seed, bots: 2 });
    const bot = sim.fighters.find((f) => f !== a && f !== b && !f.npc && f.brain);
    if (!bot) { sim.dispose(); continue; }
    tried++;
    // bot stands where `a` was, facing b, who is 1.4 m away and stands still
    const spot = { x: a.x, z: a.z }; tp(sim, a, 100, 100); tp(sim, bot, spot.x, spot.z); tp(sim, b, spot.x, spot.z - 1.4);
    bot.brain.skill = 0.9; bot.yaw = 0; b.yaw = Math.PI; b.hp = b.maxHp;
    let did = false;
    for (let i = 0; i < 5 * 60 && !did; i++) { sim.step(DT, { ...idleCmd(), yaw: 0 }); for (const e of sim.drainEvents()) if (e.t === 'melee' && e.by === bot.id) did = true; }
    if (did) struck++;
    sim.dispose();
  }
  assert.ok(tried >= 6, `tried ${tried}`); assert.ok(struck >= Math.ceil(tried * 0.5), `${struck} of ${tried} bots struck`);
});

test('network: the key is command flag 4096, survives sanitising, and the cooldown rides the private self-state', async () => {
  assert.equal(CF.melee, 4096);
  const back = unpackCmd(JSON.parse(JSON.stringify(packCmd({ ...idleCmd(), melee: true, seq: 3 }))));
  assert.equal(back.melee, true); assert.equal(back.smoke, false); assert.equal(back.grenade, false);
  assert.equal(unpackCmd(packCmd({ ...idleCmd(), smoke: true })).melee, false);
  assert.equal(sanitizeCmd({ melee: 1 }).melee, true); assert.equal(sanitizeCmd({}).melee, false);
  const sim = await mk({ bots: 0 }); const p = sim.player; p.meleeT = 0.5;
  const self = JSON.parse(JSON.stringify(p.exportSelf())); assert.equal(self.mlT, 0.5);
  p.meleeT = 0; p.importSelf(self); assert.equal(p.meleeT, 0.5);
  sim.dispose();
});
