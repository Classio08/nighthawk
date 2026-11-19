// MISSION STEALTH LAYER (offline operations only; deterministic; no graphics, no timers, no Math.random).
// Three bounded systems that sit on top of the existing garrison AI. None of them gives an NPC knowledge it could not have:
//   1. UNIFORM DISGUISE  press E over a downed guard: ~45 s of cover that garrison guards respect at range (disguise.js has the rules).
//   2. VIPER             a named hunter-killer who arrives once the garrison reaches full ALERT. He only follows contacts the
//                        garrison already holds (a guard's own sighting), plus his own eyes. He is not fooled by a uniform at long range.
//   3. SEARCHLIGHTS      two sweeping lights over the extraction approach. Being lit for ~1 s tells the garrison where you are.
// What the player and the HUD read: sim.stealth.snapshot(). Nothing here runs in an online room.
import { makeRng } from './rng.js';
import { findFreeSpot } from './map.js';
import { BotBrain } from './bot.js';
import { isCloaked } from './abilities.js';
import { smokeBlocks } from './smoke.js';
import { DISGUISE, UNIFORM_USELESS, isDisguised } from './disguise.js';

export const VIPER = {
  NAME: 'VIPER', ID: 'viper', COLOR: '#b565d9', HP: 240, SPEED: 10.5, ARMOR: 90, ARMOR_LV: 2,
  SPAWN_DIST: 42,            // metres from the operator when he is deployed
  RETARGET: 1.2,             // seconds between looks at what the garrison knows
  TRAIL_T: 6,                // a garrison contact older than this is cold
};

export const SEARCHLIGHT = {
  COUNT: 2, RADIUS: 4.2, CROUCH_RADIUS: 3.2, SWEEP_R: 13, SPEED: 0.42,   // radians/second around the pad
  EXPOSE_T: 0.9,             // seconds in the beam before the garrison is told
  COOLDOWN: 7,               // seconds before the lights can report you again
  HEIGHT: 14,                // the lamp heads (smoke below this line hides you from them)
};

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** where the lamps' light pools are at mission time `t` (pure: the renderer and the tests use it too) */
export function searchlightSpots(centre, t) {
  const spots = [];
  for (let i = 0; i < SEARCHLIGHT.COUNT; i++) {
    const dir = i % 2 === 0 ? 1 : -1, ph = (i / SEARCHLIGHT.COUNT) * Math.PI * 2 + 0.9 * i;
    const a = dir * SEARCHLIGHT.SPEED * t + ph;
    spots.push({ x: centre.x + Math.cos(a) * SEARCHLIGHT.SWEEP_R, z: centre.z + Math.sin(a) * SEARCHLIGHT.SWEEP_R, r: SEARCHLIGHT.RADIUS });
  }
  return spots;
}

export class MissionStealth {
  constructor(sim) {
    this.sim = sim;
    this.rng = makeRng(((sim.seed | 0) * 40503 + 0x51ED) | 0 || 7);                // its own stream for placement (adding a fighter still draws one yaw from the match stream: deterministic, but not RNG-free)
    this.viperEnabled = sim.mission?.id === 'signal-blackout';
    this.lightsEnabled = sim.mission?.id === 'signal-blackout';
    this.viper = null; this.viperDown = false; this.retargetT = 0;
    this.expose = 0; this.coolT = 0; this.spotted = 0; this.lit = false;
    this.lastHp = null; this.uniformsTaken = 0; this.disguiseBreaks = 0;
  }

  /* ---------------- 1. disguise ---------------- */

  /** E near a downed guard. Returns true when the key press was used here (so the E handler stops). */
  takeUniform(p) {
    const sim = this.sim;
    if (!p?.alive || p.veh || p.air) return false;
    let body = null, best = DISGUISE.TAKE_RANGE;
    for (const f of sim.fighters) {
      if (f.alive || !f.npc || f.uniformTaken || !f.brain?.p?.guard || f.brain.p.hunter) continue;
      const d = dist2(f, p);
      if (d <= best) { best = d; body = f; }
    }
    if (!body) return false;
    if (UNIFORM_USELESS.has(sim.mission?.alert?.level)) {
      sim.emit({ t: 'mission', phase: 'disguise', on: false, why: 'alert' });        // the garrison is checking faces: the jacket would not help
      return true;
    }
    body.uniformTaken = true;
    p.disguiseT = DISGUISE.DURATION; this.uniformsTaken++;
    sim.emit({ t: 'mission', phase: 'disguise', on: true, secs: DISGUISE.DURATION, x: body.x, z: body.z });
    return true;
  }

  _breakDisguise(p, why) {
    p.disguiseT = 0; this.disguiseBreaks++;
    this.sim.emit({ t: 'mission', phase: 'disguise', on: false, why });
  }

  _tickDisguise(p, dt) {
    if (!isDisguised(p)) return;
    p.disguiseT = Math.max(0, p.disguiseT - dt);
    if (p.disguiseT <= 0) { this._breakDisguise(p, 'expired'); return; }
    if (p.wasFiring || p.meleeT > 0 || p.nadeT > 0) { this._breakDisguise(p, 'noise'); return; }     // a shot, a strike or a throw
    if (this.lastHp !== null && p.hp < this.lastHp - 1e-6) { this._breakDisguise(p, 'hit'); return; }
    if (p.sprinting && p.speedH > 4) {
      for (const g of this.sim.fighters) {
        if (!g.alive || !g.npc || !g.brain?.p?.guard) continue;
        if (dist2(g, p) <= DISGUISE.SPRINT_BREAK_RANGE) { this._breakDisguise(p, 'sprint'); return; }
      }
    }
  }

  /* ---------------- 2. VIPER ---------------- */

  /** deploy him (once): 42 m from the operator on a free spot, hunting the freshest garrison contact */
  _deployViper(p) {
    const sim = this.sim;
    const a = this.rng() * Math.PI * 2;
    const spot = findFreeSpot(sim.map, this.rng, p.x + Math.cos(a) * VIPER.SPAWN_DIST, p.z + Math.sin(a) * VIPER.SPAWN_DIST, 6, 2.2);
    const op = { id: VIPER.ID, name: VIPER.NAME, color: VIPER.COLOR, hp: VIPER.HP, speed: VIPER.SPEED, weapon: 'ar' };
    const f = sim._addFighter(sim.fighters.length, VIPER.NAME, op, false, spot);
    f.npc = true; f.maxHp = VIPER.HP; f.hp = VIPER.HP;
    f.armor = VIPER.ARMOR; f.armorLv = VIPER.ARMOR_LV; f.nades = 2; f.smokes = 0;
    f.brain = new BotBrain(sim, f, 0.9, 'hunter');
    f.brain.post = { x: p.x, z: p.z }; f.brain.leash = 24;
    this.viper = f; this.retargetT = 0;
    sim.emit({ t: 'mission', phase: 'viper', id: f.id, x: f.x, z: f.z });
  }

  /** the hunter's trail: the freshest contact any garrison guard holds, else his own */
  _viperTrail() {
    let best = null, age = VIPER.TRAIL_T;
    for (const g of this.sim.fighters) {
      if (!g.alive || !g.npc || !g.brain?.p?.guard || g === this.viper) continue;
      const b = g.brain;
      if (b.lastSeen && b.lastSeenT < age) { age = b.lastSeenT; best = b.lastSeen; }
    }
    const own = this.viper?.brain;
    if (own?.lastSeen && own.lastSeenT < age) best = own.lastSeen;
    return best;
  }

  _tickViper(dt, p) {
    const v = this.viper;
    if (!v) return;
    if (!v.alive) {
      if (!this.viperDown) { this.viperDown = true; this.sim.emit({ t: 'mission', phase: 'viperdown', x: v.x, z: v.z }); }
      return;
    }
    this.retargetT -= dt;
    if (this.retargetT > 0) return;
    this.retargetT = VIPER.RETARGET;
    const trail = this._viperTrail();
    if (trail) { v.brain.post = { x: trail.x, z: trail.z }; v.brain.radioIn(trail, 0.1); }
  }

  /** 'unknown' before he is deployed, 'loose' while he hunts, 'down' once he is dead */
  viperStatus() { return !this.viper ? 'none' : (this.viperDown || !this.viper.alive) ? 'down' : 'loose'; }

  /* ---------------- 3. searchlights ---------------- */

  get lightsOn() { return this.lightsEnabled && this.sim.mission?.stage === 'extract' && !this.sim.mission?.finished; }

  spots() { return this.lightsOn ? searchlightSpots(this.sim.mission.extraction, this.sim.time) : []; }

  /** is operator `p` inside a light pool and visible to it? (cloak, smoke, a uniform and crouching all help) */
  isLit(p) {
    if (!p?.alive || isCloaked(p) || isDisguised(p) || p.veh) return false;
    const r = p.crouch ? SEARCHLIGHT.CROUCH_RADIUS : SEARCHLIGHT.RADIUS;
    for (const s of this.spots()) {
      if (Math.hypot(s.x - p.x, s.z - p.z) > r) continue;
      if (smokeBlocks(this.sim.smokes, s.x, SEARCHLIGHT.HEIGHT, s.z, p.x, p.y + 0.35, p.z)) continue;
      return true;
    }
    return false;
  }

  _tickLights(dt, p) {
    this.coolT = Math.max(0, this.coolT - dt);
    if (!this.lightsOn) { this.expose = 0; this.lit = false; return; }
    this.lit = this.isLit(p);
    this.expose = this.lit ? this.expose + dt : Math.max(0, this.expose - dt * 1.5);
    if (this.expose < SEARCHLIGHT.EXPOSE_T || this.coolT > 0) return;
    this.expose = 0; this.coolT = SEARCHLIGHT.COOLDOWN; this.spotted++;
    const where = { x: p.x, z: p.z };
    this.sim.emit({ t: 'mission', phase: 'spotlit', x: where.x, z: where.z });
    this.sim.alertGarrison?.(where, 2);                                   // the tower radios the garrison to the operator's position
  }

  /* ---------------- tick ---------------- */

  update(dt) {
    const sim = this.sim, m = sim.mission;
    if (!m || m.finished || sim.state !== 'playing') return;
    const p = sim.player;
    if (!p?.alive) { this._tickViper(dt, p); return; }
    this._tickDisguise(p, dt);
    this._tickLights(dt, p);
    if (this.viperEnabled && !this.viper && m.alert?.maxIndex >= 3) this._deployViper(p);
    this._tickViper(dt, p);
    this.lastHp = p.hp;
  }

  snapshot() {
    const p = this.sim.player;
    return {
      disguise: p ? +(p.disguiseT ?? 0).toFixed(2) : 0,
      viper: this.viper ? { status: this.viperStatus(), hp: Math.max(0, Math.round(this.viper.hp)), maxHp: this.viper.maxHp, id: this.viper.id } : null,
      lights: { on: this.lightsOn, lit: this.lit, expose: +this.expose.toFixed(2), spots: this.spots().map((s) => ({ x: +s.x.toFixed(2), z: +s.z.toFixed(2), r: s.r })) },
      spotted: this.spotted,
    };
  }
}

/** what each stealth 'mission' event says on screen (null = nothing). Missions call this after their own eventMessage. */
export function stealthMessage(e) {
  if (e?.t !== 'mission') return null;
  switch (e.phase) {
    case 'disguise': {
      if (e.on) return { text: `UNIFORM ON · ${Math.round(e.secs)}s OF COVER · WALK, DON'T RUN`, color: '#5be37a', secs: 2.8, sfx: 'pickup' };
      const why = { expired: 'THE UNIFORM HAS EXPIRED', noise: 'YOU MADE NOISE', hit: 'YOU WERE HIT', sprint: 'A GUARD SAW YOU RUN', alert: 'GARRISON ON FULL ALERT: THE UNIFORM IS USELESS' }[e.why] ?? 'DISGUISE LOST';
      return { text: e.why === 'alert' ? `UNIFORM USELESS · ${why.split(': ')[0]}` : `COVER BLOWN · ${why}`, color: '#ff9a4d', secs: 2.2, sfx: 'dry' };
    }
    case 'viper': return { text: 'VIPER · HUNTER-KILLER INBOUND', color: VIPER.COLOR, secs: 3.2, sfx: 'whistle' };
    case 'viperdown': return { text: 'VIPER DOWN', color: '#5be37a', secs: 2.6, sfx: 'healend' };
    case 'spotlit': return { text: 'CAUGHT IN THE SEARCHLIGHT · GARRISON ALERTED', color: '#ff9a4d', secs: 2.4, sfx: 'whistle' };
    default: return null;
  }
}

/** a short status for the mission panel (disguise time left, VIPER hunting, in the searchlight); '' when there is nothing to say */
export function stealthTag(sim) {
  const st = sim?.stealth, p = sim?.player;
  if (!st || !p) return '';
  const parts = [];
  if (isDisguised(p)) parts.push(`DISGUISED ${Math.ceil(p.disguiseT)}s`);
  if (st.lit) parts.push('IN THE LIGHT');
  if (st.viperStatus() === 'loose') parts.push('VIPER HUNTING');
  return parts.join(' · ');
}
