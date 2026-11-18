// The rules engine hosts SEVERAL humans at once (that is what the multiplayer server runs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, MAX_LAG_TICKS } from '../src/sim/world.js';
import { idleCmd, sanitizeCmd } from '../src/sim/cmd.js';

const DT = 1 / 60;
const tp = (f, x, z) => { f.rb.setTranslation({ x, y: 0.9, z }, true); f.x = x; f.y = 0.9; f.z = z; };
async function arena(humans, bots = 0) {
  const sim = await Simulation.create({ seed: 5, bots, humans });
  for (const f of sim.fighters) f.brain = null;
  sim.zone.radius = 500;
  return sim;
}
/** find an empty stretch of ground (no building or crate near the straight line) so shots are not blocked by the map */
function lane(sim, len = 40) {
  const hit = (x, z, m) => sim.map.boxes.some((b) => Math.abs(x - b.x) < b.w / 2 + m && Math.abs(z - b.z) < b.d / 2 + m)
    || sim.crates.some((c) => { const t = c.body.translation(); return Math.abs(x - t.x) < m + 1 && Math.abs(z - t.z) < m + 1; });
  for (let x = -80; x <= 60; x += 5) for (let z0 = 90; z0 > -60; z0 -= 5) {
    let ok = true;
    for (let d = 0; d <= len + 4 && ok; d++) for (let dx = -2; dx <= 14 && ok; dx += 2) if (hit(x + dx, z0 - d, 2)) ok = false;
    if (ok) return { x, z0 };
  }
  throw new Error('no free lane');
}

test('two humans: each follows ITS OWN cmd, and step() never edits the cmd', async () => {
  const sim = await arena([{ operator: 'roms' }, { operator: 'shadow' }]);
  assert.equal(sim.humans.length, 2);
  const [a, b] = sim.humans;
  const L = lane(sim);
  tp(a, L.x, L.z0); tp(b, L.x + 8, L.z0); sim.world.step();
  const x0 = [a.x, b.x];
  const ca = { ...idleCmd(), strafe: 1, slot: 2, reload: true }, cb = { ...idleCmd() };
  const before = JSON.stringify(ca);
  for (let i = 0; i < 30; i++) sim.step(DT, new Map([[a.id, ca], [b.id, cb]]));
  assert.ok(a.x - x0[0] > 2.5, 'A strafed right (+x)');
  assert.ok(Math.abs(b.x - x0[1]) < 0.01, 'B had no input: stays');
  assert.equal(JSON.stringify(ca), before, 'cmd is untouched (one-shot flags are cleared by the caller)');
  assert.equal(a.cur, 'smg', 'slot 2 switched weapon exactly once');
  assert.equal(sim.tick, 30);
});

test('lag compensation: you hit where the target WAS on your screen, not where it is now', async () => {
  const sim = await arena([{ operator: 'roms' }, { operator: 'shadow' }]);
  const [a, b] = sim.humans; const L = lane(sim, 40);
  tp(a, L.x, L.z0); tp(b, L.x, L.z0 - 30); a.yaw = 0; b.yaw = Math.PI; sim.world.step();
  // B runs sideways for 0.5 s (30 ticks) = ~3.5 m; A's screen is 12 ticks behind the server
  const seen = [];
  for (let i = 0; i < 30; i++) { sim.step(DT, new Map([[a.id, idleCmd()], [b.id, { ...idleCmd(), yaw: Math.PI, strafe: 1 }]])); seen.push({ tick: sim.tick, x: b.x, z: b.z }); }
  const old = seen[seen.length - 1 - 12];                        // where B was 12 ticks ago
  const yawTo = (to) => Math.atan2(-(to.x - a.x), -(to.z - a.z));
  // aim at the chest (about 0.9 m above the feet; the eye is 1.62 m up)
  const pitchTo = (to) => Math.atan2(0.9 - 1.62, Math.hypot(to.x - a.x, to.z - a.z));
  const mk = (vt) => ({ ...idleCmd(), yaw: yawTo(old), pitch: pitchTo(old), fire: true, vt });

  const hp0 = b.hp;
  a.weapons[a.cur].ammo = 30; a.fireT = 0;
  sim.events.length = 0;
  sim.step(DT, new Map([[a.id, mk(0)], [b.id, { ...idleCmd(), yaw: Math.PI, strafe: 1 }]]));        // no lag info -> judged on the CURRENT position -> miss
  const missed = b.hp === hp0;
  a.fireT = 0; a.wasFiring = false;
  sim.step(DT, new Map([[a.id, mk(old.tick)], [b.id, { ...idleCmd(), yaw: Math.PI, strafe: 1 }]])); // same shot with the view tick -> HIT
  const hit = b.hp < hp0;
  assert.ok(missed, 'without lag compensation the shot goes where B no longer is');
  assert.ok(hit, 'with the shooter\'s view tick the shot lands');
  assert.ok(MAX_LAG_TICKS <= 60);
});

test('lag compensation is capped: a cheater cannot rewind the world 5 seconds', async () => {
  const sim = await arena([{ operator: 'roms' }, { operator: 'shadow' }]);
  const [a] = sim.humans;
  for (let i = 0; i < 200; i++) sim.step(DT, new Map());
  sim.stepPlayer(a, { ...idleCmd(), vt: 1 }, DT);       // claims to be 199 ticks behind
  assert.equal(a.lagTicks, MAX_LAG_TICKS);
  sim.stepPlayer(a, { ...idleCmd(), vt: sim.tick + 500 }, DT);   // claims to be in the FUTURE
  assert.equal(a.lagTicks, 0);
});

test('every human gets their own result; the last one standing wins; match is over', async () => {
  const sim = await arena([{ operator: 'roms' }, { operator: 'shadow' }, { operator: 'douglas' }]);
  const [a, b, c] = sim.humans; const ev = [];
  sim.damage(b, 9999, a, { cause: 'bullet', w: 'ar' }); ev.push(...sim.events);
  assert.equal(sim.state, 'playing', 'two humans still alive: match goes on');
  const endB = ev.find((e) => e.t === 'end' && e.to === b.id);
  assert.ok(endB && !endB.won && endB.placement === 3, `B finished 3rd, got ${JSON.stringify(endB)}`);
  sim.events.length = 0;
  sim.damage(c, 9999, a, { cause: 'bullet', w: 'ar' });
  const evs = sim.events;
  assert.ok(evs.some((e) => e.t === 'end' && e.to === c.id && e.placement === 2));
  assert.ok(evs.some((e) => e.t === 'end' && e.to === a.id && e.won && e.placement === 1));
  assert.ok(evs.some((e) => e.t === 'over' && e.winner === a.id));
  assert.equal(sim.state, 'over');
});

test('a human who leaves is replaced by a bot (and the match can still finish)', async () => {
  const sim = await arena([{ operator: 'roms' }, { operator: 'shadow' }], 2);
  const [a, b] = sim.humans;
  sim.botify(b);
  assert.equal(sim.humans.length, 1); assert.ok(b.brain && !b.human);
  // the sim keeps running with only one human
  for (let i = 0; i < 120; i++) sim.step(DT, new Map([[a.id, idleCmd()]]));
  assert.ok(Number.isFinite(b.x));
});

test('sanitizeCmd: the server never trusts the network', () => {
  const c = sanitizeCmd({ yaw: NaN, pitch: 99, forward: 50, strafe: -50, jump: 'yes', fire: 1, slot: 99, grenade: 0, seq: 'x', hack: true });
  assert.equal(c.yaw, 0); assert.equal(c.pitch, 1.5); assert.equal(c.forward, 1); assert.equal(c.strafe, -1);
  assert.equal(c.jump, true); assert.equal(c.slot, 6); assert.equal(c.grenade, false); assert.equal(c.seq, 0); assert.equal('hack' in c, false);
});
