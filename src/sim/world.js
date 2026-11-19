// The game rules, with NO graphics inside (so the same file can later run on the multiplayer server).
// Physics = Rapier. Bot brains = Yuka (see bot.js). Everything that happens is reported as small
// plain-object "events" that the renderer, sound and HUD read once per frame.
import RAPIER from '@dimforge/rapier3d-compat';
import * as YUKA from 'yuka';
import operatorData from '../../data/operators.json' with { type: 'json' };
import { makeRng } from './rng.js';
import { WEAPONS, SLOT_ORDER, reloadTime, magCap, skinOk, SKINS, damageAt } from './weapons.js';
import { buildMap, pickSpawns, findFreeSpot, insideAnyBox } from './map.js';
import { Squad } from './squad.js';
import { pickPersonality } from './personality.js';
import { Contracts } from './contracts.js';
import { LootSystem, MED_HEAL, HEAL_T, ARMOR_ABSORB } from './loot.js';
import { VehicleSystem } from './vehicles.js';
import { activeAbility, tickAbility, useAbility, STUN_MOVE } from './abilities.js';
import { NavGrid } from './nav.js';
import { pickWeather } from './weather.js';
import { Zone, DROP_START_RADIUS } from './zone.js';
import { moveVector } from '../input/move.js';
import { rayCapsule } from './geom.js';
import { idleCmd } from './cmd.js';
import { BotBrain } from './bot.js';
import { startDrop, stepAir } from './drop.js';
import { SMOKE, popSmoke, updateSmokes, smokeBlocks } from './smoke.js';
import { meleeSwing } from './melee.js';
import { materialForMapKind, materialForPropKind, surfaceImpact, classifyHitZone, hitZoneMultiplier, blastImpulse, hitPushImpulse, shrapnelDirection } from './physics-correlation.js';
import { createMission } from './missions.js';
import { MANTLE, findLedge, mantlePos } from './mantle.js';

export const GRAV = -22;
export const OPERATORS = operatorData.operators;
const EYE = 0.72;               // eye height above the capsule centre (capsule centre is 0.9 above the feet)
const EYE_C = 0.2;              // ...and when crouching (eyes about 1.1 m above the ground)
const FALL_SAFE = 12, FALL_DMG = 7;       // landing faster than 12 m/s (a ~3.3 m drop) hurts: 7 HP per extra m/s. A normal jump lands at 8.2 m/s, so jumping is always free.
const BASE_SPEED = 7;
const JUMP = 8.2;
const JUMP_BUFFER = 0.15, COYOTE_TIME = 0.12;
// SLIDE: press C while sprinting. You keep your momentum (a bit more than a sprint), it bleeds off to a crouch walk, you stay low (crouch hitbox, steady aim) and can shoot. Jump cancels it.
export const SLIDE = { T: 0.85, BOOST: 1.25, CD: 0.9, MIN_SPEED: 5, BLOCKED: 0.35 };
const REGEN_DELAY = 6, REGEN_RATE = 5, REGEN_CAP = 0.65;
const GRENADE_FUSE = 2.2, GRENADE_R = 9, GRENADE_DMG = 150;
const CRATE_HP = 70, BARREL_HP = 40, BARREL_R = 8, BARREL_DMG = 130;   // props: bullets and blasts wear them down
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ARMORED = new Set(['bullet', 'explosion', 'shrapnel']);        // which kinds of damage armor helps against (not the zone, falls or crashes)
const HIST = 64;                // how many ticks of fighter positions we remember (for lag compensation)
export const MAX_LAG_TICKS = 30; // never rewind more than 0.5 s

let rapierReady = null;
export function initPhysics() { return (rapierReady ??= RAPIER.init()); }

export class Fighter {
  constructor(id, name, op, human) {
    this.id = id; this.name = name; this.op = op; this.human = human; this.isPlayer = human; this.placement = 0; this.lagTicks = 0; this.rngKey = id; this.shotN = 0; this.squad = null; this.npc = false;
    this.color = op.color; this.maxHp = op.hp; this.hp = op.hp;
    this.alive = true; this.kills = 0; this.veh = null; this.seat = -1;
    this.x = 0; this.y = 0.9; this.z = 0; this.yaw = 0; this.pitch = 0;
    this.vy = 0; this.grounded = false; this.speedH = 0; this.moveX = 0; this.moveZ = 0;
    this.jumpBufferT = 0; this.coyoteT = 0; this.recoilPitch = 0; this.recoilYaw = 0;
    this.hitPushX = 0; this.hitPushZ = 0; this.hitPushT = 0; this.limpT = 0;
    this.ads = false; this.sprinting = false; this.crouch = false;
    this.slideT = 0; this.slideVx = 0; this.slideVz = 0; this.slideCd = 0;                   // sprint-slide (SLIDE)
    this.mantleT = 0; this.mFrom = null; this.mTo = null;                                   // ledge pull-up (mantle.js)
    this.weapons = {}; this.cur = op.weapon;
    for (const id2 of SLOT_ORDER) this.weapons[id2] = { ammo: WEAPONS[id2].mag, reserve: WEAPONS[id2].reserve, have: true };
    this.fireT = 0; this.reloadT = 0; this.reloadTot = 1; this.reloadEmpty = false; this.skin = null; this.mortar = 0; this.streak = 0; this.switchT = 0; this.bloom = 0; this.wasFiring = false; this.shotsInBurst = 0;
    this.nades = 2; this.nadeT = 0; this.meleeT = 0; this.smokes = 2;       // smoke grenades (smoke.js)
    this.armor = 0; this.armorLv = 0; this.meds = 0; this.healT = 0;       // loot: armor points left, medkits carried, seconds left of the medkit being used
    this.abCd = 0; this.abT = 0; this.dashT = 0; this.dashVx = 0; this.dashVz = 0; this.dashHit = []; this.stunT = 0;   // operator ability: cooldown left, effect time left, dash, stunned
    this.noHurtT = 0; this.zoneAcc = 0;
    this.air = 0; this.airT = 0; this.avx = 0; this.avz = 0; this.jumpPrev = false;      // drop-in (drop.js): 0 on foot, 1 in the plane, 2 free fall, 3 parachute
    this.brain = null; this.rb = null; this.col = null;
  }
  get sliding() { return this.slideT > 0; }           // (the views read these names on every kind of fighter: sim, remote snapshot, predicted self)
  get mantling() { return this.mantleT > 0; }
  get eyeY() { return this.y + (this.crouch ? EYE_C : EYE); }

  /** loot matches: you start with a pistol and nothing else */
  loadoutLoot() {
    for (const k of SLOT_ORDER) this.weapons[k] = k === 'pistol' ? { ammo: WEAPONS.pistol.mag, reserve: 45, have: true } : { ammo: 0, reserve: 0, have: false };
    this.cur = 'pistol'; this.nades = 0; this.smokes = 1; this.armor = 0; this.armorLv = 0; this.meds = 0; this.healT = 0;
  }
  /** the garrison: an SMG and a light vest (they guard the best spot, so they should be a bit hard to take out) */
  loadoutGuard() {
    this.weapons.smg = { ammo: WEAPONS.smg.mag, reserve: WEAPONS.smg.reserve, have: true }; this.cur = 'smg'; this.armor = 40; this.armorLv = 1; this.nades = 1; this.smokes = 0;
  }
  get haveBits() { let b = 0; SLOT_ORDER.forEach((k, i) => { if (this.weapons[k].have) b |= 1 << i; }); return b; }

  /** everything the owner's browser needs to rewind its prediction to the server's truth (sent only to that one player) */
  exportSelf() {
    const w = {}; for (const k of SLOT_ORDER) w[k] = [this.weapons[k].ammo, this.weapons[k].reserve];
    return { yaw: this.yaw, x: this.x, y: this.y, z: this.z, vy: this.vy, gr: this.grounded ? 1 : 0, cur: this.cur, w,
      fireT: this.fireT, reloadT: this.reloadT, rt: this.reloadTot, re: this.reloadEmpty ? 1 : 0, switchT: this.switchT, bloom: this.bloom, wf: this.wasFiring ? 1 : 0,
      nades: this.nades, sn: this.smokes, nadeT: this.nadeT, mlT: this.meleeT, shotN: this.shotN, hv: this.haveBits, ar: this.armor, al: this.armorLv, md: this.meds, hl: this.healT, mt: this.mortar, ks: this.streak, sv: this.veh ? this.veh.id : -1, ss: this.seat, air: [this.air, this.airT, this.avx, this.avz, this.jumpPrev ? 1 : 0], ab: [this.abCd, this.abT, this.dashT, this.dashVx, this.dashVz, this.stunT], cr: this.crouch ? 1 : 0, ads: this.ads ? 1 : 0, spr: this.sprinting ? 1 : 0, sp: this.speedH,
      sl: [this.slideT, this.slideVx, this.slideVz, this.slideCd], rp: this.recoilPitch, ry: this.recoilYaw,
      jp: this.jumpBufferT, cy: this.coyoteT, hp: [this.hitPushX, this.hitPushZ, this.hitPushT, this.limpT], ml: this.mantleT > 0 ? [this.mantleT, this.mFrom.x, this.mFrom.y, this.mFrom.z, this.mTo.x, this.mTo.y, this.mTo.z] : 0 };
  }
  importSelf(s) {
    this.x = s.x; this.y = s.y; this.z = s.z; this.vy = s.vy; this.grounded = !!s.gr; this.cur = s.cur;
    for (const k of SLOT_ORDER) { this.weapons[k].ammo = s.w[k][0]; this.weapons[k].reserve = s.w[k][1]; }
    this.fireT = s.fireT; this.reloadT = s.reloadT; this.reloadTot = s.rt ?? 1; this.reloadEmpty = !!s.re; this.switchT = s.switchT; this.bloom = s.bloom; this.wasFiring = !!s.wf;
    if (s.hv !== undefined) { SLOT_ORDER.forEach((k, i) => { this.weapons[k].have = !!(s.hv & (1 << i)); }); this.armor = s.ar; this.armorLv = s.al; this.meds = s.md; this.healT = s.hl; }
    this.crouch = !!s.cr;
    if (s.air) { this.air = s.air[0]; this.airT = s.air[1]; this.avx = s.air[2]; this.avz = s.air[3]; this.jumpPrev = !!s.air[4]; }
    if (s.sl) { this.slideT = s.sl[0]; this.slideVx = s.sl[1]; this.slideVz = s.sl[2]; this.slideCd = s.sl[3]; }
    this.recoilPitch = s.rp ?? 0; this.recoilYaw = s.ry ?? 0; this.jumpBufferT = s.jp ?? 0; this.coyoteT = s.cy ?? 0;
    if (s.hp) { this.hitPushX = s.hp[0]; this.hitPushZ = s.hp[1]; this.hitPushT = s.hp[2]; this.limpT = s.hp[3]; }
    if (s.ml) { this.mantleT = s.ml[0]; this.mFrom = { x: s.ml[1], y: s.ml[2], z: s.ml[3] }; this.mTo = { x: s.ml[4], y: s.ml[5], z: s.ml[6] }; } else { this.mantleT = 0; this.mFrom = this.mTo = null; }
    if (s.ab) { this.abCd = s.ab[0]; this.abT = s.ab[1]; this.dashT = s.ab[2]; this.dashVx = s.ab[3]; this.dashVz = s.ab[4]; this.stunT = s.ab[5]; }
    this.nades = s.nades; if (s.sn !== undefined) this.smokes = s.sn; this.nadeT = s.nadeT; if (s.mlT !== undefined) this.meleeT = s.mlT; this.shotN = s.shotN; this.mortar = s.mt ?? 0; this.streak = s.ks ?? 0; this.ads = !!s.ads; this.sprinting = !!s.spr; this.speedH = s.sp;
    if (this.rb) { this.rb.setTranslation({ x: this.x, y: this.y, z: this.z }, true); this.rb.setNextKinematicTranslation({ x: this.x, y: this.y, z: this.z }); }
  }
}

export class Simulation {
  /** @param {{seed?:number, bots?:number, operator?:string}} opts */
  constructor(opts = {}) {
    this.opts = opts;
    this.seed = opts.seed ?? ((Math.random() * 1e9) | 0);   // purity-ok: the ONE entropy source, only to pick a fresh match seed; everything after it is seeded
    this.rng = makeRng(this.seed);
    this.map = buildMap(opts.mapSeed ?? 7);
    this.nav = opts.predictor || opts.nav === false ? null : new NavGrid(this.map);     // bots path around buildings with A* (nav.js); a predicting browser has no bots
    this.navBudget = 0;
    this.time = 0; this.tick = 0; this.events = []; this.blastSerial = 0;
    this.hist = new Array(HIST).fill(null); this.humans = []; this.player = null;
    this.fighters = []; this.crates = []; this.barrels = []; this.grenades = []; this.smokes = [];      // thrown grenades / smoke clouds in the world
    this.propByCol = new Map();     // collider handle -> crate / barrel (things bullets can break)
    this.surfaceByCol = new Map(); // collider handle -> physical material for bullet / impact response
    this.destroyed = [];            // ids of broken props (replicated to browsers in every snapshot)
    this.colMap = new Map();        // collider handle -> Fighter
    this.solid = new Set();         // collider handles of ground, buildings, crates
    this.state = 'playing'; this.result = null;
    this.obstacles = [];            // Yuka obstacle entities (for bot steering)
    this.weather = pickWeather(this.seed, opts.weather);       // same seed => same weather on the server and in every browser
    this.contracts = new Contracts(this);
    this.mission = createMission(opts.mission, this);
    if (this.mission) this.contracts.off = true;
    this.loot = new LootSystem(this);      // starting items come from the seed (loot.js); only a loot match (opts.loot) has any
    this.strikes = [];              // mortar barrages in progress
  }

  static async create(opts = {}) {
    await initPhysics();
    const s = new Simulation(opts);
    s._build();
    return s;
  }

  _build() {
    this.world = new RAPIER.World({ x: 0, y: GRAV, z: 0 });
    this.world.timestep = 1 / 60;
    const ground = this.world.createCollider(RAPIER.ColliderDesc.cuboid(300, 0.5, 300).setTranslation(0, -0.5, 0));
    this.solid.add(ground.handle); this.surfaceByCol.set(ground.handle, materialForMapKind('ground'));
    for (const b of this.map.boxes) {
      const c = this.world.createCollider(RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2).setTranslation(b.x, b.y, b.z));
      this.solid.add(c.handle); this.surfaceByCol.set(c.handle, materialForMapKind(b.kind));
      if (b.kind !== 'edge') {
        const ob = new YUKA.GameEntity();
        ob.position.set(b.x, 0, b.z); ob.boundingRadius = Math.hypot(b.w, b.d) / 2 + 0.6;
        this.obstacles.push(ob);
      }
    }
    this.cc = this.world.createCharacterController(0.02);
    this.cc.enableAutostep(0.45, 0.2, true);
    this.cc.enableSnapToGround(0.3);
    this.cc.setApplyImpulsesToDynamicBodies(true);

    // loose crates you can shoot and blow around
    const cr = this.rng;
    for (let i = 0; i < 10; i++) {
      const x = cr.range(-30, 30), z = cr.range(-30, 30);
      let below = null;
      for (let k = 0; k < 2; k++) { const c = this._addCrate(x + k * 0.1, 0.6 + k * 1.22, z); if (k === 0) below = c; else below.above = c; }
    }
    this._makeBarrels();

    // fighters: humans first (ids 0..H-1), then bots. Offline = 1 human. Online = everybody in the room.
    const humans = this.opts.humans ?? [{ operator: this.opts.operator ?? 'roms', skin: this.opts.skin }];
    const nBots = this.opts.bots ?? 15;
    const spawns = pickSpawns(this.map, humans.length + nBots, this.rng);
    if (this.mission && spawns.length) spawns[0] = this.mission.insertion;
    this.humans = []; const usedOps = new Set();
    humans.forEach((h, i) => {
      const op = OPERATORS.find((o) => o.id === h.operator) ?? OPERATORS[i % OPERATORS.length];
      const f = this._addFighter(i, h.name ?? op.name, op, true, spawns[i]);
      f.sessionId = h.sessionId ?? null; f.skin = skinOk(h.skin); this.humans.push(f); usedOps.add(op.id);
    });
    this.player = this.humans[0] ?? null;        // "the" local player (offline / client prediction). null on a pure server
    const botOps = OPERATORS.filter((o) => !usedOps.has(o.id));
    const generic = ['ar', 'smg', 'shotgun', 'dmr', 'lmg'];
    const colors = ['#9aa5b1', '#b08968', '#8aa17b', '#a78bb8', '#c9a227', '#6fa3b8', '#b86f6f', '#7d8f69'];
    for (let i = 0; i < nBots; i++) {
      const op = i < botOps.length ? botOps[i]
        : { id: `recruit${i}`, name: `Recruit-${String(i - botOps.length + 1).padStart(2, '0')}`, color: colors[i % colors.length], hp: 100, speed: 9.5, weapon: generic[i % generic.length] };
      const f = this._addFighter(humans.length + i, op.name, op, false, spawns[humans.length + i] ?? { x: this.rng.range(-60, 60), z: this.rng.range(-60, 60) });
      f.brain = new BotBrain(this, f, this.rng.range(0.35, 0.9), pickPersonality(this.rng, i));
      f.skin = ((f.id * 2654435761 + (this.opts.seed ?? 0) * 97) >>> 0) % 100 < 34 ? SKINS[(f.id * 7 + (this.opts.seed ?? 0)) % SKINS.length] : null;   // not rng(): keeps the dice sequence unchanged
    }
    this.squads = [];
    if (this.opts.squads !== false) this._makeSquads(this.fighters.filter((f) => f.brain));
    this._makeGuards(this.opts.guards ?? 4);
    this.zone = new Zone(this.rng, this.opts.drop ? DROP_START_RADIUS : undefined);
    this.vehicles = new VehicleSystem(this);      // buggies + bikes (vehicles.js): needs the world, the map and the props to exist
    this.plane = null; this.zoneStart = 0;
    if (this.opts.drop) startDrop(this);          // everybody starts in the plane (drop.js); off in unit tests, on in the real game
  }

  /** ~60% of the bots fight in radio squads of 2-3 who start next to each other (see squad.js) */
  _makeSquads(bots) {
    const pool = bots.slice(); let used = 0, id = 0;
    const target = Math.floor(bots.length * 0.6);
    while (used < target && pool.length >= 2) {
      const leader = pool.shift(), sq = new Squad(this, id++); sq.add(leader);
      const size = this.rng() < 0.5 ? 2 : 3;
      for (let k = 1; k < size && pool.length; k++) {
        const m = pool.shift(); sq.add(m);
        const spot = findFreeSpot(this.map, this.rng, leader.x, leader.z, 9, 2.5);
        m.rb.setTranslation({ x: spot.x, y: 0.9, z: spot.z }, true); m.x = spot.x; m.z = spot.z;
        if (m.brain) { m.brain.px = m.x; m.brain.pz = m.z; m.brain.vehicle.position.set(m.x, 0, m.z); }
      }
      if (sq.members.length > 1 && !sq.members.some((m) => m.brain.pid === 'tactician')) {
        const m = sq.members[1]; m.brain = new BotBrain(this, m, this.rng.range(0.45, 0.85), 'tactician'); m.brain.px = m.x; m.brain.pz = m.z; m.brain.vehicle.position.set(m.x, 0, m.z);
      }
      used += sq.members.length; this.squads.push(sq);
    }
  }

  /** third faction: NPC guards who defend one outpost and never leave it far. They do not count for "last one standing". */
  _makeGuards(n) {
    if (n <= 0) return;
    const post = this.mission ? { ...this.mission.guardPost } : findFreeSpot(this.map, this.rng, 0, 0, 26, 7);
    this.outpost = post;
    // Separate deterministic stream: patrol setup must not perturb match RNG or loot rolls.
    const patrolRng = makeRng(((this.seed | 0) * 65537 + 991) | 0);
    const patrolRoute = Array.from({ length: 4 }, (_, i) => {
      const a = i * Math.PI / 2;
      return findFreeSpot(this.map, patrolRng, post.x + Math.cos(a) * 9, post.z + Math.sin(a) * 9, 2.8, 1.8);
    });
    for (let i = 0; i < n; i++) {
      const spot = findFreeSpot(this.map, this.rng, post.x, post.z, 6, 2);
      const op = { id: `guard${i}`, name: `Garrison-0${i + 1}`, color: '#b05cff', hp: 140, speed: 9, weapon: 'smg' };
      const f = this._addFighter(this.fighters.length, op.name, op, false, spot);
      f.npc = true; if (this.opts.loot) f.loadoutGuard();
      f.brain = new BotBrain(this, f, this.rng.range(0.55, 0.8), 'guard');
      f.brain.post = post; f.brain.leash = 16;
      f.brain.patrolRoute = patrolRoute;
      f.brain.patrolIndex = i % patrolRoute.length;
    }
  }

  /** Existing garrison guards redeploy to a live relay objective without spawning new fighters. */
  alertGarrison(point, urgency = 1) {
    const guards = this.fighters.filter((f) => f.alive && f.npc && f.brain?.p.guard);
    if (!guards.length) return;
    const radius = urgency >= 2 ? 5 : 8;
    const seed = ((this.seed | 0) * 8191 + Math.round(point.x * 31 + point.z * 17) + 1931 + urgency * 101) | 0;
    const routeRng = makeRng(seed);
    const route = Array.from({ length: 4 }, (_, i) => {
      const a = i * Math.PI / 2;
      return findFreeSpot(this.map, routeRng, point.x + Math.cos(a) * radius, point.z + Math.sin(a) * radius, 3.5, 2);
    });
    guards.forEach((f, i) => {
      const b = f.brain;
      if (!b.alertHome) b.alertHome = { post: b.post, leash: b.leash, patrolRoute: b.patrolRoute, patrolIndex: b.patrolIndex };
      b.post = { x: point.x, z: point.z };
      b.leash = urgency >= 2 ? 11 : 18;
      b.patrolRoute = route;
      b.patrolIndex = i % route.length;
      b.radioIn({ x: point.x, z: point.z }, (urgency >= 2 ? 0.12 : 0.25) + i * 0.08);
    });
  }

  /** Return redeployed guards to their original outpost and patrol route. */
  restoreGarrison() {
    for (const f of this.fighters) {
      const b = f.brain;
      if (!f.npc || !b?.alertHome) continue;
      b.post = b.alertHome.post; b.leash = b.alertHome.leash;
      b.patrolRoute = b.alertHome.patrolRoute; b.patrolIndex = b.alertHome.patrolIndex;
      b.alertHome = null;
    }
  }

  _addCrate(x, y, z) {
    // online: crates are fixed (so every browser's prediction sees exactly the same world); offline: they fly around
    const body = this.world.createRigidBody((this.opts.propsFixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic()).setTranslation(x, y, z));
    const col = this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.6, 0.6, 0.6).setRestitution(0.3).setFriction(0.7).setDensity(11.6), body);
    this.solid.add(col.handle);
    const c = { id: this.crates.length, kind: 'crate', body, col, hp: CRATE_HP, maxHp: CRATE_HP, dead: false, above: null };
    this.crates.push(c); this.propByCol.set(col.handle, c); this.surfaceByCol.set(col.handle, materialForPropKind(c.kind));
    return c;
  }

  /**
   * EXPLOSIVE BARRELS: always fixed (heavy). Shoot one: it goes up after a short fuse, hurts everybody near it and sets the barrels
   * next to it off too (chain reaction). Placed in clusters from their own dice, so every browser builds the same barrels.
   */
  _makeBarrels() {
    const rng = makeRng(((this.opts.mapSeed ?? 7) * 977 + 13) | 0);
    const clusters = this.opts.barrelClusters ?? 7;
    for (let c = 0; c < clusters; c++) {
      const at = findFreeSpot(this.map, rng, 0, 0, 92, 4);
      const n = 2 + Math.floor(rng() * 2);
      for (let k = 0; k < n; k++) {
        const a = rng() * Math.PI * 2, d = 0.95 + rng() * 0.9 + k * 0.25;
        const x = at.x + Math.cos(a) * d * (k ? 1 : 0), z = at.z + Math.sin(a) * d * (k ? 1 : 0);
        if (insideAnyBox(this.map, x, z, 0.6)) continue;
        this._addBarrel(x, z);
      }
    }
  }

  _addBarrel(x, z) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0.55, z));
    const col = this.world.createCollider(RAPIER.ColliderDesc.cylinder(0.55, 0.42), body);
    this.solid.add(col.handle);
    const b = { id: 100 + this.barrels.length, kind: 'barrel', x, y: 0.55, z, body, col, hp: BARREL_HP, maxHp: BARREL_HP, dead: false, fuse: -1, owner: null };
    this.barrels.push(b); this.propByCol.set(col.handle, b); this.surfaceByCol.set(col.handle, materialForPropKind(b.kind));
    return b;
  }

  /** something a bullet or blast can break */
  propById(id) { return id >= 100 ? this.barrels[id - 100] : this.crates[id]; }

  damageProp(p, amount, owner) {
    if (p.dead || amount <= 0 || this.opts.predictor) return;       // a predicting browser never breaks things itself: the server tells it
    p.hp -= amount;
    if (p.hp > 0) { this.emit({ t: 'propHit', id: p.id, hp: p.hp }); return; }
    if (p.kind === 'barrel') { if (p.fuse < 0) { p.fuse = 0.12 + (p.id % 3) * 0.05; p.owner = owner; } }
    else this._breakProp(p);
  }

  /** remove a prop from the world (also used by browsers, silently, when the server says it broke) */
  _breakProp(p, silent = false) {
    if (p.dead) return;
    p.dead = true;
    this.solid.delete(p.col.handle); this.propByCol.delete(p.col.handle); this.surfaceByCol.delete(p.col.handle);
    const t = p.body.translation();
    this.world.removeRigidBody(p.body);
    if (!this.destroyed.includes(p.id)) this.destroyed.push(p.id);
    if (!silent) this.emit({ t: 'prop', id: p.id, kind: p.kind, x: t.x, y: t.y, z: t.z });
    if (p.above && this.opts.propsFixed) this._breakProp(p.above, silent);          // fixed crates cannot float: a stack falls apart together
  }

  /** browsers: apply the list of broken props from a snapshot */
  syncDestroyed(ids) { for (const id of ids) { const p = this.propById(id); if (p && !p.dead) this._breakProp(p, true); } }

  _stepBarrels(dt) {
    for (const b of this.barrels) {
      if (b.dead || b.fuse < 0) continue;
      b.fuse -= dt;
      if (b.fuse > 0) continue;
      const t = b.body.translation();
      this._breakProp(b);
      this._blast(t.x, t.y + 0.2, t.z, BARREL_R, BARREL_DMG, b.owner, 'barrel');
    }
  }

  _addFighter(id, name, op, human, spawn) {
    const f = new Fighter(id, name, op, human);
    f.x = spawn.x; f.y = 0.9; f.z = spawn.z; f.yaw = this.rng.range(0, Math.PI * 2);
    f.rb = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(f.x, 0.9, f.z));
    f.col = this.world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.4), f.rb);
    this.colMap.set(f.col.handle, f);
    if (this.opts.loot) f.loadoutLoot();
    this.fighters.push(f);
    return f;
  }

  alive() { return this.fighters.filter((f) => f.alive); }
  /** fighters still in the race (NPC guards do not count) */
  aliveCount() { let n = 0; for (const f of this.fighters) if (f.alive && !f.npc) n++; return n; }
  emit(e) { this.events.push(e); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  /* ---------------- sight and sound ---------------- */

  /** nothing solid between two points? (fighters do not block sight) */
  losClear(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    const hit = this.world.castRay(new RAPIER.Ray({ x: ax, y: ay, z: az }, { x: dx / d, y: dy / d, z: dz / d }), d - 0.05, true,
      undefined, undefined, undefined, undefined, (c) => this.solid.has(c.handle));
    return !hit;
  }

  /** can `a` see `b`? needs: inside range, inside field of view (people very close are noticed anyway), clear line */
  canSee(a, b, range = 75, fov = 2.0) {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d > range * this.weather.sight) return false;               // fog / night / rain shorten what bots can see
    if (d > 9) {
      const ang = Math.atan2(-dx, -dz);                       // direction a->b in our yaw convention
      let diff = Math.abs(((ang - a.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff > fov / 2) return false;
    }
    return this.losClear(a.x, a.eyeY, a.z, b.x, b.y + 0.35, b.z) && !smokeBlocks(this.smokes, a.x, a.eyeY, a.z, b.x, b.y + 0.35, b.z);      // smoke clouds block sight (not bullets)
  }

  makeNoise(src, radius) {
    for (const f of this.fighters) {
      if (!f.alive || f === src || !f.brain) continue;
      if (Math.hypot(f.x - src.x, f.z - src.z) < radius * this.weather.hearing) f.brain.hear(src.x, src.z);   // rain muffles sound
    }
  }

  /* ---------------- shooting ---------------- */

  _aimDir(f, spread, rng = this.rng) {
    // Server and predictor share the same recoil state, so the kick affects both presentation and hit direction.
    const yaw = f.yaw + f.recoilYaw;
    const pitch = clamp(f.pitch + f.recoilPitch, -1.5, 1.5);
    const cp = Math.cos(pitch);
    const d = { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
    if (!spread) return d;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const ux = Math.sin(yaw) * Math.sin(pitch), uy = Math.cos(pitch), uz = Math.cos(yaw) * Math.sin(pitch);
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * spread;
    const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
    const x = d.x + rx * ox + ux * oy, y = d.y + uy * oy, z = d.z + rz * ox + uz * oy;
    const l = Math.hypot(x, y, z);
    return { x: x / l, y: y / l, z: z / l };
  }

  /** where was fighter `t` at tick `tick`? (current position if the tick is too old or unknown) */
  posAt(t, tick) {
    if (tick >= this.tick) return { x: t.x, y: t.y, z: t.z, alive: t.alive, crouch: !!t.crouch };
    const h = this.hist[tick % HIST];
    if (!h || h.tick !== tick) return { x: t.x, y: t.y, z: t.z, alive: t.alive, crouch: !!t.crouch };
    const i = t.id * 4;
    return { x: h.d[i], y: h.d[i + 1], z: h.d[i + 2], alive: h.d[i + 3] >= 1, crouch: h.d[i + 3] === 2 };
  }

  _record() {
    const slot = this.tick % HIST, n = this.fighters.length;
    let h = this.hist[slot];
    if (!h || h.d.length !== n * 4) h = this.hist[slot] = { tick: 0, d: new Float32Array(n * 4) };
    h.tick = this.tick;
    for (const f of this.fighters) { const i = f.id * 4; h.d[i] = f.x; h.d[i + 1] = f.y; h.d[i + 2] = f.z; h.d[i + 3] = f.alive ? (f.crouch ? 2 : 1) : 0; }
  }

  _fire(f) {
    const w = WEAPONS[f.cur], st = f.weapons[f.cur];
    const A = activeAbility(f), deadeye = !!(A && A.shotMul);
    st.ammo--; f.fireT = A?.fireMul ? w.rof / A.fireMul : w.rof;
    if (deadeye) f.abT = 0;

    const moving = f.speedH > 1.2;
    const base = (f.ads ? w.spreadAds : w.spreadHip * (moving ? 1.35 : 1)) * (f.crouch ? 0.78 : 1);
    const spread = base + f.bloom;
    f.bloom = Math.min(w.bloomMax, f.bloom + w.bloom);

    // A stable per-shot recoil kick: no shared RNG stream is consumed by hit effects or rendering.
    f.shotN++;
    const recoilRng = makeRng((this.seed * 31 + f.rngKey * 1009 + f.shotN * 211 + 0x51A7) | 0);
    const recoilScale = f.ads ? 0.72 : 1;
    f.recoilPitch = clamp(f.recoilPitch + (w.recoilUp ?? 0.01) * recoilScale, 0, 0.22);
    f.recoilYaw = clamp(f.recoilYaw + (recoilRng() - 0.5) * (w.recoilSide ?? 0.004) * 2 * recoilScale, -0.1, 0.1);

    const origin = { x: f.x, y: f.eyeY, z: f.z };
    const viewTick = this.tick - f.lagTicks;
    for (let p = 0; p < w.pellets; p++) {
      const shotSeed = (this.seed * 31 + f.rngKey * 1009 + f.shotN * 7 + p * 101) | 0;
      const dir = this._aimDir(f, spread, f.human ? makeRng(shotSeed) : this.rng);
      const physicalRng = makeRng((shotSeed ^ 0x4f1bbcdc) | 0);

      // First collision with the world. Thin wood / glass can transmit one reduced-energy ray.
      const ray = new RAPIER.Ray(origin, dir);
      const hit = this.world.castRayAndGetNormal(ray, w.range, true, undefined, undefined, f.col, undefined, (col) => this.solid.has(col.handle));
      const firstWallT = hit ? hit.timeOfImpact : w.range;
      const firstMaterial = hit ? (this.surfaceByCol.get(hit.collider.handle) ?? 'concrete') : null;
      const impact = hit ? surfaceImpact(firstMaterial, physicalRng()) : null;
      let wallT = firstWallT, penetrated = false;
      if (hit && impact?.penetrates && impact.thickness > 0.001) {
        const advance = impact.thickness + 0.04;
        const remaining = w.range - firstWallT - advance;
        if (remaining > 0.05) {
          const startRay = {
            x: origin.x + dir.x * (firstWallT + advance),
            y: origin.y + dir.y * (firstWallT + advance),
            z: origin.z + dir.z * (firstWallT + advance),
          };
          const second = this.world.castRayAndGetNormal(
            new RAPIER.Ray(startRay, dir), remaining, true, undefined, undefined, undefined, undefined,
            (col) => this.solid.has(col.handle) && col.handle !== f.col.handle && col.handle !== hit.collider.handle,
          );
          wallT = second ? firstWallT + advance + second.timeOfImpact : w.range;
          penetrated = true;
        }
      }

      // Fighter collision is tested against the same lag-compensated capsule that the shooter saw.
      let target = null, tHit = wallT, pos = null;
      const through = [];
      for (const other of this.fighters) {
        if (other === f || !other.alive) continue;
        const q = this.posAt(other, viewTick);
        if (!q.alive) continue;
        const t = rayCapsule(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, q.x, q.y - 0.5, q.z, q.y + (q.crouch ? 0.15 : 0.5), 0.4);
        if (deadeye && t >= 0 && t < wallT) through.push({ o: other, q, t });
        if (t >= 0 && t < tHit) { tHit = t; target = other; pos = q; }
      }

      const end = { x: origin.x + dir.x * tHit, y: origin.y + dir.y * tHit, z: origin.z + dir.z * tHit };
      const firstProp = hit ? this.propByCol.get(hit.collider.handle) : null;
      const firstVehicle = hit ? this.vehicles.byCol.get(hit.collider.handle) : null;
      const e = {
        t: 'shot', by: f.id, w: w.id, first: p === 0,
        ox: origin.x, oy: origin.y, oz: origin.z,
        ex: end.x, ey: end.y, ez: end.z,
        dx: dir.x, dy: dir.y, dz: dir.z, hit: null,
      };

      if (target) {
        const throughSurface = !!(penetrated && tHit > firstWallT + (impact?.thickness ?? 0));
        if (throughSurface && firstProp) this.damageProp(firstProp, damageAt(w, firstWallT, false) * 0.75, f);
        const zone = classifyHitZone(end.y, pos.y - 0.9, pos.crouch);
        const head = zone === 'head';
        const surfaceMul = throughSurface ? impact.damageMultiplier : 1;
        const dmg = damageAt(w, tHit, head) * hitZoneMultiplier(zone) * surfaceMul * (deadeye ? A.shotMul : 1);
        e.hit = 'fighter'; e.target = target.id; e.zone = zone;
        if (throughSurface) {
          e.penetrated = true; e.material = firstMaterial; e.impact = impact.effect;
          e.nx = hit.normal.x; e.ny = hit.normal.y; e.nz = hit.normal.z;
          e.surfaceX = origin.x + dir.x * firstWallT;
          e.surfaceY = origin.y + dir.y * firstWallT;
          e.surfaceZ = origin.z + dir.z * firstWallT;
        }
        this.damage(target, dmg, f, { head, zone, w: w.id, dx: dir.x, dy: dir.y, dz: dir.z, x: end.x, y: end.y, z: end.z, cause: 'bullet', pierce: deadeye });
        if (deadeye) for (const other of through.sort((a, b) => a.t - b.t)) {
          if (other.o === target) continue;
          const pointY = origin.y + dir.y * other.t;
          const extraZone = classifyHitZone(pointY, other.q.y - 0.9, other.q.crouch);
          const extraHead = extraZone === 'head';
          this.damage(other.o, damageAt(w, other.t, extraHead) * hitZoneMultiplier(extraZone) * A.shotMul * A.pierceMul,
            f, { head: extraHead, zone: extraZone, w: w.id, dx: dir.x, dy: dir.y, dz: dir.z,
              x: origin.x + dir.x * other.t, y: pointY, z: origin.z + dir.z * other.t, cause: 'bullet', pierce: true });
        }
      } else if (hit) {
        e.hit = 'world'; e.nx = hit.normal.x; e.ny = hit.normal.y; e.nz = hit.normal.z;
        e.material = firstMaterial; e.impact = impact?.effect ?? 'dust';
        e.surfaceX = end.x; e.surfaceY = end.y; e.surfaceZ = end.z;
        e.ricochet = impact?.kind === 'ricochet';

        const body = hit.collider.parent();
        if (body && body.isDynamic()) {
          const impulse = Math.max(0.5, Math.min(14, damageAt(w, firstWallT, false) * 0.18));
          body.applyImpulseAtPoint({ x: dir.x * impulse, y: dir.y * impulse, z: dir.z * impulse }, { x: end.x, y: end.y, z: end.z }, true);
        }
        if (firstVehicle) { e.veh = firstVehicle.id; this.vehicles.damage(firstVehicle, damageAt(w, firstWallT, false) * (w.pellets > 1 ? 1.2 : 1), f); }
        if (firstProp) { e.prop = firstProp.id; this.damageProp(firstProp, damageAt(w, firstWallT, false) * (w.pellets > 1 ? 1.4 : 1), f); }

        // A metal ricochet gets one short reflected ray. It can still hit a fighter, but with much less energy.
        if (impact?.kind === 'ricochet') {
          const n = hit.normal, dot = dir.x * n.x + dir.y * n.y + dir.z * n.z;
          const reflected = { x: dir.x - 2 * dot * n.x, y: dir.y - 2 * dot * n.y, z: dir.z - 2 * dot * n.z };
          const len = Math.hypot(reflected.x, reflected.y, reflected.z) || 1;
          reflected.x /= len; reflected.y /= len; reflected.z /= len;
          const ricOrigin = { x: end.x + reflected.x * 0.06, y: end.y + reflected.y * 0.06, z: end.z + reflected.z * 0.06 };
          const ricRange = Math.min(24, w.range * 0.25);
          const ricWall = this.world.castRayAndGetNormal(
            new RAPIER.Ray(ricOrigin, reflected), ricRange, true, undefined, undefined, undefined, undefined,
            (col) => this.solid.has(col.handle) && col.handle !== f.col.handle && col.handle !== hit.collider.handle,
          );
          let ricT = ricWall ? ricWall.timeOfImpact : ricRange, ricTarget = null, ricPos = null;
          for (const other of this.fighters) {
            if (other === f || !other.alive) continue;
            const q = this.posAt(other, viewTick);
            if (!q.alive) continue;
            const t = rayCapsule(ricOrigin.x, ricOrigin.y, ricOrigin.z, reflected.x, reflected.y, reflected.z,
              q.x, q.y - 0.5, q.z, q.y + (q.crouch ? 0.15 : 0.5), 0.4);
            if (t >= 0 && t < ricT) { ricT = t; ricTarget = other; ricPos = q; }
          }
          const ricEnd = { x: ricOrigin.x + reflected.x * ricT, y: ricOrigin.y + reflected.y * ricT, z: ricOrigin.z + reflected.z * ricT };
          e.ricochetEndX = ricEnd.x; e.ricochetEndY = ricEnd.y; e.ricochetEndZ = ricEnd.z;
          if (ricTarget) {
            const zone = classifyHitZone(ricEnd.y, ricPos.y - 0.9, ricPos.crouch);
            const head = zone === 'head';
            this.damage(ricTarget, damageAt(w, ricT, head) * hitZoneMultiplier(zone) * impact.damageMultiplier,
              f, { head, zone, w: w.id, dx: reflected.x, dy: reflected.y, dz: reflected.z,
                x: ricEnd.x, y: ricEnd.y, z: ricEnd.z, cause: 'bullet' });
            e.ricochetTarget = ricTarget.id;
          }
        }
      }
      this.emit(e);
    }
    this.emit({ t: 'fire', by: f.id, w: w.id });
    this.makeNoise(f, w.noise);
  }

  /** weapon state machine for ANY fighter (player or bot) */
  updateWeapon(f, dt, wantFire, wantReload) {
    f.fireT = Math.max(0, f.fireT - dt);
    f.switchT = Math.max(0, f.switchT - dt);
    f.bloom = Math.max(0, f.bloom - 0.12 * dt);
    const w = WEAPONS[f.cur], st = f.weapons[f.cur];
    const recoilDecay = Math.exp(-(w.recoilReturn ?? 7) * dt);
    f.recoilPitch *= recoilDecay; f.recoilYaw *= recoilDecay;
    if (f.reloadT > 0) {
      f.reloadT -= dt;
      if (f.reloadT <= 0) {
        // tactical reload keeps the chambered round (mag + 1); an empty gun just gets a full magazine
        const cap = f.reloadEmpty ? w.mag : magCap(w, 1), take = Math.min(cap - st.ammo, st.reserve);
        st.ammo += take; st.reserve -= take; f.reloadT = 0;
        this.emit({ t: 'reload', by: f.id, phase: 'end', w: w.id, empty: f.reloadEmpty });
      }
      f.wasFiring = wantFire; return;
    }
    if ((wantReload || (wantFire && st.ammo <= 0)) && st.ammo < w.mag && st.reserve > 0) {
      f.reloadEmpty = st.ammo <= 0; f.reloadTot = f.reloadT = reloadTime(w, st.ammo); f.shotsInBurst = 0;
      this.emit({ t: 'reload', by: f.id, phase: 'start', w: w.id, time: f.reloadT, empty: f.reloadEmpty, left: st.ammo });
      f.wasFiring = wantFire; return;
    }
    if (f.stunT > 0) wantFire = false;                                 // EMP: the trigger does nothing
    const trigger = wantFire && (w.auto || !f.wasFiring);
    if (trigger && f.fireT <= 0 && f.switchT <= 0) {
      if (st.ammo > 0) this._fire(f);
      else { f.fireT = 0.3; this.emit({ t: 'dry', by: f.id }); }
    }
    f.wasFiring = wantFire;
  }

  switchWeapon(f, id) {
    if (!f.weapons[id] || !f.weapons[id].have || f.cur === id) return;
    f.cur = id; f.reloadT = 0; f.switchT = 0.32; f.bloom = 0;
    this.emit({ t: 'switch', by: f.id, w: id });
  }

  /* ---------------- grenades and damage ---------------- */

  /** `smoke`: throw a smoke canister instead of a fragmentation grenade */
  throwGrenade(f, dir, speed = 15, smoke = false) {
    if ((smoke ? f.smokes : f.nades) <= 0 || f.nadeT > 0 || f.air) return false;
    if (smoke) f.smokes--; else f.nades--;
    f.nadeT = 1.2;
    if (this.opts.predictor) { this.emit({ t: 'throw', by: f.id, smoke }); return true; }   // a predicting browser only plays the throw; the server owns the grenade
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(f.x + dir.x * 0.9, f.eyeY + dir.y * 0.9, f.z + dir.z * 0.9)
      .setLinvel(dir.x * speed, dir.y * speed + 3.5, dir.z * speed).setAngvel({ x: 6, y: 2, z: 3 }));
    const col = this.world.createCollider(RAPIER.ColliderDesc.ball(0.15).setRestitution(0.55).setFriction(0.6).setDensity(1.2), body);
    this.grenades.push({ body, col, t: 0, owner: f, smoke });
    this.emit({ t: 'throw', by: f.id, smoke });
    this.makeNoise(f, smoke ? 12 : 30);
    return true;
  }

  _explode(g) {
    const p = g.body.translation();
    this._blast(p.x, p.y, p.z, GRENADE_R, GRENADE_DMG, g.owner, 'grenade');
    this.world.removeRigidBody(g.body);
  }

  /** one explosion for grenades AND barrels: pushes loose crates, hurts fighters (walls shield), breaks props, sets nearby barrels off */
  _shrapnel(x, y, z, kind, owner, except = null) {
    // A deliberately small, server-authoritative fragment budget. Fragments are instant,
    // seeded traces (not replicated rigid bodies); every ray stops at the first Rapier wall.
    // This gives cover a real effect without a hidden "kill around corners" rule.
    const profiles = {
      grenade: { count: 14, damage: 9, range: 13 },
      barrel: { count: 10, damage: 7, range: 10 },
      mortar: { count: 12, damage: 7, range: 14 },
    };
    const profile = profiles[kind];
    if (!profile || this.opts.predictor) return;
    const serial = ++this.blastSerial;
    const rng = makeRng((this.seed * 73856093 ^ this.tick * 19349663 ^ serial * 83492791 ^ ((owner?.id ?? 0) * 2654435761)) | 0);
    const alreadyHit = new Set();

    for (let i = 0; i < profile.count; i++) {
      const dir = shrapnelDirection(rng);
      const wall = this.world.castRay(
        new RAPIER.Ray({ x, y, z }, dir),
        profile.range,
        true,
        undefined, undefined, undefined, undefined,
        (collider) => this.solid.has(collider.handle),
      );
      const wallDistance = wall ? wall.timeOfImpact : profile.range;
      let target = null, targetDistance = wallDistance, targetPos = null;

      for (const fighter of this.fighters) {
        if (!fighter.alive || fighter === except || alreadyHit.has(fighter.id)) continue;
        const distance = rayCapsule(
          x, y, z, dir.x, dir.y, dir.z,
          fighter.x, fighter.y - 0.5, fighter.z,
          fighter.y + (fighter.crouch ? 0.15 : 0.5), 0.4,
        );
        if (distance >= 0 && distance < targetDistance) {
          target = fighter;
          targetDistance = distance;
          targetPos = {
            x: x + dir.x * distance,
            y: y + dir.y * distance,
            z: z + dir.z * distance,
          };
        }
      }

      if (!target) continue;
      alreadyHit.add(target.id);
      const zone = classifyHitZone(targetPos.y, target.y - 0.9, target.crouch);
      const damage = profile.damage * (1 - 0.45 * (targetDistance / profile.range));
      this.damage(target, damage, owner, {
        head: zone === 'head', zone, w: kind,
        dx: dir.x, dy: dir.y, dz: dir.z,
        x: targetPos.x, y: targetPos.y, z: targetPos.z,
        cause: 'shrapnel',
      });
    }
  }

  _blast(x, y, z, R, maxDmg, owner, w, except = null) {
    this.emit({ t: 'explosion', x, y, z, r: R, w, by: owner ? owner.id : -1 });
    for (const c of this.crates) {
      if (c.dead) continue;
      const q = c.body.translation(), dx = q.x - x, dy = q.y - y, dz = q.z - z, d = Math.hypot(dx, dy, dz);
      if (d < R && c.body.isDynamic()) {
        const impulse = blastImpulse(d, R, maxDmg * 0.35, dx, dy, dz, c.body.mass(), 0.6);
        c.body.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
      }
    }
    for (const f of this.fighters) {
      if (!f.alive || f === except) continue;
      const dx = f.x - x, dy = f.y + 0.4 - y, dz = f.z - z, d = Math.hypot(dx, dy, dz);
      if (d >= R) continue;
      let dmg = maxDmg * (1 - d / R) ** 1.2;
      if (!this.losClear(x, y + 0.3, z, f.x, f.y + 0.4, f.z)) dmg *= 0.25;
      const l = d || 1;
      this.damage(f, dmg, owner, { head: false, w, dx: dx / l, dy: dy / l + 0.4, dz: dz / l, x: f.x, y: f.y + 0.4, z: f.z, cause: 'explosion' });
    }

    // Fragments are separate from the pressure wave: a fragment must have a clear ray to a target.
    // The fixed per-kind budget and separate seeded RNG keep explosion cost and match determinism bounded.
    this._shrapnel(x, y, z, w, owner, except);

    // props: crates near the blast splinter, barrels go off in a wave (the further away, the later)
    for (const c of this.crates) {
      if (c.dead) continue;
      const q = c.body.translation(), d = Math.hypot(q.x - x, q.y - y, q.z - z);
      if (d < R) this.damageProp(c, maxDmg * 1.3 * (1 - d / R), owner);
    }
    for (const v of this.vehicles.list) {                      // vehicles take a beating from blasts (and chain-explode)
      if (v.dead) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < R + 1.5) this.vehicles.damage(v, maxDmg * 1.15 * (1 - d / (R + 1.5)), owner);
    }
    for (const b of this.barrels) {
      if (b.dead || b.fuse >= 0) continue;
      const d = Math.hypot(b.x - x, b.y - y, b.z - z);
      if (d < R && d > 0.01) { b.hp = 0; b.fuse = 0.1 + (d / R) * 0.35; b.owner = owner; }
    }
    this.makeNoise({ x, z }, Math.max(24, R * 10)); // NPCs react to the report of an explosion, not just its damage
  }

  /* ---------------- mortar killstreak ---------------- */

  /** the player marks a spot with the crosshair: the ray from the eye decides where the barrage lands */
  callMortarFromView(f) {
    if (this.opts.predictor || f.mortar <= 0) return false;
    const o = { x: f.x, y: f.eyeY, z: f.z }, d = this._aimDir(f, 0);
    const hit = this.world.castRay(new RAPIER.Ray(o, d), 150, true, undefined, undefined, f.col, undefined, (c) => this.solid.has(c.handle));
    if (!hit) return false;
    return this.callMortar(f, o.x + d.x * hit.timeOfImpact, o.z + d.z * hit.timeOfImpact);
  }

  callMortar(f, x, z) {
    if (this.opts.predictor || f.mortar <= 0 || !f.alive) return false;
    if (Math.hypot(x - f.x, z - f.z) < 16) { this.emit({ t: 'mortarFail', by: f.id, why: 'too close' }); return false; }
    f.mortar--;
    const shells = [];
    for (let i = 0; i < 7; i++) {
      const a = this.rng() * Math.PI * 2, r = i === 0 ? 0 : 3 + this.rng() * 9;
      shells.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, at: 2.4 + i * 0.5, state: 0 });
    }
    this.strikes.push({ owner: f, x, z, t: 0, shells });
    this.emit({ t: 'mortar', by: f.id, x, z });
    return true;
  }

  _stepStrikes(dt) {
    for (const s of this.strikes) {
      s.t += dt;
      for (const sh of s.shells) {
        if (sh.state === 0 && s.t >= sh.at) { sh.state = 1; this.emit({ t: 'shell', x: sh.x, z: sh.z, eta: 1.0 }); }
        else if (sh.state === 1 && s.t >= sh.at + 1.0) { sh.state = 2; this._blast(sh.x, 0.5, sh.z, 7, 100, s.owner, 'mortar'); }
      }
    }
    this.strikes = this.strikes.filter((s) => s.shells.some((sh) => sh.state < 2));
  }

  damage(target, amount, source, info = {}) {
    if (!target.alive || amount <= 0 || target.air) return;
    if (ARMORED.has(info.cause) || info.cause === 'melee') { const T = activeAbility(target); if (T?.takeMul) amount *= T.takeMul; }
    let soaked = 0;
    if (target.armor > 0 && !info.head && !info.pierce && ARMORED.has(info.cause)) {
      soaked = Math.min(target.armor, amount * ARMOR_ABSORB); target.armor -= soaked; amount -= soaked;
      if (target.armor < 0.5) { target.armor = 0; target.armorLv = 0; }
    }
    if (info.cause !== 'zone' && target.healT > 0) { target.healT = 0; this.emit({ t: 'heal', phase: 'cancel', by: target.id }); }

    // A hit nudges a kinematic character through normal movement on subsequent ticks.
    const zone = info.zone ?? (info.head ? 'head' : 'torso');
    if (info.cause === 'bullet' || info.cause === 'explosion' || info.cause === 'shrapnel' || info.cause === 'melee') {
      const pushDamage = info.cause === 'explosion' ? amount * 1.55 : amount;
      const push = hitPushImpulse(pushDamage, { x: info.dx ?? 0, z: info.dz ?? 0 }, zone);
      target.hitPushX = clamp(target.hitPushX + push.x, -2.2, 2.2);
      target.hitPushZ = clamp(target.hitPushZ + push.z, -2.2, 2.2);
      target.hitPushT = Math.max(target.hitPushT, 0.14);
      if (zone === 'leg' && info.cause === 'bullet') target.limpT = Math.max(target.limpT, 0.42);
    }

    target.hp -= amount; target.noHurtT = 0;
    const killed = target.hp <= 0;
    this.emit({ t: 'hit', by: source ? source.id : -1, target: target.id, dmg: amount,
      head: !!info.head, zone, killed, cause: info.cause, arm: soaked > 0 ? Math.round(soaked) : 0,
      x: info.x ?? target.x, y: info.y ?? target.y, z: info.z ?? target.z, dx: info.dx ?? 0, dy: info.dy ?? 0, dz: info.dz ?? 0,
      sx: source ? source.x : target.x, sz: source ? source.z : target.z });
    if (target.brain) target.brain.onHurt(source);
    if (killed) this._kill(target, source, info);
  }

  _kill(target, source, info) {
    if (target.veh) this.vehicles.leave(target, true);
    target.alive = false; target.hp = 0;
    this.colMap.delete(target.col.handle);
    this.world.removeRigidBody(target.rb);
    if (source && source !== target) {
      source.kills++;
      if (!source.npc && ++source.streak % 3 === 0) { source.mortar = Math.min(2, source.mortar + 1); this.emit({ t: 'streak', by: source.id, n: source.streak }); }   // every 3rd kill in a row earns a mortar strike
    }
    target.streak = 0;
    this.contracts.onKill(target, source);
    this.loot.dropFrom(target);
    this.emit({ t: 'kill', by: source ? source.id : -1, target: target.id, w: info.w ?? info.cause ?? 'zone', head: !!info.head, cause: info.cause ?? 'zone',
      x: target.x, y: target.y, z: target.z, dx: info.dx ?? 0, dy: info.dy ?? 0, dz: info.dz ?? 0,
      name: target.name, byName: source ? source.name : 'The zone', color: target.color, vx: target.moveX, vz: target.moveZ });
    const left = this.aliveCount();
    if (target.human) {                                            // every human gets their own result the moment they die
      target.placement = left + 1;
      target.result = { to: target.id, won: false, placement: left + 1, kills: target.kills, time: this.time };
      this.emit({ t: 'end', ...target.result });
    }
    if (this.state === 'playing' && (this.mission ? !this.humans.some((h) => h.alive) : (left <= 1 || !this.humans.some((h) => h.alive)))) this._finish();
  }

  /** the match is over: crown the last fighter standing */
  _finish() {
    const winner = this.fighters.find((f) => f.alive && !f.npc) ?? null;
    if (winner && winner.human) {
      winner.placement = 1;
      winner.result = { to: winner.id, won: true, placement: 1, kills: winner.kills, time: this.time };
      this.emit({ t: 'end', ...winner.result });
    }
    this.state = this.humans.length === 1 ? (this.humans[0].alive ? 'won' : 'lost') : 'over';   // 'won'/'lost' = offline, 'over' = online
    this.result = this.humans.length === 1 ? this.humans[0].result : null;
    this.emit({ t: 'over', winner: winner ? winner.id : -1, winnerName: winner ? winner.name : '', kills: winner ? winner.kills : 0, time: this.time });
  }

  /** a human left (closed the tab): a bot takes over their fighter so the match stays fair for the others */
  botify(f) {
    if (!f.human) return;
    f.human = false; f.isPlayer = false; f.sessionId = null;
    this.humans = this.humans.filter((h) => h !== f);
    if (this.player === f) this.player = this.humans[0] ?? null;
    if (f.alive) f.brain = new BotBrain(this, f, 0.55);
    if (this.state === 'playing' && !this.humans.some((h) => h.alive)) this._finish();
  }

  /* ---------------- movement shared by player and bots ---------------- */

  /** move a fighter by (dx,dz) metres this step with collision; y handled by gravity/jump */
  moveFighter(f, dx, dz, dt, jump = false) {
    if (f.dashT > 0) { dx = f.dashVx * dt; dz = f.dashVz * dt; jump = false; }
    else if (f.stunT > 0) { dx *= STUN_MOVE; dz *= STUN_MOVE; jump = false; }

    // Buffered input + coyote time. Both timers are part of private prediction state.
    f.jumpBufferT = jump ? JUMP_BUFFER : Math.max(0, f.jumpBufferT - dt);
    f.coyoteT = f.grounded ? COYOTE_TIME : Math.max(0, f.coyoteT - dt);
    const wasGrounded = f.grounded;
    if (f.jumpBufferT > 0 && f.coyoteT > 0 && f.stunT <= 0 && f.dashT <= 0) {
      f.vy = JUMP; f.grounded = false; f.jumpBufferT = 0; f.coyoteT = 0;
    }

    // Short, mass-aware hit impulses and a brief leg-hit limp are movement forces, not teleportation.
    if (f.hitPushT > 0) {
      dx += f.hitPushX * dt; dz += f.hitPushZ * dt;
      const drag = Math.exp(-10 * dt);
      f.hitPushX *= drag; f.hitPushZ *= drag; f.hitPushT = Math.max(0, f.hitPushT - dt);
    } else { f.hitPushX = 0; f.hitPushZ = 0; }
    if (f.limpT > 0) { dx *= 0.84; dz *= 0.84; f.limpT = Math.max(0, f.limpT - dt); }

    f.vy += GRAV * dt;
    if (f.grounded && f.vy < 0) f.vy = -1;
    const vyIn = f.vy;
    this.cc.computeColliderMovement(f.col, { x: dx, y: f.vy * dt, z: dz });
    const m = this.cc.computedMovement();
    f.grounded = this.cc.computedGrounded();

    if (!wasGrounded && f.grounded && !this.opts.predictor && f.alive) {
      const impact = Math.abs(vyIn);
      if (impact > 8) this.emit({ t: 'landing', by: f.id, x: f.x, y: f.y, z: f.z, impact, hard: impact >= FALL_SAFE });
      if (impact > FALL_SAFE) {
        f.vy = -1;
        this.damage(f, (impact - FALL_SAFE) * FALL_DMG, null, { cause: 'fall', x: f.x, y: f.y - 0.5, z: f.z });
        if (!f.alive) return;
      }
      f.coyoteT = COYOTE_TIME;
    }

    const t = f.rb.translation();
    const nx = t.x + m.x, ny = t.y + m.y, nz = t.z + m.z;
    f.rb.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    f.moveX = m.x / dt; f.moveZ = m.z / dt;
    f.speedH = Math.hypot(f.moveX, f.moveZ);
    f.x = nx; f.y = ny; f.z = nz;
  }

  /* ---------------- the main fixed step ---------------- */

  /**
   * One human's input for one tick. NEVER changes `cmd` (the caller owns it).
   * Edge flags (slot / reload / grenade) are only true for a single cmd, so they are simply acted on once.
   */
  stepPlayer(p, cmd, dt) {
    p.yaw = cmd.yaw; p.pitch = clamp(cmd.pitch, -1.5, 1.5);
    p.lagTicks = cmd.vt > 0 ? clamp(this.tick - cmd.vt, 0, MAX_LAG_TICKS) : 0;
    if (p.air) { p.slideT = 0; p.mantleT = 0; stepAir(this, p, cmd, dt); return; }       // plane / free fall / parachute: its own physics, no shooting
    if (p.veh) { p.slideT = 0; p.mantleT = 0; this._stepSeated(p, cmd, dt); return; }
    const w = WEAPONS[p.cur];
    const wasCrouch = p.crouch, wasSprint = p.sprinting;                           // (last tick's stance: a slide starts on the tick C goes down while sprinting)
    p.slideCd = Math.max(0, p.slideCd - dt);
    if (p.stunT > 0 || p.dashT > 0) { p.slideT = 0; p.mantleT = 0; p.mFrom = p.mTo = null; }      // an EMP or a dash interrupts both
    p.crouch = !!cmd.crouch;                                                      // C (hold): lower, slower, steadier, harder to hit; no sprint or jump while crouched
    p.sprinting = !!cmd.sprint && cmd.forward > 0 && !cmd.ads && !p.crouch;
    p.ads = !!cmd.ads && !p.sprinting && p.reloadT <= 0 && p.switchT <= 0;
    const mv = moveVector(p.yaw, cmd.forward, cmd.strafe);                        // the one shared (and unit-tested) movement maths
    const mvLen = Math.hypot(mv.x, mv.z);
    // SLIDE: C pressed while sprinting on the ground, with speed and no cooldown
    if (p.slideT <= 0 && p.mantleT <= 0 && cmd.crouch && !wasCrouch && wasSprint && p.grounded && p.slideCd <= 0 && p.speedH >= SLIDE.MIN_SPEED) {
      p.slideT = SLIDE.T;
      if (mvLen > 0.1) { p.slideVx = mv.x / mvLen; p.slideVz = mv.z / mvLen; } else { p.slideVx = -Math.sin(p.yaw); p.slideVz = -Math.cos(p.yaw); }
      this.emit({ t: 'slide', by: p.id, x: p.x, y: p.y, z: p.z });
    }
    if (p.slideT > 0 && cmd.jump) { p.slideT = 0; p.slideCd = SLIDE.CD; p.crouch = false; }       // a jump cancels the slide (and is allowed even if C is still down)
    const slideOn = p.slideT > 0;
    if (slideOn) { p.crouch = true; p.sprinting = false; p.ads = false; }
    // MANTLE: airborne, pushing into a ledge within reach: pull up and over (rules in mantle.js)
    if (p.mantleT <= 0 && !p.grounded && !p.crouch && mvLen > 0.1 && p.vy > MANTLE.MAX_FALL) {
      const led = findLedge(this.map, p.x, p.y - MANTLE.FEET, p.z, mv.x / mvLen, mv.z / mvLen);
      if (led) {
        p.mantleT = MANTLE.T; p.mFrom = { x: p.x, y: p.y, z: p.z }; p.mTo = { x: led.x, y: led.y, z: led.z };
        p.slideT = 0; p.healT = 0; p.reloadT = 0; this.emit({ t: 'mantle', by: p.id, x: p.x, y: p.y, z: p.z });
      }
    }
    const busy = p.mantleT > 0;
    if (busy) { p.ads = false; p.sprinting = false; }
    let sp = BASE_SPEED * (p.op.speed / 10) * w.moveMul;
    const walkSp = sp * 0.5;
    if (p.sprinting) sp *= 1.5; else if (p.ads) sp *= 0.62;
    if (p.crouch) sp *= 0.5;
    if (p.reloadT > 0) sp *= 0.92;
    if (slideOn) { const k = p.slideT / SLIDE.T; sp = walkSp + (BASE_SPEED * (p.op.speed / 10) * w.moveMul * 1.5 * SLIDE.BOOST - walkSp) * k * k; }   // momentum bleeds off smoothly to a crouch walk
    const act = activeAbility(p); if (act?.speedMul) sp *= act.speedMul;      // Cloak: faster
    if (cmd.ability && !busy) useAbility(this, p);                                     // Q: the operator's ability (the server validates cooldown / state)
    // medkit (H): takes HEAL_T seconds of standing mostly still; shooting, reloading, switching, throwing, sprinting or getting hurt cancels it
    if (cmd.heal) this.startHeal(p);
    if (p.healT > 0 && (cmd.fire || cmd.reload || cmd.slot || cmd.grenade || cmd.melee || cmd.use || p.sprinting)) p.healT = 0;
    if (p.healT > 0) sp *= 0.55;
    if (busy) {
      p.mantleT = Math.max(0, p.mantleT - dt);
      const pos = mantlePos(p.mFrom, p.mTo, 1 - p.mantleT / MANTLE.T), ox = p.x, oz = p.z;
      p.rb.setNextKinematicTranslation(pos); p.x = pos.x; p.y = pos.y; p.z = pos.z;
      p.moveX = (pos.x - ox) / dt; p.moveZ = (pos.z - oz) / dt; p.speedH = Math.hypot(p.moveX, p.moveZ); p.vy = 0; p.grounded = false;
      if (p.mantleT <= 0) { p.grounded = true; p.mFrom = p.mTo = null; }
    } else {
      const mx = slideOn ? p.slideVx : mv.x, mz = slideOn ? p.slideVz : mv.z;
      this.moveFighter(p, mx * sp * dt, mz * sp * dt, dt, !!cmd.jump && !p.crouch);
      if (!p.alive) return;                                               // (a lethal landing ends the turn)
      if (slideOn) {
        p.slideT = Math.max(0, p.slideT - dt);
        if (!p.grounded || p.speedH < sp * SLIDE.BLOCKED) p.slideT = 0;   // ran into something, or slid off an edge
        if (p.slideT <= 0) p.slideCd = SLIDE.CD;
      }
    }
    if (cmd.slot) this.switchWeapon(p, SLOT_ORDER[cmd.slot - 1]);
    if (cmd.grenade) this.throwGrenade(p, this._aimDir(p, 0));
    if (cmd.smoke) this.throwGrenade(p, this._aimDir(p, 0), 15, true);
    if (cmd.melee && !busy) this.melee(p);
    if (cmd.mortar) this.callMortarFromView(p);
    if (cmd.use && !this.mission?.interact(p)) this.vehicles.enter(p);  // E: mission interaction first, otherwise enter/exit a vehicle
    p.nadeT = Math.max(0, p.nadeT - dt); p.meleeT = Math.max(0, p.meleeT - dt);
    this.tickHeal(p, dt);
    this.updateWeapon(p, dt, !!cmd.fire && p.switchT <= 0 && !busy, !!cmd.reload);
    tickAbility(this, p, dt);
  }

  /** a close-quarters strike (B for humans, the brain for bots); rules in melee.js */
  melee(f) { return meleeSwing(this, f); }

  /** start using a medkit (humans: the H key, bots: their brain). It is finished by tickHeal() after HEAL_T seconds. */
  startHeal(f) {
    if (f.healT > 0 || f.meds <= 0 || f.hp >= f.maxHp || !f.alive || f.veh) return false;
    f.healT = HEAL_T; this.emit({ t: 'heal', phase: 'start', by: f.id }); return true;
  }
  tickHeal(f, dt) {
    if (f.healT <= 0) return;
    f.healT -= dt;
    if (f.healT <= 0) {
      f.healT = 0; f.meds = Math.max(0, f.meds - 1); f.hp = Math.min(f.maxHp, f.hp + MED_HEAL);
      this.emit({ t: 'heal', phase: 'end', by: f.id, hp: Math.round(f.hp) });
    }
  }

  /** a human sitting in a vehicle: the driver steers it (and cannot shoot), the passenger can shoot but not move */
  _stepSeated(p, cmd, dt) {
    const v = p.veh; p.healT = 0; p.crouch = false;
    if (cmd.use) { this.vehicles.leave(p); return; }
    p.sprinting = false; p.ads = !!cmd.ads && p.seat === 1 && p.reloadT <= 0 && p.switchT <= 0;
    if (p.seat === 0) v.input = { thr: cmd.forward, steer: cmd.strafe, brake: !!cmd.jump, boost: !!cmd.sprint };
    if (cmd.slot) this.switchWeapon(p, SLOT_ORDER[cmd.slot - 1]);
    p.nadeT = Math.max(0, p.nadeT - dt); p.meleeT = Math.max(0, p.meleeT - dt);
    this.updateWeapon(p, dt, p.seat === 1 && !!cmd.fire && p.switchT <= 0, p.seat === 1 && !!cmd.reload);
    tickAbility(this, p, dt);
  }

  /**
   * @param {number} dt fixed step (1/60)
   * @param {object|Map|Record<number,object>} input  ONE cmd (offline: drives `this.player`), or cmds per human fighter id
   */
  step(dt, input) {
    this.time += dt;
    if (!this.opts.predictor && !this.mission && this.time >= this.zoneStart) this.zone.update(dt);        // no zone in an operation; with a drop-in the circle waits until everybody had time to land

    let cmds = input;
    if (input && typeof input.yaw === 'number') cmds = this.player ? { [this.player.id]: input } : {};
    const getCmd = (id) => (cmds instanceof Map ? cmds.get(id) : cmds?.[id]);
    for (const h of this.humans) {
      if (!h.alive) continue;
      const c = getCmd(h.id);
      if (c) this.stepPlayer(h, c, dt);
      else this.stepPlayer(h, { ...idleCmd(), yaw: h.yaw, pitch: h.pitch }, dt);    // no input this tick: stand still but keep falling / reloading
    }

    this.navBudget = 4;                                    // at most 4 path searches per tick across all bots (keeps the tick time flat)
    for (const f of this.fighters) {
      if (!f.alive || this.opts.predictor) continue;       // a predicting browser only simulates ITS player's movement/weapon; hp and zone come from the server
      if (f.brain) f.brain.update(dt);
      if (!f.human) tickAbility(this, f, dt);
      // health regen after a few seconds of peace (arcade feel)
      f.noHurtT += dt;
      const cap = this.opts.loot ? 0.3 : REGEN_CAP;          // in a loot match medkits are how you heal (you only walk it off up to 30%)
      if (f.noHurtT > REGEN_DELAY && f.hp < f.maxHp * cap) f.hp = Math.min(f.maxHp * cap, f.hp + REGEN_RATE * dt);
      // the zone hurts
      if (!this.mission && this.zone.outside(f.x, f.z) > 0) {
        f.zoneAcc += this.zone.dps * dt;
        if (f.zoneAcc >= 1) { const a = f.zoneAcc; f.zoneAcc = 0; this.damage(f, a, null, { cause: 'zone', x: f.x, y: f.y, z: f.z }); }
      }
      // fell out of the world?
      if (f.y < -10) this.damage(f, 9999, null, { cause: 'fall' });
    }

    if (!this.opts.predictor) this.vehicles.update(dt);
    this.world.step();

    if (!this.opts.predictor) {
      this.mission?.update(dt);
      this._stepBarrels(dt); this._stepStrikes(dt);
      if (!this.mission) this.contracts.update(dt);
      this.loot.update();
    }
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i]; g.t += dt;
      if (g.smoke) { if (g.t >= SMOKE.FUSE) { const t = g.body.translation(); popSmoke(this, t.x, t.y, t.z, g.owner); this.world.removeRigidBody(g.body); this.grenades.splice(i, 1); } }
      else if (g.t >= GRENADE_FUSE) { this._explode(g); this.grenades.splice(i, 1); }
    }
    if (!this.opts.predictor) updateSmokes(this, dt);
    this.tick++;
    this._record();
  }

  dispose() { try { this.world.free(); } catch { /* already freed */ } }
}
