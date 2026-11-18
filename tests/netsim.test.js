// The trickiest part of online play: "rewind to the server's version of me, replay what the server has not seen yet".
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/world.js';
import { makeRng } from '../src/sim/rng.js';
import { idleCmd } from '../src/sim/cmd.js';
import { packCmd, unpackCmd, packSnapshot, packFighter, unpackFighterInto } from '../src/net/protocol.js';

const DT = 1 / 60;
const mk = (predictor) => Simulation.create({ seed: 11, bots: 0, humans: [{ operator: 'roms' }], propsFixed: true, predictor });

/** a wiggly input script: walking, strafing, jumping, turning, shooting, reloading */
function script(n) {
  const r = makeRng(4); const out = [];
  let yaw = 0;
  for (let i = 0; i < n; i++) {
    if (i % 17 === 0) yaw += r.range(-0.8, 0.8);
    out.push({ ...idleCmd(), seq: i + 1, yaw, pitch: 0, forward: r.int(0, 2) - 1 || 1, strafe: r.int(0, 2) - 1, jump: i % 41 === 0, sprint: i % 90 < 30, fire: i % 50 > 40, reload: i === 77, vt: 0 });
  }
  return out;
}

test('reconciliation: after rewinding to the server state and replaying the unacked inputs, client == server', async () => {
  const cmds = script(180);
  const ref = await mk(false);                 // "the server", run with ALL 180 inputs = the truth the client is predicting
  for (const c of cmds) ref.step(DT, c);

  const srv = await mk(false);                 // the server, only 120 inputs processed when the snapshot was cut
  for (const c of cmds.slice(0, 120)) srv.step(DT, c);
  const snapshotSelf = srv.player.exportSelf();

  const cli = await mk(true);                  // the browser predicted all 180, but its state has drifted (we shove it 4 m off)
  for (const c of cmds.slice(0, 100)) cli.step(DT, c);
  cli.player.importSelf({ ...cli.player.exportSelf(), x: cli.player.x + 4, z: cli.player.z - 4 });
  cli.world.propagateModifiedBodyPositionsToColliders();
  for (const c of cmds.slice(100, 180)) cli.step(DT, c);
  assert.ok(Math.hypot(cli.player.x - ref.player.x, cli.player.z - ref.player.z) > 2, 'sanity: the client really was off');

  // the snapshot arrives (ack = 120): rewind and replay inputs 121..180
  cli.player.importSelf(snapshotSelf); cli.world.propagateModifiedBodyPositionsToColliders();
  for (const c of cmds.slice(120)) cli.step(DT, c);
  const d = Math.hypot(cli.player.x - ref.player.x, cli.player.y - ref.player.y, cli.player.z - ref.player.z);
  assert.ok(d < 0.02, `client ended ${d.toFixed(4)} m from the truth`);
  assert.equal(cli.player.cur, ref.player.cur);
  assert.equal(cli.player.weapons[cli.player.cur].ammo, ref.player.weapons[ref.player.cur].ammo, 'ammo matches too');
  assert.equal(cli.player.shotN, ref.player.shotN, 'same number of shots fired (so the bullet spread dice stay in sync)');
});

test('bullet spread is the SAME on the shooter\'s browser and on the server (same dice)', async () => {
  const a = await mk(false), b = await mk(true);
  b.player.rngKey = a.player.rngKey;
  for (const s of [a, b]) { s.player.yaw = 0.3; s.player.pitch = 0.05; s.player.fireT = 0; }
  const ea = [], eb = [];
  for (let i = 0; i < 120; i++) {
    a.stepPlayer(a.player, { ...idleCmd(), fire: true, yaw: 0.3, pitch: 0.05, ads: false }, DT); a.world.step();
    b.stepPlayer(b.player, { ...idleCmd(), fire: true, yaw: 0.3, pitch: 0.05, ads: false }, DT); b.world.step();
    ea.push(...a.drainEvents().filter((e) => e.t === 'shot')); eb.push(...b.drainEvents().filter((e) => e.t === 'shot'));
  }
  assert.ok(ea.length > 5 && ea.length === eb.length);
  for (let i = 0; i < ea.length; i++) assert.ok(Math.abs(ea[i].dx - eb[i].dx) < 1e-9 && Math.abs(ea[i].dy - eb[i].dy) < 1e-9 && Math.abs(ea[i].dz - eb[i].dz) < 1e-9, `pellet ${i} differs`);
  const spread = new Set(ea.map((e) => e.dx.toFixed(5))).size;
  assert.ok(spread > 3, 'and it is still random-looking (different shots go different ways)');
});

test('wire format round-trips', async () => {
  const c = { ...idleCmd(), seq: 7, yaw: 1.2345678, pitch: -0.4, forward: 1, strafe: -1, jump: true, fire: true, reload: true, slot: 3, vt: 99 };
  const u = unpackCmd(packCmd(c));
  assert.equal(u.seq, 7); assert.ok(Math.abs(u.yaw - 1.235) < 1e-9); assert.equal(u.jump, true); assert.equal(u.sprint, false); assert.equal(u.fire, true);
  assert.equal(u.reload, true); assert.equal(u.grenade, false); assert.equal(u.slot, 3); assert.equal(u.vt, 99); assert.equal(unpackCmd([1, 2]), null);
  const sim = await Simulation.create({ seed: 2, bots: 3, guards: 0 });
  const snap = packSnapshot(sim, []);
  assert.equal(snap.f.length, 4); assert.equal(JSON.parse(JSON.stringify(snap)).f[0][0], 0);
  const o = {}; unpackFighterInto(o, packFighter(sim.fighters[2]));
  assert.ok(Math.abs(o.x - sim.fighters[2].x) < 0.006 && o.alive === true && o.cur === sim.fighters[2].cur);
  sim.dispose();
});
