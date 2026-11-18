// End-to-end netcode test WITHOUT browsers: a real server, two real NetSim clients (the same code the game uses),
// artificial latency, and checks for prediction, interpolation, hits, lag compensation and leaving.
import { createServer } from '../src/index.js';
import { MatchRoom } from '../src/MatchRoom.js';
import { NetSim } from '../../src/net/netsim.js';
import { idleCmd } from '../../src/sim/cmd.js';

const PORT = 2599, URL = `ws://localhost:${PORT}`, STEP = 1 / 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) failed++; };

const server = createServer({ lobbySecs: 1, total: 5 });
await server.listen(PORT);

/** runs a client's fixed 60 Hz loop in real time. `cmdFn(ns, t)` returns the keys for this tick */
function drive(ns, cmdFn) {
  let acc = 0, last = performance.now(), t = 0, alive = true;
  const id = setInterval(() => {
    if (!alive) return;
    const now = performance.now(); acc += Math.min(0.1, (now - last) / 1000); last = now;
    while (acc >= STEP) { ns.step(STEP, { ...idleCmd(), ...cmdFn(ns, t) }); t += STEP; acc -= STEP; }
    ns.update(1 / 60);
  }, 8);
  return { stop() { alive = false; clearInterval(id); }, set fn(f) { cmdFn = f; } };
}

const [A, B] = await Promise.all([
  NetSim.join(URL, { name: 'Roms', operator: 'roms', lag: 120 }),     // A plays with 120 ms of artificial round-trip lag
  NetSim.join(URL, { name: 'Shadow', operator: 'shadow', lag: 0 }),
]);
if (process.env.NO_LAGCOMP) { A.viewTick = () => 0; console.log('(lag compensation OFF for A: shots are judged on the CURRENT positions)'); }
const room = [...MatchRoom.instances][0], sim = room.sim;
check('both players got a match, with different fighter ids', A.myId !== B.myId && A.fighters.filter((f) => !f.npc).length === 5, `ids ${A.myId}/${B.myId}, ${A.fighters.length} fighters`);
check('bots fill the empty slots', A.fighters.filter((f) => !f.human && !f.npc).length === 3);
check('the guard garrison is replicated and flagged npc', A.fighters.filter((f) => f.npc).length === 4);

// ---- 1. movement: prediction is instant, the server agrees, the other player sees it
// the spawn is random: walk in the direction that has the most open ground (a wall right in front of A would make "moved > 5 m" a test of the map, not of the netcode)
const run = (dx, dz) => { const m = sim.fighters[A.myId]; let d = 0; const hit = (x, z) => sim.map.boxes.some((b) => Math.abs(x - b.x) < b.w / 2 + 1.5 && Math.abs(z - b.z) < b.d / 2 + 1.5) || sim.crates.some((c) => { const t = c.body.translation(); return Math.abs(x - t.x) < 2.2 && Math.abs(z - t.z) < 2.2; }) || sim.fighters.some((q) => q !== m && Math.hypot(x - q.x, z - q.z) < 1.6);
  while (d < 14 && !hit(m.x + dx * d, m.z + dz * d)) d += 1; return d; };
const dirs = [{ strafe: 1, forward: 0, r: run(1, 0) }, { strafe: -1, forward: 0, r: run(-1, 0) }, { strafe: 0, forward: 1, r: run(0, -1) }, { strafe: 0, forward: -1, r: run(0, 1) }].sort((p, q) => q.r - p.r);
const way = dirs[0];
const dA = drive(A, () => ({ strafe: way.strafe, forward: way.forward, yaw: 0 })), dB = drive(B, () => ({}));
const a0 = { x: A.me.x, z: A.me.z }, b0x = B.fighters[A.myId].x;
await sleep(1500);
check('my own movement is predicted (moved > 3 m in 1.5 s)', Math.hypot(A.me.x - a0.x, A.me.z - a0.z) > 3, `moved=${Math.hypot(A.me.x - a0.x, A.me.z - a0.z).toFixed(1)} m (open ground ${way.r} m, dir ${way.strafe},${way.forward}, from ${a0.x.toFixed(1)},${a0.z.toFixed(1)} to ${A.me.x.toFixed(1)},${A.me.z.toFixed(1)}, server ${sim.fighters[A.myId].x.toFixed(1)},${sim.fighters[A.myId].z.toFixed(1)})`);
const srvA = sim.fighters[A.myId];
dA.fn = () => ({});                               // stop and let everything settle (error smoothing needs a moment on a slow machine)
await sleep(1600);
const gap = Math.hypot(A.me.x - srvA.x, A.me.z - srvA.z);
check('after stopping, prediction == server (within 0.15 m) even with 120 ms lag', gap < 0.15, `gap=${gap.toFixed(3)} m`);
check('prediction error stayed small while moving (max < 1.0 m)', A.stats.maxErr < 1.0, `maxErr=${A.stats.maxErr.toFixed(3)} corrections=${A.stats.corrections}`);
const seenByB = B.fighters[A.myId];
check('B sees A at (nearly) the same place as the server', Math.hypot(seenByB.x - srvA.x, seenByB.z - srvA.z) < 0.5, `diff=${Math.hypot(seenByB.x - srvA.x, seenByB.z - srvA.z).toFixed(2)}`);
check('B saw A move', Math.abs(seenByB.x - b0x) > 3);
// ---- 1b. props: a barrel / crate that breaks on the server breaks for every player (and in their prediction world)
{
  const bar = sim.barrels[0], crate = sim.crates[0]; sim.barrels[0].hp = 0; sim._breakProp(bar); sim._breakProp(crate);
  await sleep(700);
  check('a barrel that explodes on the server is gone for both players', A.barrels[0].dead && B.barrels[0].dead);
  check('a broken crate (and the crate stacked on it) is gone for both players', A.crates[0].dead && B.crates[0].dead && A.crates[1].dead);
}
check('the clock estimate is sane (snapshots arriving ~20/s)', A.stats.snaps > 20, `snaps=${A.stats.snaps}`);

// ---- 2. a shoot-out in an open lane: B runs left/right, A (120 ms lag) shoots at where B is DRAWN
const hit = (x, z, m) => sim.map.boxes.some((b) => Math.abs(x - b.x) < b.w / 2 + m && Math.abs(z - b.z) < b.d / 2 + m);
let L = null;
for (let x = -80; x <= 60 && !L; x += 5) for (let z0 = 90; z0 > -60 && !L; z0 -= 5) {
  let ok = true; for (let d = 0; d <= 30 && ok; d++) for (let dx = -2; dx <= 14 && ok; dx += 2) if (hit(x + dx, z0 - d, 2)) ok = false;
  if (ok) L = { x, z0 };
}
const tp = (f, x, z) => { f.rb.setTranslation({ x, y: 0.9, z }, true); f.x = x; f.y = 0.9; f.z = z; };
for (const f of sim.fighters) if (!f.human) { f.brain = null; tp(f, 100, 100); }   // bots out of the way
sim.zone.radius = 500;
tp(sim.fighters[A.myId], L.x, L.z0); tp(sim.fighters[B.myId], L.x + 3, L.z0 - 15);
sim.fighters[A.myId].yaw = 0;
const keep = setInterval(() => { for (const h of sim.humans) { h.hp = h.maxHp; } }, 40);        // nobody dies in this test
await sleep(900);
let t0 = performance.now(); let fired = 0, hits = 0;
dB.stop();
const dB2 = drive(B, (ns, t) => ({ strafe: Math.floor(t / 1.0) % 2 === 0 ? 1 : -1, yaw: Math.PI }));
dA.stop();
const dA2 = drive(A, (ns) => {
  const tgt = ns.fighters[B.myId], me = ns.me;
  const dx = tgt.x - me.x, dz = tgt.z - me.z;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(0.9 - 1.62, Math.hypot(dx, dz)), ads: true, fire: true };
});
const evs = [];
const collect = setInterval(() => { for (const e of A.drainEvents()) evs.push(e); }, 20);
await sleep(6000);
clearInterval(collect); clearInterval(keep);
fired = evs.filter((e) => e.t === 'fire' && e.by === A.myId).length;
hits = evs.filter((e) => e.t === 'hit' && e.by === A.myId && e.target === B.myId).length;
check('A fired a lot (own shots are predicted instantly)', fired > 20, `fired=${fired}`);
check('lag compensation: most shots at a RUNNING target land despite 120 ms lag', hits / Math.max(1, fired) > 0.5, `${hits}/${fired} = ${(100 * hits / Math.max(1, fired)).toFixed(0)}%`);

// ---- 3. leaving: B closes the tab -> a bot takes over, the match goes on
dB2.stop(); dA2.stop();
B.leave(); await sleep(400);
check('when B leaves, a bot takes his fighter', sim.fighters[B.myId].human === false && !!sim.fighters[B.myId].brain);
check('the match is still running for A', sim.state === 'playing');

A.leave(); await sleep(500);
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll netcode checks passed');
process.exit(failed ? 1 : 0);
