// Bot brain. Steering = Yuka (Seek + ObstacleAvoidance). Eyes = Rapier ray (sim.canSee). Ears = sim.makeNoise -> hear().
// Decisions = UTILITY AI: every desire gets a score 0..1 from the situation and the bot's PERSONALITY, the highest score wins
// (the current choice gets a small bonus so bots do not flip-flop). Desires:
//   zone | cover | engage | flank | suppress | hunt | investigate | camp | regroup | return(guards) | roam
// Squad radio / flanking lives in squad.js, personalities in personality.js.
import * as YUKA from 'yuka';
import { WEAPONS, SLOT_ORDER } from './weapons.js';
import { WEAPON_RANK } from './loot.js';
import { findCover, findPerch, insideAnyBox, MAP_HALF } from './map.js';
import { searchWaypoint } from './guard-doctrine.js';
import { PERSONALITIES } from './personality.js';
import { diffOf } from './difficulty.js';
import { botAir } from './drop.js';
import { botUseAbility, activeAbility, isCloaked, ABILITIES } from './abilities.js';

const BASE_SPEED = 7;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapAngle = (a) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; };
const wrap = (a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

/**
 * Lower is better. A bot still favours nearby enemies, but can deliberately
 * finish a weakened opponent, answer incoming fire, or honour squad focus.
 * Kept pure so target-selection tuning can be regression-tested.
 */
export function scoreTargetCandidate({ distance, current = false, lastHurt = false, attacking = false, wounded = false, isolated = false, squadFocus = false }) {
  return distance
    - (current ? 9 : 0)
    - (lastHurt ? 12 : 0)
    - (attacking ? 5 : 0)
    - (wounded ? 4 : 0)
    - (isolated ? 2 : 0)
    - (squadFocus ? 7 : 0);
}

/** Cover triggers for damage, active incoming pressure, or a risky reload. */
export function shouldSeekCover({ hurtBadly = false, underFire = false, reloadFight = false }) {
  return hurtBadly || underFire || reloadFight;
}

export class BotBrain {
  /** @param skill 0..1 (higher = faster reactions, better aim, turns quicker)  @param personality key of PERSONALITIES */
  constructor(sim, f, skill = 0.6, personality = 'brawler') {
    this.pid = PERSONALITIES[personality] ? personality : 'brawler';
    this.p = PERSONALITIES[this.pid];
    this.baseSkill = clamp(skill + this.p.skillBonus, 0.2, 0.97);
    this.sim = sim; this.f = f;
    this.state = 'roam'; this.decideT = 0; this.scores = {};
    this.supT = 0; this.supOn = false; this.flankPt = null; this.barrelAim = null;
    this.radio = null; this.perch = null; this.perchPhase = -1; this.campT = 0; this.post = null; this.leash = 18;
    this.patrolRoute = null; this.patrolIndex = 0;
    this.searchAnchor = null; this.searchGoal = null; this.searchIndex = 0;
    this.main = this.p.weapons.includes(f.op.weapon) ? f.op.weapon : this.p.weapons[f.id % this.p.weapons.length];
    if (f.weapons[this.main].have && f.cur !== this.main) f.cur = this.main;
    this.mainT = 0; this.lootScanT = 0; this.lootPickPrev = null; this.lootBan = new Map(); this.lootId = -1; this.lootT = 0;
    this.fov = 1.9;
    this.setDifficulty(sim.opts.difficulty);                       // sets skill, reaction, turnSpeed, aimErr (see difficulty.js)

    this.target = null; this.visible = false; this.engageT = 0;
    this.lastSeen = null; this.lastSeenT = 99;
    this.heard = null; this.heardT = 99;
    this.lastHurtBy = null; this.hurtT = 99;
    this.lookAt = null;
    this.scanT = sim.rng() * 0.25;
    this.aimT = 0; this.offY = 0; this.offP = 0;
    this.burstT = 0.5; this.burstPause = 0;
    this.strafeDir = sim.rng.sign(); this.strafeT = 0;
    this.coverPt = null; this.coverT = 0; this.coverCool = 0;
    this.roamGoal = null; this.roamT = 0;
    this.path = null; this.pathGoal = null; this.pathT = 0; this.stuckCount = 0; this.navOk = false;       // A* route (nav.js) around buildings
    this.unstick = null; this.stuckT = 0; this.stuckCheck = 0.5; this.px = f.x; this.pz = f.z;
    this.jumpCool = 0; this.moving = false; this.sprint = false;
    this.nadeCool = 6 + sim.rng() * 8;

    // Yuka steering: one vehicle per bot, we copy its velocity into the Rapier character controller.
    this.goal = new YUKA.Vector3(f.x, 0, f.z);
    this.vehicle = new YUKA.Vehicle();
    this.vehicle.boundingRadius = 0.7; this.vehicle.maxForce = 70; this.vehicle.mass = 1;
    this.vehicle.position.set(f.x, 0, f.z);
    this.seek = new YUKA.SeekBehavior(this.goal);
    this.avoid = new YUKA.ObstacleAvoidanceBehavior(sim.obstacles);
    this.vehicle.steering.add(this.seek);
    this.vehicle.steering.add(this.avoid);
  }

  /** (re)apply a difficulty level (difficulty.js): derives skill, reaction time, turn speed and aim error from the bot's own skill */
  setDifficulty(id) {
    const d = this.diff = diffOf(id), skill = this.skill = clamp(this.baseSkill + d.skill, 0.1, 0.99);
    this.reaction = lerp(1.0, 0.4, skill) * d.react;
    this.turnSpeed = lerp(3.0, 7.5, skill);
    this.aimErr = lerp(0.11, 0.035, skill) * d.aim;
    this.trickRate = d.tricks;
  }

  /* ----- senses ----- */

  /** called by sim.makeNoise() when somebody fires/throws nearby */
  hear(x, z) {
    if (this.visible) return;
    if (this.sim.rng() > 0.2 + this.skill * 0.4) return; // often bots just do not react
    this.heard = { x, z }; this.heardT = 0;
    this.lookAt = { x, z, t: 0.9 };
  }

  /** squad radio: "contact at x,z" arrives after a short delay */
  radioIn(contact, delay) { this.radio = { x: contact.x, z: contact.z, at: this.sim.time + delay }; }

  onHurt(source) {
    this.hurtT = 0;
    if (source && source !== this.f && source.alive) {
      this.lastHurtBy = source;
      this.lastSeen = { x: source.x, z: source.z }; this.lastSeenT = 0.5;
      this.lookAt = { x: source.x, z: source.z, t: 1.0 };
    }
  }

  _scan() {
    const { sim, f } = this;
    let best = null, bs = 1e9;
    for (const o of sim.fighters) {
      if (o === f || !o.alive || o.air) continue;                          // (nobody shoots at a parachute)
      if (f.squad && f.squad.allies(f, o)) continue;                       // squad-mates are friends (until the circle gets small)
      if (this.p.guard && o.npc) continue;                                 // guards do not shoot each other
      const d = Math.hypot(o.x - f.x, o.z - f.z);
      if (d > 65) continue;
      if (isCloaked(o) && d > ABILITIES.shadow.cloakRange) continue;        // Shadow's Cloak: only seen from up close
      if (!sim.canSee(f, o, 65, this.fov)) continue;
      // Threat-aware target selection: do not tunnel on the nearest body.
      // Facing + firing means this opponent is an immediate threat; low-health
      // enemies are finishable, and squad contacts receive a modest focus bonus.
      const toBot = Math.atan2(-(f.x - o.x), -(f.z - o.z));
      const facingBot = Math.abs(wrap(toBot - o.yaw)) < 0.72;
      const attacking = facingBot && (o.wasFiring || o.fireT > 0);
      const wounded = o.maxHp > 0 && o.hp / o.maxHp <= 0.45;
      const isolated = !!o.squad && o.squad.alive.every((mate) =>
        mate === o || Math.hypot(mate.x - o.x, mate.z - o.z) > 14);
      const squadFocus = !!(f.squad?.fresh() && f.squad.contact.id === o.id);
      const s = scoreTargetCandidate({
        distance: d, current: o === this.target, lastHurt: o === this.lastHurtBy,
        attacking, wounded, isolated, squadFocus,
      });
      if (s < bs) { bs = s; best = o; }
    }
    // an enemy standing next to an explosive barrel: shoot the BARREL (from a safe distance), not the enemy
    this.barrelAim = null;
    if (best && !this.p.guard) {
      for (const b of sim.barrels) {
        if (b.dead || b.fuse >= 0 || Math.hypot(b.x - best.x, b.z - best.z) > 3.6) continue;
        const d = Math.hypot(b.x - f.x, b.z - f.z); if (d < 10 || d > 55) continue;
        if (sim.losClear(f.x, f.eyeY, f.z, b.x - (b.x - f.x) / d * 0.7, 0.55, b.z - (b.z - f.z) / d * 0.7)) { this.barrelAim = b; break; }
      }
    }
    if (best) {
      const newContact = this.target !== best || !this.visible;
      if (this.target !== best) { this.target = best; this.engageT = 0; this.burstT = 0.5; this.burstPause = 0; }
      this.visible = true;
      this.lastSeen = { x: best.x, z: best.z }; this.lastSeenT = 0;
      if (newContact && this.p.guard) {
        for (const ally of sim.fighters) {
          if (ally === f || !ally.alive || !ally.npc || !ally.brain?.p.guard) continue;
          const d = Math.hypot(ally.x - f.x, ally.z - f.z);
          if (d <= 70) ally.brain.radioIn(this.lastSeen, 0.18 + d / 120);
        }
      }
      if (this.p.guard) { this.searchAnchor = { ...this.lastSeen }; this.searchGoal = null; this.searchIndex = 0; }
      f.squad?.report(f, best);
    } else {
      this.visible = false;
    }
  }

  /* ----- helpers ----- */

  /** where to steer to reach (gx,gz): the goal itself when the straight line is clear, else the next waypoint of an A* route (re-planned when the goal moves or every ~1.3 s) */
  _nav(gx, gz, dt) {
    const { sim, f } = this, nav = sim.nav;
    this.navOk = true;
    if (nav.segmentClear(f.x, f.z, gx, gz)) { this.path = null; return { x: gx, z: gz }; }
    this.pathT -= dt;
    // keep the route we have (re-planning every second makes equal-length routes flip-flop and the bot dither); plan again only when the goal moved, the route is gone, we were pushed off it, or it is old
    const goalMoved = !this.pathGoal || Math.hypot(this.pathGoal.x - gx, this.pathGoal.z - gz) > 5;
    const off = this.path && this.path.length && !nav.segmentClear(f.x, f.z, this.path[0].x, this.path[0].z);
    if ((!this.path || !this.path.length || goalMoved || off || this.pathT <= 0) && sim.navBudget > 0) {
      sim.navBudget--; this.pathT = 8 + (f.id % 5) * 0.5; this.pathGoal = { x: gx, z: gz };
      this.path = nav.findPath(f.x, f.z, gx, gz);
    }
    const path = this.path;
    if (!path || !path.length) { this.navOk = false; return { x: gx, z: gz }; }                  // no route found (or no budget yet): steer straight, avoidance + unstick still work
    while (path.length > 1 && (Math.hypot(path[0].x - f.x, path[0].z - f.z) < 1.8 || nav.segmentClear(f.x, f.z, path[1].x, path[1].z))) path.shift();
    return path[0];
  }

  _pickRoam() {
    const { sim } = this, z = sim.zone;
    for (let i = 0; i < 14; i++) {
      const a = sim.rng() * Math.PI * 2, r = Math.sqrt(sim.rng()) * z.nextR * 0.85;
      const x = z.nextX + Math.cos(a) * r, zz = z.nextZ + Math.sin(a) * r;
      if (Math.abs(x) > MAP_HALF - 6 || Math.abs(zz) > MAP_HALF - 6) continue;
      if (insideAnyBox(sim.map, x, zz, 2.5)) continue;
      this.roamGoal = { x, z: zz }; this.roamT = 0; return;
    }
    this.roamGoal = { x: z.nextX, z: z.nextZ }; this.roamT = 0;
  }

  _throwAt(tx, ty, tz) {
    const { sim, f } = this;
    const dx = tx - f.x, dz = tz - f.z, R = Math.hypot(dx, dz);
    if (R < 7) return false;
    const g = 22, T = clamp(R / 13, 0.7, 1.7), vh = R / T;
    const vy = (ty - f.eyeY + 0.5 * g * T * T) / T - 3.5;      // the sim adds +3.5 to the vertical speed
    const e = (1 - this.skill) * 0.08;
    const vx = (dx / R) * vh * (1 + (sim.rng() - 0.5) * e), vz = (dz / R) * vh * (1 + (sim.rng() - 0.5) * e);
    const sp = Math.hypot(vx, vy, vz);
    return sim.throwGrenade(f, { x: vx / sp, y: vy / sp, z: vz / sp }, sp);
  }

  _chooseWeapon(dist) {
    const { sim, f } = this;
    const st = f.weapons[f.cur];
    if (st.ammo <= 0 && st.reserve <= 0) {                      // empty: switch to anything that still has ammo
      for (const id of ['pistol', ...SLOT_ORDER]) { const s = f.weapons[id]; if (s.have && s.ammo + s.reserve > 0) { sim.switchWeapon(f, id); return; } }
      return;
    }
    if (f.switchT > 0 || f.reloadT > 0) return;
    const main = this.main;
    if (dist < 6 && f.cur !== 'shotgun' && f.weapons.shotgun.have && f.weapons.shotgun.ammo > 0 && this.skill > 0.5 && sim.rng() < 0.02) sim.switchWeapon(f, 'shotgun');
    else if (dist > 16 && f.cur !== main && f.weapons[main].have && f.weapons[main].ammo + f.weapons[main].reserve > 0) sim.switchWeapon(f, main);
  }

  /** loot matches: use the best gun you actually have (your personality's favourites first), re-checked about once a second */
  _refreshMain() {
    const { f } = this;
    const owned = SLOT_ORDER.filter((k) => f.weapons[k].have && f.weapons[k].ammo + f.weapons[k].reserve > 0);
    let best = this.p.weapons.find((k) => owned.includes(k));
    if (!best) best = owned.filter((k) => k !== 'pistol').sort((a, b) => WEAPON_RANK[b] - WEAPON_RANK[a])[0] ?? 'pistol';
    this.main = best;
  }

  /**
   * UTILITY AI: score every desire 0..1 from the situation + personality; the best score wins.
   * (Read bot.scores in the debugger to see why a bot did what it did.)
   */
  _decide({ outNow, relocating, tgt, dist, hpF }) {
    const { sim, f } = this, p = this.p, z = sim.zone, sq = f.squad, S = {};
    S.roam = 0.12;
    S.zone = outNow > 0 ? 2 : (relocating && !p.guard ? 0.62 + 0.1 * p.caution : 0);
    S.cover = this.coverT > 0 && this.coverPt ? 0.9 : 0;
    if (p.guard && this.post) {                                  // guards: stay near the post
      const dPost = Math.hypot(f.x - this.post.x, f.z - this.post.z);
      S.return = dPost > this.leash ? 1.0 : (dPost > this.leash * 0.45 && !tgt ? 0.4 : 0);
      S.hold = 0.3;
      if (!tgt && this.lastSeen && this.lastSeenT >= 3 && this.lastSeenT < 9) S.search = 0.54;
      else if (!tgt && (!this.lastSeen || this.lastSeenT >= 9) && (!this.heard || this.heardT >= 8) && this.patrolRoute?.length) S.patrol = 0.38;
    }
    if (tgt) S.engage = clamp(0.58 + 0.35 * p.aggr - 0.2 * clamp(dist / 65, 0, 1) - (hpF < 0.35 ? 0.25 * p.caution : 0), 0, 1);
    if (this.lastSeen && this.lastSeenT < 3) S.hunt = 0.3 + 0.45 * p.aggr;
    if (this.heard && this.heardT < 8) S.investigate = 0.15 + 0.5 * p.curiosity;
    if (sq) {                                                    // squad commander doctrine
      const order = sq.orderFor(f);
      if (order === 'fallback') S.fallback = 0.92 + 0.05 * p.caution;
      this.flankPt = sq.flankPoint(f, insideAnyBox);
      if (this.flankPt) S.flank = 0.5 + 0.3 * p.tact;
      if (!tgt && sq.united && sq.pinner() === f && sq.alive.some((m) => m !== f && m.brain && m.brain.state === 'flank')) S.suppress = 0.66;
      if (!sq.fresh() && sq.united) {
        const lead = sq.alive[0];
        if (lead && lead !== f && Math.hypot(lead.x - f.x, lead.z - f.z) > 28) S.regroup = 0.25 + 0.3 * p.social;
      }
    } else this.flankPt = null;
    if (p.camper > 0.3 && !p.guard) {                            // sniper's nest, re-picked every time the circle changes
      if (this.perchPhase !== z.phase) { this.perch = findPerch(sim.map, sim.rng, z.nextX, z.nextZ, Math.max(12, z.nextR * 0.9)); this.perchPhase = z.phase; this.campT = 0; }
      if (this.perch) S.camp = (0.3 + 0.4 * p.camper) * (this.campT > 25 ? 0.4 : 1);
    }
    // contracts: airdrops and hardpoints attract the greedy; a bounty on somebody else attracts the aggressive
    const ct = p.guard ? null : sim.contracts.wantedBy(f, 95);
    this.contractPt = ct;
    if (ct) S.contract = 0.3 + 0.5 * p.greed + (ct.type === 'airdrop' && ct.state === 'landed' ? 0.12 : 0) + (ct.type === 'uplink' && ct.stage === 1 ? 0.08 : 0) - (tgt ? 0.3 : 0);
    const bounty = sim.contracts.of('bounty');
    if (bounty && bounty.who !== f.id && !p.guard && p.aggr >= 0.7 && Math.hypot(bounty.x - f.x, bounty.z - f.z) < 85) { this.lastSeen = { x: bounty.x, z: bounty.z }; this.lastSeenT = 0.6; S.hunt = Math.max(S.hunt ?? 0, 0.3 + 0.45 * p.aggr); }
    // vehicles: far from the next circle (or just a thief at heart) => walk to the closest free buggy / bike and drive it
    this.stealVeh = null;
    if (!p.guard && !f.veh && this.noVehT <= 0 && sim.vehicles.list.length) {
      const sv = sim.vehicles.nearest(f, 55, true);
      if (sv) {
        const far = Math.hypot(f.x - z.nextX, f.z - z.nextZ) > Math.max(40, z.nextR + 25);
        this.stealVeh = sv;
        S.steal = clamp(0.18 + 0.5 * p.drive + (far ? 0.3 : 0) + (outNow > 0 || relocating ? 0.25 : 0) - (tgt ? 0.35 : 0), 0, 0.95);
      }
    }
    // loot matches: go and pick up what you need (guns first), and use a medkit when hurt and nobody is shooting at you
    this.lootPick = null;
    if (sim.opts.loot && !p.guard && !f.veh) {
      if (this.lootScanT <= 0 || (this.lootPickPrev && this.lootPickPrev.it.gone)) { this.lootScanT = 0.3 + sim.rng() * 0.2;       // look around for loot a few times a second, not every tick
        this.lootPickPrev = sim.loot.wantedBy(f, 55, (id) => (this.lootBan.get(id) ?? 0) > sim.time); }
      const lp = this.lootPickPrev && !this.lootPickPrev.it.gone ? this.lootPickPrev : null;
      if (lp) { this.lootPick = lp; S.loot = clamp(0.18 + 0.52 * lp.score + 0.1 * p.greed - (tgt ? 0.45 : 0), 0, 0.9); }
      if (f.meds > 0 && f.hp < f.maxHp * 0.62 && f.hp < f.maxHp && !tgt && this.hurtT > 1.5) S.heal = 0.93;
      if (f.healT > 0 && !tgt) S.heal = 1.0;
    }
    if (S[this.state] !== undefined) S[this.state] += 0.1;       // stickiness: do not flip-flop
    this.scores = S;
    let best = 'roam', bv = -1;
    for (const k in S) if (S[k] > bv) { bv = S[k]; best = k; }
    return best;
  }

  /** the bot is the DRIVER of f.veh: steer towards the next safe circle (or run an enemy over), dodge walls, back out when stuck, get out at the goal */
  _drive(dt) {
    const { sim, f } = this, v = f.veh, z = sim.zone, vs = sim.vehicles;
    f.sprinting = false; f.ads = false; f.yaw = v.yaw; f.pitch = 0;
    sim.updateWeapon(f, dt, false, false);
    this.driveT = (this.driveT ?? 0) + dt;
    const leave = (cool) => { vs.leave(f); this.noVehT = cool; this.driveT = 0; };
    if (f.seat !== 0) { if (this.driveT > 4) leave(15); return; }
    const tgt = this.visible ? this.target : null;
    let gx = z.nextX, gz = z.nextZ, chase = false;
    if (tgt && tgt.alive && this.p.aggr > 0.6 && Math.hypot(tgt.x - v.x, tgt.z - v.z) < 70) { gx = tgt.x; gz = tgt.z; chase = true; }
    const dGoal = Math.hypot(gx - v.x, gz - v.z);
    if ((!chase && dGoal < Math.max(16, z.nextR * 0.45)) || v.hp < v.maxHp * 0.22 || this.driveT > 70 || (this.stuckCount ?? 0) >= 3) { leave(30); return; }
    const probe = (yaw, d) => insideAnyBox(sim.map, v.x - Math.sin(yaw) * d, v.z - Math.cos(yaw) * d, v.T.r + 0.7);
    const blocked = (yaw) => probe(yaw, 5) || probe(yaw, 10) || probe(yaw, 15);
    const ang = Math.atan2(-(gx - v.x), -(gz - v.z)), diff = wrapAngle(ang - v.yaw);
    let want = ang;
    if (blocked(v.yaw + clamp(diff, -0.3, 0.3))) {                                  // wall ahead: take whichever side is open
      const L = !blocked(v.yaw + 0.8), R = !blocked(v.yaw - 0.8);
      want = L && (!R || diff >= 0) ? v.yaw + 0.8 : R ? v.yaw - 0.8 : v.yaw + 1.6;
    }
    const d2 = wrapAngle(want - v.yaw);
    let steer = clamp(-d2 * 2.2, -1, 1), thr = Math.abs(d2) > 1.6 ? 0.5 : Math.abs(d2) > 0.8 ? 0.7 : 1;
    if (Math.abs(v.speed) < 1.3 && !(this.reverseT > 0)) this.stuckT = (this.stuckT ?? 0) + dt; else if (Math.abs(v.speed) >= 1.3) this.stuckT = 0;
    if (this.stuckT > 1) { this.reverseT = 1.2; this.revSteer = sim.rng() < 0.5 ? -1 : 1; this.stuckT = 0; this.stuckCount = (this.stuckCount ?? 0) + 1; }
    if (this.reverseT > 0) { this.reverseT -= dt; thr = -1; steer = this.revSteer; }
    v.input = { thr, steer, brake: false, boost: dGoal > 60 && !(this.reverseT > 0) };
  }

  /* ----- main update (called once per fixed step) ----- */

  update(dt) {
    const { sim, f } = this;
    const zone = sim.zone;
    this.noVehT = Math.max(0, (this.noVehT ?? 0) - dt);
    if (f.air) { botAir(sim, f, this, dt); return; }                                  // in the plane / falling / under a parachute (drop.js)
    if (f.veh) { f.crouch = false; this._drive(dt); return; }                       // sitting in a vehicle: a different kind of thinking
    sim.tickHeal(f, dt); this.lootScanT -= dt;
    if (sim.opts.loot) { this.mainT -= dt; if (this.mainT <= 0) { this.mainT = 1; this._refreshMain(); } }
    this.hurtT += dt; this.lastSeenT += dt; this.heardT += dt;
    this.coverT = Math.max(0, this.coverT - dt); this.coverCool = Math.max(0, this.coverCool - dt);
    this.jumpCool = Math.max(0, this.jumpCool - dt); this.nadeCool = Math.max(0, this.nadeCool - dt);
    if (this.lookAt) { this.lookAt.t -= dt; if (this.lookAt.t <= 0) this.lookAt = null; }
    if (this.unstick) { this.unstick.t -= dt; if (this.unstick.t <= 0) this.unstick = null; }
    if (this.target && !this.target.alive) { this.target = null; this.visible = false; }

    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.18 + sim.rng() * 0.1; this._scan(); }

    // ---- radio: a squad-mate called out an enemy ----
    if (this.radio && sim.time >= this.radio.at) {
      if (!this.visible) { this.lastSeen = { x: this.radio.x, z: this.radio.z }; this.lastSeenT = 0.4; this.lookAt = { x: this.radio.x, z: this.radio.z, t: 1.0 }; }
      this.radio = null;
    }

    // ---- the situation ----
    const outNow = zone.outside(f.x, f.z);
    const relocating = zone.outsideNext(f.x, f.z, 3) && (zone.shrinking || zone.timeLeft < 16);
    const tgt = this.visible ? this.target : null;
    const dist = tgt ? Math.hypot(tgt.x - f.x, tgt.z - f.z) : 0;
    const hpF = f.hp / f.maxHp, pers = this.p;

    // run for cover when hurt badly, or while reloading in a fight (a cautious personality does it sooner, a Rusher never)
    if (!pers.noCover && !pers.guard && this.coverT <= 0 && this.coverCool <= 0 && outNow < -4) {
      const hurtBadly = hpF < 0.38 + 0.25 * (pers.caution - 0.5) && this.hurtT < 5;
      // React to incoming fire before health becomes critical. Rushers still
      // ignore cover through their existing noCover personality trait.
      const underFire = !!(this.lastHurtBy?.alive && this.hurtT < 1.8);
      const reloadFight = tgt && f.reloadT > 0 && dist < 45 && sim.rng() < 0.25 + 0.3 * pers.caution;
      if (shouldSeekCover({ hurtBadly, underFire, reloadFight })) {
        const th = tgt ?? this.lastSeen ?? (this.lastHurtBy ? { x: this.lastHurtBy.x, z: this.lastHurtBy.z } : null);
        this.coverCool = 1.6;
        if (th) { const pt = findCover(sim.map, f, th, 28); if (pt) { this.coverPt = pt; this.coverT = 4.5 + sim.rng() * 2; } }
      }
    }
    if (this.coverT > 0 && hpF > 0.6 && f.weapons[f.cur].ammo > WEAPONS[f.cur].mag * 0.5) this.coverT = 0;

    this.state = this._decide({ outNow, relocating, tgt, dist, hpF });
    this.abT = (this.abT ?? 0) - dt;
    if (this.abT <= 0) { this.abT = 0.25 / this.trickRate; botUseAbility(sim, f, { tgt, dist, hpF, hurtRecently: this.hurtT < 2.5 }); }       // press Q when it is worth it
    if (this.state !== 'heal') f.healT = 0;                       // anything more important than healing stops the medkit
    if (!tgt && sim.opts.loot && f.cur !== this.main && f.switchT <= 0 && f.reloadT <= 0 && f.weapons[this.main].have) sim.switchWeapon(f, this.main);   // out of a fight: equip the best gun

    // ---- movement goal for this state ----
    const w = WEAPONS[f.cur];
    let gx = f.x, gz = f.z, move = true, sp = BASE_SPEED * (f.op.speed / 10) * w.moveMul * 0.96 * (activeAbility(f)?.speedMul ?? 1);
    let sprint = false, idleLook = false, jump = false;
    let adsNow = false;

    switch (this.state) {
      case 'zone': {
        // outside NOW: run to the middle of the current circle. Outside the NEXT circle only: head for the next centre.
        if (outNow > 0) { gx = zone.cx; gz = zone.cz; } else { gx = zone.nextX; gz = zone.nextZ; }
        sprint = true; break;
      }
      case 'cover': {
        gx = this.coverPt.x; gz = this.coverPt.z;
        if (Math.hypot(gx - f.x, gz - f.z) < 1.3) { move = false; idleLook = true; } else sprint = true;
        break;
      }
      case 'engage': {
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = 0.7 + sim.rng() * 1.5; if (sim.rng() < 0.7) this.strafeDir = -this.strafeDir; }
        const dx = tgt.x - f.x, dz = tgt.z - f.z, d = Math.max(0.1, dist), ux = dx / d, uz = dz / d;
        const px = uz, pz = -ux;                                   // sideways direction
        const radial = clamp(dist - w.ideal, -7, 9);
        const flank = this.skill > 0.55 && dist > w.ideal + 6;
        gx = f.x + ux * radial + px * this.strafeDir * (flank ? 7 : 4);
        gz = f.z + uz * radial + pz * this.strafeDir * (flank ? 7 : 4);
        if (this.skill > 0.5 && this.jumpCool <= 0 && sim.rng() < 0.012) { jump = true; this.jumpCool = 1.3; }
        adsNow = dist > 22 && this.skill > 0.45;
        break;
      }
      case 'hunt': {
        gx = this.lastSeen.x; gz = this.lastSeen.z;
        if (Math.hypot(gx - f.x, gz - f.z) < 3) { move = false; idleLook = true; if (this.lastSeenT > 2.5 && !this.p.guard) this.lastSeenT = 99; }
        break;
      }
      case 'search': {
        if (!this.searchAnchor || Math.hypot(this.searchAnchor.x - this.lastSeen.x, this.searchAnchor.z - this.lastSeen.z) > 4) {
          this.searchAnchor = { ...this.lastSeen }; this.searchIndex = 0; this.searchGoal = null;
        }
        if (!this.searchGoal) {
          // Skip sweep points embedded in collision geometry or outside the playable square.
          for (let tries = 0; tries < 8; tries++) {
            const candidate = searchWaypoint(this.searchAnchor, this.searchIndex + tries, 5.5);
            if (Math.abs(candidate.x) < MAP_HALF - 3 && Math.abs(candidate.z) < MAP_HALF - 3 &&
                !insideAnyBox(sim.map, candidate.x, candidate.z, 1.2)) {
              this.searchIndex += tries; this.searchGoal = candidate; break;
            }
          }
          if (!this.searchGoal) this.searchGoal = { ...this.searchAnchor };
        }
        gx = this.searchGoal.x; gz = this.searchGoal.z;
        if (Math.hypot(gx - f.x, gz - f.z) < 2.4) {
          this.searchIndex++; this.searchGoal = null; move = false; idleLook = true;
        }
        break;
      }
      case 'patrol': {
        const route = this.patrolRoute ?? [];
        if (route.length) {
          const pt = route[this.patrolIndex % route.length];
          gx = pt.x; gz = pt.z;
          if (Math.hypot(gx - f.x, gz - f.z) < 2.5) {
            this.patrolIndex = (this.patrolIndex + 1) % route.length;
            move = false; idleLook = true;
          }
          sp *= 0.78;
        } else { move = false; idleLook = true; }
        break;
      }
      case 'investigate': {
        gx = this.heard.x; gz = this.heard.z;
        if (Math.hypot(gx - f.x, gz - f.z) < 4) { this.heard = null; move = false; }
        break;
      }
      case 'loot': {
        const lp = this.lootPick; if (!lp) break;
        gx = lp.x; gz = lp.z; sprint = !tgt;
        if (this.lootId !== lp.it.id) { this.lootId = lp.it.id; this.lootT = 0; }
        this.lootT += dt;
        if (this.lootT > 14) this.lootBan.set(lp.it.id, sim.time + 45);         // cannot reach it (walled in?): leave it for a while
        break;
      }
      case 'heal': { move = false; sim.startHeal(f); break; }
      case 'steal': {
        const sv = this.stealVeh;
        if (!sv || sv.driver >= 0 || sv.dead) { this.noVehT = 4; break; }
        gx = sv.x; gz = sv.z; sprint = true;
        if (Math.hypot(sv.x - f.x, sv.z - f.z) - sv.T.r < 2.2) {
          if (sim.vehicles.enter(f, sv, 0)) { this.driveT = 0; this.stuckT = 0; this.reverseT = 0; this.stuckCount = 0; return; }
          this.noVehT = 6;
        }
        break;
      }
      case 'contract': {
        gx = this.contractPt.x; gz = this.contractPt.z; sprint = true;
        if (Math.hypot(gx - f.x, gz - f.z) < (this.contractPt.type === 'hardpoint' ? 2.5 : this.contractPt.type === 'uplink' ? this.contractPt.r * 0.55 : 1.4)) { move = false; idleLook = true; }
        break;
      }
      case 'flank': {
        gx = this.flankPt.x; gz = this.flankPt.z; sprint = true;
        if (Math.hypot(gx - f.x, gz - f.z) < 2.5) { move = false; idleLook = true; }
        break;
      }
      case 'fallback': {
        // Break contact as a coordinated unit when the squad is badly hurt.
        const contact = f.squad?.fresh();
        const cover = contact ? findCover(sim.map, f, contact, 24) : null;
        if (cover) { gx = cover.x; gz = cover.z; }
        else if (contact) {
          const dx = f.x - contact.x, dz = f.z - contact.z, d = Math.max(1, Math.hypot(dx, dz));
          gx = clamp(f.x + dx / d * 18, -MAP_HALF + 5, MAP_HALF - 5);
          gz = clamp(f.z + dz / d * 18, -MAP_HALF + 5, MAP_HALF - 5);
        } else { gx = zone.nextX; gz = zone.nextZ; }
        sprint = true;
        if (Math.hypot(gx - f.x, gz - f.z) < 2) { move = false; idleLook = true; }
        break;
      }
      case 'suppress': { move = false; break; }
      case 'camp': {
        gx = this.perch.x; gz = this.perch.z;
        if (Math.hypot(gx - f.x, gz - f.z) < 1.8) { move = false; this.campT += dt; this.lookAt = { x: this.perch.faceX, z: this.perch.faceZ, t: 0.5 }; } else sprint = true;
        break;
      }
      case 'regroup': {
        const lead = f.squad.alive[0]; gx = lead.x; gz = lead.z;
        if (Math.hypot(gx - f.x, gz - f.z) < 7) move = false;
        break;
      }
      case 'return': { gx = this.post.x; gz = this.post.z; sprint = true; break; }
      case 'hold': { move = false; idleLook = true; break; }
      default: { // roam
        this.roamT += dt;
        if (!this.roamGoal || this.roamT > 14 || Math.hypot(this.roamGoal.x - f.x, this.roamGoal.z - f.z) < 2.5) this._pickRoam();
        gx = this.roamGoal.x; gz = this.roamGoal.z; sp *= 0.8;
      }
    }

    if (tgt && pers.ads && dist > 14) adsNow = true;            // snipers always look down the sight

    // ---- stuck? pick a random direction for a moment ----
    this.stuckCheck -= dt;
    if (this.stuckCheck <= 0) {
      this.stuckCheck = 0.5;
      const moved = Math.hypot(f.x - this.px, f.z - this.pz); this.px = f.x; this.pz = f.z;
      if (this.moving && moved < 0.25) this.stuckT += 0.5; else this.stuckT = 0;
      if (this.stuckT >= 1) {
        this.stuckT = 0; this.stuckCount++; const a = sim.rng() * Math.PI * 2;
        this.unstick = { x: f.x + Math.cos(a) * 10, z: f.z + Math.sin(a) * 10, t: 1.3 }; this.roamGoal = null;
      }
    }
    if (this.unstick) { gx = this.unstick.x; gz = this.unstick.z; move = true; jump = true; }
    this.avoid.active = !this.unstick;

    // ---- aim, fire, reload ----
    let wantFire = false, wantReload = false;
    if (tgt) {
      this._chooseWeapon(dist);
      const w2 = WEAPONS[f.cur];
      this.engageT += dt; this.aimT -= dt;
      if (this.aimT <= 0) {
        this.aimT = 0.3 + sim.rng() * 0.2;
        const k = (1 + dist / 45) * (this.moving ? 1.35 : 1);
        this.offY = (sim.rng() - 0.5) * 2 * this.aimErr * k; this.offP = (sim.rng() - 0.5) * 2 * this.aimErr * k * 0.7;
      }
      const bb = this.barrelAim && !this.barrelAim.dead && this.barrelAim.fuse < 0 ? this.barrelAim : null;
      const ax = bb ? bb.x : tgt.x, az = bb ? bb.z : tgt.z, ad = bb ? Math.hypot(bb.x - f.x, bb.z - f.z) : dist;
      const ty = bb ? 0.55 : tgt.y + 0.2 + (this.skill > 0.75 && dist < 35 ? 0.35 : 0);
      const wantYaw = Math.atan2(-(ax - f.x), -(az - f.z)) + this.offY * (bb ? 0.4 : 1);
      const wantPitch = Math.atan2(ty - f.eyeY, Math.max(0.5, ad)) + this.offP * (bb ? 0.4 : 1);
      const dyaw = wrap(wantYaw - f.yaw), dpitch = wantPitch - f.pitch, m = this.turnSpeed * dt;
      f.yaw += clamp(dyaw, -m, m); f.pitch = clamp(f.pitch + clamp(dpitch, -m, m), -1.4, 1.4);
      const aligned = Math.abs(dyaw) < 0.09;
      if (this.engageT > this.reaction && dist < w2.range * 0.85 && aligned) {
        if (this.burstPause > 0) this.burstPause -= dt;
        else {
          this.burstT -= dt;
          wantFire = w2.auto ? true : f.fireT <= 0;
          if (this.burstT <= 0) {
            this.burstPause = sim.rng.range(0.3, 0.9) * (1.4 - this.skill);
            this.burstT = sim.rng.range(0.4, 1.1) * (0.6 + this.skill * 0.6) * (w2.id === 'lmg' ? 1.8 : 1);
          }
        }
      }
      // a banked mortar strike: call it on somebody far away
      if (f.mortar > 0 && dist > 28 && dist < 105 && this.skill > 0.45 && sim.rng() < 0.012 * this.trickRate) sim.callMortar(f, tgt.x, tgt.z);
      // grenades: lob one at somebody in the open at medium range
      if (f.nades > 0 && f.nadeT <= 0 && this.nadeCool <= 0 && dist > 12 && dist < 30 && this.skill > 0.4 && sim.rng() < 0.004 * this.trickRate) {
        if (this._throwAt(tgt.x, tgt.y, tgt.z)) this.nadeCool = 10 + sim.rng() * 10;
      }
      if (f.weapons[f.cur].ammo < w2.mag * 0.2 && f.reloadT <= 0 && dist > 25) wantReload = true;
    } else if (this.state === 'suppress' && f.squad && f.squad.fresh()) {
      // suppressive fire: no target in sight, so shoot bursts at the spot where the enemy was while the squad-mate swings round
      const c = f.squad.contact, dx = c.x - f.x, dz = c.z - f.z, d = Math.max(1, Math.hypot(dx, dz));
      const dyaw = wrap(Math.atan2(-dx, -dz) - f.yaw), dpitch = Math.atan2(1.0 - f.eyeY, d) - f.pitch, m = this.turnSpeed * dt;
      f.yaw += clamp(dyaw, -m, m); f.pitch = clamp(f.pitch + clamp(dpitch, -m, m), -1.4, 1.4);
      const w2 = WEAPONS[f.cur];
      this.engageT = 0; this.supT -= dt;
      if (Math.abs(dyaw) < 0.12 && d < w2.range && f.weapons[f.cur].ammo > w2.mag * 0.25) {
        if (this.supOn) { wantFire = w2.auto ? true : f.fireT <= 0; if (this.supT <= 0) { this.supOn = false; this.supT = 0.8 + sim.rng() * 0.6; } }
        else if (this.supT <= 0) { this.supOn = true; this.supT = 0.5 + sim.rng() * 0.5; }
      }
    } else {
      this.engageT = 0;
      // face where we are going (or where we heard/were shot from)
      let faceX = null, faceZ = null;
      if (this.lookAt) { faceX = this.lookAt.x - f.x; faceZ = this.lookAt.z - f.z; }
      else if (idleLook && this.lastSeen) { faceX = this.lastSeen.x - f.x; faceZ = this.lastSeen.z - f.z; }
      else if (move && f.speedH > 0.5) { faceX = f.moveX; faceZ = f.moveZ; }
      if (faceX !== null && Math.hypot(faceX, faceZ) > 0.2) {
        const dy = wrap(Math.atan2(-faceX, -faceZ) - f.yaw), m = this.turnSpeed * 0.7 * dt;
        f.yaw += clamp(dy, -m, m);
      } else if (idleLook) f.yaw += 0.7 * dt;                    // look around while waiting
      f.pitch *= 1 - Math.min(1, 4 * dt);
      const st = f.weapons[f.cur];
      if (st.ammo < WEAPONS[f.cur].mag * 0.45 && f.reloadT <= 0) wantReload = true;
      // hunt: sometimes toss a grenade at where we last saw them
      if (this.state === 'hunt' && this.lastSeen && f.nades > 0 && f.nadeT <= 0 && this.nadeCool <= 0 && this.skill > 0.55 && this.lastSeenT < 3 && sim.rng() < 0.003 * this.trickRate) {
        if (this._throwAt(this.lastSeen.x, 0.5, this.lastSeen.z)) this.nadeCool = 12 + sim.rng() * 10;
      }
    }
    if (this.state === 'cover' && !move) wantReload = f.weapons[f.cur].ammo < WEAPONS[f.cur].mag;

    f.ads = adsNow && !sprint && f.reloadT <= 0 && f.switchT <= 0;
    f.crouch = this.state === 'cover' && !move && !sprint;                  // sitting behind cover: crouch (smaller target, steadier aim)
    f.sprinting = sprint && !tgt;
    if (f.ads) sp *= 0.62; else if (f.sprinting) sp *= 1.45; else if (sprint) sp *= 1.2;
    if (f.reloadT > 0) sp *= 0.92;

    sim.updateWeapon(f, dt, wantFire, wantReload);
    f.nadeT = Math.max(0, f.nadeT - dt);

    // ---- walk ----
    this.moving = move;
    if (move) {
      const wp = !this.unstick && sim.nav ? this._nav(gx, gz, dt) : { x: gx, z: gz };       // straight line when it is clear, otherwise the next A* waypoint
      this.avoid.active = !this.unstick && !(sim.nav && this.navOk);                          // the A* route already goes round buildings; Yuka's circle avoidance would only push the bot off it
      this.goal.set(wp.x, 0, wp.z);
      const v = this.vehicle;
      v.maxSpeed = sp; v.position.set(f.x, 0, f.z);
      v.update(dt);
      sim.moveFighter(f, v.velocity.x * dt, v.velocity.z * dt, dt, jump);
      v.velocity.set(f.moveX, 0, f.moveZ);                       // trust what physics really allowed
    } else {
      sim.moveFighter(f, 0, 0, dt, false);
      this.vehicle.velocity.set(0, 0, 0);
    }
  }
}
