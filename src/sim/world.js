// The game rules, with NO graphics inside (so the same file can later run on the multiplayer server).
// Physics = Rapier. Bot brains = Yuka (see bot.js). Everything that happens is reported as small
// plain-object "events" that the renderer, sound and HUD read once per frame.
import RAPIER from '@dimforge/rapier3d-compat';
import * as YUKA from 'yuka';
import operatorData from '../../data/operators.json' with { type: 'json' };
import { makeRng } from './rng.js';
import { WEAPONS, SLOT_ORDER, damageAt } from './weapons.js';
import { buildMap, pickSpawns } from './map.js';
import { Zone } from './zone.js';
import { moveVector } from '../input/move.js';
import { BotBrain } from './bot.js';

export const GRAV = -22;
export const OPERATORS = operatorData.operators;
const EYE = 0.72;               // eye height above the capsule centre (capsule centre is 0.9 above the feet)
const BASE_SPEED = 7;
const JUMP = 8.2;
const REGEN_DELAY = 6, REGEN_RATE = 5, REGEN_CAP = 0.65;
const GRENADE_FUSE = 2.2, GRENADE_R = 9, GRENADE_DMG = 150;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let rapierReady = null;
export function initPhysics() { return (rapierReady ??= RAPIER.init()); }

export class Fighter {
  constructor(id, name, op, isPlayer) {
    this.id = id; this.name = name; this.op = op; this.isPlayer = isPlayer;
    this.color = op.color; this.maxHp = op.hp; this.hp = op.hp;
    this.alive = true; this.kills = 0;
    this.x = 0; this.y = 0.9; this.z = 0; this.yaw = 0; this.pitch = 0;
    this.vy = 0; this.grounded = false; this.speedH = 0; this.moveX = 0; this.moveZ = 0;
    this.ads = false; this.sprinting = false;
    this.weapons = {}; this.cur = op.weapon;
    for (const id2 of SLOT_ORDER) this.weapons[id2] = { ammo: WEAPONS[id2].mag, reserve: WEAPONS[id2].reserve };
    this.fireT = 0; this.reloadT = 0; this.switchT = 0; this.bloom = 0; this.wasFiring = false; this.shotsInBurst = 0;
    this.nades = 2; this.nadeT = 0;
    this.noHurtT = 0; this.zoneAcc = 0;
    this.brain = null; this.rb = null; this.col = null;
  }
  get eyeY() { return this.y + EYE; }
}

export class Simulation {
  /** @param {{seed?:number, bots?:number, operator?:string}} opts */
  constructor(opts = {}) {
    this.opts = opts;
    this.seed = opts.seed ?? ((Math.random() * 1e9) | 0);
    this.rng = makeRng(this.seed);
    this.map = buildMap(opts.mapSeed ?? 7);
    this.time = 0; this.events = [];
    this.fighters = []; this.crates = []; this.grenades = [];
    this.colMap = new Map();        // collider handle -> Fighter
    this.solid = new Set();         // collider handles of ground, buildings, crates
    this.state = 'playing'; this.result = null;
    this.obstacles = [];            // Yuka obstacle entities (for bot steering)
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
    this.solid.add(ground.handle);
    for (const b of this.map.boxes) {
      const c = this.world.createCollider(RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2).setTranslation(b.x, b.y, b.z));
      this.solid.add(c.handle);
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
      for (let k = 0; k < 2; k++) this._addCrate(x + k * 0.1, 0.6 + k * 1.22, z);
    }

    // fighters: the player + bots
    const opId = this.opts.operator ?? 'roms';
    const playerOp = OPERATORS.find((o) => o.id === opId) ?? OPERATORS[0];
    const nBots = this.opts.bots ?? 15;
    const spawns = pickSpawns(this.map, nBots + 1, this.rng);
    this.player = this._addFighter(0, playerOp.name, playerOp, true, spawns[0]);
    const botOps = OPERATORS.filter((o) => o.id !== playerOp.id);
    const generic = ['ar', 'smg', 'shotgun', 'dmr', 'lmg'];
    const colors = ['#9aa5b1', '#b08968', '#8aa17b', '#a78bb8', '#c9a227', '#6fa3b8', '#b86f6f', '#7d8f69'];
    for (let i = 0; i < nBots; i++) {
      const op = i < botOps.length ? botOps[i]
        : { id: `recruit${i}`, name: `Recruit-${String(i - botOps.length + 1).padStart(2, '0')}`, color: colors[i % colors.length], hp: 100, speed: 9.5, weapon: generic[i % generic.length] };
      const f = this._addFighter(i + 1, op.name, op, false, spawns[i + 1] ?? { x: this.rng.range(-60, 60), z: this.rng.range(-60, 60) });
      f.brain = new BotBrain(this, f, this.rng.range(0.35, 0.9));
    }
    this.zone = new Zone(this.rng);
  }

  _addCrate(x, y, z) {
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z));
    const col = this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.6, 0.6, 0.6).setRestitution(0.1).setFriction(0.8).setDensity(0.6), body);
    this.solid.add(col.handle);
    this.crates.push({ body, col });
  }

  _addFighter(id, name, op, isPlayer, spawn) {
    const f = new Fighter(id, name, op, isPlayer);
    f.x = spawn.x; f.y = 0.9; f.z = spawn.z; f.yaw = this.rng.range(0, Math.PI * 2);
    f.rb = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(f.x, 0.9, f.z));
    f.col = this.world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.4), f.rb);
    this.colMap.set(f.col.handle, f);
    this.fighters.push(f);
    return f;
  }

  alive() { return this.fighters.filter((f) => f.alive); }
  aliveCount() { let n = 0; for (const f of this.fighters) if (f.alive) n++; return n; }
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
    if (d > range) return false;
    if (d > 9) {
      const ang = Math.atan2(-dx, -dz);                       // direction a->b in our yaw convention
      let diff = Math.abs(((ang - a.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff > fov / 2) return false;
    }
    return this.losClear(a.x, a.eyeY, a.z, b.x, b.y + 0.35, b.z);
  }

  makeNoise(src, radius) {
    for (const f of this.fighters) {
      if (!f.alive || f === src || !f.brain) continue;
      if (Math.hypot(f.x - src.x, f.z - src.z) < radius) f.brain.hear(src.x, src.z);
    }
  }

  /* ---------------- shooting ---------------- */

  _aimDir(f, spread) {
    const cp = Math.cos(f.pitch);
    const d = { x: -Math.sin(f.yaw) * cp, y: Math.sin(f.pitch), z: -Math.cos(f.yaw) * cp };
    if (!spread) return d;
    const rx = Math.cos(f.yaw), rz = -Math.sin(f.yaw);                       // right vector
    const ux = -Math.sin(f.pitch) * -Math.sin(f.yaw), uy = Math.cos(f.pitch), uz = -Math.sin(f.pitch) * -Math.cos(f.yaw);
    const a = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * spread;
    const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
    const x = d.x + rx * ox + ux * oy, y = d.y + uy * oy, z = d.z + rz * ox + uz * oy;
    const l = Math.hypot(x, y, z);
    return { x: x / l, y: y / l, z: z / l };
  }

  _fire(f) {
    const w = WEAPONS[f.cur], st = f.weapons[f.cur];
    st.ammo--; f.fireT = w.rof;
    const moving = f.speedH > 1.2;
    const base = f.ads ? w.spreadAds : w.spreadHip * (moving ? 1.35 : 1);
    const spread = base + f.bloom;
    f.bloom = Math.min(w.bloomMax, f.bloom + w.bloom);
    const origin = { x: f.x, y: f.eyeY, z: f.z };
    for (let p = 0; p < w.pellets; p++) {
      const dir = this._aimDir(f, spread);
      const ray = new RAPIER.Ray(origin, dir);
      const hit = this.world.castRayAndGetNormal(ray, w.range, true, undefined, undefined, f.col, undefined,
        (c) => this.solid.has(c.handle) || this.colMap.has(c.handle));
      const t = hit ? hit.timeOfImpact : w.range;
      const e = { t: 'shot', by: f.id, w: w.id, first: p === 0, ox: origin.x, oy: origin.y, oz: origin.z,
        ex: origin.x + dir.x * t, ey: origin.y + dir.y * t, ez: origin.z + dir.z * t, dx: dir.x, dy: dir.y, dz: dir.z, hit: null };
      if (hit) {
        const target = this.colMap.get(hit.collider.handle);
        if (target) {
          e.hit = 'fighter'; e.target = target.id;
          const head = e.ey - (target.y - 0.9) > 1.42;
          const dmg = damageAt(w, t, head);
          this.damage(target, dmg, f, { head, w: w.id, dx: dir.x, dy: dir.y, dz: dir.z, x: e.ex, y: e.ey, z: e.ez, cause: 'bullet' });
        } else {
          e.hit = 'world'; e.nx = hit.normal.x; e.ny = hit.normal.y; e.nz = hit.normal.z;
          const rb = hit.collider.parent();
          if (rb && rb.isDynamic()) rb.applyImpulseAtPoint({ x: dir.x * 5, y: dir.y * 5, z: dir.z * 5 }, { x: e.ex, y: e.ey, z: e.ez }, true);
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
    if (f.reloadT > 0) {
      f.reloadT -= dt;
      if (f.reloadT <= 0) {
        const take = Math.min(w.mag - st.ammo, st.reserve);
        st.ammo += take; st.reserve -= take; f.reloadT = 0;
        this.emit({ t: 'reload', by: f.id, phase: 'end', w: w.id });
      }
      f.wasFiring = wantFire; return;
    }
    if ((wantReload || (wantFire && st.ammo <= 0)) && st.ammo < w.mag && st.reserve > 0) {
      f.reloadT = w.reload; f.shotsInBurst = 0;
      this.emit({ t: 'reload', by: f.id, phase: 'start', w: w.id, time: w.reload });
      f.wasFiring = wantFire; return;
    }
    const trigger = wantFire && (w.auto || !f.wasFiring);
    if (trigger && f.fireT <= 0 && f.switchT <= 0) {
      if (st.ammo > 0) this._fire(f);
      else { f.fireT = 0.3; this.emit({ t: 'dry', by: f.id }); }
    }
    f.wasFiring = wantFire;
  }

  switchWeapon(f, id) {
    if (!f.weapons[id] || f.cur === id) return;
    f.cur = id; f.reloadT = 0; f.switchT = 0.32; f.bloom = 0;
    this.emit({ t: 'switch', by: f.id, w: id });
  }

  /* ---------------- grenades and damage ---------------- */

  throwGrenade(f, dir, speed = 15) {
    if (f.nades <= 0 || f.nadeT > 0) return false;
    f.nades--; f.nadeT = 1.2;
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(f.x + dir.x * 0.9, f.eyeY + dir.y * 0.9, f.z + dir.z * 0.9)
      .setLinvel(dir.x * speed, dir.y * speed + 3.5, dir.z * speed).setAngvel({ x: 6, y: 2, z: 3 }));
    const col = this.world.createCollider(RAPIER.ColliderDesc.ball(0.15).setRestitution(0.55).setFriction(0.6).setDensity(1.2), body);
    this.grenades.push({ body, col, t: 0, owner: f });
    this.emit({ t: 'throw', by: f.id });
    this.makeNoise(f, 30);
    return true;
  }

  _explode(g) {
    const p = g.body.translation();
    this.emit({ t: 'explosion', x: p.x, y: p.y, z: p.z, r: GRENADE_R });
    for (const c of this.crates) {
      const q = c.body.translation(), dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, d = Math.hypot(dx, dy, dz) || 1;
      if (d < GRENADE_R) { const k = 16 * (1 - d / GRENADE_R); c.body.applyImpulse({ x: dx / d * k, y: dy / d * k + k * 0.6, z: dz / d * k }, true); }
    }
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const dx = f.x - p.x, dy = f.y + 0.4 - p.y, dz = f.z - p.z, d = Math.hypot(dx, dy, dz);
      if (d >= GRENADE_R) continue;
      let dmg = GRENADE_DMG * (1 - d / GRENADE_R) ** 1.2;
      if (!this.losClear(p.x, p.y + 0.3, p.z, f.x, f.y + 0.4, f.z)) dmg *= 0.25;
      const l = d || 1;
      this.damage(f, dmg, g.owner, { head: false, w: 'grenade', dx: dx / l, dy: dy / l + 0.4, dz: dz / l, x: f.x, y: f.y + 0.4, z: f.z, cause: 'explosion' });
    }
    this.world.removeRigidBody(g.body);
  }

  damage(target, amount, source, info = {}) {
    if (!target.alive || amount <= 0) return;
    target.hp -= amount; target.noHurtT = 0;
    const killed = target.hp <= 0;
    this.emit({ t: 'hit', by: source ? source.id : -1, target: target.id, dmg: amount, head: !!info.head, killed, cause: info.cause,
      x: info.x ?? target.x, y: info.y ?? target.y, z: info.z ?? target.z, dx: info.dx ?? 0, dy: info.dy ?? 0, dz: info.dz ?? 0,
      sx: source ? source.x : target.x, sz: source ? source.z : target.z });
    if (target.brain) target.brain.onHurt(source);
    if (killed) this._kill(target, source, info);
  }

  _kill(target, source, info) {
    target.alive = false; target.hp = 0;
    this.colMap.delete(target.col.handle);
    this.world.removeRigidBody(target.rb);
    if (source && source !== target) source.kills++;
    this.emit({ t: 'kill', by: source ? source.id : -1, target: target.id, w: info.w ?? info.cause ?? 'zone', head: !!info.head, cause: info.cause ?? 'zone',
      x: target.x, y: target.y, z: target.z, dx: info.dx ?? 0, dy: info.dy ?? 0, dz: info.dz ?? 0,
      name: target.name, byName: source ? source.name : 'The zone', color: target.color, vx: target.moveX, vz: target.moveZ });
    const left = this.aliveCount();
    if (this.state === 'playing') {
      if (target.isPlayer) {
        this.state = 'lost';
        this.result = { won: false, placement: left + 1, kills: target.kills, time: this.time };
        this.emit({ t: 'end', ...this.result });
      } else if (left === 1 && this.player.alive) {
        this.state = 'won';
        this.result = { won: true, placement: 1, kills: this.player.kills, time: this.time };
        this.emit({ t: 'end', ...this.result });
      }
    }
  }

  /* ---------------- movement shared by player and bots ---------------- */

  /** move a fighter by (dx,dz) metres this step with collision; y handled by gravity/jump */
  moveFighter(f, dx, dz, dt, jump = false) {
    if (f.grounded && jump) f.vy = JUMP;
    f.vy += GRAV * dt;
    if (f.grounded && f.vy < 0) f.vy = -1;
    this.cc.computeColliderMovement(f.col, { x: dx, y: f.vy * dt, z: dz });
    const m = this.cc.computedMovement();
    f.grounded = this.cc.computedGrounded();
    const t = f.rb.translation();
    const nx = t.x + m.x, ny = t.y + m.y, nz = t.z + m.z;
    f.rb.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    f.moveX = m.x / dt; f.moveZ = m.z / dt;
    f.speedH = Math.hypot(f.moveX, f.moveZ);
    f.x = nx; f.y = ny; f.z = nz;
  }

  /* ---------------- the main fixed step ---------------- */

  /** @param {number} dt fixed step (1/60)  @param {object} cmd the player's input for this step (edge flags are cleared after use) */
  step(dt, cmd) {
    this.time += dt;
    const p = this.player;
    this.zone.update(dt);

    if (p.alive && cmd) {
      p.yaw = cmd.yaw; p.pitch = clamp(cmd.pitch, -1.5, 1.5);
      const w = WEAPONS[p.cur];
      p.sprinting = !!cmd.sprint && cmd.forward > 0 && !cmd.ads;
      p.ads = !!cmd.ads && !p.sprinting && p.reloadT <= 0 && p.switchT <= 0;
      let sp = BASE_SPEED * (p.op.speed / 10) * w.moveMul;
      if (p.sprinting) sp *= 1.5; else if (p.ads) sp *= 0.62;
      if (p.reloadT > 0) sp *= 0.92;
      const { x: mx, z: mz } = moveVector(p.yaw, cmd.forward, cmd.strafe); // the one shared (and unit-tested) movement maths
      this.moveFighter(p, mx * sp * dt, mz * sp * dt, dt, !!cmd.jump);
      if (cmd.slot) { this.switchWeapon(p, SLOT_ORDER[cmd.slot - 1]); cmd.slot = 0; }
      if (cmd.grenade) { this.throwGrenade(p, this._aimDir(p, 0)); cmd.grenade = false; }
      p.nadeT = Math.max(0, p.nadeT - dt);
      this.updateWeapon(p, dt, !!cmd.fire && p.switchT <= 0, !!cmd.reload);
      cmd.reload = false;
    }

    for (const f of this.fighters) {
      if (!f.alive) continue;
      if (f.brain) f.brain.update(dt);
      // health regen after a few seconds of peace (arcade feel)
      f.noHurtT += dt;
      if (f.noHurtT > REGEN_DELAY && f.hp < f.maxHp * REGEN_CAP) f.hp = Math.min(f.maxHp * REGEN_CAP, f.hp + REGEN_RATE * dt);
      // the zone hurts
      if (this.zone.outside(f.x, f.z) > 0) {
        f.zoneAcc += this.zone.dps * dt;
        if (f.zoneAcc >= 1) { const a = f.zoneAcc; f.zoneAcc = 0; this.damage(f, a, null, { cause: 'zone', x: f.x, y: f.y, z: f.z }); }
      }
      // fell out of the world?
      if (f.y < -10) this.damage(f, 9999, null, { cause: 'fall' });
    }

    this.world.step();

    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i]; g.t += dt;
      if (g.t >= GRENADE_FUSE) { this._explode(g); this.grenades.splice(i, 1); }
    }
  }

  dispose() { try { this.world.free(); } catch { /* already freed */ } }
}
