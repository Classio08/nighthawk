import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/world.js';
import { MissionStealth, VIPER, SEARCHLIGHT, searchlightSpots } from '../src/sim/stealth.js';
import { DISGUISE, disguiseFools, isDisguised, UNIFORM_USELESS } from '../src/sim/disguise.js';
import { PERSONALITIES } from '../src/sim/personality.js';
import { idleCmd } from '../src/sim/cmd.js';

const make = (mission = 'signal-blackout', seed = 777, guards = 3) => Simulation.create({ seed, bots: 0, guards, mission, loot: false, contracts: false });
const place = (f, p) => { f.x = p.x; f.z = p.z; f.rb.setTranslation({ x: p.x, y: 0.9, z: p.z }, true); };
const guards = (sim) => sim.fighters.filter((f) => f.npc && f.brain?.p.guard && !f.brain.p.hunter);
const step = (sim, secs, cmd) => { for (let i = 0; i < Math.round(secs * 60); i++) sim.step(1 / 60, cmd ? { yaw: sim.player.yaw, pitch: 0, ...idleCmd(), ...cmd } : undefined); };
const mEvents = (sim, phase) => sim.drainEvents().filter((e) => e.t === 'mission' && (!phase || e.phase === phase));
const farFromGuards = (sim) => ({ x: sim.mission.insertion.x, z: sim.mission.insertion.z });

test('disguise rules: only a disguised operator is fooled, close guards and the hunter see through it, full alert makes it worthless', () => {
  const live = { alive: true, disguiseT: 20 }, bare = { alive: true, disguiseT: 0 };
  const guard = { brain: { p: { guard: true } } }, hunter = { brain: { p: { guard: true, hunter: true } } };
  assert.equal(isDisguised(live), true); assert.equal(isDisguised(bare), false);
  assert.equal(isDisguised({ alive: false, disguiseT: 20 }), false); assert.equal(isDisguised(null), false);
  assert.equal(disguiseFools(guard, bare, 30, 'routine'), false);
  assert.equal(disguiseFools(guard, live, DISGUISE.SEE_THROUGH + 1, 'routine'), true);
  assert.equal(disguiseFools(guard, live, DISGUISE.SEE_THROUGH - 1, 'routine'), false, 'a guard this close sees your face');
  assert.equal(disguiseFools(hunter, live, 15, 'searching'), false, 'the hunter is not fooled at 15 m');
  assert.equal(disguiseFools(hunter, live, DISGUISE.HUNTER_RANGE + 2, 'searching'), true);
  for (const lv of UNIFORM_USELESS) assert.equal(disguiseFools(guard, live, 40, lv), false, lv);
  assert.deepEqual([...UNIFORM_USELESS].sort(), ['alert', 'crisis']);
});

test('hunter personality: a guard-type brain flagged hunter, so existing "guards do not shoot guards" rules apply to him', () => {
  assert.equal(PERSONALITIES.hunter.guard, true); assert.equal(PERSONALITIES.hunter.hunter, true);
  assert.deepEqual(PERSONALITIES.hunter.weapons, ['ar']);
});

test('stealth layer exists only inside an operation, with VIPER and searchlights on SIGNAL BLACKOUT only', async () => {
  const br = await Simulation.create({ seed: 3, bots: 4, mission: undefined, loot: false, contracts: false });
  const sb = await make('signal-blackout'), dl = await make('dust-lantern', 5);
  try {
    assert.equal(br.stealth, null);
    assert.ok(sb.stealth instanceof MissionStealth); assert.ok(dl.stealth instanceof MissionStealth);
    assert.equal(sb.stealth.viperEnabled, true); assert.equal(sb.stealth.lightsEnabled, true);
    assert.equal(dl.stealth.viperEnabled, false); assert.equal(dl.stealth.lightsEnabled, false);
    assert.equal(sb.stealth.viperStatus(), 'none');
    const snap = sb.stealth.snapshot();
    assert.equal(snap.disguise, 0); assert.equal(snap.viper, null); assert.equal(snap.lights.on, false); assert.deepEqual(snap.lights.spots, []);
  } finally { br.dispose(); sb.dispose(); dl.dispose(); }
});

test('taking a uniform: needs a downed garrison guard within reach, once per body, and is refused (but consumes E) at full alert', async () => {
  const sim = await make();
  try {
    const p = sim.player, g = guards(sim)[0];
    place(p, farFromGuards(sim)); step(sim, 0.1);
    assert.equal(sim.stealth.takeUniform(p), false, 'no body, no uniform');
    place(p, g); assert.equal(sim.stealth.takeUniform(p), false, 'a LIVING guard has no uniform to take');
    sim.damage(g, 9999, p, { cause: 'bullet' }); sim.drainEvents();
    assert.equal(g.alive, false);
    place(p, { x: g.x + DISGUISE.TAKE_RANGE + 1.5, z: g.z }); assert.equal(sim.stealth.takeUniform(p), false, 'too far from the body');
    place(p, { x: g.x + 1, z: g.z });
    sim.mission.alert.level = 'alert';
    assert.equal(sim.stealth.takeUniform(p), true); assert.equal(p.disguiseT, 0); assert.equal(g.uniformTaken, false);
    const refused = mEvents(sim, 'disguise'); assert.equal(refused.length, 1); assert.equal(refused[0].on, false); assert.equal(refused[0].why, 'alert');
    sim.mission.alert.level = 'routine';
    assert.equal(sim.stealth.takeUniform(p), true); assert.equal(p.disguiseT, DISGUISE.DURATION); assert.equal(g.uniformTaken, true);
    const ev = mEvents(sim, 'disguise'); assert.equal(ev.length, 1); assert.equal(ev[0].on, true); assert.equal(ev[0].secs, DISGUISE.DURATION);
    p.disguiseT = 0;
    assert.equal(sim.stealth.takeUniform(p), false, 'a stripped body gives nothing twice');
    assert.equal(sim.stealth.uniformsTaken, 1);
  } finally { sim.dispose(); }
});

test('pressing E over a body goes through the normal use key and starts the disguise', async () => {
  const sim = await make();
  try {
    const p = sim.player, g = guards(sim)[1];
    place(p, farFromGuards(sim)); step(sim, 0.1);
    sim.damage(g, 9999, p, { cause: 'bullet' }); sim.drainEvents();
    place(p, { x: g.x + 1, z: g.z + 0.5 });
    sim.step(1 / 60, { ...idleCmd(), yaw: p.yaw, pitch: 0, use: true });
    assert.ok(p.disguiseT > 0, 'E near a body disguises the operator');
  } finally { sim.dispose(); }
});

test('disguise decays, and is torn off by a shot, a hit, running near a guard, and by expiry', async () => {
  const sim = await make();
  try {
    const p = sim.player; place(p, farFromGuards(sim));
    const reasons = [];
    const watch = () => { for (const e of sim.drainEvents()) if (e.t === 'mission' && e.phase === 'disguise' && !e.on) reasons.push(e.why); };
    p.disguiseT = 10; step(sim, 1); watch();
    assert.ok(p.disguiseT > 8.5 && p.disguiseT < 9.2, `decays about one second per second, got ${p.disguiseT}`);
    p.disguiseT = 0.05; step(sim, 0.2); watch(); assert.equal(p.disguiseT, 0); assert.deepEqual(reasons, ['expired']);
    p.disguiseT = 30; p.wasFiring = true; sim.stealth.update(1 / 60); watch(); p.wasFiring = false; assert.equal(p.disguiseT, 0); assert.equal(reasons.at(-1), 'noise');
    p.disguiseT = 30; sim.stealth.lastHp = p.hp; p.hp -= 5; sim.stealth.update(1 / 60); watch(); assert.equal(p.disguiseT, 0); assert.equal(reasons.at(-1), 'hit');
    p.hp += 5; p.disguiseT = 30; p.meleeT = 0.4; sim.stealth.update(1 / 60); watch(); p.meleeT = 0; assert.equal(p.disguiseT, 0);
    const g = guards(sim)[0]; place(p, { x: g.x + 10, z: g.z }); p.disguiseT = 30; p.sprinting = true; p.speedH = 9; sim.stealth.lastHp = p.hp;
    sim.stealth.update(1 / 60); watch(); assert.equal(p.disguiseT, 0); assert.equal(reasons.at(-1), 'sprint');
    place(p, { x: g.x + 40, z: g.z }); p.disguiseT = 30; p.sprinting = true; p.speedH = 9; sim.stealth.update(1 / 60); watch();
    assert.ok(p.disguiseT > 29, 'running far from every guard keeps the cover');
    p.sprinting = false;
    place(p, { x: g.x + 10, z: g.z }); p.disguiseT = 30; sim.stealth.update(1 / 60); watch(); assert.ok(p.disguiseT > 29, 'walking past is fine');
  } finally { sim.dispose(); }
});

test('a disguised operator in plain view of a guard at range is ignored; without the uniform the same guard sees them', async () => {
  const run = async (disguised) => {
    const sim = await make('signal-blackout', 4242, 4);
    try {
      const g = guards(sim)[0], p = sim.player;
      for (const o of guards(sim)) if (o !== g) place(o, { x: g.x + 120, z: g.z + 120 });     // nobody else around
      let spot = null;                                                                            // a direction with a clear line, 22 m away
      for (let k = 0; k < 16 && !spot; k++) {
        const a = k * Math.PI / 8, c = { x: g.x + Math.cos(a) * 22, z: g.z + Math.sin(a) * 22 };
        place(p, c); sim.step(1 / 60); g.yaw = Math.atan2(-(c.x - g.x), -(c.z - g.z));
        if (sim.canSee(g, p, 65, g.brain.fov)) spot = { c, yaw: g.yaw };
      }
      assert.ok(spot, 'test setup: a clear 22 m line exists');
      let seen = false;
      for (let i = 0; i < 120; i++) { place(p, spot.c); g.yaw = spot.yaw; if (disguised) p.disguiseT = 30; sim.step(1 / 60); if (g.brain.visible && g.brain.target === p) seen = true; }
      return seen;
    } finally { sim.dispose(); }
  };
  assert.equal(await run(false), true, 'control: with no uniform the guard at 22 m with a clear line sees the operator');
  assert.equal(await run(true), false, 'with the uniform the same guard ignores the operator');
});

test('VIPER: nobody arrives before full alert; at ALERT one named hunter is deployed ~42 m away, once, armoured, with his own placement stream', async () => {
  const sim = await make('signal-blackout', 31337, 3);
  try {
    place(sim.player, farFromGuards(sim)); const n0 = sim.fighters.length;
    step(sim, 2); assert.equal(sim.stealth.viper, null); assert.equal(sim.fighters.length, n0);
    sim.mission.alert.maxIndex = 2; step(sim, 0.5); assert.equal(sim.stealth.viper, null, 'searching is not enough');
    sim.mission.alert.maxIndex = 3; sim.step(1 / 60);
    const v = sim.stealth.viper; assert.ok(v, 'deployed');
    assert.equal(sim.fighters.length, n0 + 1); assert.equal(v.name, VIPER.NAME); assert.equal(v.npc, true); assert.equal(v.brain.p.hunter, true);
    assert.equal(v.maxHp, VIPER.HP); assert.equal(v.hp, VIPER.HP); assert.equal(v.armor, VIPER.ARMOR);
    const d = Math.hypot(v.x - sim.player.x, v.z - sim.player.z); assert.ok(d > 20 && d < 70, `spawned ${d.toFixed(1)} m away`);
    const ev = mEvents(sim, 'viper'); assert.equal(ev.length, 1); assert.equal(ev[0].id, v.id);
    step(sim, 3); sim.mission.alert.maxIndex = 4; step(sim, 1);
    assert.equal(sim.fighters.filter((f) => f.name === VIPER.NAME).length, 1, 'only one VIPER, ever');
    assert.equal(sim.stealth.viperStatus(), 'loose'); assert.equal(sim.aliveCount(), 1, 'NPCs never count as race entrants');
  } finally { sim.dispose(); }
});

test('VIPER follows only what the garrison knows: a fresh guard contact moves his post, a cold or missing one does not', async () => {
  const sim = await make('signal-blackout', 99, 3);
  try {
    place(sim.player, farFromGuards(sim)); sim.mission.alert.maxIndex = 3; sim.step(1 / 60);
    const v = sim.stealth.viper, b = v.brain; place(v, { x: -95, z: 95 });                      // far outside sight range of the operator
    const home = { ...b.post };
    for (const g of guards(sim)) { g.brain.lastSeen = null; g.brain.lastSeenT = 99; } b.lastSeen = null; b.lastSeenT = 99;
    step(sim, 2); assert.deepEqual({ x: b.post.x, z: b.post.z }, home, 'no evidence: he does not magically track the operator');
    const g = guards(sim)[0]; g.brain.lastSeen = { x: -61, z: 23 }; g.brain.lastSeenT = 1;
    step(sim, 1.5); assert.deepEqual({ x: b.post.x, z: b.post.z }, { x: -61, z: 23 }, 'a fresh guard sighting becomes his trail');
    g.brain.lastSeenT = 40; g.brain.lastSeen = { x: 5, z: 5 }; sim.stealth.retargetT = 0; step(sim, 1.5);
    assert.deepEqual({ x: b.post.x, z: b.post.z }, { x: -61, z: 23 }, 'a cold contact is ignored (the post stays where it was)');
  } finally { sim.dispose(); }
});

test('VIPER down: the death is announced once and the status flips to down', async () => {
  const sim = await make('signal-blackout', 8, 2);
  try {
    place(sim.player, farFromGuards(sim)); sim.mission.alert.maxIndex = 3; sim.step(1 / 60); sim.drainEvents();
    const v = sim.stealth.viper; sim.damage(v, 9999, sim.player, { cause: 'bullet' }); sim.drainEvents();
    step(sim, 0.5);
    const ev = mEvents(sim, 'viperdown'); assert.equal(ev.length, 1);
    step(sim, 1); assert.equal(mEvents(sim, 'viperdown').length, 0, 'announced once');
    assert.equal(sim.stealth.viperStatus(), 'down');
    place(sim.player, v); assert.equal(sim.stealth.takeUniform(sim.player), false, 'VIPER carries no garrison uniform');
  } finally { sim.dispose(); }
});

test('searchlights: dark until the extract stage, two moving pools around the pad, deterministic in time', async () => {
  const sim = await make();
  try {
    assert.deepEqual(sim.stealth.spots(), []); assert.equal(sim.stealth.lightsOn, false);
    sim.mission.stage = 'extract';
    const a = searchlightSpots(sim.mission.extraction, 10), b = searchlightSpots(sim.mission.extraction, 10), c = searchlightSpots(sim.mission.extraction, 14);
    assert.deepEqual(a, b); assert.notDeepEqual(a, c); assert.equal(a.length, SEARCHLIGHT.COUNT);
    for (const s of a) assert.ok(Math.abs(Math.hypot(s.x - sim.mission.extraction.x, s.z - sim.mission.extraction.z) - SEARCHLIGHT.SWEEP_R) < 1e-9);
    assert.equal(sim.stealth.lightsOn, true); assert.equal(sim.stealth.spots().length, 2);
    sim.mission.finished = true; assert.equal(sim.stealth.lightsOn, false, 'the lights go dark when the operation is over');
  } finally { sim.dispose(); }
});

test('searchlights: standing in the pool for about a second tells the garrison; cooldown stops spam; a uniform, smoke and the cloak all hide you', async () => {
  const sim = await make('signal-blackout', 2024, 3);
  try {
    sim.mission.stage = 'extract';
    const p = sim.player, put = () => { const s = sim.stealth.spots()[0]; place(p, { x: s.x, z: s.z }); };
    put(); step(sim, 0.3); put(); assert.equal(sim.stealth.isLit(p), true);
    assert.equal(sim.stealth.spotted, 0, 'too brief to be reported');
    for (let i = 0; i < 70; i++) { put(); sim.step(1 / 60); }
    assert.equal(sim.stealth.spotted, 1);
    const ev = mEvents(sim, 'spotlit'); assert.equal(ev.length, 1); assert.ok(Number.isFinite(ev[0].x) && Number.isFinite(ev[0].z));
    for (let i = 0; i < 120; i++) { put(); sim.step(1 / 60); }
    assert.equal(sim.stealth.spotted, 1, 'the 7 s cooldown holds');
    for (let i = 0; i < 6 * 60; i++) { put(); sim.step(1 / 60); }
    assert.equal(sim.stealth.spotted, 2, 'after the cooldown the lights can report again');
    p.disguiseT = 20; put(); assert.equal(sim.stealth.isLit(p), false, 'a guard uniform: the lamp crews think you are one of them');
    p.disguiseT = 0; put(); assert.equal(sim.stealth.isLit(p), true);
    p.crouch = true; const s = sim.stealth.spots()[0]; place(p, { x: s.x + 3.7, z: s.z });
    assert.equal(sim.stealth.isLit(p), false, 'crouching shrinks the pool you can be caught in'); p.crouch = false; assert.equal(sim.stealth.isLit(p), true);
    place(p, { x: s.x + SEARCHLIGHT.RADIUS + 3, z: s.z + 40 }); assert.equal(sim.stealth.isLit(p), false);
  } finally { sim.dispose(); }
});

test('searchlights: being reported sends the garrison to the operator via the same alertGarrison used for relays', async () => {
  const sim = await make('signal-blackout', 55, 3);
  try {
    sim.mission.stage = 'extract';
    const calls = []; const orig = sim.alertGarrison.bind(sim); sim.alertGarrison = (pt, u) => { calls.push({ pt: { ...pt }, u }); return orig(pt, u); };
    const p = sim.player; for (let i = 0; i < 80; i++) { const s = sim.stealth.spots()[0]; place(p, { x: s.x, z: s.z }); sim.step(1 / 60); }
    assert.equal(calls.length, 1); assert.equal(calls[0].u, 2); assert.ok(Math.hypot(calls[0].pt.x - p.x, calls[0].pt.z - p.z) < 12);
  } finally { sim.dispose(); }
});

test('determinism: the same seed and the same inputs give the same VIPER spawn and the same searchlight reports', async () => {
  const run = async () => {
    const sim = await make('signal-blackout', 4711, 3);
    try {
      place(sim.player, farFromGuards(sim)); sim.mission.alert.maxIndex = 3; sim.step(1 / 60);
      const v = sim.stealth.viper; step(sim, 4);
      sim.mission.stage = 'extract'; for (let i = 0; i < 200; i++) { const s = sim.stealth.spots()[0]; place(sim.player, { x: s.x, z: s.z }); sim.step(1 / 60); }
      return JSON.stringify({ v: [+v.x.toFixed(4), +v.z.toFixed(4)], spotted: sim.stealth.spotted, snap: sim.stealth.snapshot() });
    } finally { sim.dispose(); }
  };
  assert.equal(await run(), await run());
});

test('messages and HUD tag: every stealth event has an on-screen line, unknown events say nothing, the tag reflects the real state', async () => {
  const { stealthMessage, stealthTag } = await import('../src/sim/stealth.js');
  const m = (e) => stealthMessage({ t: 'mission', ...e });
  assert.match(m({ phase: 'disguise', on: true, secs: 45 }).text, /UNIFORM ON · 45s/);
  for (const why of ['expired', 'noise', 'hit', 'sprint']) assert.match(m({ phase: 'disguise', on: false, why }).text, /COVER BLOWN/, why);
  assert.match(m({ phase: 'disguise', on: false, why: 'alert' }).text, /USELESS/);
  assert.match(m({ phase: 'disguise', on: false }).text, /COVER BLOWN · DISGUISE LOST/);
  assert.match(m({ phase: 'viper' }).text, /VIPER/); assert.match(m({ phase: 'viperdown' }).text, /VIPER DOWN/); assert.match(m({ phase: 'spotlit' }).text, /SEARCHLIGHT/);
  assert.equal(m({ phase: 'clue' }), null); assert.equal(stealthMessage({ t: 'kill' }), null); assert.equal(stealthMessage(null), null);
  for (const phase of ['disguise', 'viper', 'viperdown', 'spotlit']) { const x = m({ phase, on: true, secs: 1 }); assert.ok(x.color && x.secs > 0 && x.sfx, phase); }
  const sim = await make();
  try {
    assert.equal(stealthTag(sim), ''); assert.equal(stealthTag(null), '');
    sim.player.disguiseT = 12.2; assert.equal(stealthTag(sim), 'DISGUISED 13s');
    sim.stealth.lit = true; sim.stealth.viper = { alive: true, hp: 200, maxHp: 240, id: 99 };
    assert.equal(stealthTag(sim), 'DISGUISED 13s · IN THE LIGHT · VIPER HUNTING');
    assert.match(sim.mission.hudInfo(sim.player).detail, /DISGUISED 13s · IN THE LIGHT · VIPER HUNTING$/, 'the mission panel carries the tag');
    sim.stealth.viper = null; sim.stealth.lit = false; sim.player.disguiseT = 0;
    assert.equal(sim.mission.hudInfo(sim.player).detail.includes('DISGUISED'), false);
  } finally { sim.dispose(); }
});

test('mission stats carry the stealth story (VIPER status, searchlight hits) and the debrief shows them only when they happened', async () => {
  const { buildDebrief } = await import('../src/campaign/debrief.js');
  const sim = await make();
  try {
    assert.equal(sim.mission.stats(true).viper, 'none'); assert.equal(sim.mission.stats(true).spotted, 0);
    sim.stealth.spotted = 2; sim.stealth.viper = { alive: false, hp: 0, maxHp: 240, id: 7 }; sim.stealth.viperDown = true;
    const s = sim.mission.stats(true); assert.equal(s.viper, 'down'); assert.equal(s.spotted, 2);
  } finally { sim.dispose(); }
  const base = { won: true, alertMax: 3, elapsed: 300, kills: 5, headshots: 1, damage: 500, found: 3, total: 3, taskFails: 0, traceLeft: 100 };
  const rowsOf = (stats, id = 'signal-blackout') => Object.fromEntries(buildDebrief(id, stats, null).rows);
  assert.equal('VIPER' in rowsOf(base), false); assert.equal('SEARCHLIGHT HITS' in rowsOf(base), false);
  assert.equal(rowsOf({ ...base, viper: 'down' }).VIPER, 'DOWN'); assert.equal(rowsOf({ ...base, viper: 'loose' }).VIPER, 'STILL HUNTING');
  assert.equal(rowsOf({ ...base, viper: 'none', spotted: 3 })['SEARCHLIGHT HITS'], '3');
  assert.equal('SEARCHLIGHT HITS' in rowsOf({ ...base, spotted: NaN }), false, 'garbage stats never print');
  assert.equal('VIPER' in rowsOf({ ...base, viper: 'down' }, 'dust-lantern'), false, 'DUST LANTERN has no VIPER');
});

test('barks: VIPER introduces himself in his own recording, taking a uniform plays the stealth line, a searchlight hit plays the spotted line', async () => {
  const { BarkDirector } = await import('../src/fx/bark-director.js');
  const d = new BarkDirector();
  const v = d.event({ t: 'mission', phase: 'viper' }, { t: 10 });
  assert.equal(v?.id, 'onEnemyTaunt_viper'); assert.equal(v.speaker, 'viper');
  const st = new BarkDirector().event({ t: 'mission', phase: 'disguise', on: true }, { t: 5 }); assert.equal(st?.category, 'onStealth');
  assert.equal(new BarkDirector().event({ t: 'mission', phase: 'disguise', on: false, why: 'expired' }, { t: 5 }), null);
  assert.equal(new BarkDirector().event({ t: 'mission', phase: 'spotlit' }, { t: 5 })?.category, 'onSpotted');
});
