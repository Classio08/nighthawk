// Stage 19: sprint-slide and ledge mantle. Rules only (no graphics): the browser, the server and the predictor must agree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, SLIDE } from '../src/sim/world.js';
import { MANTLE, findLedge, mantlePos } from '../src/sim/mantle.js';
import { idleCmd } from '../src/sim/cmd.js';
import { packFighter, unpackFighterInto, FF } from '../src/net/protocol.js';
import { insideAnyBox } from '../src/sim/map.js';

const DT = 1 / 60;
let W = null;
const idle = () => ({ ...idleCmd(), yaw: 0 });
const tp = (f, x, y, z) => { f.rb.setTranslation({ x, y, z }, true); f.rb.setNextKinematicTranslation({ x, y, z }); W.propagateModifiedBodyPositionsToColliders(); f.vy = 0; f.x = x; f.y = y; f.z = z; f.grounded = y < 1; };
const run = (sim, secs, cmd = idle()) => { for (let i = 0; i < Math.round(secs * 60); i++) sim.step(DT, cmd); };
async function arena(opts = {}) {
  const sim = await Simulation.create({ seed: 12, bots: 3, guards: 0, squads: false, barrelClusters: 0, weather: 'clear', contracts: false, vehicles: false, ...opts });
  W = sim.world;
  for (const f of sim.fighters) { f.brain = null; f.maxHp = f.hp = 200; }
  sim.zone.radius = 500; sim.zone.update = () => {};
  return sim;
}
function lane(sim, len = 40) {
  const hit = (x, z, m) => insideAnyBox(sim.map, x, z, m) || sim.crates.some((c) => { if (c.dead) return false; const t = c.body.translation(); return Math.abs(x - t.x) < m + 1 && Math.abs(z - t.z) < m + 1; });
  for (let x = -85; x <= 85; x += 5) for (let z0 = 95; z0 > -40; z0 -= 5) {
    let ok = true;
    for (let d = 0; d <= len + 4 && ok; d += 2) for (const dx of [-4, 0, 4]) if (hit(x + dx, z0 - d, 2.5)) { ok = false; break; }
    if (ok) return { x, z0 };
  }
  throw new Error('no open lane');
}
const away = (...fs) => fs.forEach((f, i) => { const L = [[-100, -100], [100, -100], [-100, 100], [100, 100]][i % 4]; tp(f, L[0], 0.9, L[1]); });

test('slide: C while sprinting gives a fast low slide that bleeds off to a crouch walk; standing still never slides', async () => {
  const sim = await arena(); const [p, ...o] = sim.fighters; away(...o); const L = lane(sim, 40);
  tp(p, L.x, 0.9, L.z0); run(sim, 0.3);
  const sprint = { ...idle(), forward: 1, sprint: true };
  run(sim, 0.8, sprint); const sprintSpeed = p.speedH; assert.ok(p.sprinting && sprintSpeed > SLIDE.MIN_SPEED);
  sim.step(DT, { ...sprint, crouch: true });                       // C goes down while sprinting
  assert.ok(p.slideT > 0, 'slide started'); assert.ok(p.crouch, 'a slide is a crouch (hitbox and eyes)'); assert.equal(p.sprinting, false);
  const evs = sim.drainEvents().filter((e) => e.t === 'slide'); assert.equal(evs.length, 1, 'one slide event');
  run(sim, 0.1, { ...sprint, crouch: true }); const early = p.speedH;
  assert.ok(early > sprintSpeed * 1.04, `the slide starts faster than the sprint (${early.toFixed(2)} vs ${sprintSpeed.toFixed(2)})`);
  const z0 = p.z; run(sim, 0.9, { ...idle(), crouch: true });     // steering is locked: it keeps going the way it started, even with no keys held
  assert.ok(z0 - p.z > 2, 'it kept sliding forward with no movement keys');
  assert.equal(p.slideT, 0, 'the slide ended'); const late = p.speedH;
  assert.ok(late < early * 0.2, `held C after the slide: ends crouched and nearly stopped (${late.toFixed(2)})`);
  // from a standing start: crouching is just a crouch
  run(sim, 1.2, idle()); sim.step(DT, { ...idle(), crouch: true }); assert.equal(p.slideT, 0, 'no slide from standing');
  // walking (not sprinting) and crouching: no slide either
  run(sim, 0.3, idle()); run(sim, 0.5, { ...idle(), forward: 1 }); sim.step(DT, { ...idle(), forward: 1, crouch: true }); assert.equal(p.slideT, 0, 'no slide when walking');
});

test('slide: cooldown, jump cancels it, a wall stops it, and EMP interrupts', async () => {
  const sim = await arena(); const [p, ...o] = sim.fighters; away(...o); const L = lane(sim, 40);
  tp(p, L.x, 0.9, L.z0); run(sim, 0.3);
  const sprint = { ...idle(), forward: 1, sprint: true };
  const slide = () => { run(sim, 0.7, sprint); sim.step(DT, { ...sprint, crouch: true }); };
  slide(); assert.ok(p.slideT > 0);
  sim.step(DT, { ...sprint, crouch: true, jump: true });          // jump out of the slide
  assert.equal(p.slideT, 0); assert.ok(p.slideCd > 0, 'cooldown after a cancelled slide'); assert.ok(p.vy > 3, 'and you really jumped');
  run(sim, 0.5, sprint);                                          // still on cooldown (0.9 s)
  const before = p.slideCd; sim.step(DT, { ...sprint, crouch: true });
  if (before > 0) assert.equal(p.slideT, 0, 'no slide during the cooldown');
  // EMP interrupts
  run(sim, 1.2, sprint); sim.step(DT, { ...sprint, crouch: true }); assert.ok(p.slideT > 0, 'cooldown over, slide works again');
  p.stunT = 1; sim.step(DT, { ...sprint, crouch: true }); assert.equal(p.slideT, 0, 'a stun ends the slide');
});

test('slide: hit-box and snapshot flags: a sliding fighter is crouched for the server and shows the slide flag to everybody', async () => {
  const sim = await arena(); const [p, ...o] = sim.fighters; away(...o); const L = lane(sim, 40);
  tp(p, L.x, 0.9, L.z0); run(sim, 0.3);
  const sprint = { ...idle(), forward: 1, sprint: true };
  run(sim, 0.7, sprint); sim.step(DT, { ...sprint, crouch: true }); sim.step(DT, { ...sprint, crouch: true });
  const rec = packFighter(p); assert.ok(rec[7] & FF.slide, 'slide flag on the wire'); assert.ok(rec[7] & FF.crouch, 'crouch flag too');
  const o2 = unpackFighterInto({}, rec); assert.equal(o2.sliding, true); assert.equal(o2.crouch, true); assert.equal(o2.mantling, false);
  assert.equal(sim.posAt(p, sim.tick).crouch, true, 'lag-compensated history sees the low stance');
});

test('mantle: findLedge picks a box top within hand reach, ignores walls that are too tall, and refuses low ceilings', () => {
  const map = { boxes: [{ kind: 'poi-wall', x: 0, y: 0.8, z: -1.5, w: 6, h: 1.6, d: 1.6 }, { kind: 'poi-container', x: 20, y: 1.3, z: -1.5, w: 6, h: 2.6, d: 2.6 }] };
  // feet at 1.2 (mid-jump) walking toward -z (dz = -1): the 1.6 m wall top is 0.4 above the feet, in reach
  const led = findLedge(map, 0, 1.2, 0, 0, -1); assert.ok(led, 'ledge found'); assert.ok(Math.abs(led.top - 1.6) < 1e-9);
  assert.ok(Math.abs(led.y - (1.6 + MANTLE.FEET + 0.02)) < 1e-9); assert.ok(led.z < -1.5 + 0.8 && led.z > -1.5 - 0.8, 'lands on the wall top');
  assert.equal(findLedge(map, 0, 0.2, 0, 0, -1), null, 'feet too low: 1.4 m of rise is out of reach');
  assert.equal(findLedge(map, 0, 1.7, 0, 0, -1), null, 'feet already above the top');
  assert.equal(findLedge(map, 20, 0.5, 0, 0, -1), null, 'a 2.6 m container is out of reach from a normal jump');
  assert.ok(findLedge(map, 20, 1.95, 0, 0, -1), 'but a crate under your feet gets you there');
  assert.equal(findLedge(map, 0, 1.2, 0, 1, 0), null, 'facing away from the wall: nothing');
  map.boxes.push({ kind: 'poi-building', x: 0, y: 3.2, z: -1.5, w: 6, h: 0.6, d: 1.6 });   // a low slab above the wall: no headroom
  assert.equal(findLedge(map, 0, 1.2, 0, 0, -1), null, 'low ceiling: no mantle');
  const edge = { boxes: [{ kind: 'edge', x: 0, y: 0.8, z: -1.5, w: 6, h: 1.6, d: 1.6 }] }; assert.equal(findLedge(edge, 0, 1.2, 0, 0, -1), null, 'the map border is not climbable');
  const a = { x: 0, y: 1, z: 0 }, b = { x: 0, y: 2.5, z: -1.2 };
  assert.deepEqual(mantlePos(a, b, 0), a); assert.ok(Math.abs(mantlePos(a, b, 1).y - 2.5) < 1e-9);
  assert.ok(mantlePos(a, b, 0.3).y > 1.6 && mantlePos(a, b, 0.3).z === 0, 'it goes UP first, then over');
});

test('mantle: jump at a 1.6 m wall and you end up standing on it; the wall of a tall building stops you', async () => {
  const sim = await arena(); const [p, ...o] = sim.fighters; away(...o);
  const wall = sim.map.boxes.find((b) => b.kind === 'poi-wall' && b.h > 1.5 && b.w > 10 && b.d < 1);          // e.g. the Basin Yard wall
  assert.ok(wall, 'a 1.6 m wall exists in the map');
  const sx = wall.x, sz = wall.z + wall.d / 2 + 3.2;               // 3 m south of its face, looking north (-z)
  tp(p, sx, 0.9, sz); run(sim, 0.3);
  const go = { ...idle(), forward: 1, yaw: 0 };
  run(sim, 0.45, go);                                              // run up to it
  let sawMantle = false, evs = 0, done = false;
  for (let i = 0; i < 120; i++) {
    const c = sawMantle && p.mantleT === 0 ? idle() : { ...go, jump: i < 20 };      // stop pushing once you are up
    sim.step(DT, c); if (p.mantleT > 0) sawMantle = true; evs += sim.drainEvents().filter((e) => e.t === 'mantle').length; done = sawMantle && p.mantleT === 0;
  }
  assert.ok(sawMantle && done, 'a mantle started and finished'); assert.equal(evs, 1, 'exactly one mantle event');
  const top = wall.y + wall.h / 2;
  assert.ok(Math.abs(p.z - wall.z) < wall.d / 2 + 0.2, `standing over the wall (z ${p.z.toFixed(2)} vs wall ${wall.z})`);
  assert.ok(Math.abs(p.y - (top + 0.9)) < 0.25, `feet on the top (y ${p.y.toFixed(2)} vs ${(top + 0.9).toFixed(2)})`);
  assert.ok(p.grounded || Math.abs(p.vy) < 3, 'settled');
  // a building wall (5 m) never mantles
  const bld = sim.map.boxes.find((b) => b.kind === 'poi-building' && b.h >= 5);
  tp(p, bld.x, 0.9, bld.z + bld.d / 2 + 3.2); run(sim, 0.3);
  let m2 = false; for (let i = 0; i < 90; i++) { sim.step(DT, { ...go, jump: i < 20 }); if (p.mantleT > 0) m2 = true; }
  assert.equal(m2, false, 'a 5 m wall cannot be mantled'); assert.ok(p.y < 3, 'and you are still on the ground');
});

test('mantle: no shooting while pulling up, own-state export/import resumes it mid-way, and it works the same on a predictor', async () => {
  const BASE = { seed: 12, bots: 0, guards: 0, squads: false, barrelClusters: 0, weather: 'clear', contracts: false, vehicles: false, propsFixed: true };
  const sim = await Simulation.create({ ...BASE, humans: [{ operator: 'roms' }] }); W = sim.world;
  const pred = await Simulation.create({ ...BASE, humans: [{ operator: 'roms' }], predictor: true });
  const p = sim.player, q = pred.player;
  const wall = sim.map.boxes.find((b) => b.kind === 'poi-wall' && b.h > 1.5 && b.w > 10 && b.d < 1);
  W = sim.world; tp(p, wall.x, 0.9, wall.z + wall.d / 2 + 3.2); run(sim, 0.3);
  W = pred.world; tp(q, wall.x, 0.9, wall.z + wall.d / 2 + 3.2); run(pred, 0.3);
  const go = { ...idle(), forward: 1, yaw: 0 };
  let mid = null, midAt = -1; const trail = [];
  for (let i = 0; i < 100; i++) {
    const c = { ...go, jump: i < 20, fire: true };
    sim.step(DT, c); pred.step(DT, c); trail.push({ x: p.x, y: p.y, z: p.z });
    if (p.mantleT > 0 && p.mantleT < MANTLE.T * 0.6 && !mid) { mid = p.exportSelf(); midAt = i; }
    assert.ok(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < 1e-3, `predictor in lock-step at step ${i}: sim ${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)} pred ${q.x.toFixed(4)},${q.y.toFixed(4)},${q.z.toFixed(4)}`);
  }
  assert.ok(mid, 'captured a mid-mantle state'); assert.ok(mid.ml, 'the own state carries the mantle');
  // a fresh predictor adopts it and follows the same path for the rest of the climb and beyond
  const pred2 = await Simulation.create({ ...BASE, humans: [{ operator: 'roms' }], predictor: true }); const r = pred2.player;
  pred2.world.step();                                              // (a brand-new physics world has no query pipeline until it has stepped once)
  r.importSelf(mid); pred2.world.propagateModifiedBodyPositionsToColliders();
  assert.ok(r.mantleT > 0 && r.mantleT < MANTLE.T);
  for (let i = midAt + 1; i < 100; i++) pred2.step(DT, { ...go, jump: i < 20, fire: true });
  const end = trail[99];
  assert.ok(Math.hypot(r.x - end.x, r.y - end.y, r.z - end.z) < 0.05, `resumed climb follows the same path (${r.x.toFixed(2)},${r.y.toFixed(2)},${r.z.toFixed(2)} vs ${end.x.toFixed(2)},${end.y.toFixed(2)},${end.z.toFixed(2)})`);
});

test('slide: own state carries the slide so a predictor resumes it', async () => {
  const BASE = { seed: 12, bots: 0, guards: 0, squads: false, barrelClusters: 0, weather: 'clear', contracts: false, vehicles: false, propsFixed: true };
  const sim = await Simulation.create({ ...BASE, humans: [{ operator: 'roms' }] }); W = sim.world; const p = sim.player;
  const L = lane(sim, 30); tp(p, L.x, 0.9, L.z0); run(sim, 0.3);
  const sprint = { ...idle(), forward: 1, sprint: true };
  run(sim, 0.7, sprint); sim.step(DT, { ...sprint, crouch: true }); run(sim, 0.2, { ...idle(), crouch: true });
  const s = p.exportSelf(); assert.ok(s.sl[0] > 0 && Math.hypot(s.sl[1], s.sl[2]) > 0.99);
  const pred = await Simulation.create({ ...BASE, humans: [{ operator: 'roms' }], predictor: true }); const q = pred.player; W = pred.world; W.step();
  q.importSelf(s); W.propagateModifiedBodyPositionsToColliders();
  assert.ok(Math.abs(q.slideT - p.slideT) < 1e-9 && q.crouch);
  for (let i = 0; i < 20; i++) { W = sim.world; sim.step(DT, { ...idle(), crouch: true }); W = pred.world; pred.step(DT, { ...idle(), crouch: true }); }
  assert.ok(Math.hypot(q.x - p.x, q.z - p.z) < 0.05, `both slid to the same spot: sim ${p.x.toFixed(3)},${p.z.toFixed(3)} pred ${q.x.toFixed(3)},${q.z.toFixed(3)} slideT ${p.slideT.toFixed(3)} vs ${q.slideT.toFixed(3)}`);
});
