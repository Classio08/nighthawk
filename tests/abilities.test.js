// Stage 9: operator abilities (Q). Every rule here is simulation-only (no graphics), so the browser, the server and the predictor agree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, OPERATORS } from '../src/sim/world.js';
import { ABILITIES, abilityOf, isCloaked, useAbility, botUseAbility } from '../src/sim/abilities.js';
import { packCmd, unpackCmd, packFighter, unpackFighterInto, FF } from '../src/net/protocol.js';
import { sanitizeCmd, idleCmd } from '../src/sim/cmd.js';
import { insideAnyBox } from '../src/sim/map.js';
import { WEAPONS, damageAt } from '../src/sim/weapons.js';

const DT = 1 / 60;
let W = null;
const idle = () => ({ ...idleCmd(), yaw: 0 });
const tp = (f, x, z) => { f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); W.propagateModifiedBodyPositionsToColliders(); f.vy = 0; f.x = x; f.y = 0.9; f.z = z; };
const run = (sim, secs, cmd = idle()) => { for (let i = 0; i < Math.round(secs * 60); i++) sim.step(DT, cmd); };
const setOp = (f, id) => { f.op = OPERATORS.find((o) => o.id === id); f.maxHp = f.hp = f.op.hp; f.color = f.op.color; };
async function arena(opts = {}) {
  const sim = await Simulation.create({ seed: 12, bots: 3, guards: 0, squads: false, barrelClusters: 0, weather: 'clear', contracts: false, vehicles: false, ...opts });
  W = sim.world;
  for (const f of sim.fighters) { f.brain = null; f.maxHp = f.hp = 200; }
  sim.zone.radius = 500; sim.zone.update = () => {};
  return sim;
}
/** an open straight lane towards -z, `len` metres long, starting at (x, z0) */
function lane(sim, len = 40) {
  const hit = (x, z, m) => insideAnyBox(sim.map, x, z, m) || sim.crates.some((c) => { if (c.dead) return false; const t = c.body.translation(); return Math.abs(x - t.x) < m + 1 && Math.abs(z - t.z) < m + 1; });
  for (let x = -85; x <= 85; x += 5) for (let z0 = 95; z0 > -40; z0 -= 5) {
    let ok = true;
    for (let d = 0; d <= len + 4 && ok; d += 2) for (const dx of [-4, 0, 4]) if (hit(x + dx, z0 - d, 2.5)) { ok = false; break; }
    if (ok) return { x, z0 };
  }
  throw new Error('no open lane');
}
const away = (sim, ...fs) => fs.forEach((f, i) => { const L = [[-100, -100], [100, -100], [-100, 100], [100, 100]][i % 4]; tp(f, L[0], L[1]); });
const events = (sim) => sim.drainEvents();

test('roster: all eight operators have an ability and it is named like the roster says', () => {
  assert.equal(OPERATORS.length, 8);
  for (const op of OPERATORS) {
    const A = ABILITIES[op.id]; assert.ok(A, `ability for ${op.id}`);
    assert.equal(A.name.toLowerCase(), op.ability.name.toLowerCase(), `${op.id}: name matches data/operators.json`);
    assert.ok(A.cd > 0 && A.cd <= 20, 'sane cooldown');
  }
});

test('cooldown: Q works once, is refused while cooling down, and works again after the cooldown', async () => {
  const sim = await arena(); const [p, ...o] = sim.fighters; away(sim, ...o); setOp(p, 'rampol'); tp(p, 0, 60);
  assert.equal(useAbility(sim, p), true); assert.ok(Math.abs(p.abCd - 12) < 1e-6);
  assert.equal(useAbility(sim, p), false, 'cooling down');
  run(sim, 11.9); assert.equal(useAbility(sim, p), false, 'still 0.1 s to go');
  run(sim, 0.2); assert.equal(p.abCd, 0); assert.equal(useAbility(sim, p), true);
});

test('Overclock (Roms): faster fire and 40% less damage, for 5 s only', async () => {
  const sim = await arena(); const [p, ...o] = sim.fighters; away(sim, ...o); setOp(p, 'roms'); tp(p, 0, 60);
  sim.switchWeapon(p, 'ar'); run(sim, 0.5);
  const c = idle(); c.fire = true; sim.step(DT, c);
  const slow = p.fireT; run(sim, 1, idle());
  useAbility(sim, p); assert.ok(p.abT > 4.9);
  const hp0 = p.hp; sim.damage(p, 100, null, { cause: 'bullet' }); assert.ok(Math.abs((hp0 - p.hp) - 60) < 1e-6, 'takes 60 of 100');
  sim.damage(p, 100, null, { cause: 'zone' }); assert.ok(Math.abs((hp0 - 60 - p.hp) - 100) < 1e-6, 'the zone is not reduced');
  run(sim, 0.5); p.weapons.ar.ammo = 30; p.fireT = 0; p.wasFiring = false; sim.step(DT, c);
  assert.ok(Math.abs(p.fireT - slow / 1.3) < 0.004, `fire interval ${p.fireT.toFixed(3)} vs ${(slow / 1.3).toFixed(3)}`);
  run(sim, 5.2); p.hp = p.maxHp; const hp1 = p.hp; sim.damage(p, 100, null, { cause: 'bullet' }); assert.equal(Math.round(hp1 - p.hp), 100, 'back to normal');
});

test('Bulwark (Rampol): takes 65% less from bullets and blasts, not from the zone', async () => {
  const sim = await arena(); const [p, ...o] = sim.fighters; away(sim, ...o); setOp(p, 'rampol'); tp(p, 0, 60);
  useAbility(sim, p); const hp0 = p.hp;
  sim.damage(p, 100, null, { cause: 'explosion' }); assert.ok(Math.abs((hp0 - p.hp) - 35) < 1e-6);
});

test('Trauma Kit (Douglas): +25 at once, +14 HP/s for 5 s, and it is not wasted at full health', async () => {
  const sim = await arena(); const [p, ...o] = sim.fighters; away(sim, ...o); setOp(p, 'douglas'); tp(p, 0, 60);
  assert.equal(useAbility(sim, p), false, 'full health: refused'); assert.equal(p.abCd, 0, 'and no cooldown is spent');
  p.hp = 20; p.noHurtT = -100;
  assert.equal(useAbility(sim, p), true); assert.equal(p.hp, 45);
  run(sim, 5.05); assert.ok(Math.abs(p.hp - (45 + 70)) < 2.5, `hp ${p.hp.toFixed(1)}`);
  const h = p.hp; run(sim, 1); assert.ok(p.hp - h < 1.5, 'regen is over');
});

test('Blast Dash (Cliffhanger): dashes ~11 m forward, blast hurts a target at the landing spot but never the owner', async () => {
  const sim = await arena(); const [p, v, ...o] = sim.fighters; away(sim, ...o); setOp(p, 'cliffhanger'); const L = lane(sim, 30);
  tp(p, L.x, L.z0); p.yaw = 0; tp(v, L.x + 1.5, L.z0 - 12); run(sim, 0.3);
  const hpP = p.hp, hpV = v.hp; assert.equal(useAbility(sim, p), true);
  run(sim, 0.4); const ev = events(sim);
  const moved = L.z0 - p.z; assert.ok(moved > 9 && moved < 12.5, `dashed ${moved.toFixed(1)} m`);
  assert.ok(ev.some((e) => e.t === 'explosion' && e.w === 'dash'), 'charge went off');
  assert.ok(v.hp < hpV, 'target took damage'); assert.equal(p.hp, hpP, 'owner took none');
});

test('Deadeye (Navy Blue): the next shot does 3x damage, ignores armor, passes through a second body, and is then used up', async () => {
  const sim = await arena(); const [p, a, b, ...o] = sim.fighters; away(sim, ...o); setOp(p, 'navy-blue'); const L = lane(sim, 50);
  tp(p, L.x, L.z0); p.yaw = 0; sim.switchWeapon(p, 'dmr'); tp(a, L.x, L.z0 - 15); tp(b, L.x, L.z0 - 22); run(sim, 0.6);
  a.hp = b.hp = 400; a.maxHp = b.maxHp = 400;
  const aim = (t) => Math.atan2(t.y + 0.1 - p.eyeY, Math.hypot(t.x - p.x, t.z - p.z)), pitch = aim(a);
  const shoot = () => { sim.step(DT, { ...idle(), pitch, fire: true, ads: true }); sim.step(DT, { ...idle(), pitch, ads: true }); };
  a.armor = 100; a.armorLv = 3;
  useAbility(sim, p); assert.ok(p.abT > 7.9);
  shoot();
  const dBody = damageAt(WEAPONS.dmr, 15, false);
  const got = 400 - a.hp; assert.ok(got >= dBody * 3 * 0.99, `deadeye ${got.toFixed(1)} vs 3x body ${(dBody * 3).toFixed(1)}`);
  assert.equal(a.armor, 100, 'armor untouched (it pierces)');
  assert.ok(400 - b.hp > 0, 'the shot went through to the second fighter behind'); assert.equal(p.abT, 0, 'used up by one shot');
  run(sim, 1); const before = a.hp; a.armor = 0; shoot();
  assert.ok(before - a.hp < dBody * 2.5, 'the next shot is a normal one again');
});

test('EMP Breach (Maetja): stuns every enemy within 24 m for 3 s (slow, cannot shoot), not the ones further away', async () => {
  const sim = await arena(); const [p, near, far, ...o] = sim.fighters; away(sim, ...o); setOp(p, 'maetja'); const L = lane(sim, 40);
  tp(p, L.x, L.z0); tp(near, L.x, L.z0 - 15); tp(far, L.x, L.z0 - 32); run(sim, 0.3); events(sim);
  assert.equal(useAbility(sim, p), true);
  assert.ok(near.stunT > 2.9 && far.stunT === 0, `near ${near.stunT} far ${far.stunT}`); assert.equal(p.stunT, 0);
  assert.ok(events(sim).some((e) => e.t === 'stun' && e.target === near.id));
  const c = idle(); c.forward = 1; const z0 = near.z; for (let i = 0; i < 60; i++) { near.stunT = 3; near.rb.setNextKinematicTranslation({ x: near.x, y: near.y, z: near.z }); sim.moveFighter(near, 0, -9 * DT, DT); sim.step(DT, idle()); }
  assert.ok(z0 - near.z < 4, `stunned fighters crawl (${(z0 - near.z).toFixed(1)} m in 1 s of trying to run 9 m/s)`);
  near.stunT = 1; near.weapons[near.cur].ammo = 10; near.fireT = 0; const ammo = near.weapons[near.cur].ammo; sim.updateWeapon(near, DT, true, false);
  assert.equal(near.weapons[near.cur].ammo, ammo, 'a stunned trigger does nothing');
  near.stunT = 0.05; run(sim, 0.2); assert.equal(near.stunT, 0, 'the stun wears off');
});

test('Crimson Rush (Cleiseis): a dash strike for 70, and an instant finish on anyone below 40% health', async () => {
  const sim = await arena(); const [p, healthy, wounded, ...o] = sim.fighters; away(sim, ...o); setOp(p, 'cleiseis'); const L = lane(sim, 30);
  tp(p, L.x, L.z0); p.yaw = 0; tp(healthy, L.x, L.z0 - 6); healthy.hp = healthy.maxHp = 200; run(sim, 0.2);
  const h0 = healthy.hp; assert.equal(useAbility(sim, p), true); run(sim, 0.5);
  assert.ok(h0 - healthy.hp >= 69 && h0 - healthy.hp < 71, `strike ${h0 - healthy.hp}`);
  p.abCd = 0; tp(p, L.x, L.z0); tp(wounded, L.x, L.z0 - 6); wounded.hp = 40; wounded.maxHp = 200; run(sim, 0.2);
  useAbility(sim, p); run(sim, 0.5); assert.equal(wounded.alive, false, 'finished');
});

test('Cloak (Shadow): bots only notice a cloaked fighter from up close; speed goes up', async () => {
  const sim = await arena({ bots: 2 }); const [p, bot, ...o] = sim.fighters; away(sim, ...o); setOp(p, 'shadow'); const L = lane(sim, 50);
  const { BotBrain } = await import('../src/sim/bot.js');
  bot.brain = new BotBrain(sim, bot, 0.9); tp(bot, L.x, L.z0); bot.yaw = 0; tp(p, L.x, L.z0 - 20); run(sim, 0.3);
  bot.brain._scan(); assert.equal(bot.brain.visible, true, 'visible when not cloaked (sanity)');
  bot.brain.visible = false; bot.brain.target = null; useAbility(sim, p); assert.equal(isCloaked(p), true);
  bot.brain._scan(); assert.equal(bot.brain.visible, false, 'a cloaked Shadow 20 m away is invisible to bots');
  tp(p, L.x, L.z0 - 6); run(sim, 0.2); bot.yaw = 0; bot.brain._scan(); assert.equal(bot.brain.visible, true, 'but 6 m away he is seen');
  p.abT = 0; p.abCd = 0; const c = idle(); c.forward = 1; p.yaw = 0; tp(p, L.x, L.z0 - 40); run(sim, 0.5, c); const base = p.speedH; useAbility(sim, p); run(sim, 0.4, c);
  assert.ok(p.speedH > base * 1.2, `cloak speed ${p.speedH.toFixed(2)} vs ${base.toFixed(2)}`);
});

test('bots press Q when it makes sense and not otherwise', async () => {
  const sim = await arena(); const [p, bot, ...o] = sim.fighters; away(sim, ...o); const L = lane(sim, 30);
  setOp(p, 'cleiseis'); tp(p, L.x, L.z0); tp(bot, L.x, L.z0 - 25); run(sim, 0.2);
  const ctx = (dist) => ({ tgt: bot, dist, hpF: 1, hurtRecently: false });
  assert.equal(botUseAbility(sim, p, ctx(25)), false, 'Crimson Rush: too far to dash');
  assert.equal(botUseAbility(sim, p, ctx(6)), true, 'Crimson Rush: in range');
  assert.equal(botUseAbility(sim, p, ctx(6)), false, 'and now it is cooling down');
});

test('wire: the Q flag survives packCmd/unpackCmd and sanitizeCmd, ability tells ride the fighter flags, own state round-trips', async () => {
  const c = idle(); c.ability = true; c.seq = 3;
  assert.equal(unpackCmd(packCmd(c)).ability, true); assert.equal(unpackCmd(packCmd({ ...c, ability: false })).ability, false);
  assert.equal(sanitizeCmd({ ...c, ability: 1 }).ability, true); assert.equal(sanitizeCmd({ ...c, ability: undefined }).ability, false);
  const sim = await arena(); const [p, ...o] = sim.fighters; away(sim, ...o); setOp(p, 'shadow'); tp(p, 0, 60); useAbility(sim, p);
  const a = packFighter(p); assert.ok((a[7] & FF.ab) && (a[7] & FF.cloak) && !(a[7] & FF.stun));
  const o2 = unpackFighterInto({}, a); assert.equal(o2.cloaked, true); assert.equal(o2.abOn, true); assert.equal(o2.stunned, false);
  p.stunT = 1; assert.ok(packFighter(p)[7] & FF.stun);
  const self = JSON.parse(JSON.stringify(p.exportSelf())); const q = { ...p, rb: null, weapons: { ...p.weapons } };
  const fresh = await arena(); const f = fresh.fighters[0]; f.rb = null; f.importSelf(self);
  assert.ok(Math.abs(f.abCd - p.abCd) < 1e-9 && Math.abs(f.abT - p.abT) < 1e-9 && f.stunT === p.stunT && f.dashT === p.dashT, 'cooldown, effect, stun and dash all survive the round trip');
  assert.ok(abilityOf(q));
});

test('predictor: a predicting browser tracks its own cooldown and dash but never touches other fighters', async () => {
  const sim = await arena({ predictor: true }); const [p, other, ...o] = sim.fighters; setOp(p, 'maetja'); other.stunT = 0;
  tp(p, 0, 60); tp(other, 0, 50);
  assert.equal(useAbility(sim, p), true); assert.equal(p.abCd, 14); assert.equal(other.stunT, 0, 'EMP effects are the server\'s job');
  assert.equal(sim.drainEvents().some((e) => e.t === 'ability'), false, 'and so is announcing it');
});
