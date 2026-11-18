// Contracts (airdrop / hardpoint / bounty / relay uplink), the mortar killstreak, weather effects, and wire formats.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/world.js';
import { Contracts } from '../src/sim/contracts.js';
import { pickWeather, WEATHERS } from '../src/sim/weather.js';
import { packSnapshot, packCmd, unpackCmd } from '../src/net/protocol.js';
import { insideAnyBox } from '../src/sim/map.js';
import { WEAPONS } from '../src/sim/weapons.js';

const DT = 1 / 60;
const idle = () => ({ yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, fire: false, ads: false, reload: false, slot: 0, grenade: false, mortar: false });
let W = null;
const tp = (f, x, z) => { f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); W.propagateModifiedBodyPositionsToColliders(); f.vy = 0; f.x = x; f.y = 0.9; f.z = z; };
const run = (sim, secs, cmd = idle()) => { for (let i = 0; i < Math.round(secs * 60); i++) sim.step(DT, cmd); };
async function arena(opts = {}) {
  const sim = await Simulation.create({ seed: 12, bots: 3, guards: 0, squads: false, barrelClusters: 0, weather: 'clear', contracts: false, vehicles: false, ...opts });   // vehicles off: a parked buggy in the firing lane is not what these tests are about
  W = sim.world;
  for (const f of sim.fighters) { f.brain = null; f.maxHp = f.hp = 400; }
  sim.zone.radius = 500; sim.zone.update = () => {};
  return sim;
}
/** switch contracts on, but only when the test spawns them */
const manual = (sim) => { sim.contracts.off = false; sim.contracts.nextAt = Infinity; return sim.contracts; };
/** an open straight lane towards -z: shooter at (x, z0) */
function lane(sim, len = 60) {
  const hit = (x, z, m) => insideAnyBox(sim.map, x, z, m) || sim.crates.some((c) => { if (c.dead) return false; const t = c.body.translation(); return Math.abs(x - t.x) < m + 1 && Math.abs(z - t.z) < m + 1; });
  for (let x = -85; x <= 85; x += 5) for (let z0 = 95; z0 > -40; z0 -= 5) {
    let ok = true;
    for (let d = 0; d <= len + 4 && ok; d += 2) for (const dx of [-4, 0, 4]) if (hit(x + dx, z0 - d, 2.5)) { ok = false; break; }
    if (ok) return { x, z0 };
  }
  throw new Error('no open lane');
}
const farAway = (sim, ...fs) => fs.forEach((f, i) => { const L = [[-100, -100], [100, -100], [-100, 100]][i % 3]; tp(f, L[0], L[1]); });

test('weather: same seed => same weather; forcing works; every kind has sane numbers', () => {
  assert.equal(pickWeather(5).id, pickWeather(5).id);
  const seen = new Set(); for (let s = 1; s < 400; s++) seen.add(pickWeather(s).id);
  assert.equal(seen.size, 5, 'every weather shows up across seeds');
  assert.equal(pickWeather(5, 'fog').id, 'fog');
  for (const w of Object.values(WEATHERS)) assert.ok(w.hearing > 0 && w.hearing <= 1 && w.sight > 0 && w.sight <= 1);
});

test('weather: fog shortens how far a bot can see, rain muffles what it hears', async () => {
  const clear = await arena({ weather: 'clear' }), fog = await arena({ weather: 'fog' });
  const L = lane(clear, 60);
  for (const sim of [clear, fog]) { W = sim.world; const [a, b] = sim.fighters; tp(a, L.x, L.z0); tp(b, L.x, L.z0 - 50); a.yaw = 0; farAway(sim, ...sim.fighters.slice(2)); }
  assert.equal(clear.canSee(clear.fighters[0], clear.fighters[1], 75, 6.3), true, 'clear day: 50 m is visible');
  assert.equal(fog.canSee(fog.fighters[0], fog.fighters[1], 75, 6.3), false, 'thick fog: 50 m is not');
  W = fog.world; tp(fog.fighters[1], L.x, L.z0 - 30);
  assert.equal(fog.canSee(fog.fighters[0], fog.fighters[1], 75, 6.3), true, 'but 30 m still is');

  const rain = await arena({ weather: 'rain' }); let heardClear = 0, heardRain = 0;
  clear.fighters[1].brain = { hear: () => heardClear++ }; rain.fighters[1].brain = { hear: () => heardRain++ };
  W = clear.world; tp(clear.fighters[0], 0, 0); tp(clear.fighters[1], 30, 0);
  W = rain.world; tp(rain.fighters[0], 0, 0); tp(rain.fighters[1], 30, 0);
  clear.makeNoise(clear.fighters[0], 40); rain.makeNoise(rain.fighters[0], 40);
  assert.equal(heardClear, 1); assert.equal(heardRain, 0, 'rain: 40*0.6 = 24 m is not enough to carry 30 m');
});

test('airdrop: falls first, then opens only for ONE person who stays next to it long enough, and pays out', async () => {
  const sim = await arena(); const ct = manual(sim); const [p, b1, b2] = sim.fighters;
  ct._spawn('airdrop'); const c = ct.list[0];
  assert.equal(c.state, 'falling'); assert.ok(sim.drainEvents().some((e) => e.t === 'contract' && e.phase === 'new' && e.type === 'airdrop'));
  farAway(sim, b1, b2); tp(p, c.x, c.z); p.hp = 100; p.nades = 0; p.mortar = 0;
  for (const k of Object.keys(p.weapons)) p.weapons[k].reserve = 0;
  run(sim, 5); assert.equal(ct.list[0].state, 'falling', 'still in the air after 5 s'); assert.equal(c.prog, 0, 'cannot be opened while falling');
  run(sim, 5); assert.equal(c.state, 'landed');
  assert.ok(sim.drainEvents().some((e) => e.t === 'contract' && e.phase === 'landed'));
  // two people next to it: contested, no progress
  tp(b1, c.x + 1, c.z); run(sim, 3); assert.equal(c.prog, 0, 'contested crate does not open'); tp(b1, 100, 100);
  run(sim, 1.8); assert.ok(c.prog > 0.4 && c.prog < 1, `one person: timer is running (${c.prog.toFixed(2)})`);
  run(sim, 1.4);
  assert.equal(ct.list.length, 0, 'opened and gone');
  const done = sim.drainEvents().find((e) => e.t === 'contract' && e.phase === 'done');
  assert.ok(done && done.by === p.id);
  assert.ok(p.hp >= 160, `healed +60 (then natural regen): ${p.hp}`); assert.equal(p.nades, 2); assert.equal(p.mortar, 1);
  for (const k of Object.keys(p.weapons)) assert.equal(p.weapons[k].reserve, WEAPONS[k].reserve, `${k} refilled`);
});

test('hardpoint: capture time only counts while exactly one fighter stands inside', async () => {
  const sim = await arena(); const ct = manual(sim); const [p, b1, b2] = sim.fighters;
  ct._spawn('hardpoint'); const c = ct.list[0]; farAway(sim, b1, b2);
  tp(p, c.x, c.z); p.hp = 50; run(sim, 6); const half = c.prog; assert.ok(half > 0.35 && half < 0.5, `about 6/14 captured (${half.toFixed(2)})`);
  tp(b1, c.x + 2, c.z); run(sim, 4); assert.equal(c.who, -2, 'contested'); assert.ok(Math.abs(c.prog - half) < 0.02, 'no progress while contested');
  tp(b1, 100, 100); run(sim, 9.5);
  assert.equal(ct.list.length, 0, 'captured');
  assert.equal(p.hp, p.maxHp, 'full heal'); assert.equal(p.mortar, 1);
  assert.ok(sim.drainEvents().some((e) => e.t === 'contract' && e.phase === 'done' && e.type === 'hardpoint' && e.by === p.id));
  // stepping out lets the timer fall back
  ct._spawn('hardpoint'); const d = ct.list[0]; tp(p, d.x, d.z); run(sim, 5); const hi = d.prog; tp(p, d.x + 40, d.z); run(sim, 5); assert.ok(d.prog < hi);
});

test('relay uplink mobilizes existing garrison guards and restores their original post when it ends', async () => {
  const sim = await Simulation.create({ seed: 31, bots: 0, guards: 2, squads: false, contracts: false, weather: 'clear' });
  const guards = sim.fighters.filter((f) => f.npc);
  assert.equal(guards.length, 2);
  const home = { ...guards[0].brain.post };
  const homeRoute = guards[0].brain.patrolRoute;
  sim.contracts.off = false; sim.contracts.nextAt = Infinity;
  sim.contracts._spawn('uplink');
  const c = sim.contracts.list[0];
  assert.deepEqual(guards[0].brain.post, { x: c.x, z: c.z }, 'guards redeploy to the relay');
  assert.notEqual(guards[0].brain.patrolRoute, homeRoute, 'guards receive a relay patrol route');
  sim.contracts._end(c, 'expired');
  assert.deepEqual(guards[0].brain.post, home, 'guards return to their outpost');
  assert.equal(guards[0].brain.patrolRoute, homeRoute, 'original patrol route is restored');
});

test('relay uplink: secure first, then upload; contest pauses progress and completion pays out', async () => {
  const sim = await arena(); const ct = manual(sim); const [p, b1] = sim.fighters;
  ct._spawn('uplink'); const c = ct.list[0];
  assert.equal(c.stage, 0); assert.equal(c.r, 6.5);
  farAway(sim, ...sim.fighters.slice(1)); tp(p, c.x, c.z); p.hp = 100; p.mortar = 0;
  run(sim, 3); const secured = c.prog; assert.ok(secured > 0.4 && secured < 0.5);
  tp(b1, c.x + 1, c.z); run(sim, 2);
  assert.equal(c.who, -2, 'multiple operators contest the relay');
  assert.ok(Math.abs(c.prog - secured) < 0.02, 'contested progress pauses');
  tp(b1, 100, 100); run(sim, 4.2);
  assert.equal(c.stage, 1, 'first phase arms the relay');
  assert.ok(sim.drainEvents().some((e) => e.t === 'contract' && e.phase === 'armed' && e.type === 'uplink'));
  run(sim, 10.5);
  assert.equal(ct.active.length, 0, 'intel upload completes');
  assert.equal(p.mortar, 1); assert.ok(p.hp >= 135, 'uplink reward restores 35 health');
  assert.ok(sim.drainEvents().some((e) => e.t === 'contract' && e.phase === 'done' && e.type === 'uplink' && e.by === p.id));
});

test('bounty: the top killer is marked; whoever kills them is paid; a zone death only ends it', async () => {
  const sim = await arena(); const ct = manual(sim); const [p, b1, b2, b3] = sim.fighters;
  b2.kills = 5; ct._spawn('bounty'); const c = ct.list[0];
  assert.equal(c.who, b2.id); farAway(sim, b1, b3); tp(p, 0, 0); tp(b2, 20, 20);
  run(sim, 1); assert.ok(Math.hypot(c.x - b2.x, c.z - b2.z) < 0.5, 'the marker follows the target');
  p.hp = 50; p.mortar = 0; sim.drainEvents();
  sim.damage(b2, 9999, p, { w: 'ar' });
  assert.ok(p.hp >= 100, `+50 paid: ${p.hp}`); assert.equal(p.mortar, 1); assert.equal(ct.active.length, 0);
  assert.ok(sim.drainEvents().some((e) => e.t === 'contract' && e.phase === 'done' && e.by === p.id));
  b1.kills = 9; ct._spawn('bounty'); assert.equal(ct.of('bounty').who, b1.id);
  sim.damage(b1, 9999, null, { cause: 'zone' }); assert.equal(ct.active.length, 0); assert.equal(p.mortar, 1, 'nobody was paid');
});

test('contracts are scheduled by themselves, at most two at a time, always starting with one of each kind', async () => {
  const sim = await Simulation.create({ seed: 21, bots: 8, guards: 0, squads: false, contractStart: 2 });
  W = sim.world; sim.zone.update = () => {}; sim.zone.radius = 500; for (const f of sim.fighters) { f.brain = null; f.hp = f.maxHp = 9999; }
  const types = []; let most = 0;
  for (let i = 0; i < 60 * 130; i++) { sim.step(DT, idle()); for (const e of sim.drainEvents()) if (e.t === 'contract' && e.phase === 'new') types.push(e.type); most = Math.max(most, sim.contracts.active.length); }
  assert.ok(types.length >= 3, `${types.length} contracts in 130 s`); assert.deepEqual(types.slice(0, 3), ['airdrop', 'hardpoint', 'bounty']); assert.ok(most <= 2);
});

test('mortar: every 3rd kill in a row earns one; it can only be called on something far away; shells hurt only what is under them', async () => {
  const sim = await arena({ bots: 4 }); const [p, ...bots] = sim.fighters;
  for (const b of bots) tp(b, 100, 100);
  sim.damage(bots[0], 9999, p, { w: 'ar' }); sim.damage(bots[1], 9999, p, { w: 'ar' });
  assert.equal(p.mortar, 0); assert.equal(p.streak, 2);
  sim.damage(bots[2], 9999, p, { w: 'ar' }); assert.equal(p.mortar, 1, 'third kill => a strike'); assert.ok(sim.drainEvents().some((e) => e.t === 'streak' && e.by === p.id && e.n === 3));
  const v = bots[3]; v.hp = v.maxHp = 400; v.alive || (v.alive = true);
  const L = lane(sim, 60); tp(p, L.x, L.z0); tp(v, L.x, L.z0 - 40);
  assert.equal(sim.callMortar(p, L.x, L.z0 - 5), false, 'too close to yourself'); assert.equal(p.mortar, 1, 'and it was not spent');
  assert.equal(sim.callMortar(p, L.x, L.z0 - 40), true); assert.equal(p.mortar, 0);
  assert.equal(sim.callMortar(p, L.x, L.z0 - 40), false, 'no charge left');
  const ev = []; for (let i = 0; i < 60 * 8; i++) { sim.step(DT, idle()); ev.push(...sim.drainEvents()); }
  assert.ok(ev.some((e) => e.t === 'mortar' && e.by === p.id));
  assert.equal(ev.filter((e) => e.t === 'shell').length, 7, 'seven shells');
  assert.equal(ev.filter((e) => e.t === 'explosion' && e.w === 'mortar').length, 7);
  assert.ok(v.hp < 400 || !v.alive, 'the target was under the barrage'); assert.ok(p.hp === 400, 'the caller 40 m away is fine');
  assert.equal(sim.strikes.length, 0, 'strike is over');
});

test('mortar: aiming with the crosshair + the mortar key marks the spot you look at', async () => {
  const sim = await arena(); const [p] = sim.fighters; const L = lane(sim, 70);
  tp(p, L.x, L.z0); p.yaw = 0; run(sim, 0.3); p.mortar = 1; const c = idle(); c.pitch = -Math.atan2(1.62, 45); c.mortar = true;
  sim.step(DT, c);
  const ev = sim.drainEvents().find((e) => e.t === 'mortar');
  assert.ok(ev, 'strike called'); assert.ok(Math.abs(ev.x - L.x) < 1 && Math.abs(ev.z - (L.z0 - 45)) < 3, `landed near the crosshair (${ev.x.toFixed(1)}, ${ev.z.toFixed(1)})`);
});

test('wire format: mortar key survives packCmd, contracts survive a snapshot round trip', async () => {
  const c = idle(); c.mortar = true; c.slot = 2; const back = unpackCmd(packCmd({ seq: 5, vt: 9, ...c }));
  assert.equal(back.mortar, true); assert.equal(back.grenade, false); assert.equal(back.slot, 2);
  const sim = await arena(); const ct = manual(sim); ct._spawn('airdrop'); ct._spawn('hardpoint'); ct._spawn('uplink');
  ct.list[2].stage = 1; ct.list[2].prog = 0.4;
  const snap = packSnapshot(sim, []); assert.equal(snap.ct.length, 3);
  const list = Contracts.unpack(JSON.parse(JSON.stringify(snap.ct)));
  assert.deepEqual(list.map((x) => [x.id, x.type, x.state]), ct.list.map((x) => [x.id, x.type, x.state]));
  assert.ok(Math.abs(list[0].x - ct.list[0].x) < 0.01 && list[1].r === 9);
  assert.equal(list[2].r, 6.5); assert.equal(list[2].stage, 1); assert.equal(list[2].prog, 0.4);
});
