// Loot: deterministic layout, pickups, armor, medkits, death drops, airdrop crates, bots that loot and heal, wire format.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/world.js';
import { LootSystem, ARMOR, ARMOR_ABSORB, MED_HEAL, HEAL_T, PICK_R } from '../src/sim/loot.js';
import { WEAPONS, SLOT_ORDER } from '../src/sim/weapons.js';
import { insideAnyBox } from '../src/sim/map.js';
import { packSnapshot, packCmd, unpackCmd } from '../src/net/protocol.js';
import { idleCmd, sanitizeCmd } from '../src/sim/cmd.js';

const DT = 1 / 60;
let W = null;
const tp = (f, x, z) => { f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); W.propagateModifiedBodyPositionsToColliders(); f.vy = 0; f.x = x; f.y = 0.9; f.z = z; };
const run = (sim, secs, cmd = idleCmd()) => { for (let i = 0; i < Math.round(secs * 60); i++) sim.step(DT, cmd); };
async function arena(opts = {}) {
  const sim = await Simulation.create({ seed: 41, bots: 3, guards: 0, squads: false, barrelClusters: 0, weather: 'clear', contracts: false, vehicles: false, loot: true, ...opts });
  W = sim.world;
  for (const f of sim.fighters) { f.brain = null; f.maxHp = f.hp = 100; }
  sim.zone.radius = 500; sim.zone.update = () => {};
  for (const f of sim.fighters) if (f !== sim.player) tp(f, -100 + sim.fighters.indexOf(f) * 3, 100);
  return sim;
}
const clearItems = (sim) => { for (const it of [...sim.loot.items]) sim.loot._remove(it); };
const put = (sim, o) => sim.loot._add({ qty: 0, qty2: 0, sub: '', ...o }, true);
const stand = (sim, f, it) => { tp(f, it.x, it.z); sim.loot.update(); };

test('loot: off by default (older modes keep every gun); a loot match starts with a pistol only', async () => {
  const a = await Simulation.create({ seed: 5, bots: 2, vehicles: false });
  assert.equal(a.loot.items.length, 0);
  assert.ok(SLOT_ORDER.every((k) => a.player.weapons[k].have));
  const b = await Simulation.create({ seed: 5, bots: 2, vehicles: false, loot: true });
  assert.equal(b.player.cur, 'pistol');
  assert.ok(SLOT_ORDER.filter((k) => k !== 'pistol').every((k) => !b.player.weapons[k].have));
  assert.equal(b.player.armor, 0); assert.equal(b.player.meds, 0);
  assert.ok(b.loot.items.length >= 100);
});

test('loot: the same seed gives the same items in the server, a second game and a browser predictor; none inside a building', async () => {
  const a = await Simulation.create({ seed: 77, bots: 2, vehicles: false, loot: true, mapSeed: 7 });
  const b = await Simulation.create({ seed: 77, bots: 0, vehicles: false, loot: true, mapSeed: 7, predictor: true });
  const c = await Simulation.create({ seed: 78, bots: 2, vehicles: false, loot: true, mapSeed: 7 });
  const key = (s) => s.loot.items.map((i) => [i.id, i.type, i.sub, Math.round(i.x * 100), Math.round(i.z * 100), i.qty, i.qty2].join(',')).join('|');
  assert.equal(key(a), key(b)); assert.notEqual(key(a), key(c));
  for (const it of a.loot.items) assert.ok(!insideAnyBox(a.map, it.x, it.z, 0.5), `item ${it.id} inside a building`);
  const types = new Set(a.loot.items.map((i) => i.type)); for (const t of ['weapon', 'ammo', 'med', 'armor', 'nade']) assert.ok(types.has(t), t);
  assert.ok(a.loot.items.some((i) => i.type === 'weapon' && i.sub === 'dmr') || a.loot.items.some((i) => i.type === 'weapon' && i.sub === 'lmg'));
});

test('loot: walking over a gun takes it, equips it from the pistol and removes it for everyone; it is all-or-nothing', async () => {
  const sim = await arena(); clearItems(sim);
  const me = sim.player, g = put(sim, { type: 'weapon', sub: 'ar', x: 10, z: 10, qty: 30, qty2: 90 });
  tp(me, g.x + PICK_R + 1, g.z); sim.loot.update(); assert.ok(!g.gone, 'too far');
  stand(sim, me, g);
  assert.ok(g.gone); assert.ok(me.weapons.ar.have); assert.equal(me.weapons.ar.ammo, 30); assert.equal(me.weapons.ar.reserve, 90); assert.equal(me.cur, 'ar');
  const ev = sim.drainEvents().filter((e) => e.t === 'pickup'); assert.equal(ev.length, 1); assert.equal(ev[0].sub, 'ar'); assert.equal(ev[0].by, me.id);
  // a second copy of a gun I own only gives ammo; a full gun refuses it
  const g2 = put(sim, { type: 'weapon', sub: 'ar', x: 12, z: 10, qty: 30, qty2: 60 }); me.weapons.ar.reserve = 10; stand(sim, me, g2);
  assert.ok(g2.gone); assert.equal(me.weapons.ar.reserve, 10 + 90);
  const g3 = put(sim, { type: 'weapon', sub: 'ar', x: 14, z: 10, qty: 30, qty2: 60 }); me.weapons.ar.reserve = Math.round(WEAPONS.ar.reserve * 1.5); stand(sim, me, g3);
  assert.ok(!g3.gone, 'full of ammo: leave it');
});

test('loot: ammo only for guns you have; medkits and grenades stop at their limits; armor only if it is better', async () => {
  const sim = await arena(); clearItems(sim); const me = sim.player;
  const a1 = put(sim, { type: 'ammo', sub: 'dmr', x: 20, z: 20, qty: 20 }); stand(sim, me, a1); assert.ok(!a1.gone, 'no dmr, no dmr ammo');
  const a2 = put(sim, { type: 'ammo', sub: 'pistol', x: 22, z: 20, qty: 24 }); me.weapons.pistol.reserve = 10; stand(sim, me, a2); assert.ok(a2.gone); assert.equal(me.weapons.pistol.reserve, 34);
  me.meds = 3; const m = put(sim, { type: 'med', x: 24, z: 20, qty: 2 }); stand(sim, me, m); assert.ok(m.gone); assert.equal(me.meds, 4);
  const m2 = put(sim, { type: 'med', x: 26, z: 20, qty: 1 }); stand(sim, me, m2); assert.ok(!m2.gone, 'at the medkit limit');
  me.nades = 3; const n = put(sim, { type: 'nade', x: 28, z: 20, qty: 2 }); stand(sim, me, n); assert.ok(n.gone); assert.equal(me.nades, 4);
  const v2 = put(sim, { type: 'armor', sub: '2', x: 30, z: 20, qty: ARMOR[2].pts }); stand(sim, me, v2); assert.ok(v2.gone); assert.equal(me.armor, ARMOR[2].pts); assert.equal(me.armorLv, 2);
  const v1 = put(sim, { type: 'armor', sub: '1', x: 32, z: 20, qty: ARMOR[1].pts }); stand(sim, me, v1); assert.ok(!v1.gone, 'worse vest: ignore');
  const v3 = put(sim, { type: 'armor', sub: '3', x: 34, z: 20, qty: ARMOR[3].pts }); stand(sim, me, v3); assert.ok(v3.gone); assert.equal(me.armorLv, 3);
});

test('armor: soaks a share of body shots and blasts, never head shots, and breaks when used up', async () => {
  const sim = await arena(); const [me, foe] = [sim.player, sim.fighters[1]];
  me.armor = 40; me.armorLv = 1; me.hp = 100;
  sim.damage(me, 20, foe, { cause: 'bullet', head: false });
  assert.ok(Math.abs(me.armor - (40 - 20 * ARMOR_ABSORB)) < 1e-6); assert.ok(Math.abs(me.hp - (100 - 20 * (1 - ARMOR_ABSORB))) < 1e-6);
  const hp = me.hp, ar = me.armor; sim.damage(me, 20, foe, { cause: 'bullet', head: true });
  assert.equal(me.armor, ar); assert.equal(me.hp, hp - 20, 'head shots ignore armor');
  const ar2 = me.armor; sim.damage(me, 10, foe, { cause: 'explosion' }); assert.ok(me.armor < ar2, 'blasts are soaked');
  const ar3 = me.armor; sim.damage(me, 4, null, { cause: 'zone' }); assert.equal(me.armor, ar3, 'the zone ignores armor');
  me.armor = 5; me.armorLv = 1; sim.damage(me, 30, foe, { cause: 'bullet' }); assert.equal(me.armor, 0); assert.equal(me.armorLv, 0);
  const ev = sim.drainEvents().filter((e) => e.t === 'hit' && e.arm > 0); assert.ok(ev.length >= 2);
});

test('medkit: H channels for 3 s while moving slowly, heals 60, costs one medkit; needs a medkit and missing health', async () => {
  const sim = await arena(); const me = sim.player; tp(me, 0, 0);
  me.hp = 30; me.meds = 0; run(sim, 0.1, { ...idleCmd(), heal: true }); assert.equal(me.healT, 0, 'no medkit');
  me.meds = 2; me.hp = 100; run(sim, 0.1, { ...idleCmd(), heal: true }); assert.equal(me.healT, 0, 'nothing to heal');
  me.hp = 20; me.noHurtT = -999;
  run(sim, 0.1, { ...idleCmd(), heal: true }); assert.ok(me.healT > 0 && me.healT < HEAL_T);
  run(sim, HEAL_T - 0.4); assert.ok(me.healT > 0, 'still channelling');
  run(sim, 0.6); assert.equal(me.healT, 0); assert.equal(me.meds, 1); assert.ok(me.hp >= 20 + MED_HEAL - 1 && me.hp <= 20 + MED_HEAL + 3, `hp ${me.hp}`);
  const ev = sim.drainEvents().filter((e) => e.t === 'heal').map((e) => e.phase); assert.deepEqual(ev, ['start', 'end']);
  // capped at max health
  me.hp = 70; run(sim, 0.1, { ...idleCmd(), heal: true }); run(sim, HEAL_T + 0.2); assert.ok(me.hp <= me.maxHp);
});

test('medkit: shooting, reloading, sprinting, switching or being shot cancels it (and wastes nothing)', async () => {
  for (const [label, extra] of [['fire', { fire: true }], ['reload', { reload: true }], ['sprint', { sprint: true, forward: 1 }], ['slot', { slot: 1 }], ['nade', { grenade: true }]]) {
    const sim = await arena(); const me = sim.player; tp(me, 0, 0); me.hp = 20; me.meds = 1; me.noHurtT = -999; me.weapons.pistol.ammo = 5;
    run(sim, 0.2, { ...idleCmd(), heal: true }); assert.ok(me.healT > 0, label);
    run(sim, 0.05, { ...idleCmd(), ...extra }); assert.equal(me.healT, 0, `${label} cancels`); assert.equal(me.meds, 1, `${label} keeps the medkit`);
  }
  const sim = await arena(); const me = sim.player; tp(me, 0, 0); me.hp = 50; me.meds = 1; run(sim, 0.2, { ...idleCmd(), heal: true });
  sim.damage(me, 5, sim.fighters[1], { cause: 'bullet' }); assert.equal(me.healT, 0); assert.equal(me.meds, 1);
  assert.ok(sim.drainEvents().some((e) => e.t === 'heal' && e.phase === 'cancel'));
});

test('loot: a dead fighter drops what they carried (not the pistol) and whoever walks over it can use it', async () => {
  const sim = await arena(); clearItems(sim); const [me, foe] = [sim.player, sim.fighters[1]];
  foe.weapons.dmr = { ammo: 5, reserve: 33, have: true }; foe.weapons.smg = { ammo: 20, reserve: 44, have: true }; foe.armor = 70; foe.armorLv = 2; foe.meds = 2; foe.nades = 1;
  tp(foe, 15, 15); foe.hp = 1; sim.damage(foe, 50, me, { cause: 'bullet' });
  const drops = sim.loot.items.filter((i) => !i.gone); const kinds = drops.map((i) => i.type + ':' + i.sub).sort();
  assert.deepEqual(kinds, ['ammo:pistol', 'armor:2', 'med:', 'nade:', 'weapon:dmr', 'weapon:smg']);
  assert.ok(drops.every((i) => i.dyn && i.id >= 10000 && Math.hypot(i.x - 15, i.z - 15) < 2));
  const d = drops.find((i) => i.sub === 'dmr'); assert.equal(d.qty, 5); assert.equal(d.qty2, 33);
  stand(sim, me, d); assert.ok(me.weapons.dmr.have); assert.equal(me.weapons.dmr.reserve, 33); assert.ok(['dmr', 'smg'].includes(me.cur), 'equipped the first gun it picked up');
});

test('loot: airdrop crates spill a good gun, top armor and medkits', async () => {
  const sim = await arena(); clearItems(sim); sim.loot.dropCrate(40, 40, sim.rng);
  const t = sim.loot.items.filter((i) => !i.gone).map((i) => i.type).sort(); assert.deepEqual(t, ['ammo', 'armor', 'med', 'nade', 'weapon']);
  assert.equal(sim.loot.items.find((i) => i.type === 'armor' && !i.gone).sub, '3');
});

test('loot: ground items are capped so a long match cannot flood the network', async () => {
  const sim = await arena(); clearItems(sim);
  for (let i = 0; i < 40; i++) sim.loot.drop(0, 0, Array.from({ length: 5 }, () => ({ type: 'ammo', sub: 'pistol', qty: 10, qty2: 0 })));
  assert.ok(sim.loot.items.filter((i) => i.dyn && !i.gone).length <= 140);
});

test('loot wire: a browser mirror rebuilds the same ground (gone starting items + dropped ones) from pack()', async () => {
  const srv = await Simulation.create({ seed: 91, bots: 2, vehicles: false, loot: true });
  const cli = await Simulation.create({ seed: 91, bots: 0, vehicles: false, loot: true, predictor: true });
  W = srv.world; const me = srv.player;
  for (const it of srv.loot.items.slice(0, 7)) srv.loot._remove(it);
  srv.loot.drop(5, 5, [{ type: 'weapon', sub: 'lmg', qty: 100, qty2: 50 }, { type: 'med', sub: '', qty: 2, qty2: 0 }]);
  const wire = JSON.parse(JSON.stringify(srv.loot.pack())); cli.loot.applyState(wire);
  const live = (s) => s.loot.items.filter((i) => !i.gone).map((i) => [i.id, i.type, i.sub, Math.round(i.x * 100), Math.round(i.z * 100), i.qty, i.qty2].join(',')).sort();
  assert.deepEqual(live(cli), live(srv));
  // a drop being picked up later disappears on the mirror too
  const d = srv.loot.items.find((i) => i.dyn); srv.loot._remove(d); cli.loot.applyState(JSON.parse(JSON.stringify(srv.loot.pack())));
  assert.deepEqual(live(cli), live(srv));
  void me;
});

test('loot wire: snapshots carry the loot state only when it changed (plus a periodic refresh); cmd heal flag survives the wire', async () => {
  const sim = await arena(); const s1 = packSnapshot(sim, []); assert.ok(s1.lt, 'first snapshot has it');
  sim.step(DT, idleCmd()); const s2 = packSnapshot(sim, []); assert.equal(s2.lt, undefined, 'nothing changed');
  sim.loot._remove(sim.loot.items[0]); const s3 = packSnapshot(sim, []); assert.ok(s3.lt && s3.lt.g.length === 1);
  const old = await Simulation.create({ seed: 3, bots: 1, vehicles: false }); assert.equal(packSnapshot(old, []).lt, undefined, 'no loot, no field');
  const c = { ...idleCmd(), heal: true, seq: 4, vt: 9 }; assert.equal(unpackCmd(packCmd(c)).heal, true);
  assert.equal(unpackCmd(packCmd({ ...c, heal: false })).heal, false); assert.equal(sanitizeCmd({ heal: 1 }).heal, true);
});

test('loot: the player self-state (what the server sends one player) carries guns, armor and medkits', async () => {
  const a = await arena(), b = await arena();
  a.player.weapons.dmr = { ammo: 4, reserve: 20, have: true }; a.player.armor = 66; a.player.armorLv = 2; a.player.meds = 3; a.player.healT = 1.25;
  b.player.importSelf(JSON.parse(JSON.stringify(a.player.exportSelf())));
  assert.ok(b.player.weapons.dmr.have); assert.equal(b.player.armor, 66); assert.equal(b.player.armorLv, 2); assert.equal(b.player.meds, 3); assert.equal(b.player.healT, 1.25); assert.ok(!b.player.weapons.ar.have);
});

test('bots: in a loot match they go and pick up guns, armor and medkits, and heal when hurt and safe', async () => {
  const sim = await Simulation.create({ seed: 52, bots: 7, guards: 0, vehicles: false, loot: true, contracts: false, weather: 'clear' });
  W = sim.world;
  const bot = sim.fighters.find((f) => f.brain);
  for (const f of sim.fighters) if (f !== bot) { f.alive = true; tp(f, -100 + f.id * 2, -100); f.brain = null; }
  clearItems(sim); tp(bot, 0, 0);
  const gun = put(sim, { type: 'weapon', sub: 'ar', x: 22, z: 0, qty: 30, qty2: 90 }), vest = put(sim, { type: 'armor', sub: '2', x: 0, z: 22, qty: 80 });
  sim.zone.radius = 500; sim.zone.update = () => {};
  run(sim, 45);
  assert.ok(gun.gone || vest.gone, 'the bot collected something');
  // hurt, safe, has a medkit -> uses it
  bot.hp = 25; bot.meds = 1; bot.noHurtT = -999; bot.brain.hurtT = 30; let healed = false;
  for (let i = 0; i < 60 * 8 && !healed; i++) { sim.step(DT, idleCmd()); if (bot.hp > 60) healed = true; }
  assert.ok(healed && bot.meds === 0, `bot healed (hp ${bot.hp}, meds ${bot.meds})`);
});

test('bots: a bot that finds a better gun uses it; guards carry an SMG and a vest', async () => {
  const sim = await Simulation.create({ seed: 60, bots: 3, guards: 4, vehicles: false, loot: true, contracts: false });
  const g = sim.fighters.filter((f) => f.npc); assert.ok(g.length >= 1);
  for (const f of g) { assert.ok(f.weapons.smg.have); assert.ok(f.armor > 0); }
  const bot = sim.fighters.find((f) => f.brain && !f.npc);
  bot.weapons.dmr = { ammo: 10, reserve: 40, have: true }; bot.brain._refreshMain();
  assert.ok(['dmr', 'ar', 'smg', 'shotgun', 'lmg'].includes(bot.brain.main)); assert.ok(bot.weapons[bot.brain.main].have);
});

test('loot: a whole bot match plays out without errors, and the ground is being used', async () => {
  const sim = await Simulation.create({ seed: 8, bots: 15, vehicles: true, loot: true, weather: 'clear' });
  W = sim.world; let picks = 0, heals = 0, drops0 = 0;
  for (let i = 0; i < 60 * 120; i++) {
    sim.step(DT, idleCmd());
    for (const e of sim.drainEvents()) { if (e.t === 'pickup') picks++; if (e.t === 'heal' && e.phase === 'end') heals++; }
    if (i === 60 * 120 - 1) drops0 = sim.loot.items.filter((q) => q.dyn).length;
  }
  assert.ok(picks >= 12, `bots picked up ${picks}`);
  assert.ok(Number.isFinite(sim.player.hp));
  void heals; void drops0;
});
