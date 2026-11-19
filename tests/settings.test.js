// Settings: validation of saved data, key rebinding, difficulty table.
import test from 'node:test';
import assert from 'node:assert/strict';
import { settings, sanitize, ACTIONS, DEFAULT_KEYS, QUALITY, keyLabel } from '../src/settings.js';
import { DIFFICULTY, DIFFICULTY_IDS, diffOf } from '../src/sim/difficulty.js';

const base = () => ({ gore: true, difficulty: 'normal', sens: 1, fov: 78, volume: 0.5, quality: 'high', keys: { ...DEFAULT_KEYS } });

test('sanitize keeps good values, clamps numbers and ignores junk', () => {
  const s = sanitize({ gore: false, difficulty: 'brutal', sens: 99, fov: 5, volume: '0.25', quality: 'low' }, base());
  assert.deepEqual([s.gore, s.difficulty, s.sens, s.fov, s.volume, s.quality], [false, 'brutal', 3, 60, 0.25, 'low']);
  const j = sanitize({ gore: 'yes', difficulty: 'godlike', sens: 'NaN', fov: null, volume: {}, quality: 'ultra', keys: 7 }, base());
  assert.deepEqual(j, base(), 'garbage changes nothing');
  assert.deepEqual(sanitize(null, base()), base()); assert.deepEqual(sanitize('x', base()), base());
});

test('sanitize: bad key codes are dropped, reserved keys refused, duplicate bindings fall back to the defaults', () => {
  const k = sanitize({ keys: { forward: 'ArrowUp', back: '<script>', jump: 'Escape', reload: 'Digit3', heal: 'F5', nope: 'KeyZ' } }, base()).keys;
  assert.equal(k.forward, 'ArrowUp'); assert.equal(k.back, 'KeyS'); assert.equal(k.jump, 'Space'); assert.equal(k.reload, 'KeyR'); assert.equal(k.heal, 'KeyH');
  assert.equal(k.nope, undefined, 'unknown actions are not invented');
  assert.deepEqual(sanitize({ keys: { forward: 'KeyZ', back: 'KeyZ' } }, base()).keys, DEFAULT_KEYS, 'two actions on one key -> default layout');
});

test('every action has a distinct default key and a label', () => {
  assert.equal(new Set(ACTIONS.map((a) => a[2])).size, ACTIONS.length);
  for (const [id, label, key] of ACTIONS) { assert.ok(id && label && key); assert.equal(settings.key(id), DEFAULT_KEYS[id]); }
});

test('rebind: moves the key, swaps with the action that had it, refuses reserved keys', () => {
  assert.deepEqual(settings.rebind('reload', 'KeyZ'), { ok: true, swapped: null }); assert.equal(settings.key('reload'), 'KeyZ');
  assert.deepEqual(settings.rebind('grenade', 'KeyZ'), { ok: true, swapped: 'reload' });
  assert.equal(settings.key('grenade'), 'KeyZ'); assert.equal(settings.key('reload'), 'KeyG', 'the old owner got the old key: nothing is ever unbound');
  assert.equal(new Set(ACTIONS.map(([id]) => settings.key(id))).size, ACTIONS.length, 'still no duplicates');
  for (const bad of ['Escape', 'Tab', 'Digit2', 'F11', 'MetaLeft', '', null, 'a b']) assert.equal(settings.rebind('use', bad).ok, false, String(bad));
  assert.equal(settings.rebind('flying', 'KeyY').ok, false);
  settings.resetKeys(); for (const [id] of ACTIONS) assert.equal(settings.key(id), DEFAULT_KEYS[id]);
});

test('setters validate and notify listeners', () => {
  let n = 0; const off = settings.onChange(() => n++);
  settings.setSens(10); assert.equal(settings.sens, 3); settings.setSens(-1); assert.equal(settings.sens, 0.2); settings.setSens('abc'); assert.equal(settings.sens, 0.2); settings.setSens(1);
  settings.setFov(200); assert.equal(settings.fov, 110); settings.setFov(78);
  settings.setVolume(2); assert.equal(settings.volume, 1); settings.setVolume(0.5);
  settings.setQuality('ultra'); assert.ok(QUALITY[settings.quality]); settings.setQuality('medium'); assert.equal(settings.quality, 'medium'); settings.setQuality('high');
  settings.setDifficulty('nightmare'); assert.equal(settings.difficulty, 'normal'); settings.setDifficulty('hard'); assert.equal(settings.difficulty, 'hard'); settings.setDifficulty('normal');
  assert.ok(n >= 8, `listeners were told (${n})`); off(); const before = n; settings.setSens(1.1); settings.setSens(1); assert.equal(n, before, 'unsubscribed');
});

test('keyLabel is readable', () => {
  assert.deepEqual(['KeyW', 'Space', 'ShiftLeft', 'ArrowUp', 'Digit5', 'Numpad7', ''].map(keyLabel), ['W', 'SPACE', 'L SHIFT', 'UP', '5', 'NUM 7', '-']);
});

test('difficulty table: ordered easy < normal < hard < brutal, normal changes nothing, unknown ids mean normal', () => {
  assert.deepEqual(DIFFICULTY_IDS, ['easy', 'normal', 'hard', 'brutal']);
  const d = DIFFICULTY_IDS.map((id) => DIFFICULTY[id]);
  for (let i = 1; i < d.length; i++) { assert.ok(d[i].skill > d[i - 1].skill && d[i].react < d[i - 1].react && d[i].aim < d[i - 1].aim && d[i].tricks > d[i - 1].tricks, `${d[i].id} is stronger than ${d[i - 1].id}`); }
  assert.deepEqual([DIFFICULTY.normal.skill, DIFFICULTY.normal.react, DIFFICULTY.normal.aim, DIFFICULTY.normal.tricks], [0, 1, 1, 1]);
  assert.equal(diffOf('nonsense'), DIFFICULTY.normal); assert.equal(diffOf(undefined), DIFFICULTY.normal);
});

test('sanitize: an older save that already uses a newer action\'s default key keeps its layout (the new action moves to a free key)', () => {
  const out = sanitize({ keys: { forward: 'KeyZ', back: 'KeyX', left: 'KeyN', right: 'KeyM' } }, { ...base() });
  assert.equal(out.keys.forward, 'KeyZ'); assert.equal(out.keys.back, 'KeyX');
  assert.notEqual(out.keys.smoke, 'KeyX'); assert.equal(new Set(Object.values(out.keys)).size, ACTIONS.length, 'no duplicates');
  // a save that does name every action (and has a real clash) still falls back to the defaults
  const clash = sanitize({ keys: { ...Object.fromEntries(ACTIONS.map(([id, , k]) => [id, k])), back: 'KeyX' } }, base());
  assert.deepEqual(clash.keys, Object.fromEntries(ACTIONS.map(([id, , k]) => [id, k])));
});
