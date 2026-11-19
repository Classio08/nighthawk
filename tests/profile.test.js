// Guest profile: validation of saved data, XP / level curve, applying matches, badges, skin unlocks, event tracking, storage failures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultProfile, sanitizeProfile, levelInfo, xpAt, xpToNext, rankName, xpBreakdown, recordMatch, earnedBadges, badgeProgress, BADGES,
  MatchTracker, loadProfile, saveProfile, resetProfile, PROFILE_KEY, MAX_LEVEL, XP_CAP, SKIN_UNLOCK, skinUnlocked, skinsAt, favouriteWeapon, kdRatio,
} from '../src/profile.js';
import { SKINS } from '../src/sim/weapons.js';

const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
const match = (o = {}) => ({ placement: 8, total: 16, kills: 2, headshots: 1, damage: 240, time: 180, won: false, blast: 0, road: 0, weapons: { ar: 2 }, ...o });

test('level curve: starts at 1, each level costs a little more, caps at MAX_LEVEL', () => {
  assert.deepEqual([levelInfo(0).level, levelInfo(119).level, levelInfo(120).level], [1, 1, 2]);
  assert.equal(levelInfo(xpAt(7)).level, 7); assert.equal(levelInfo(xpAt(7) - 1).level, 6);
  for (let l = 1; l < 20; l++) assert.ok(xpToNext(l + 1) > xpToNext(l));
  const top = levelInfo(1e9); assert.equal(top.level, MAX_LEVEL); assert.equal(top.maxed, true); assert.equal(top.pct, 1);
  const mid = levelInfo(120 + 80); assert.equal(mid.level, 2); assert.equal(mid.into, 80); assert.ok(Math.abs(mid.pct - 80 / 160) < 1e-9);
  for (const bad of [NaN, -5, null, undefined, 'x', Infinity]) assert.equal(levelInfo(bad).level, 1);
});

test('ranks climb with level', () => {
  assert.deepEqual([1, 4, 5, 12, 20, 33, 50].map(rankName), ['RECRUIT', 'RECRUIT', 'PRIVATE', 'CORPORAL', 'LIEUTENANT', 'CAPTAIN', 'COLONEL']);
});

test('sanitizeProfile: garbage in, a valid profile out', () => {
  for (const junk of [null, undefined, 5, 'x', [], true]) assert.deepEqual({ ...sanitizeProfile(junk, 1000), createdAt: 0, updatedAt: 0 }, { ...defaultProfile(1000), createdAt: 0, updatedAt: 0 });
  const p = sanitizeProfile({ xp: -50, matches: 3, wins: 99, kills: NaN, deaths: '7', headshots: 1e30, damage: 12.9, timePlayed: Infinity, bestPlacement: 500, history: 'nope', weaponKills: [1, 2] }, 5);
  assert.equal(p.xp, 0); assert.equal(p.wins, 3, 'wins can never exceed matches'); assert.equal(p.kills, 0); assert.equal(p.deaths, 0, 'strings are not numbers');
  assert.equal(p.headshots, 1e9, 'huge numbers are capped'); assert.equal(p.damage, 12); assert.equal(p.timePlayed, 0); assert.equal(p.bestPlacement, 64);
  assert.deepEqual(p.history, []); assert.deepEqual(p.weaponKills, {});
});

test('sanitizeProfile: weapon keys are checked, prototype tricks do nothing, at most 16 weapons, history keeps the last 10', () => {
  const evil = JSON.parse('{"weaponKills":{"__proto__":9,"ar":4,"<b>":3,"constructor":2,"ok-key_1":"7","dmr":-1}}');
  const p = sanitizeProfile(evil);
  assert.deepEqual(Object.keys(p.weaponKills).sort(), ['ar', 'constructor'], 'bad names and non-numbers are dropped');
  assert.equal(p.weaponKills.ar, 4); assert.equal(Object.getPrototypeOf(p.weaponKills), Object.prototype); assert.equal({}.polluted, undefined);
  const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`w${i}`, i + 1]));
  assert.equal(Object.keys(sanitizeProfile({ weaponKills: many }).weaponKills).length, 16);
  const hist = Array.from({ length: 25 }, (_, i) => ({ at: i, placement: 3, kills: 1, time: 60, xp: 50, won: i === 24 }));
  const h = sanitizeProfile({ history: [...hist, null, 7] }).history; assert.ok(h.length <= 10); assert.ok(h.every((x) => x && typeof x.xp === 'number'));
});

test('xpBreakdown: win beats a loss, kills and survival add up, the cap holds', () => {
  const loss = xpBreakdown(match()), win = xpBreakdown(match({ placement: 1, won: true }));
  assert.ok(win.xp > loss.xp + 100);
  assert.equal(loss.xp, loss.parts.reduce((a, [, v]) => a + v, 0), 'the parts add up to the total');
  assert.ok(loss.parts.some(([l, v]) => /2 KILLS/.test(l) && v === 60));
  assert.ok(xpBreakdown(match({ kills: 5 })).xp > xpBreakdown(match({ kills: 2 })).xp);
  assert.ok(xpBreakdown(match({ time: 600 })).xp > xpBreakdown(match({ time: 60 })).xp);
  assert.equal(xpBreakdown(match({ kills: 1e6, headshots: 1e6, damage: 1e12, time: 1e9, placement: 1, won: true })).xp, XP_CAP);
  assert.ok(xpBreakdown(null).xp >= 20 && xpBreakdown({}).xp >= 20, 'a missing summary still pays the participation XP');
  const worst = xpBreakdown(match({ placement: 16, kills: 0, headshots: 0, damage: 0, time: 5 })); assert.ok(worst.xp >= 20 && worst.xp < 40);
});

test('recordMatch: totals accumulate, wins and deaths are exclusive, input is not mutated', () => {
  const p0 = defaultProfile(1); const snap = JSON.stringify(p0);
  const a = recordMatch(p0, match({ kills: 3, headshots: 2, blast: 1, weapons: { ar: 2, grenade: 1 } }), 10);
  assert.equal(JSON.stringify(p0), snap, 'the old profile is untouched');
  assert.deepEqual([a.profile.matches, a.profile.kills, a.profile.deaths, a.profile.wins, a.profile.headshots, a.profile.blastKills, a.profile.bestKills], [1, 3, 1, 0, 2, 1, 3]);
  const b = recordMatch(a.profile, match({ placement: 1, won: true, kills: 5, weapons: { ar: 4 } }), 20);
  assert.deepEqual([b.profile.matches, b.profile.wins, b.profile.deaths, b.profile.kills, b.profile.bestPlacement, b.profile.bestKills, b.profile.top5], [2, 1, 1, 8, 1, 5, 1]);
  assert.deepEqual(b.profile.weaponKills, { ar: 6, grenade: 1 }); assert.equal(b.profile.xp, a.gain.xp + b.gain.xp);
  assert.equal(b.profile.history.length, 2); assert.equal(b.profile.history[1].won, true);
  assert.deepEqual(favouriteWeapon(b.profile), ['ar', 6]); assert.equal(kdRatio(b.profile), 8);
});

test('recordMatch: headshots / blast / road cannot exceed kills, weapon names are screened, history is capped at 10', () => {
  let p = defaultProfile(1);
  p = recordMatch(p, match({ kills: 1, headshots: 50, blast: 9, road: 9, weapons: { __proto__: 5, 'x y': 3, constructor: 2 } })).profile;
  assert.deepEqual([p.headshots, p.blastKills, p.roadKills], [1, 1, 1]);
  assert.deepEqual(Object.keys(p.weaponKills), ['constructor']); assert.equal(p.weaponKills.constructor, 2);
  for (let i = 0; i < 15; i++) p = recordMatch(p, match()).profile;
  assert.equal(p.history.length, 10); assert.equal(p.matches, 16);
  assert.doesNotThrow(() => recordMatch(p, null)); assert.doesNotThrow(() => recordMatch(null, match()));
});

test('level-ups, new badges and new skins are reported once', () => {
  const r1 = recordMatch(defaultProfile(1), match({ kills: 1, placement: 1, won: true }));
  assert.ok(r1.gain.leveledUp && r1.gain.level1 > r1.gain.level0, 'a winning first match levels you up');
  assert.ok(r1.gain.badges.includes('FIRST BLOOD') && r1.gain.badges.includes('WINNER'));
  const r2 = recordMatch(r1.profile, match({ kills: 1 }));
  assert.ok(!r2.gain.badges.includes('FIRST BLOOD'), 'a badge is announced only when it is first earned');
  const near = { ...defaultProfile(1), xp: xpAt(2) - 5 };
  const up = recordMatch(near, match()); assert.ok(up.gain.level1 >= 2); assert.ok(up.gain.skins.includes('carbon'), 'carbon unlocks at level 2');
  assert.deepEqual(recordMatch({ ...defaultProfile(1), xp: xpAt(30) }, match()).gain.skins, [], 'nothing new when already past every unlock level');
});

test('skins: stock is always free, every skin has a level, unlocks are monotonic', () => {
  assert.equal(skinUnlocked(null, 1), true);
  assert.deepEqual(Object.keys(SKIN_UNLOCK).sort(), [...SKINS].sort(), 'every skin has an unlock level');
  assert.deepEqual(skinsAt(1), []); assert.equal(skinsAt(MAX_LEVEL).length, SKINS.length);
  for (let l = 1; l < 20; l++) assert.ok(skinsAt(l + 1).length >= skinsAt(l).length);
  assert.equal(skinUnlocked('reactive', 13), false); assert.equal(skinUnlocked('reactive', 14), true);
});

test('badges: progress is clamped to the goal and every badge can be earned', () => {
  const p = { ...defaultProfile(1), kills: 30, headshots: 3, matches: 12, wins: 0 };
  const prog = badgeProgress(p); const hunter = prog.find((b) => b.id === 'hunter');
  assert.equal(hunter.done, true); assert.equal(hunter.val, 25); assert.equal(prog.find((b) => b.id === 'warlord').done, false);
  assert.ok(earnedBadges(p).has('survivor') && !earnedBadges(p).has('winner'));
  assert.equal(new Set(BADGES.map((b) => b.id)).size, BADGES.length);
  const maxed = { ...defaultProfile(1), kills: 999, headshots: 999, matches: 999, wins: 999, top5: 999, bestKills: 99, blastKills: 99, roadKills: 99, timePlayed: 1e6 };
  assert.equal(earnedBadges(maxed).size, BADGES.length);
});

test('MatchTracker counts only MY hits and kills, never self damage', () => {
  const t = new MatchTracker();
  t.onEvent({ t: 'hit', by: 3, target: 7, dmg: 25 }, 3); t.onEvent({ t: 'hit', by: 3, target: 3, dmg: 40 }, 3);     // second one: I hurt myself (grenade / fall)
  t.onEvent({ t: 'hit', by: 5, target: 3, dmg: 99 }, 3); t.onEvent({ t: 'hit', by: 3, target: 7, dmg: NaN }, 3);
  t.onEvent({ t: 'kill', by: 3, target: 7, cause: 'bullet', w: 'dmr', head: true }, 3);
  t.onEvent({ t: 'kill', by: 3, target: 8, cause: 'explosion', w: 'grenade', head: false }, 3);
  t.onEvent({ t: 'kill', by: 3, target: 9, cause: 'vehicle', w: 'vehicle' }, 3);
  t.onEvent({ t: 'kill', by: 3, target: 3, cause: 'explosion', w: 'grenade' }, 3);                                    // suicide: not a kill
  t.onEvent({ t: 'kill', by: 6, target: 7, cause: 'bullet', w: 'ar', head: true }, 3); t.onEvent(null, 3); t.onEvent({ t: 'kill' }, 3);
  const s = t.summary({ placement: 2, kills: 3, time: 120, won: false }, 16);
  assert.deepEqual([s.headshots, s.damage, s.blast, s.road], [1, 25, 1, 1]);
  assert.deepEqual(s.weapons, { dmr: 1, grenade: 1, vehicle: 1 }); assert.equal(s.total, 16);
  t.reset(); assert.deepEqual(t.summary({ placement: 1, kills: 0, time: 1, won: true }, 16).weapons, {});
});

test('storage: round trip, corrupted JSON, missing and throwing storage', () => {
  const st = memStore();
  assert.deepEqual(loadProfile(st, 5), defaultProfile(5));
  const r = recordMatch(defaultProfile(1), match(), 2).profile; assert.equal(saveProfile(r, st), true);
  assert.deepEqual(loadProfile(st), r); assert.ok(st._m.has(PROFILE_KEY));
  st.setItem(PROFILE_KEY, '{not json'); assert.equal(loadProfile(st, 9).matches, 0);
  st.setItem(PROFILE_KEY, JSON.stringify({ matches: 4, wins: 9, xp: 'lots' })); const l = loadProfile(st); assert.deepEqual([l.matches, l.wins, l.xp], [4, 4, 0]);
  const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } };
  assert.equal(loadProfile(boom).matches, 0); assert.equal(saveProfile(r, boom), false); assert.doesNotThrow(() => resetProfile(boom));
  assert.equal(resetProfile(st).matches, 0); assert.equal(st._m.has(PROFILE_KEY), false);
});
