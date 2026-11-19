// Guest profile: career stats, XP, level / rank, badges and cosmetic unlocks. Saved in this browser only (localStorage "nh_profile_v1").
// Pure logic + a tiny storage wrapper, so it runs (and is unit-tested) in Node. UI lives in ui/profile-view.js.
//
// Rules of the design:
//  - cosmetics only: levels unlock weapon skins, never damage, guns or operators (no pay-to-win, no progress-to-win)
//  - the save is client-trusted (it is YOUR browser). That is fine for cosmetics; anything with real value (leaderboards, shop) needs a
//    server-side account later, and the match result would be signed by the server
//  - every field is validated on load: a hand-edited or corrupted save can never produce NaN, negative numbers or odd keys
import { SKINS } from './sim/weapons.js';

export const PROFILE_KEY = 'nh_profile_v1';
export const MAX_LEVEL = 50;
const BIG = 1e9;

/* ---------------- levels and ranks ---------------- */
/** XP needed to climb from `level` to `level + 1` */
export const xpToNext = (level) => 120 + 40 * (level - 1);
/** total XP needed to reach `level` (level 1 = 0) */
export const xpAt = (level) => { let t = 0; for (let l = 1; l < level; l++) t += xpToNext(l); return t; };

export function levelInfo(xp) {
  xp = typeof xp === 'number' && Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let level = 1, left = xp;
  while (level < MAX_LEVEL && left >= xpToNext(level)) { left -= xpToNext(level); level++; }
  const maxed = level >= MAX_LEVEL;
  const need = maxed ? 0 : xpToNext(level);
  return { level, into: maxed ? 0 : left, need, pct: maxed ? 1 : left / need, maxed, total: xp };
}

export const RANKS = [[1, 'RECRUIT'], [5, 'PRIVATE'], [10, 'CORPORAL'], [15, 'SERGEANT'], [20, 'LIEUTENANT'], [30, 'CAPTAIN'], [40, 'MAJOR'], [50, 'COLONEL']];
export const rankName = (level) => { let r = RANKS[0][1]; for (const [l, n] of RANKS) if (level >= l) r = n; return r; };

/** level at which each weapon skin unlocks (the stock look is always free) */
export const SKIN_UNLOCK = { carbon: 2, damascus: 4, gold: 7, magma: 10, reactive: 14 };
export const skinUnlocked = (skin, level) => !skin || (SKIN_UNLOCK[skin] ?? 1) <= level;
export const skinsAt = (level) => SKINS.filter((s) => skinUnlocked(s, level));

/* ---------------- the stored shape ---------------- */
export function defaultProfile(now = Date.now()) {
  return { v: 1, createdAt: now, updatedAt: now, xp: 0, matches: 0, wins: 0, top5: 0, kills: 0, deaths: 0, headshots: 0, blastKills: 0, roadKills: 0,
    damage: 0, timePlayed: 0, bestPlacement: 0, bestKills: 0, weaponKills: {}, history: [] };
}

const COUNTERS = ['xp', 'matches', 'wins', 'top5', 'kills', 'deaths', 'headshots', 'blastKills', 'roadKills', 'damage', 'timePlayed', 'bestKills'];
const nat = (v, max = BIG) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0);
const WKEY = /^[a-z0-9_-]{1,16}$/;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);                         // 'constructor' / 'toString' are valid-looking keys: never read them off the prototype
const bump = (o, k, n) => { o[k] = (own(o, k) ? o[k] : 0) + n; };

/** turn untrusted data (a saved blob) into a valid profile; garbage fields fall back to the defaults */
export function sanitizeProfile(raw, now = Date.now()) {
  const out = defaultProfile(now);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  out.createdAt = nat(raw.createdAt, 4e12) || now; out.updatedAt = nat(raw.updatedAt, 4e12) || out.createdAt;
  for (const k of COUNTERS) out[k] = nat(raw[k]);
  out.bestPlacement = nat(raw.bestPlacement, 64); out.bestKills = nat(raw.bestKills, 64);
  if (out.wins > out.matches) out.wins = out.matches;                                         // cannot win more than you played
  if (raw.weaponKills && typeof raw.weaponKills === 'object' && !Array.isArray(raw.weaponKills)) {
    for (const [k, v] of Object.entries(raw.weaponKills)) {                                   // Object.entries skips inherited keys; "__proto__" is refused by the key test
      if (!WKEY.test(k) || k === '__proto__') continue;
      const n = nat(v); if (n > 0 && Object.keys(out.weaponKills).length < 16) out.weaponKills[k] = n;
    }
  }
  if (Array.isArray(raw.history)) {
    out.history = raw.history.slice(-10).filter((h) => h && typeof h === 'object').map((h) => ({
      at: nat(h.at, 4e12), placement: nat(h.placement, 64), kills: nat(h.kills, 64), time: nat(h.time, 86400), xp: nat(h.xp, 5000), won: h.won === true }));
  }
  return out;
}

/* ---------------- XP for one match ---------------- */
export const XP_CAP = 1500;
/** @param s { placement, total, kills, headshots, damage, time, won }  @returns { xp, parts: [label, xp][] } */
export function xpBreakdown(s) {
  if (!s || typeof s !== 'object') s = {};
  const total = Math.max(2, nat(s.total, 64)), placement = Math.min(total, Math.max(1, nat(s.placement, 64) || total));
  const parts = [['PLAYED A MATCH', 20]];
  const surv = Math.round(Math.min(900, nat(s.time, 86400)) / 60 * 8); if (surv > 0) parts.push(['SURVIVAL', surv]);
  const place = Math.round(((total - placement) / (total - 1)) * 100); if (place > 0) parts.push([`PLACEMENT #${placement}`, place]);
  const kills = Math.min(40, nat(s.kills, 64)); if (kills > 0) parts.push([`${kills} KILL${kills === 1 ? '' : 'S'}`, kills * 30]);
  const hs = Math.min(40, nat(s.headshots, 64)); if (hs > 0) parts.push([`${hs} HEADSHOT${hs === 1 ? '' : 'S'}`, hs * 10]);
  const dmg = Math.min(60, Math.floor(nat(s.damage, 1e6) / 20)); if (dmg > 0) parts.push(['DAMAGE DEALT', dmg]);
  if (s.won) parts.push(['VICTORY', 150]);
  let xp = parts.reduce((a, [, v]) => a + v, 0);
  if (xp > XP_CAP) { parts.push(['CAP', XP_CAP - xp]); xp = XP_CAP; }
  return { xp, parts };
}

/* ---------------- badges (computed from lifetime stats, nothing extra is stored) ---------------- */
export const BADGES = [
  { id: 'first_blood', name: 'FIRST BLOOD', desc: 'Get a kill', goal: 1, val: (p) => p.kills },
  { id: 'hunter', name: 'HUNTER', desc: 'Get 25 kills', goal: 25, val: (p) => p.kills },
  { id: 'warlord', name: 'WARLORD', desc: 'Get 150 kills', goal: 150, val: (p) => p.kills },
  { id: 'headhunter', name: 'HEADHUNTER', desc: '20 headshot kills', goal: 20, val: (p) => p.headshots },
  { id: 'deadeye', name: 'DEADEYE', desc: '100 headshot kills', goal: 100, val: (p) => p.headshots },
  { id: 'survivor', name: 'SURVIVOR', desc: 'Finish 10 matches', goal: 10, val: (p) => p.matches },
  { id: 'veteran', name: 'VETERAN', desc: 'Finish 50 matches', goal: 50, val: (p) => p.matches },
  { id: 'winner', name: 'WINNER', desc: 'Win a match', goal: 1, val: (p) => p.wins },
  { id: 'champion', name: 'CHAMPION', desc: 'Win 10 matches', goal: 10, val: (p) => p.wins },
  { id: 'top_five', name: 'CONTENDER', desc: 'Finish top 5 in 5 matches', goal: 5, val: (p) => p.top5 },
  { id: 'brawler', name: 'BRAWLER', desc: '8 kills in one match', goal: 8, val: (p) => p.bestKills },
  { id: 'demolition', name: 'DEMOLITION', desc: '10 kills with explosions', goal: 10, val: (p) => p.blastKills },
  { id: 'roadkill', name: 'ROADKILL', desc: '5 kills with a vehicle', goal: 5, val: (p) => p.roadKills },
  { id: 'endurance', name: 'ENDURANCE', desc: 'Play for one hour in total', goal: 3600, val: (p) => p.timePlayed },
];
export const badgeProgress = (p) => BADGES.map((b) => { const v = b.val(p); return { id: b.id, name: b.name, desc: b.desc, goal: b.goal, val: Math.min(v, b.goal), done: v >= b.goal }; });
export const earnedBadges = (p) => new Set(badgeProgress(p).filter((b) => b.done).map((b) => b.id));

/* ---------------- applying a finished match ---------------- */
/**
 * @param profile a valid profile (not mutated)
 * @param s       { placement, total, kills, headshots, damage, time, won, blast, road, weapons: {id: kills} }
 * @returns { profile, gain: { xp, parts, level0, level1, leveledUp, rank0, rank1, badges: [names], skins: [ids] } }
 */
export function recordMatch(profile, s, now = Date.now()) {
  if (!s || typeof s !== 'object') s = {};
  const before = sanitizeProfile(profile, now);
  const p = sanitizeProfile(profile, now);
  const { xp, parts } = xpBreakdown(s);
  const total = Math.max(2, nat(s.total, 64)), placement = Math.min(total, Math.max(1, nat(s.placement, 64) || total));
  const kills = nat(s.kills, 64), time = Math.min(86400, nat(s.time, 86400));
  p.matches++; p.kills += kills; p.headshots += Math.min(kills, nat(s.headshots, 64)); p.damage += nat(s.damage, 1e6); p.timePlayed += time;
  p.blastKills += Math.min(kills, nat(s.blast, 64)); p.roadKills += Math.min(kills, nat(s.road, 64));
  if (s.won) p.wins++; else p.deaths++;
  if (placement <= 5) p.top5++;
  p.bestPlacement = p.bestPlacement ? Math.min(p.bestPlacement, placement) : placement;
  p.bestKills = Math.max(p.bestKills, kills);
  for (const [k, v] of Object.entries(s.weapons ?? {})) {
    if (!WKEY.test(k) || k === '__proto__') continue;
    const n = nat(v, 64); if (n > 0 && (own(p.weaponKills, k) || Object.keys(p.weaponKills).length < 16)) { bump(p.weaponKills, k, n); p.weaponKills[k] = Math.min(BIG, p.weaponKills[k]); }
  }
  p.xp = Math.min(BIG, p.xp + xp); p.updatedAt = now;
  p.history = [...p.history, { at: now, placement, kills, time, xp, won: !!s.won }].slice(-10);
  const l0 = levelInfo(before.xp), l1 = levelInfo(p.xp);
  const b0 = earnedBadges(before), b1 = earnedBadges(p), badges = BADGES.filter((b) => b1.has(b.id) && !b0.has(b.id)).map((b) => b.name);
  const skins = SKINS.filter((k) => skinUnlocked(k, l1.level) && !skinUnlocked(k, l0.level));
  return { profile: p, gain: { xp, parts, level0: l0.level, level1: l1.level, leveledUp: l1.level > l0.level, rank0: rankName(l0.level), rank1: rankName(l1.level), badges, skins } };
}

/** your best weapon: [id, kills] or null */
export const favouriteWeapon = (p) => Object.entries(p.weaponKills).sort((a, b) => b[1] - a[1])[0] ?? null;
export const kdRatio = (p) => Math.round((p.kills / Math.max(1, p.deaths)) * 100) / 100;

/* ---------------- collecting stats while a match runs (works for solo and online: both deliver the same events) ---------------- */
export class MatchTracker {
  constructor() { this.reset(); }
  reset() { this.headshots = 0; this.damage = 0; this.blast = 0; this.road = 0; this.weapons = {}; }
  /** feed every sim event; `me` = the local player's fighter id */
  onEvent(e, me) {
    if (!e || e.by !== me) return;
    if (e.t === 'hit') { if (e.target !== me && Number.isFinite(e.dmg) && e.dmg > 0) this.damage += Math.min(e.dmg, 300); return; }
    if (e.t !== 'kill' || e.target === me) return;
    if (e.cause === 'bullet' && e.head) this.headshots++;
    else if (e.cause === 'explosion') this.blast++;
    else if (e.cause === 'vehicle') this.road++;
    const w = typeof e.w === 'string' ? e.w : e.cause;
    if (typeof w === 'string' && WKEY.test(w) && w !== '__proto__') bump(this.weapons, w, 1);
  }
  /** result = the `end` event for the local player: { placement, kills, time, won } */
  summary(result, total) {
    return { placement: result.placement, total, kills: result.kills, time: result.time, won: !!result.won,
      headshots: this.headshots, damage: Math.round(this.damage), blast: this.blast, road: this.road, weapons: { ...this.weapons } };
  }
}

/* ---------------- storage ---------------- */
const store = (s) => { try { return s ?? globalThis.localStorage ?? null; } catch { return null; } };

export function loadProfile(storage, now = Date.now()) {
  const st = store(storage);
  try { const raw = st?.getItem(PROFILE_KEY); return raw ? sanitizeProfile(JSON.parse(raw), now) : defaultProfile(now); } catch { return defaultProfile(now); }
}
/** @returns true if it was written (private mode / quota errors are swallowed: the game must never break because a save failed) */
export function saveProfile(profile, storage) {
  const st = store(storage); if (!st) return false;
  try { st.setItem(PROFILE_KEY, JSON.stringify(profile)); return true; } catch { return false; }
}
export function resetProfile(storage) { const st = store(storage); try { st?.removeItem(PROFILE_KEY); } catch { /* ignore */ } return defaultProfile(); }
