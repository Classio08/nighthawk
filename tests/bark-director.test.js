import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { BarkDirector, RULES, SPEAKERS, operationVoiceIds } from '../src/fx/bark-director.js';
import { VOICE, VOICE_CATEGORIES } from '../src/fx/voice-data.js';

const ctx = (t, o = {}) => ({ t, id: 0, hp: 100, maxHp: 100, x: 0, z: 0, ...o });
const kill = (o = {}) => ({ t: 'kill', by: 0, target: 5, head: false, ...o });

test('every voice line has a speaker we know, text, and a file on disk', () => {
  for (const [id, v] of Object.entries(VOICE)) {
    assert.ok(SPEAKERS[v.s], `${id}: unknown speaker ${v.s}`);
    assert.ok(v.t.length > 3 && v.d > 0.2 && v.d < 8, `${id}: bad text/duration`);
    assert.ok(existsSync(new URL(`../public/audio/voice/${id}.mp3`, import.meta.url)), `${id}.mp3 missing`);
  }
  assert.equal(Object.keys(VOICE).length, 84);
});

test('every rule points at a real category, and the operation preload list has no duplicates', () => {
  for (const c of Object.keys(RULES)) assert.ok(VOICE_CATEGORIES[c]?.length, `rule ${c} has no lines`);
  const ids = operationVoiceIds();
  assert.equal(new Set(ids).size, ids.length);
});

test('one voice at a time: a lower or equal priority line is dropped while another is speaking, a higher one cuts in', () => {
  const d = new BarkDirector();
  assert.ok(d.say('onHeadshot', 10));                       // prio 2
  assert.equal(d.say('onKill', 10.5), null);                // prio 1 while busy
  assert.equal(d.say('onContact', 10.5), null);             // prio 2 (equal) while busy
  assert.ok(d.say('onSpotted', 10.5));                      // prio 3 cuts in
});

test('category cooldowns stop chatter', () => {
  const d = new BarkDirector();
  assert.ok(d.say('onKill', 100));
  assert.equal(d.say('onKill', 104), null);                 // 7 s cooldown
  assert.ok(d.say('onKill', 108));
});

test('variants rotate round-robin and a requested variant is honoured', () => {
  const d = new BarkDirector(), seen = [];
  for (let i = 0; i < 4; i++) seen.push(d.say('onSpawn', i * 100 + (i ? 0 : 0))?.id);   // once-only: only the first plays
  assert.equal(seen.filter(Boolean).length, 1);
  const e = new BarkDirector(), a = e.say('onKill', 0).id, b = e.say('onKill', 50).id;
  assert.notEqual(a, b);
  assert.equal(new BarkDirector().say('onHostageFound', 0, 'onHostageFound_amara').speaker, 'amara');
});

test('kills: first blood once, double kill within 6 s, headshots get their own line', () => {
  const d = new BarkDirector();
  assert.equal(d.event(kill(), ctx(20)).category, 'onFirstBlood');
  assert.equal(d.event(kill(), ctx(25)).category, 'onMultiKill');      // 2nd kill 5 s later
  const e = new BarkDirector(); e.event(kill(), ctx(0));
  assert.equal(e.event(kill({ head: true }), ctx(30)).category, 'onHeadshot');
});

test('only the local player kills trigger lines (never somebody else or a suicide)', () => {
  const d = new BarkDirector();
  assert.equal(d.event(kill({ by: 3 }), ctx(5)), null);
  assert.equal(d.event(kill({ target: 0 }), ctx(5)), null);
});

test('low health call only when you are the one hit and below 35%', () => {
  const d = new BarkDirector();
  assert.equal(d.event({ t: 'hit', target: 0 }, ctx(5, { hp: 60 })), null);
  assert.equal(d.event({ t: 'hit', target: 9 }, ctx(5, { hp: 10 })), null);
  assert.equal(d.event({ t: 'hit', target: 0 }, ctx(5, { hp: 30 })).category, 'onLowHP');
});

test('mission events map to the right lines (SIGNAL BLACKOUT and DUST LANTERN)', () => {
  const m = (e) => new BarkDirector().event({ t: 'mission', ...e }, ctx(10));
  assert.equal(m({ phase: 'task' }).category, 'onHackStart');
  assert.equal(m({ phase: 'taskdone', count: 1 }), null);
  assert.equal(m({ phase: 'taskdone', count: 2 }).category, 'onHackHalf');
  assert.equal(m({ phase: 'unlocked' }).category, 'onHackComplete');
  assert.equal(m({ phase: 'taskfail', reason: 'moved' }), null);
  assert.equal(m({ phase: 'taskfail', reason: 'hit' }).category, 'onSpotted');
  assert.equal(m({ phase: 'rescued' }).speaker, 'amara');
  assert.equal(m({ phase: 'identified' }).id, 'onGhostHot_echo');
});

test('end of operation: complete vs failed, and somebody else\'s result is ignored', () => {
  assert.equal(new BarkDirector().event({ t: 'end', to: 0, won: true }, ctx(1)).category, 'onMissionComplete');
  assert.equal(new BarkDirector().event({ t: 'end', to: 0, won: false }, ctx(1)).category, 'onMissionFailed');
  assert.equal(new BarkDirector().event({ t: 'end', to: 4, won: true }, ctx(1)), null);
});

test('mortar warning only when the shell lands close', () => {
  assert.equal(new BarkDirector().event({ t: 'shell', x: 100, z: 0 }, ctx(1)), null);
  assert.equal(new BarkDirector().event({ t: 'shell', x: 10, z: 0 }, ctx(1)).category, 'onMortar');
});

test('alert escalation talks, cooling down does not; full crisis brings the villain', () => {
  const d = new BarkDirector();
  assert.equal(d.alert('routine', 1), null);
  assert.equal(d.alert('uneasy', 2), null);
  assert.equal(d.alert('searching', 3).category, 'onContact');
  assert.equal(d.alert('uneasy', 4), null);                 // cooling off: silent
  assert.equal(d.alert('crisis', 60).category, 'onEnemyTaunt');
  assert.ok(['viper', 'jackal'].includes(new BarkDirector().say('onEnemyTaunt', 0).speaker));
});

test('the director is deterministic: same events, same lines', () => {
  const run = () => { const d = new BarkDirector(), out = []; for (let i = 0; i < 30; i++) out.push(d.event(kill({ head: i % 3 === 0 }), ctx(i * 5))?.id ?? null); return out; };
  assert.deepEqual(run(), run());
});
