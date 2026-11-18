// CONTRACTS: little side objectives that pull fighters towards each other (server-authoritative, replicated in every snapshot).
//   AIRDROP   a crate floats down (marked on the map); stand next to it for 2.5 s to open it: ammo, health, grenades, a mortar charge. Contested = timer resets.
//   HARDPOINT a circle on the ground; be the ONLY one inside for 14 s (in total) to cash in: full health, ammo, a mortar charge.
//   BOUNTY    one fighter is marked on everybody's map for 50 s; whoever kills them is paid (health + mortar charge).
import { makeRng } from './rng.js';
import { findFreeSpot } from './map.js';
import { WEAPONS, SLOT_ORDER } from './weapons.js';

export const CONTRACT_TYPES = ['airdrop', 'hardpoint', 'bounty'];
export const FALL_T = 9, OPEN_T = 2.5, HOLD_T = 14, HP_R = 9, OPEN_R = 2.8;
const LIFE = { airdrop: 80, hardpoint: 75, bounty: 50 };
const r2 = (v) => Math.round(v * 100) / 100;

export class Contracts {
  constructor(sim) {
    this.sim = sim; this.list = []; this.nextId = 1;
    this.rng = makeRng(((sim.seed | 0) * 131 + 7) | 0);
    this.nextAt = sim.opts.contractStart ?? 24;
    this.off = sim.opts.contracts === false;
    this.n = 0;
  }

  get active() { return this.list.filter((c) => c.state !== 'done'); }
  of(type) { return this.list.find((c) => c.type === type && c.state !== 'done'); }

  update(dt) {
    if (this.off) return;
    const sim = this.sim, t = sim.time;
    if (t >= this.nextAt && this.active.length < 2 && !sim.zone.done && sim.zone.phase < 4) {
      this._spawn(CONTRACT_TYPES[this.n < 3 ? this.n : Math.floor(this.rng() * 3)]); this.n++;
      this.nextAt = t + 30 + this.rng() * 14;
    }
    const people = sim.fighters.filter((f) => f.alive && !f.npc);
    for (const c of this.list) {
      if (c.state === 'done') continue;
      c.age += dt;
      if (c.type === 'airdrop') this._airdrop(c, people, dt);
      else if (c.type === 'hardpoint') this._hardpoint(c, people, dt);
      else this._bounty(c, dt);
      if (c.state !== 'done' && c.age > c.life + (c.type === 'airdrop' ? FALL_T : 0)) this._end(c, 'expired');
    }
    this.list = this.list.filter((c) => c.state !== 'done');
  }

  _spawn(type) {
    const sim = this.sim, z = sim.zone;
    const c = { id: this.nextId++, type, x: 0, z: 0, r: type === 'hardpoint' ? HP_R : OPEN_R, state: 'active', prog: 0, who: -1, age: 0, life: LIFE[type] };
    if (type === 'bounty') {
      const cand = sim.fighters.filter((f) => f.alive && !f.npc);
      if (cand.length < 3) return;
      cand.sort((a, b) => b.kills - a.kills || this.rng() - 0.5);
      const f = cand[0];
      c.who = f.id; c.x = f.x; c.z = f.z;
    } else {
      const p = findFreeSpot(sim.map, this.rng, z.nextX ?? z.cx, z.nextZ ?? z.cz, Math.max(8, (z.nextR ?? z.radius) * 0.7), 5);
      c.x = p.x; c.z = p.z; if (type === 'airdrop') c.state = 'falling';
    }
    this.list.push(c);
    sim.emit({ t: 'contract', phase: 'new', type, id: c.id, x: c.x, z: c.z, who: c.who });
  }

  _airdrop(c, people, dt) {
    if (c.state === 'falling') { if (c.age >= FALL_T) { c.state = 'landed'; c.age = 0; this.sim.emit({ t: 'contract', phase: 'landed', type: c.type, id: c.id, x: c.x, z: c.z }); } return; }
    let near = null, n = 0;
    for (const f of people) if (Math.hypot(f.x - c.x, f.z - c.z) < OPEN_R) { n++; near = f; }
    if (n === 1) {
      if (c.who === near.id) c.prog += dt / OPEN_T; else { c.who = near.id; c.prog = 0; }
      if (c.prog >= 1) { this._reward(near, c); this._end(c, 'done', near); }
    } else { c.prog = n > 1 ? 0 : Math.max(0, c.prog - dt * 0.6); if (n !== 1) c.who = -1; }
  }

  _hardpoint(c, people, dt) {
    let inside = [];
    for (const f of people) if (Math.hypot(f.x - c.x, f.z - c.z) < c.r) inside.push(f);
    if (inside.length === 1) { c.who = inside[0].id; c.prog += dt / HOLD_T; if (c.prog >= 1) { this._reward(inside[0], c); this._end(c, 'done', inside[0]); } }
    else if (inside.length === 0) { c.who = -1; c.prog = Math.max(0, c.prog - dt * 0.25); }
    else c.who = -2;                                            // contested: nobody makes progress
  }

  _bounty(c, dt) {
    void dt;
    const f = this.sim.fighters[c.who];
    if (!f || !f.alive) { this._end(c, 'expired'); return; }
    c.x = f.x; c.z = f.z;
  }

  /** called by the simulation when somebody dies */
  onKill(victim, killer) {
    const c = this.list.find((q) => q.type === 'bounty' && q.who === victim.id && q.state !== 'done');
    if (!c) return;
    if (killer && killer !== victim && !killer.npc) { this._reward(killer, c); this._end(c, 'done', killer); } else this._end(c, 'expired');
  }

  _reward(f, c) {
    f.hp = Math.min(f.maxHp, f.hp + (c.type === 'bounty' ? 50 : c.type === 'airdrop' ? 60 : f.maxHp));
    if (c.type !== 'bounty') {
      if (this.sim.opts.loot) { if (c.type === 'airdrop') this.sim.loot.dropCrate(c.x, c.z, this.sim.rng); else f.nades = Math.min(4, f.nades + 1); }      // loot match: an airdrop spills the good stuff on the ground
      else {
        for (const k of SLOT_ORDER) f.weapons[k].reserve = Math.max(f.weapons[k].reserve, WEAPONS[k].reserve);
        f.nades = Math.min(4, f.nades + (c.type === 'airdrop' ? 2 : 1));
      }
    }
    f.mortar = Math.min(2, f.mortar + 1);
  }

  _end(c, how, by = null) {
    c.state = 'done';
    this.sim.emit({ t: 'contract', phase: how, type: c.type, id: c.id, x: c.x, z: c.z, by: by ? by.id : -1, byName: by ? by.name : '' });
  }

  /** the contract a bot should care about (closest first), or null. `f` is never drawn to its own bounty. */
  wantedBy(f, maxD = 95) {
    let best = null, bd = maxD;
    for (const c of this.list) {
      if (c.state === 'done' || c.type === 'bounty') continue;
      const d = Math.hypot(c.x - f.x, c.z - f.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  /* ---------- wire format ---------- */
  pack() { return this.list.filter((c) => c.state !== 'done').map((c) => [c.id, CONTRACT_TYPES.indexOf(c.type), r2(c.x), r2(c.z), ['active', 'falling', 'landed'].indexOf(c.state), r2(c.prog), c.who, r2(c.age)]); }
  static unpack(a) {
    return a.map(([id, t, x, z, st, prog, who, age]) => ({ id, type: CONTRACT_TYPES[t], x, z, r: t === 1 ? HP_R : OPEN_R, state: ['active', 'falling', 'landed'][st] ?? 'active', prog, who, age }));
  }
}
