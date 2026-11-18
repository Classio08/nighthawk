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
const protect = setInterval(() => { for (const h of sim.humans) if (h.alive) h.hp = h.maxHp; }, 40);   // bots (and now bot-driven buggies) must not kill a tester before the test teleports him
check('both players got a match, with different fighter ids', A.myId !== B.myId && A.fighters.filter((f) => !f.npc).length === 5, `ids ${A.myId}/${B.myId}, ${A.fighters.length} fighters`);
check('bots fill the empty slots', A.fighters.filter((f) => !f.human && !f.npc).length === 3);
check('the guard garrison is replicated and flagged npc', A.fighters.filter((f) => f.npc).length === 4);

// ---- 1. movement: prediction is instant, the server agrees, the other player sees it
// the spawn is random: walk in the direction that has the most open ground (a wall right in front of A would make "moved > 5 m" a test of the map, not of the netcode)
const run = (dx, dz) => { const m = sim.fighters[A.myId]; let d = 0; const hit = (x, z) => sim.map.boxes.some((b) => Math.abs(x - b.x) < b.w / 2 + 1.5 && Math.abs(z - b.z) < b.d / 2 + 1.5) || sim.crates.some((c) => { const t = c.body.translation(); return Math.abs(x - t.x) < 2.2 && Math.abs(z - t.z) < 2.2; }) || sim.fighters.some((q) => q !== m && Math.hypot(x - q.x, z - q.z) < 1.6) || sim.vehicles.list.some((v) => Math.hypot(x - v.x, z - v.z) < v.T.r + 2.2) || sim.barrels?.some?.((q) => !q.dead && Math.hypot(x - q.x, z - q.z) < 2);
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
const tp = (f, x, z) => { if (!f.alive) return; if (f.veh) sim.vehicles.leave(f); f.rb.setTranslation({ x, y: 0.9, z }, true); f.x = x; f.y = 0.9; f.z = z; };
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

// ---- 2b. contracts, mortar and weather reach both players (A must stop shooting B first: the 'nobody dies' timer is off by now)
dB2.stop(); dA2.stop();
check('weather is the same on the server and in both predictors', A.weather.id === sim.weather.id && B.weather.id === sim.weather.id, `${sim.weather.id}`);
const hp = sim.contracts._spawn('hardpoint') ?? sim.contracts.list.find((c) => c.type === 'hardpoint');
await sleep(350);
const cA = A.contracts.list.find((c) => c.type === 'hardpoint'), cB = B.contracts.list.find((c) => c.type === 'hardpoint');
check('a hardpoint appears on both clients at the same spot', !!cA && !!cB && Math.abs(cA.x - cB.x) < 0.02 && Math.abs(cA.z - cB.z) < 0.02 && cA.r === 9, cA ? `${cA.x},${cA.z}` : 'missing');
const evs2 = []; const collect2 = setInterval(() => { for (const e of A.drainEvents()) evs2.push(e); }, 20);
const caster = sim.fighters[B.myId]; caster.mortar = 1;
// aim at the emptiest corner so the barrage cannot hurt either human (the next check is about B leaving a LIVE fighter behind)
const humansNow = [sim.fighters[A.myId], caster], corners = [[-95, -95], [95, -95], [-95, 95], [95, 95]];
const [tx, tz] = corners.sort((p, q) => Math.min(...humansNow.map((h) => Math.hypot(q[0] - h.x, q[1] - h.z))) - Math.min(...humansNow.map((h) => Math.hypot(p[0] - h.x, p[1] - h.z))))[0];
sim.callMortar(caster, tx, tz); await sleep(900);
check('B\'s mortar charge shows up in his own HUD state', B.me.mortar === 0, `mortar=${B.me.mortar}`);
await sleep(5500); clearInterval(collect2);
check('mortar call, shells and explosions are replicated to the other player', evs2.some((e) => e.t === 'mortar') && evs2.filter((e) => e.t === 'shell').length >= 5 && evs2.filter((e) => e.t === 'explosion' && e.w === 'mortar').length >= 5, `shell=${evs2.filter((e) => e.t === 'shell').length} boom=${evs2.filter((e) => e.t === 'explosion' && e.w === 'mortar').length}`);
sim.contracts.list.length = 0;

// ---- 2c. vehicles: A hops into a buggy (E), drives it, B watches it move, A's body follows the vehicle with no rubber-banding, then A gets out
{
  const sa = sim.fighters[A.myId], bug = sim.vehicles.list.find((v) => v.kind === 'buggy' && v.driver < 0 && !v.dead);
  const dir = dirs[0], vx = dir.strafe || 0, vz = dir.forward ? -dir.forward : 0;
  bug.x = sa.x + vx * 3.2; bug.z = sa.z + vz * 3.2; bug.speed = 0; bug.yaw = Math.atan2(-vx, -vz) || 0; sim.vehicles._sync(bug);
  let phase = 'wait', useSent = 0;
  const dA3 = drive(A, () => { if (phase === 'enter' && !useSent) { useSent = 1; return { use: true }; } if (phase === 'drive') return { forward: 1, yaw: bug.yaw }; if (phase === 'exit' && useSent === 1) { useSent = 2; return { use: true }; } return {}; });
  await sleep(500);
  phase = 'enter'; await sleep(900);
  check('E online: the server seats A in the buggy and A\'s client agrees', sa.veh === bug && sa.seat === 0 && A.seated, `server=${!!sa.veh} client=${A.seated}`);
  const bx0 = B.vehicles.byId.get(bug.id)?.x ?? 0, bz0 = B.vehicles.byId.get(bug.id)?.z ?? 0;
  phase = 'drive'; await sleep(1700);
  const bb = B.vehicles.byId.get(bug.id), moved = Math.hypot(bb.x - bx0, bb.z - bz0);
  check('B sees the buggy being driven (it moved on his screen)', moved > 4 && Math.abs(bb.x - bug.x) < 6 && Math.abs(bb.z - bug.z) < 6, `moved=${moved.toFixed(1)} srv=${bug.x.toFixed(1)},${bug.z.toFixed(1)} B=${bb.x.toFixed(1)},${bb.z.toFixed(1)}`);
  const ab = A.vehicles.byId.get(bug.id), gap = Math.hypot(A.me.x - ab.x, A.me.z - ab.z);
  check('A\'s own body sits in the vehicle as A\'s client draws it (no rubber-band)', gap < 1.6, `gap=${gap.toFixed(2)} speed=${Math.abs(bug.speed).toFixed(1)}`);
  phase = 'exit'; await sleep(900);
  check('E again: A is on foot again, server and client agree', !sa.veh && !A.seated, `server=${!!sa.veh} client=${A.seated}`);
  const px = A.me.x, pz = A.me.z; await sleep(500);
  check('A\'s prediction is live again after leaving (no stuck state)', Math.hypot(A.me.x - sa.x, A.me.z - sa.z) < 1.2, `err=${Math.hypot(A.me.x - sa.x, A.me.z - sa.z).toFixed(2)} was ${px.toFixed(1)},${pz.toFixed(1)}`);
  dA3.stop();
}

// ---- 3. leaving: B closes the tab -> a bot takes over, the match goes on
dB2.stop(); dA2.stop();
B.leave(); await sleep(400);
{ const fb = sim.fighters[B.myId]; check('when B leaves, a bot takes his fighter', fb.human === false && !!fb.brain, `alive=${fb.alive} hp=${Math.round(fb.hp)} human=${fb.human} brain=${!!fb.brain} t=${sim.time.toFixed(1)}`); }
check('the match is still running for A', sim.state === 'playing');

clearInterval(protect);
A.leave(); await sleep(500);
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll netcode checks passed');
process.exit(failed ? 1 : 0);
