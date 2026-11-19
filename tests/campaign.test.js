import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim/world.js';
import { MISSION_IDS } from '../src/sim/missions.js';
import { ALERT_LEVEL_NAMES, MissionAlertDirector } from '../src/sim/mission-alert.js';
import { MISSION_ORDER, MISSION_STORIES, operationList, getMissionStory, actOf, CAMPAIGN } from '../src/campaign/story.js';
import { ENDINGS, ALERT_LEVELS, evaluateEnding } from '../src/campaign/endings.js';
import { scoreRun, gradeFor, buildDebrief, carryForwardLine, GRADES } from '../src/campaign/debrief.js';
import { PLANNED_MISSIONS, ACTS } from '../src/campaign/planned-data.js';
import { defaultProgress, sanitizeProgress, recordRun, loadProgress, saveProgress, resetProgress, nextOperation, operationsDone, CAMPAIGN_KEY } from '../src/campaign/progress.js';

const memStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
const win = (extra = {}) => ({ won: true, alertMax: 1, elapsed: 240, kills: 3, headshots: 2, damage: 400, found: 3, total: 3, taskFails: 0, traceLeft: 200, ...extra });

test('story: the playable operations are exactly the ones the simulation registers, each with the full set of story fields', () => {
  assert.deepEqual([...MISSION_ORDER].sort(), [...MISSION_IDS].sort());
  for (const id of MISSION_ORDER) {
    const s = getMissionStory(id);
    assert.match(s.act, /^act\d$/);
    for (const k of ['title', 'briefing', 'controlBrief', 'intro', 'outroGood', 'outroBad', 'outroFail', 'stakes']) assert.ok(typeof s[k] === 'string' && s[k].length > 10, `${id}.${k}`);
    assert.ok(actOf(id)?.name, `act of ${id}`);
    assert.ok(ENDINGS[id]?.A && ENDINGS[id]?.B && ENDINGS[id]?.fail, `endings of ${id}`);
  }
  assert.equal(getMissionStory('nope'), null); assert.equal(actOf('nope'), null);
  assert.match(CAMPAIGN.title, /KAVARI/);
});

test('planned operations: listed honestly as planned, never as playable, and carry no stat-boost rewards', () => {
  const list = operationList();
  assert.deepEqual(list.filter((o) => o.status === 'playable').map((o) => o.id), MISSION_ORDER);
  const planned = list.filter((o) => o.status === 'planned');
  assert.equal(planned.length, Object.keys(PLANNED_MISSIONS).length); assert.ok(planned.length >= 6);
  for (const o of planned) assert.ok(!MISSION_IDS.includes(o.id), `${o.id} is not in the sim registry`);
  for (const m of Object.values(PLANNED_MISSIONS)) for (const e of Object.values(m.endings)) assert.ok(!('unlock' in e) && !('ratingBonus' in e), 'cosmetics only: the pack\'s stat-boost unlocks must not come along');
  assert.ok(ACTS.length >= 3);
});

test('endings: A is the clean way, B the loud way, fail is fail; the thresholds are the ones the text promises', () => {
  const e = (id, s) => evaluateEnding(id, s).key;
  assert.equal(e('dust-lantern', { won: true, alertMax: 0 }), 'A'); assert.equal(e('dust-lantern', { won: true, alertMax: 2 }), 'A');
  assert.equal(e('dust-lantern', { won: true, alertMax: 3 }), 'B'); assert.equal(e('dust-lantern', { won: true, alertMax: 4 }), 'B');
  assert.equal(e('dust-lantern', { won: false, alertMax: 0 }), 'fail');
  assert.equal(e('signal-blackout', { won: true, alertMax: 2, taskFails: 1 }), 'A');
  assert.equal(e('signal-blackout', { won: true, alertMax: 2, taskFails: 2 }), 'B');
  assert.equal(e('signal-blackout', { won: true, alertMax: 3, taskFails: 0 }), 'B');
  assert.equal(e('signal-blackout', { won: false, alertMax: 0, taskFails: 0 }), 'fail');
  assert.equal(evaluateEnding('nope', { won: true }), null);
  assert.equal(evaluateEnding('dust-lantern', null).key, 'fail', 'missing stats can never award a win');
  assert.equal(evaluateEnding('dust-lantern', { won: true }).key, 'B', 'an unknown alert level counts as loud, not as clean');
  assert.deepEqual(ALERT_LEVELS, ALERT_LEVEL_NAMES, 'the campaign and the sim agree on the alert level order');
});

test('rating: transparent, bounded 0..100, louder and slower and sloppier never scores higher', () => {
  const base = scoreRun('dust-lantern', win());
  assert.ok(base >= 0 && base <= 100);
  assert.ok(scoreRun('dust-lantern', win({ alertMax: 4 })) < scoreRun('dust-lantern', win({ alertMax: 0 })));
  assert.ok(scoreRun('dust-lantern', win({ elapsed: 900 })) < scoreRun('dust-lantern', win({ elapsed: 200 })));
  assert.ok(scoreRun('signal-blackout', win({ taskFails: 5 })) < scoreRun('signal-blackout', win({ taskFails: 0 })));
  assert.ok(scoreRun('dust-lantern', win({ headshots: 4 })) >= scoreRun('dust-lantern', win({ headshots: 0 })));
  for (const bad of [{ alertMax: 99, elapsed: 1e9, taskFails: 1e6, headshots: -5 }, { alertMax: NaN, elapsed: NaN }, {}]) { const v = scoreRun('signal-blackout', bad); assert.ok(Number.isFinite(v) && v >= 0 && v <= 100, JSON.stringify(bad)); }
  assert.equal(scoreRun('dust-lantern', win({ alertMax: 0, elapsed: 100, headshots: 8 })) >= 92, true);
  assert.deepEqual(GRADES.map((g) => g.grade), ['S', 'A', 'B', 'C', 'D']);
  assert.deepEqual([100, 92, 91, 80, 79, 65, 64, 45, 44, 0].map((s) => gradeFor(s).grade), ['S', 'S', 'A', 'A', 'B', 'B', 'C', 'C', 'D', 'D']);
});

test('debrief: a win carries the ending, rating, real rows and the next operation; a loss is plainly a loss and offers a retry', () => {
  const w = buildDebrief('dust-lantern', win({ alertMax: 0 }), null);
  assert.equal(w.won, true); assert.equal(w.ending.key, 'A'); assert.equal(w.ending.title, 'SILENT LANTERN');
  assert.equal(w.narrative, MISSION_STORIES['dust-lantern'].outroGood);
  assert.deepEqual(w.next, { id: 'relay-uplink', title: 'RELAY UPLINK' }); assert.equal(w.retry, false);
  assert.equal(w.newBest, true); assert.equal(w.newRibbon, true);
  const row = Object.fromEntries(w.rows); assert.equal(row.TIME, '4:00'); assert.equal(row.KILLS, '3'); assert.equal(row['PEAK ALERT'], 'ROUTINE'); assert.equal(row['CLUES FOUND'], '3/3');
  const loud = buildDebrief('dust-lantern', win({ alertMax: 4 }), null);
  assert.equal(loud.ending.key, 'B'); assert.equal(loud.narrative, MISSION_STORIES['dust-lantern'].outroBad);
  const f = buildDebrief('signal-blackout', win({ won: false, found: 1 }), null);
  assert.equal(f.won, false); assert.equal(f.rating.grade, '-'); assert.equal(f.rating.score, 0); assert.equal(f.retry, true); assert.equal(f.next, null);
  assert.equal(f.ending.ribbon, null); assert.equal(f.newBest, false); assert.equal(f.newRibbon, false); assert.equal(f.narrative, MISSION_STORIES['signal-blackout'].outroFail);
  const sb = Object.fromEntries(buildDebrief('signal-blackout', win({ taskFails: 1 }), null).rows); assert.equal(sb['JAMS INTERRUPTED'], '1'); assert.ok('TRACE LEFT' in sb); assert.equal(sb['RELAYS JAMMED'], '3/3');
  assert.equal(buildDebrief('signal-blackout', win(), null).next, null, 'the last playable operation has no next one (the rest are planned)');
  assert.equal(buildDebrief('nope', win(), null), null);
  assert.doesNotThrow(() => buildDebrief('dust-lantern', { won: true }, null), 'a thin stats object must not break the end screen');
});

test('progress: records runs, keeps the best, adds a ribbon once, never mutates the input and flags new bests honestly', () => {
  const p0 = defaultProgress(), snapshot = JSON.stringify(p0);
  const d1 = buildDebrief('dust-lantern', win({ alertMax: 0 }), p0);
  const p1 = recordRun(p0, d1, 240);
  assert.equal(JSON.stringify(p0), snapshot, 'input untouched');
  assert.equal(p1.missions['dust-lantern'].plays, 1); assert.equal(p1.missions['dust-lantern'].wins, 1); assert.equal(p1.missions['dust-lantern'].bestTime, 240);
  assert.deepEqual(p1.ribbons, ['SILENT LANTERN']); assert.equal(p1.last, 'dust-lantern'); assert.equal(nextOperation(p1), 'relay-uplink'); assert.equal(operationsDone(p1), 1);
  const d2 = buildDebrief('dust-lantern', win({ alertMax: 0, elapsed: 500 }), p1);
  assert.equal(d2.newRibbon, false); assert.equal(d2.newBest, d2.rating.score > p1.missions['dust-lantern'].bestScore);
  const p2 = recordRun(p1, d2, 500);
  assert.deepEqual(p2.ribbons, ['SILENT LANTERN']); assert.equal(p2.missions['dust-lantern'].bestTime, 240, 'a slower win does not replace the best time'); assert.equal(p2.missions['dust-lantern'].plays, 2);
  const dl = buildDebrief('dust-lantern', win({ won: false }), p2), p3 = recordRun(p2, dl, 30);
  assert.equal(p3.missions['dust-lantern'].wins, 2); assert.equal(p3.missions['dust-lantern'].plays, 3); assert.ok(p3.missions['dust-lantern'].endingsSeen.includes('lantern_out'));
  const pn = recordRun(defaultProgress(), d1, NaN); assert.equal(pn.missions['dust-lantern'].bestTime, null, 'a non-finite time is never recorded as a best time');
  assert.equal(operationsDone(defaultProgress()), 0); assert.equal(nextOperation(defaultProgress()), 'dust-lantern');
});

test('progress: a hand-edited or corrupt save cannot inject NaN, unknown missions, fake ribbons or prototype keys', () => {
  const evil = JSON.parse('{"v":9,"missions":{"dust-lantern":{"plays":"lots","wins":-4,"bestScore":9999,"bestGrade":"GOD","bestTime":"fast","endingsSeen":["silent_lantern","hax","__proto__"],"lastEndingId":"hax"},"__proto__":{"polluted":true},"made-up":{"plays":9}},"ribbons":["SILENT LANTERN","SUPER ADMIN",{"x":1}],"last":"made-up"}');
  const p = sanitizeProgress(evil);
  assert.deepEqual(Object.keys(p.missions), ['dust-lantern']); assert.equal({}.polluted, undefined);
  const m = p.missions['dust-lantern'];
  assert.equal(m.plays, 0); assert.equal(m.wins, 0); assert.equal(m.bestScore, 100); assert.equal(m.bestGrade, '-'); assert.equal(m.bestTime, null); assert.deepEqual(m.endingsSeen, ['silent_lantern']); assert.equal(m.lastEndingId, null);
  assert.deepEqual(p.ribbons, ['SILENT LANTERN']); assert.equal(p.last, null);
  for (const junk of [null, undefined, 5, 'x', [], { missions: 7 }, { missions: { 'dust-lantern': 3 } }]) assert.doesNotThrow(() => sanitizeProgress(junk));
  assert.deepEqual(sanitizeProgress(null), defaultProgress());
});

test('progress storage: round-trips, survives broken/missing storage, resets', () => {
  const st = memStore(), d = buildDebrief('signal-blackout', win(), null);
  assert.equal(saveProgress(recordRun(defaultProgress(), d, 200), st), true);
  assert.ok(st._m.has(CAMPAIGN_KEY));
  assert.equal(loadProgress(st).missions['signal-blackout'].wins, 1);
  st.setItem(CAMPAIGN_KEY, '{not json'); assert.deepEqual(loadProgress(st), defaultProgress());
  const full = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('denied'); } };
  assert.deepEqual(loadProgress(full), defaultProgress()); assert.equal(saveProgress(defaultProgress(), full), false); assert.doesNotThrow(() => resetProgress(full));
  saveProgress(recordRun(defaultProgress(), d, 200), st); assert.deepEqual(resetProgress(st), defaultProgress()); assert.deepEqual(loadProgress(st), defaultProgress());
});

test('carry-forward: the second operation opens with the line that follows how the first one ended', () => {
  assert.equal(carryForwardLine('dust-lantern', defaultProgress()), null, 'the first operation has nothing to carry');
  assert.equal(carryForwardLine('relay-uplink', defaultProgress()), null); assert.equal(carryForwardLine('signal-blackout', defaultProgress()), null);
  const p = recordRun(defaultProgress(), buildDebrief('dust-lantern', win({ alertMax: 0 }), null), 240);
  assert.equal(carryForwardLine('relay-uplink', p), ENDINGS['dust-lantern'].A.dialogueNext);
  const q = recordRun(defaultProgress(), buildDebrief('dust-lantern', win({ alertMax: 4 }), null), 240);
  assert.equal(carryForwardLine('relay-uplink', q), ENDINGS['dust-lantern'].B.dialogueNext);
  const r = recordRun(p, buildDebrief('relay-uplink', win({ taskFails: 0, hackFails: 0, holdBreaks: 0, wavesSpawned: 3, wavesTotal: 3 }), null), 300);
  assert.equal(carryForwardLine('signal-blackout', r), ENDINGS['relay-uplink'].A.dialogueNext, 'SIGNAL BLACKOUT follows RELAY UPLINK now');
});

test('RELAY UPLINK: its own endings (loud is fine, interruptions are not), its own rows, and noise never costs points', () => {
  const e = (s) => evaluateEnding('relay-uplink', s)?.key;
  assert.equal(e({ won: true, alertMax: 4, taskFails: 0 }), 'A', 'a loud but uninterrupted hold is the CLEAR SIGNAL ending');
  assert.equal(e({ won: true, alertMax: 0, taskFails: 1 }), 'B'); assert.equal(e({ won: true, alertMax: 0 }), 'B', 'unknown interruptions count as broken');
  assert.equal(e({ won: false, alertMax: 0, taskFails: 0 }), 'fail');
  const base = { elapsed: 200, kills: 9, headshots: 2, damage: 800, wavesSpawned: 3, wavesTotal: 3, raidersKilled: 12, raidersTotal: 15, hackFails: 0, holdBreaks: 0, uplink: 60, taskFails: 0, found: 2, total: 2 };
  assert.equal(scoreRun('relay-uplink', win({ ...base, alertMax: 4 })), scoreRun('relay-uplink', win({ ...base, alertMax: 0 })));
  assert.ok(scoreRun('relay-uplink', win({ ...base, taskFails: 3 })) < scoreRun('relay-uplink', win(base)));
  const d = buildDebrief('relay-uplink', win(base), null), row = Object.fromEntries(d.rows);
  assert.equal(d.ending.title, 'CLEAR SIGNAL'); assert.equal(row.WAVES, '3/3'); assert.equal(row['RAIDERS DOWN'], '12/15'); assert.equal(row['HACK INTERRUPTED'], '0'); assert.equal(row.UPLINK, '100%');
  assert.ok(!('CLUES FOUND' in row) && !('PEAK ALERT' in row), 'no rows from the other operations');
  assert.deepEqual(d.next, { id: 'signal-blackout', title: 'SIGNAL BLACKOUT' });
  assert.equal(buildDebrief('relay-uplink', win({ ...base, won: false }), null).narrative, MISSION_STORIES['relay-uplink'].outroFail);
});

test('alert director: remembers the highest level ever reached, and the number survives cooling off', () => {
  const a = new MissionAlertDirector();
  assert.equal(a.maxIndex, 0); assert.equal(a.snapshot().max, 0);
  const guard = { alive: true, npc: true, brain: { p: { guard: true }, visible: true, target: { alive: true } } };
  for (let i = 0; i < 300; i++) a.update(1 / 60, [guard]);
  assert.equal(a.level, 'crisis'); assert.equal(a.maxIndex, 4);
  for (let i = 0; i < 60 * 60; i++) a.update(1 / 60, []);
  assert.equal(a.level, 'routine'); assert.equal(a.maxIndex, 4); assert.equal(a.snapshot().max, 4);
});

test('missions report real stats through the sim: Dust Lantern and Signal Blackout', async () => {
  const dl = await Simulation.create({ seed: 5, bots: 0, guards: 0, mission: 'dust-lantern', loot: false, contracts: false });
  const sb = await Simulation.create({ seed: 777, bots: 0, guards: 0, mission: 'signal-blackout', loot: false, contracts: false });
  try {
    const s0 = dl.mission.stats(false);
    assert.deepEqual([s0.won, s0.found, s0.total, s0.alertMax, s0.kills], [false, 0, 3, 0, 0]);
    dl.mission.clues[0].found = true; dl.mission.elapsed = 123.5; dl.mission.alert.maxIndex = 3;
    const s1 = dl.mission.stats(true); assert.deepEqual([s1.won, s1.found, s1.elapsed, s1.alertMax], [true, 1, 123.5, 3]);
    const t0 = sb.mission.stats(false); assert.deepEqual([t0.found, t0.total, t0.taskFails, t0.alertMax], [0, 3, 0, 0]); assert.equal(t0.traceLeft, 480);
    sb.mission.nodes[0].done = true; sb.mission.taskFails = 2; sb.mission.elapsed = 100;
    const t1 = sb.mission.stats(true); assert.deepEqual([t1.found, t1.taskFails, t1.traceLeft], [1, 2, 380]);
    for (const s of [dl, sb]) { const st = s.mission.stats(true), d = buildDebrief(s.mission.id, st, null); assert.ok(d && Number.isFinite(d.rating.score)); }
  } finally { dl.dispose(); sb.dispose(); }
});
