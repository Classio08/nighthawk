// VEHICLES (arcade, server-authoritative): buggies (driver + passenger) and bikes (one seat).
//   E enters the nearest vehicle (driver seat first) and leaves it again. The driver steers with W/A/S/D, Space = handbrake, Shift = boost.
//   The passenger can shoot (drive-by). Running people over (roadkill), crashing into walls and being shot all hurt; at 0 hp a vehicle explodes.
// Physics is a simple "car on a flat plane" model of our own (deterministic, cheap) - Rapier only holds a kinematic box per vehicle so that
// fighters cannot walk through it and bullets hit it. Browsers do not simulate driving: they draw what the server sends (see netsim.js).
import RAPIER from '@dimforge/rapier3d-compat';
import { makeRng } from './rng.js';
import { findFreeSpot, insideAnyBox, MAP_HALF } from './map.js';

export const VEHICLE_KINDS = ['buggy', 'bike'];
export const VEHICLE_TYPES = {
  buggy: { id: 'buggy', label: 'BUGGY', seats: 2, hp: 400, maxSpeed: 26, boost: 1.15, rev: 8, accel: 19, brake: 34, steer: 1.75, circles: [[0, -1.05], [0, 1.05]], r: 1.15, half: [1.1, 0.65, 1.8], roadkill: 6.5 },
  bike:  { id: 'bike',  label: 'BIKE',  seats: 1, hp: 190, maxSpeed: 31, boost: 1.12, rev: 6, accel: 25, brake: 36, steer: 2.5,  circles: [[0, 0]], r: 0.7, half: [0.35, 0.6, 1.0], roadkill: 5 },
};
// seat positions: [side (+ = right), along (+ = forward)]
const SEATS = { buggy: [[-0.42, -0.15], [0.42, -0.15]], bike: [[0, -0.15]] };
export const DEFAULT_VEHICLES = ['buggy', 'buggy', 'buggy', 'bike', 'bike'];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = (v) => Math.round(v * 100) / 100;
const wrap = (a) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; };

export class VehicleSystem {
  constructor(sim) {
    this.sim = sim; this.list = []; this.byId = new Map(); this.byCol = new Map();
    this.rng = makeRng(((sim.seed | 0) * 977 + 13) | 0);
    const kinds = sim.opts.vehicles === false ? [] : (Array.isArray(sim.opts.vehicles) ? sim.opts.vehicles : DEFAULT_VEHICLES);
    for (const kind of kinds) {
      let p = null;
      for (let i = 0; i < 80 && !p; i++) {
        const q = findFreeSpot(sim.map, this.rng, 0, 0, 86, 8);
        if (this.list.every((v) => Math.hypot(v.x - q.x, v.z - q.z) > 26)) p = q;
      }
      if (p) this._add(kind, p.x, p.z, this.rng() * Math.PI * 2);
    }
  }

  _add(kind, x, z, yaw) {
    const T = VEHICLE_TYPES[kind], sim = this.sim;
    const v = { id: this.list.length, kind, T, x, z, y: 0, yaw, speed: 0, hp: T.hp, maxHp: T.hp, driver: -1, pass: -1, dead: false,
      input: { thr: 0, steer: 0, brake: false, boost: false }, steerVis: 0, lastDriver: -1, hitT: {}, crashT: 0, lastHitBy: -1, body: null, col: null };
    v.body = sim.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, T.half[1], z).setRotation(this._quat(yaw)));
    v.col = sim.world.createCollider(RAPIER.ColliderDesc.cuboid(T.half[0], T.half[1], T.half[2]), v.body);
    sim.solid.add(v.col.handle); this.byCol.set(v.col.handle, v);
    this.list.push(v); this.byId.set(v.id, v);
    return v;
  }
  _quat(yaw) { return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }; }
  _sync(v) { if (!v.body) return; v.body.setNextKinematicTranslation({ x: v.x, y: v.T.half[1], z: v.z }); v.body.setNextKinematicRotation(this._quat(v.yaw)); }

  fighterAt(v, seat) { const id = seat === 0 ? v.driver : v.pass; return id >= 0 ? this.sim.fighters[id] : null; }
  occupants(v) { return [this.fighterAt(v, 0), this.fighterAt(v, 1)].filter(Boolean); }
  hasFreeSeat(v) { return !v.dead && (v.driver < 0 || (v.T.seats > 1 && v.pass < 0)); }
  /** the closest vehicle with a free seat within reach (or within `maxD` metres for bots walking towards one) */
  nearest(f, maxD = 3.6, needDriver = false) {
    let best = null, bd = maxD;
    for (const v of this.list) {
      if (!this.hasFreeSeat(v) || (needDriver && v.driver >= 0)) continue;
      const d = Math.hypot(v.x - f.x, v.z - f.z) - v.T.r;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  /* ---------------- seats ---------------- */
  _seatPos(v, seat) {
    const [side, along] = SEATS[v.kind][seat] ?? SEATS[v.kind][0], fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw), rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw);
    return { x: v.x + rx * side + fx * along, z: v.z + rz * side + fz * along };
  }
  _place(f, x, y, z) {
    f.x = x; f.y = y; f.z = z; f.vy = 0;
    if (f.rb && f.alive) { f.rb.setTranslation({ x, y, z }, true); f.rb.setNextKinematicTranslation({ x, y, z }); }
  }
  _follow(v) {
    for (const seat of [0, 1]) { const f = this.fighterAt(v, seat); if (!f) continue; const p = this._seatPos(v, seat); this._place(f, p.x, 0.95, p.z); f.speedH = Math.abs(v.speed); f.moveX = -Math.sin(v.yaw) * v.speed; f.moveZ = -Math.cos(v.yaw) * v.speed; }
  }

  enter(f, v = null, seatWanted = -1) {
    const sim = this.sim;
    if (sim.opts.predictor || !f.alive || f.veh || f.npc) return false;
    v = v ?? this.nearest(f, 3.6);
    if (!v || !this.hasFreeSeat(v)) return false;
    const seat = seatWanted >= 0 ? seatWanted : (v.driver < 0 ? 0 : 1);
    if ((seat === 0 && v.driver >= 0) || (seat === 1 && (v.T.seats < 2 || v.pass >= 0))) return false;
    if (seat === 0) { v.driver = f.id; v.lastDriver = f.id; } else v.pass = f.id;
    f.veh = v; f.seat = seat; f.sprinting = false; f.ads = false; f.reloadT = 0;
    const p = this._seatPos(v, seat); this._place(f, p.x, 0.95, p.z);
    sim.emit({ t: 'vehicle', phase: 'enter', id: v.id, by: f.id, seat, kind: v.kind });
    return true;
  }

  /** get out (next to the vehicle); `dead` = the fighter just died, so there is nobody to move */
  leave(f, dead = false) {
    const v = f.veh; if (!v) return false;
    if (v.driver === f.id) v.driver = -1; if (v.pass === f.id) v.pass = -1;
    f.veh = null; f.seat = -1;
    if (!dead) {
      const T = v.T, rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw), fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw), off = T.r + 1.15;
      const cands = [[rx, rz], [-rx, -rz], [-fx, -fz], [fx, fz]];
      let spot = null;
      for (const [cx, cz] of cands) { const x = v.x + cx * off, z = v.z + cz * off; if (!insideAnyBox(this.sim.map, x, z, 0.6) && Math.abs(x) < MAP_HALF - 2 && Math.abs(z) < MAP_HALF - 2) { spot = { x, z }; break; } }
      spot = spot ?? { x: v.x, z: v.z };
      this._place(f, spot.x, 0.9, spot.z);
    }
    this.sim.emit({ t: 'vehicle', phase: 'exit', id: v.id, by: f.id });
    return true;
  }
  toggle(f) { return f.veh ? this.leave(f) : this.enter(f); }

  /* ---------------- damage ---------------- */
  damage(v, amount, owner = null) {
    if (v.dead || amount <= 0 || this.sim.opts.predictor) return;
    v.hp -= amount; if (owner) v.lastHitBy = owner.id;
    if (v.hp <= 0) this.boom(v, owner);
  }

  boom(v, owner = null) {
    if (v.dead) return;
    const sim = this.sim;
    v.hp = 0; v.dead = true; v.speed = 0;
    const credit = owner ?? (v.lastHitBy >= 0 ? sim.fighters[v.lastHitBy] : null) ?? (v.lastDriver >= 0 ? sim.fighters[v.lastDriver] : null);
    for (const f of this.occupants(v)) this.leave(f);                         // thrown out: they stand next to the wreck and take the blast
    sim.solid.delete(v.col.handle); this.byCol.delete(v.col.handle);
    sim.world.removeRigidBody(v.body); v.body = null; v.col = null;
    sim.emit({ t: 'vehicle', phase: 'boom', id: v.id, x: v.x, z: v.z, kind: v.kind });
    sim._blast(v.x, 0.8, v.z, 9, 125, credit, 'vehicle');
  }

  /* ---------------- the physics step (server only) ---------------- */
  update(dt) {
    const sim = this.sim;
    for (const v of this.list) {
      if (v.dead) continue;
      const T = v.T, d = v.driver >= 0 ? sim.fighters[v.driver] : null, inp = v.input;
      let thr = d && d.alive ? clamp(inp.thr, -1, 1) : 0, steer = d && d.alive ? clamp(inp.steer, -1, 1) : 0;
      const brake = !!inp.brake, boost = !!inp.boost && thr > 0;
      v.input = { thr: 0, steer: 0, brake: false, boost: false };           // inputs are used up every tick (a stalled client stops accelerating)
      let sp = v.speed;
      const max = T.maxSpeed * (boost ? T.boost : 1);
      if (thr > 0) sp += (sp < -0.5 ? T.brake : T.accel * (boost ? 1.25 : 1)) * thr * dt;
      else if (thr < 0) sp -= (sp > 0.5 ? T.brake : T.accel * 0.55) * -thr * dt;
      else sp -= Math.sign(sp) * Math.min(Math.abs(sp), 4.5 * dt);          // engine braking
      if (brake) sp -= Math.sign(sp) * Math.min(Math.abs(sp), 38 * dt);
      sp = clamp(sp, -T.rev, Math.max(max, v.speed - 12 * dt));            // above the limit (boost just ended): bleed the extra speed off instead of snapping
      const grip = clamp(Math.abs(sp) / 5, 0, 1) * (1 - 0.4 * Math.min(1, Math.abs(sp) / T.maxSpeed)) * (brake ? 1.35 : 1);
      v.yaw = wrap(v.yaw - steer * T.steer * grip * dt * (sp >= 0 ? 1 : -1));
      v.steerVis += (steer - v.steerVis) * Math.min(1, dt * 10);
      v.speed = sp;
      this._move(v, dt);
      if (v.dead) continue;
      this._roadkill(v);
      this._follow(v); this._sync(v);
      v.crashT = Math.max(0, v.crashT - dt);
    }
  }

  _move(v, dt) {
    const sim = this.sim, T = v.T, fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw), rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw);
    v.x += fx * v.speed * dt; v.z += fz * v.speed * dt;
    let impact = 0, hitProp = null;
    const driver = this.fighterAt(v, 0);
    for (const [side, along] of T.circles) {
      const push = (qx, qz, hw, hd, r) => {                                        // circle (r) vs axis-aligned box -> push the vehicle out, remember how hard it hit
        const cx = v.x + rx * side + fx * along, cz = v.z + rz * side + fz * along;
        const px = clamp(cx, qx - hw, qx + hw), pz = clamp(cz, qz - hd, qz + hd);
        let dx = cx - px, dz = cz - pz; const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) return false;
        let nx, nz, pen;
        if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = r - d; }
        else { const ax = hw - Math.abs(cx - qx), az = hd - Math.abs(cz - qz); if (ax < az) { nx = Math.sign(cx - qx) || 1; nz = 0; pen = ax + r; } else { nx = 0; nz = Math.sign(cz - qz) || 1; pen = az + r; } }
        v.x += nx * pen; v.z += nz * pen;
        impact = Math.max(impact, -(fx * nx + fz * nz) * v.speed);
        return true;
      };
      for (const b of sim.map.boxes) { if (b.h < 0.5) continue; push(b.x, b.z, b.w / 2, b.d / 2, T.r); }
      for (const c of sim.crates) { if (c.dead) continue; const t = c.body.translation(); if (push(t.x, t.z, 0.6, 0.6, T.r * 0.8)) hitProp = hitProp ?? c; }
      for (const b of sim.barrels) { if (b.dead) continue; if (push(b.x, b.z, 0.01, 0.01, T.r * 0.75 + 0.4)) hitProp = hitProp ?? b; }
      for (const o of this.list) { if (o === v || o.dead) continue; push(o.x, o.z, 0.01, 0.01, T.r + o.T.r * 0.9); }
    }
    const lim = MAP_HALF - 1.5; v.x = clamp(v.x, -lim, lim); v.z = clamp(v.z, -lim, lim);
    if (impact > 3.5) {
      const heavy = impact > 8;
      if (hitProp && impact > 6) sim.damageProp(hitProp, hitProp.kind === 'barrel' ? 220 : 90, driver);   // ram a crate / barrel: it breaks, you lose some speed
      v.speed *= heavy ? 0.25 : 0.6;
      const dmg = Math.max(0, impact - 6) * 5; if (dmg > 0) this.damage(v, dmg);
      if (!v.dead) { const hurt = Math.max(0, impact - 13) * 3; if (hurt > 0) for (const f of this.occupants(v)) sim.damage(f, hurt, null, { cause: 'crash', x: f.x, y: f.y, z: f.z }); }
      if (v.crashT <= 0 && impact > 6) { v.crashT = 0.35; sim.emit({ t: 'vehicle', phase: 'crash', id: v.id, x: r2(v.x), z: r2(v.z), imp: r2(impact) }); }
    }
  }

  _roadkill(v) {
    const sim = this.sim, T = v.T, sp = Math.abs(v.speed);
    if (v.driver < 0 || sp < 4.5) return;
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw), rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw), driver = sim.fighters[v.driver];
    for (const f of sim.fighters) {
      if (!f.alive || f.veh || f === driver) continue;
      if (v.hitT[f.id] !== undefined && sim.time - v.hitT[f.id] < 0.7) continue;
      for (const [side, along] of T.circles) {
        const cx = v.x + rx * side + fx * along, cz = v.z + rz * side + fz * along;
        if (Math.hypot(f.x - cx, f.z - cz) < T.r + 0.45 && f.y < 2.4) {
          v.hitT[f.id] = sim.time;
          const sgn = Math.sign(v.speed) || 1;
          sim.damage(f, Math.min(320, sp * T.roadkill), driver, { w: 'vehicle', cause: 'vehicle', dx: fx * sgn, dy: 0.5, dz: fz * sgn, x: f.x, y: f.y, z: f.z });
          v.speed *= 0.94; this.damage(v, 6);
          sim.emit({ t: 'vehicle', phase: 'hit', id: v.id, target: f.id, x: r2(f.x), z: r2(f.z) });
          break;
        }
      }
    }
  }

  /* ---------------- wire format ---------------- */
  pack() { return this.list.map((v) => [v.id, VEHICLE_KINDS.indexOf(v.kind), r2(v.x), r2(v.z), r2(v.yaw), r2(v.speed), Math.round(v.hp), v.driver, v.pass, v.dead ? 1 : 0, r2(v.steerVis)]); }

  /** browsers: take the server's state (the colliders move with it so that predicted walking bumps into the same vehicles) */
  applyState(arr, smooth = false) {
    for (const a of arr) {
      const v = this.byId.get(a[0]); if (!v) continue;
      if (smooth && Math.hypot(v.x - a[2], v.z - a[3]) < 4) { v.x += (a[2] - v.x) * 0.6; v.z += (a[3] - v.z) * 0.6; } else { v.x = a[2]; v.z = a[3]; }
      v.yaw = a[4]; v.speed = a[5]; v.hp = a[6]; v.driver = a[7]; v.pass = a[8]; v.steerVis = a[10] ?? 0;
      if (a[9] && !v.dead) { v.dead = true; if (v.col) { this.sim.solid.delete(v.col.handle); this.byCol.delete(v.col.handle); this.sim.world.removeRigidBody(v.body); v.body = null; v.col = null; } }
      this._sync(v);
    }
  }
}
