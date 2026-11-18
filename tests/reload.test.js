// Reload kinds (tactical vs empty), chambered round, events, and the weapon-skin plumbing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/world.js';
import { WEAPONS, SKINS, skinOk, reloadTime, magCap, RELOAD_STAGES } from '../src/sim/weapons.js';

const DT = 1 / 60;
const idle = () => ({ yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, fire: false, ads: false, reload: false, slot: 0, grenade: false });
const run = (sim, secs, cmd = idle()) => { for (let i = 0; i < Math.round(secs * 60); i++) sim.step(DT, cmd); };
async function quiet(opts = {}) {
  const sim = await Simulation.create({ seed: 5, bots: 1, guards: 0, ...opts });
  for (const f of sim.fighters) f.brain = null;
  sim.zone.radius = 500; sim.zone.update = () => {};
  return sim;
}
const pressReload = (sim) => { const c = idle(); c.reload = true; sim.step(DT, c); };

test('every weapon: an empty reload is slower than a tactical one; stages are ordered', () => {
  for (const w of Object.values(WEAPONS)) {
    assert.ok(w.reloadEmpty >= w.reload, `${w.id}: empty reload (${w.reloadEmpty}) is not faster than tactical (${w.reload})`);
    assert.equal(reloadTime(w, 0), w.reloadEmpty); assert.equal(reloadTime(w, 3), w.reload);
  }
  const { tactical: t, empty: e } = RELOAD_STAGES;
  assert.ok(t.drop < t.insert && t.insert < 1); assert.ok(e.drop < e.insert && e.insert < e.charge && e.charge < 1);
});

test('tactical reload keeps the chambered round (mag + 1); the pump shotgun has none', async () => {
  const sim = await quiet(); const p = sim.player, w = WEAPONS[p.cur], st = p.weapons[p.cur];
  assert.equal(w.chamber, true);
  st.ammo = Math.floor(w.mag / 2); sim.drainEvents();
  pressReload(sim);
  assert.ok(p.reloadT > 0 && !p.reloadEmpty, 'tactical');
  assert.equal(p.reloadTot, w.reload);
  const start = sim.drainEvents().find((e) => e.t === 'reload' && e.phase === 'start');
  assert.deepEqual([start.empty, start.left, start.time], [false, Math.floor(w.mag / 2), w.reload]);
  run(sim, w.reload + 0.1);
  assert.equal(st.ammo, w.mag + 1, 'one extra round in the chamber');
  const end = sim.drainEvents().find((e) => e.t === 'reload' && e.phase === 'end');
  assert.equal(end.empty, false);
  assert.equal(magCap(WEAPONS.shotgun, 3), WEAPONS.shotgun.mag, 'shotgun: no chamber bonus');
});

test('empty reload takes longer, fills exactly one magazine, and runs the reserve down', async () => {
  const sim = await quiet(); const p = sim.player, w = WEAPONS[p.cur], st = p.weapons[p.cur];
  st.ammo = 0; const reserve0 = st.reserve;
  pressReload(sim);
  assert.ok(p.reloadEmpty); assert.equal(p.reloadTot, w.reloadEmpty);
  run(sim, w.reload + 0.1);                               // the tactical time is NOT enough
  assert.ok(p.reloadT > 0, 'still busy after the tactical time');
  run(sim, w.reloadEmpty - w.reload + 0.1);
  assert.equal(st.ammo, w.mag); assert.equal(st.reserve, reserve0 - w.mag);
});

test('with a nearly dry reserve you only get what is left', async () => {
  const sim = await quiet(); const p = sim.player, w = WEAPONS[p.cur], st = p.weapons[p.cur];
  st.ammo = 2; st.reserve = 5; pressReload(sim); run(sim, w.reload + 0.1);
  assert.equal(st.ammo, 7); assert.equal(st.reserve, 0);
  pressReload(sim); assert.equal(p.reloadT, 0, 'nothing left to load');
});

test('reload state travels with the owner snapshot (prediction)', async () => {
  const sim = await quiet(); const p = sim.player;
  p.weapons[p.cur].ammo = 0; pressReload(sim); run(sim, 0.3);
  const s = p.exportSelf(); assert.equal(s.re, 1); assert.equal(s.rt, WEAPONS[p.cur].reloadEmpty);
  const sim2 = await quiet(); sim2.player.importSelf(s);
  assert.equal(sim2.player.reloadEmpty, true); assert.equal(sim2.player.reloadTot, WEAPONS[p.cur].reloadEmpty);
});

test('skins: validated for humans, deterministic for bots, and they do not disturb the dice', async () => {
  assert.deepEqual(SKINS, ['gold', 'damascus', 'magma', 'carbon', 'reactive']);
  assert.equal(skinOk('magma'), 'magma'); assert.equal(skinOk('rainbow'), null); assert.equal(skinOk(undefined), null);
  const a = await Simulation.create({ seed: 12, bots: 15, humans: [{ operator: 'roms', skin: 'gold' }, { operator: 'shadow', skin: 'nope' }] });
  const b = await Simulation.create({ seed: 12, bots: 15, humans: [{ operator: 'roms', skin: 'gold' }, { operator: 'shadow', skin: 'nope' }] });
  assert.equal(a.fighters[0].skin, 'gold'); assert.equal(a.fighters[1].skin, null);
  assert.deepEqual(a.fighters.map((f) => f.skin), b.fighters.map((f) => f.skin));
  const botSkins = a.fighters.filter((f) => f.brain && !f.npc && f.skin);
  assert.ok(botSkins.length >= 2 && botSkins.length <= 10, `some bots (${botSkins.length}) carry skins`);
  assert.ok(new Set(botSkins.map((f) => f.skin)).size >= 2, 'more than one skin appears');
  assert.ok(a.fighters.filter((f) => f.npc).every((f) => !f.skin));
});
