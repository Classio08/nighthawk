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

const server = createServer({ lobbySecs: 1, total: 5, loot: false });      // the baseline sections test netcode with every gun in hand; loot has its own section (4) on a second server
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

// ---- 4. loot (a second server with loot on): same item layout from the seed, a pickup reaches the owner AND everybody's map, armor/medkit state is replicated, a death drops items
{
  const PORT2 = PORT + 1, URL2 = `ws://localhost:${PORT2}`;
  const server2 = createServer({ lobbySecs: 1, total: 4, loot: true, vehicles: false });
  await server2.listen(PORT2);
  const [A2, B2] = await Promise.all([NetSim.join(URL2, { name: 'Roms', operator: 'roms', lag: 80 }), NetSim.join(URL2, { name: 'Shadow', operator: 'shadow', lag: 0 })]);
  const room2 = [...MatchRoom.instances].find((r) => r.cfg.loot !== false && r.sim && r.sim.opts.loot), sim2 = room2.sim;
  const prot2 = setInterval(() => { for (const h of sim2.humans) if (h.alive) h.hp = Math.max(h.hp, h.maxHp * 0.99); }, 40);
  const dA = drive(A2, () => ({})), dB = drive(B2, () => ({}));
  await sleep(500);
  const key = (L) => L.items.filter((i) => !i.dyn).slice(0, 40).map((i) => `${i.id},${i.type},${i.sub},${i.x.toFixed(2)},${i.z.toFixed(2)}`).join('|');
  check('loot: welcome says loot is on; the browser builds the same starting items as the server', A2.welcome.loot === true && A2.loot.items.length === sim2.loot.items.length && key(A2.loot) === key(sim2.loot), `items ${A2.loot.items.length}/${sim2.loot.items.length}`);
  check('loot: a human lands with a pistol only', A2.me.weapons.pistol.have && !A2.me.weapons.ar.have && A2.me.cur === 'pistol');
  const tp2 = (f, x, z) => { if (!f.alive) return; f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); sim2.world.propagateModifiedBodyPositionsToColliders(); f.x = x; f.y = 0.9; f.z = z; };
  const fA = sim2.fighters[A2.myId], fB = sim2.fighters[B2.myId];
  for (const f of sim2.fighters) if (!f.human) { f.brain = null; if (!f.npc) tp2(f, -110 + f.id * 4, -110); }      // bots out of the way, guards stand still (nobody shoots a tester mid-heal)
  const free = (it) => sim2.fighters.every((f) => !f.alive || f === fA || f === fB || Math.hypot(f.x - it.x, f.z - it.z) > 25);
  const gun = sim2.loot.items.find((i) => i.type === 'weapon' && !i.gone && free(i));
  A2.drainEvents(); tp2(fA, gun.x, gun.z); await sleep(900);
  const ev = A2.drainEvents().filter((e) => e.t === 'pickup' && e.by === A2.myId);
  check('loot: walking over a gun - the server gives it to A, A\'s own state agrees (guns, equip)', fA.weapons[gun.sub].have && A2.me.weapons[gun.sub].have && A2.me.cur === gun.sub, `server=${fA.weapons[gun.sub].have} client=${A2.me.weapons[gun.sub].have} cur=${A2.me.cur}`);
  check('loot: the pickup event reaches A and the item is gone on both clients', ev.length >= 1 && A2.loot.byId.get(gun.id)?.gone === true && B2.loot.byId.get(gun.id)?.gone === true, `events=${ev.length}`);
  fA.armor = 80; fA.armorLv = 2; fA.meds = 2; await sleep(350);
  check('loot: armor and medkits are part of A\'s replicated self-state', A2.me.armor === 80 && A2.me.armorLv === 2 && A2.me.meds === 2, `armor=${A2.me.armor} lv=${A2.me.armorLv} meds=${A2.me.meds}`);
  // heal: A presses H once (the key flag is one tick), the server channels 3 s, health comes back
  fA.hp = 30; fA.noHurtT = -999; prot2 && clearInterval(prot2);
  let sent = false; dA.fn = () => { if (!sent) { sent = true; return { heal: true }; } return {}; };
  await sleep(1200);
  check('loot: H starts a heal on the server and A\'s client shows it channelling', fA.healT > 0.5 && A2.me.healT > 0, `server healT=${fA.healT.toFixed(2)} client healT=${A2.me.healT.toFixed(2)}`);
  await sleep(2600);
  check('loot: after ~3 s the server heals +60 and spends one medkit', fA.hp >= 85 && fA.meds === 1 && fA.healT === 0, `hp=${Math.round(fA.hp)} meds=${fA.meds}`);
  const heals = A2.drainEvents().filter((e) => e.t === 'heal' && e.by === A2.myId).map((e) => e.phase);
  check('loot: A hears the heal start and end exactly once', heals.join(',') === 'start,end', heals.join(','));
  // a death drops what the dead fighter carried, and both clients see the drops
  fB.armor = 60; fB.armorLv = 2; fB.meds = 1; fB.weapons.dmr = { ammo: 7, reserve: 40, have: true }; const spot = [[30, 30], [-30, 30], [30, -30], [-30, -30], [60, 0], [-60, 0], [0, 60], [0, -60]].find(([x, z]) => sim2.fighters.every((f) => !f.alive || f === fB || Math.hypot(f.x - x, f.z - z) > 25) && !sim2.map.boxes.some((b) => Math.abs(x - b.x) < b.w / 2 + 3 && Math.abs(z - b.z) < b.d / 2 + 3)) ?? [30, 30];
  tp2(fB, spot[0], spot[1]); dA.stop(); fA.x = -120; fA.z = -120; tp2(fA, -120, -120);      // (nobody near the corpse: guards and bots would pick the drops up)
  sim2.damage(fB, 9999, fA, { cause: 'bullet', head: true }); await sleep(500);      // (a head shot: armor does not soak it, so the vest survives to be dropped)
  const drops = (n) => n.loot.items.filter((i) => i.dyn && !i.gone);
  check('loot: a dead player\'s gear shows up on the ground for both clients (gun, armor, medkit)', ['weapon', 'armor', 'med'].every((t) => drops(A2).some((i) => i.type === t) && drops(B2).some((i) => i.type === t)), `A sees ${drops(A2).map((i) => i.type + ':' + i.sub).join(' ')} / B sees ${drops(B2).length}`);
  dA.stop(); dB.stop(); clearInterval(prot2); B2.leave(); A2.leave(); await sleep(300);
}
// ---- 5. operator abilities (a third server): Q is validated on the server, the cooldown/dash are predicted without rubber-banding, an EMP stun reaches the victim's own state, the tells ride the snapshots
{
  const PORT3 = PORT + 2, URL3 = `ws://localhost:${PORT3}`;
  const server3 = createServer({ lobbySecs: 1, total: 4, loot: false, vehicles: false });
  await server3.listen(PORT3);
  const [A3, B3] = await Promise.all([NetSim.join(URL3, { name: 'Maetja', operator: 'maetja', lag: 80 }), NetSim.join(URL3, { name: 'Cliffhanger', operator: 'cliffhanger', lag: 0 })]);
  const room3 = [...MatchRoom.instances].find((r) => r.sim && r.sim.fighters.some((f) => f.op.id === 'maetja' && f.human)), sim3 = room3.sim;
  const prot3 = setInterval(() => { for (const h of sim3.humans) if (h.alive) h.hp = h.maxHp; }, 40);
  const dA = drive(A3, () => ({})), dB = drive(B3, () => ({}));
  await sleep(500);
  const tp3 = (f, x, z) => { if (!f.alive) return; f.rb.setTranslation({ x, y: 0.9, z }, true); f.rb.setNextKinematicTranslation({ x, y: 0.9, z }); sim3.world.propagateModifiedBodyPositionsToColliders(); f.x = x; f.y = 0.9; f.z = z; };
  const fA = sim3.fighters[A3.myId], fB = sim3.fighters[B3.myId];
  for (const f of sim3.fighters) if (!f.human) { f.brain = null; tp3(f, -115 + f.id * 3, -115); }
  const spot = [[30, 30], [-30, 30], [30, -30], [-30, -30], [60, 0], [-60, 0]].find(([x, z]) => sim3.fighters.every((f) => f.human || Math.hypot(f.x - x, f.z - z) > 40) && !sim3.map.boxes.some((b) => b.kind !== 'edge' && Math.abs(b.x - x) < b.w / 2 + 14 && Math.abs(b.z - z) < b.d / 2 + 14)) ?? [0, 0];
  tp3(fA, spot[0], spot[1]); tp3(fB, spot[0], spot[1] - 12); await sleep(500);
  A3.drainEvents(); B3.drainEvents();
  // A (EMP Breach) presses Q once
  let sentA = false; dA.fn = () => { if (!sentA) { sentA = true; return { ability: true }; } return {}; };
  await sleep(160);
  check('ability: A\'s own cooldown starts at once (predicted, no round trip)', A3.me.abCd > 13, `client abCd=${A3.me.abCd.toFixed(2)}`);
  await sleep(500);
  check('ability: the server accepted it (cooldown running) and stunned B, who is 12 m away', fA.abCd > 11 && fA.abCd < 14 && fB.stunT > 1, `server abCd=${fA.abCd.toFixed(2)} B stunT=${fB.stunT.toFixed(2)}`);
  check('ability: B\'s own replicated state says stunned, and A sees B\'s stun flag on the snapshot', B3.me.stunT > 0.3 && A3.fighters[B3.myId].stunned === true, `B me.stunT=${B3.me.stunT.toFixed(2)} flag=${A3.fighters[B3.myId].stunned}`);
  const evA = A3.drainEvents(), evB = B3.drainEvents();
  check('ability: everybody hears the EMP once and B hears the stun', evA.filter((e) => e.t === 'ability' && e.kind === 'emp').length === 1 && evB.some((e) => e.t === 'stun' && e.target === B3.myId), `A ability events=${evA.filter((e) => e.t === 'ability').length} B stun=${evB.filter((e) => e.t === 'stun').length}`);
  // a stunned B cannot shoot (the server refuses the trigger)
  const gun = fB.cur, ammo0 = fB.weapons[gun].ammo; dB.fn = () => ({ fire: true }); await sleep(600); dB.fn = () => ({});
  check('ability: a stunned B holds the trigger and nothing is fired', fB.weapons[gun].ammo === ammo0, `ammo ${ammo0} -> ${fB.weapons[gun].ammo}`);
  // pressing Q again while cooling down must not reset or restart anything
  const cd = fA.abCd; sentA = false; await sleep(150); const cd2 = fA.abCd;
  check('ability: a second Q during the cooldown changes nothing (the server owns the cooldown)', cd2 <= cd && cd2 > cd - 0.8 && !A3.drainEvents().some((e) => e.t === 'ability'), `${cd.toFixed(2)} -> ${cd2.toFixed(2)}`);
  dA.fn = () => ({});
  // B (Blast Dash): the dash is predicted, the server agrees on where B ends up (no rubber band), the blast goes off
  await sleep(2600);                                           // the stun is over
  tp3(fB, spot[0] + 20, spot[1] - 20); await sleep(500); B3.drainEvents(); const x0 = fB.x, z0 = fB.z, corr0 = B3.stats.corrections;
  let sentB = false; dB.fn = () => { if (!sentB) { sentB = true; return { ability: true, yaw: 0 }; } return { yaw: 0 }; };
  await sleep(900);
  const moved = Math.hypot(fB.x - x0, fB.z - z0), gap = Math.hypot(B3.me.x - fB.x, B3.me.z - fB.z);
  check('ability: Blast Dash moves B about 11 m on the server and B\'s prediction ends up in the same place', moved > 6 && moved < 13 && gap < 0.8, `server moved ${moved.toFixed(1)} m, client gap ${gap.toFixed(2)} m, corrections ${B3.stats.corrections - corr0}`);
  check('ability: the blast went off and B is not hurt by his own charge', B3.drainEvents().some((e) => e.t === 'explosion' && e.w === 'dash') && fB.hp >= fB.maxHp * 0.99);
  dA.stop(); dB.stop(); clearInterval(prot3); B3.leave(); A3.leave(); await sleep(300);
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll netcode checks passed');
process.exit(failed ? 1 : 0);
