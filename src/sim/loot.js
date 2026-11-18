// LOOT: guns, ammo, armor plates, medkits and grenades lying on the ground, and what dead fighters drop.
//
// Every item is "all or nothing": walking over it either takes it (and it disappears) or leaves it alone. That keeps the network simple:
//  - the starting items come from the match seed, so the server and every browser build the SAME list (nothing is sent but ids),
//  - the server tells the browsers which starting items are gone (`gone`) and sends the few dropped items in full (`dyn`).
// Only a real match uses loot (`opts.loot`); the unit tests of older stages keep all six guns from the start.
import { makeRng } from './rng.js';
import { WEAPONS, SLOT_ORDER } from './weapons.js';
import { insideAnyBox, MAP_HALF } from './map.js';

export const ITEM_TYPES = ['weapon', 'ammo', 'med', 'armor', 'nade'];
export const ARMOR = [null, { pts: 40, name: 'LV1' }, { pts: 80, name: 'LV2' }, { pts: 120, name: 'LV3' }];
export const ARMOR_ABSORB = 0.55;       // armor soaks this share of every body hit until its points run out (head shots go straight through)
export const MED_HEAL = 60, HEAL_T = 3, MAX_MEDS = 4, MAX_NADES = 4;
export const PICK_R = 1.6;              // walk this close to an item to take it
export const WEAPON_RANK = { pistol: 0, smg: 1, shotgun: 2, ar: 3, lmg: 3.5, dmr: 4 };   // "which gun is better" for auto-equip
export const maxReserve = (id) => Math.round(WEAPONS[id].reserve * 1.5);
const MAX_DYN = 140, CELL = 4;
const cellKey = (x, z) => (Math.floor(x / CELL) + 512) * 1024 + (Math.floor(z / CELL) + 512);

const rankedPick = (rng, table) => { let t = 0; for (const k in table) t += table[k]; let r = rng() * t; for (const k in table) { r -= table[k]; if (r <= 0) return k; } return Object.keys(table)[0]; };

export class LootSystem {
  constructor(sim) {
    this.sim = sim; this.items = []; this.byId = new Map(); this.gone = [];      // `gone` = ids of starting items somebody took (cumulative)
    this.nextDyn = 10000; this.dynCount = 0; this.rev = 0;                         // `rev` changes whenever anything changes (cheap "did it change?" check)
    if (sim.opts.loot) this._layout();
  }

  /* ---------------- the starting items (deterministic from the seed) ---------------- */

  _layout() {
    const sim = this.sim, map = sim.map, rng = makeRng(((sim.seed | 0) ^ 0x10075ee) >>> 0 || 7);
    const N = sim.opts.lootCount ?? 120;
    const SOLID_KINDS = new Set(['block', 'container', 'crates', 'poi-building', 'poi-container']);
    const solids = map.boxes.filter((b) => SOLID_KINDS.has(b.kind));
    let tries = 0;
    // named places (Basin Yard, Relay Ridge, Forward Outpost, Extraction Pad) are the hot zones: good loot, so people fight over them
    for (const poi of map.landmarks ?? []) {
      if (poi.kind === 'river') continue;
      for (let n = 0, t = 0; n < 5 && t++ < 200;) {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * poi.radius * 0.8, x = poi.x + Math.cos(a) * r, z = poi.z + Math.sin(a) * r;
        if (Math.abs(x) > MAP_HALF - 5 || Math.abs(z) > MAP_HALF - 5 || insideAnyBox(map, x, z, 0.9)) continue;
        if (this.items.some((o) => Math.hypot(o.x - x, o.z - z) < 2.6)) continue;
        this._add(this._roll(rng, 3, x, z)); n++;
      }
    }
    while (this.items.length < N && tries++ < 4000) {
      let x, z;
      if (solids.length && rng() < 0.6) {                                      // next to a building / container / crate stack: the places people search
        const b = solids[Math.floor(rng() * solids.length)], side = Math.floor(rng() * 4), t = rng() * 2 - 1;
        const gx = b.w / 2 + 1.3, gz = b.d / 2 + 1.3;
        if (side === 0) { x = b.x + t * b.w / 2; z = b.z - gz; } else if (side === 1) { x = b.x + t * b.w / 2; z = b.z + gz; }
        else if (side === 2) { x = b.x - gx; z = b.z + t * b.d / 2; } else { x = b.x + gx; z = b.z + t * b.d / 2; }
      } else { const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 96; x = Math.cos(a) * r; z = Math.sin(a) * r; }
      if (Math.abs(x) > MAP_HALF - 5 || Math.abs(z) > MAP_HALF - 5) continue;
      if (insideAnyBox(map, x, z, 0.9)) continue;
      if (this.items.some((o) => Math.hypot(o.x - x, o.z - z) < 2.6)) continue;
      const quality = (1 - Math.min(1, Math.hypot(x, z) / 100)) * 0.75 + rng() * 0.45;      // the middle of the map has the good stuff
      const tier = quality < 0.42 ? 1 : quality < 0.78 ? 2 : 3;
      this._add(this._roll(rng, tier, x, z));
    }
  }

  /** one random item of a quality tier (1 = scraps ... 3 = the good stuff) */
  _roll(rng, tier, x, z) {
    const type = rankedPick(rng, { weapon: 30, ammo: 25, med: 18, armor: 12, nade: 15 });
    if (type === 'weapon') {
      const sub = rankedPick(rng, tier === 1 ? { smg: 4, shotgun: 3, ar: 3 } : tier === 2 ? { ar: 4, smg: 2, shotgun: 2, dmr: 2 } : { ar: 2, dmr: 3, lmg: 3, shotgun: 1 });
      return { type, sub, x, z, qty: WEAPONS[sub].mag, qty2: Math.floor(WEAPONS[sub].reserve * 0.5) };
    }
    if (type === 'ammo') { const sub = rankedPick(rng, { ar: 4, smg: 3, pistol: 3, shotgun: 2, dmr: 2, lmg: 1.5 }); return { type, sub, x, z, qty: Math.round(WEAPONS[sub].mag * 1.6), qty2: 0 }; }
    if (type === 'med') return { type, sub: '', x, z, qty: tier === 3 ? 2 : 1, qty2: 0 };
    if (type === 'armor') { const lv = Math.min(3, tier + (rng() < 0.12 ? 1 : 0)); return { type, sub: String(lv), x, z, qty: ARMOR[lv].pts, qty2: 0 }; }
    return { type: 'nade', sub: '', x, z, qty: rng() < 0.4 ? 2 : 1, qty2: 0 };
  }

  _add(it, dyn = false) {
    it.id = dyn ? this.nextDyn++ : this.items.length; it.dyn = dyn; it.gone = false;
    this.items.push(it); this.byId.set(it.id, it); this.rev++;
    return it;
  }

  /* ---------------- picking things up ---------------- */

  /** items bucketed into 4 m cells (rebuilt only when something was picked up or dropped), so 16 fighters do not each scan 250 items 60 times a second */
  _grid() {
    this.cells = new Map(); this.gridRev = this.rev;
    for (const it of this.items) { if (it.gone) continue; const k = cellKey(it.x, it.z); const c = this.cells.get(k); if (c) c.push(it); else this.cells.set(k, [it]); }
  }

  /** the server / offline game: walk over things to take them */
  update() {
    if (!this.sim.opts.loot || this.sim.opts.predictor) return;
    if (this.gridRev !== this.rev) this._grid();
    for (const f of this.sim.fighters) {
      if (!f.alive || f.veh) continue;
      const cx = Math.floor(f.x / CELL), cz = Math.floor(f.z / CELL);
      for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
        const cell = this.cells.get((ix + 512) * 1024 + (iz + 512)); if (!cell) continue;
        for (let n = 0; n < cell.length; n++) {
          const it = cell[n]; if (it.gone) continue;
          const dx = it.x - f.x; if (dx > PICK_R || dx < -PICK_R) continue;
          const dz = it.z - f.z; if (dz > PICK_R || dz < -PICK_R || dx * dx + dz * dz > PICK_R * PICK_R) continue;
          if (this._take(f, it)) this._remove(it, f);
        }
      }
    }
  }

  /** would this fighter actually use the item? (also decides what bots walk towards) */
  need(f, it) {
    const st = f.weapons[it.sub];
    switch (it.type) {
      case 'weapon': return st && !st.have ? (this.hasPrimary(f) ? 0.55 : 0.95) : st && st.reserve < maxReserve(it.sub) - 20 ? 0.3 : 0;
      case 'ammo': return st && st.have && st.reserve < maxReserve(it.sub) - it.qty * 0.5 ? (st.ammo + st.reserve < WEAPONS[it.sub].mag ? 0.7 : 0.4) : 0;
      case 'med': return f.meds < MAX_MEDS ? (f.meds === 0 ? 0.6 : 0.35) : 0;
      case 'armor': return it.qty > f.armor + 8 ? (f.armor <= 0 ? 0.6 : 0.4) : 0;
      case 'nade': return f.nades < MAX_NADES ? 0.25 : 0;
      default: return 0;
    }
  }

  hasPrimary(f) { return SLOT_ORDER.some((k) => k !== 'pistol' && f.weapons[k].have && f.weapons[k].ammo + f.weapons[k].reserve > 0); }

  _take(f, it) {
    if (this.need(f, it) <= 0) return false;
    const st = f.weapons[it.sub];
    switch (it.type) {
      case 'weapon':
        if (!st.have) {
          st.have = true; st.ammo = it.qty; st.reserve = it.qty2;
          const curDry = f.weapons[f.cur].ammo + f.weapons[f.cur].reserve <= 0;
          if (f.cur === 'pistol' || curDry || (f.brain && WEAPON_RANK[it.sub] > WEAPON_RANK[f.cur])) this.sim.switchWeapon(f, it.sub);
        } else st.reserve = Math.min(maxReserve(it.sub), st.reserve + it.qty + it.qty2);
        break;
      case 'ammo': st.reserve = Math.min(maxReserve(it.sub), st.reserve + it.qty); break;
      case 'med': f.meds = Math.min(MAX_MEDS, f.meds + it.qty); break;
      case 'armor': f.armor = it.qty; f.armorLv = +it.sub; break;
      case 'nade': f.nades = Math.min(MAX_NADES, f.nades + it.qty); break;
    }
    this.sim.emit({ t: 'pickup', by: f.id, kind: it.type, sub: it.sub, qty: it.qty, x: it.x, z: it.z });
    return true;
  }

  _remove(it, by = null) {
    void by;
    it.gone = true; this.rev++;
    if (it.dyn) { this.dynCount = Math.max(0, this.dynCount - 1); this.byId.delete(it.id); const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1); }
    else this.gone.push(it.id);
  }

  /* ---------------- drops ---------------- */

  /** a fighter died (or an airdrop was opened): put loose items on the ground around (x, z), at most one every ~1 m of a small ring */
  drop(x, z, list) {
    list.forEach((it, i) => {
      const a = (i / Math.max(1, list.length)) * Math.PI * 2 + 0.6, r = list.length === 1 ? 0 : 1.15;
      let px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (insideAnyBox(this.sim.map, px, pz, 0.4)) { px = x; pz = z; }
      this._add({ ...it, x: px, z: pz }, true); this.dynCount++;
    });
    while (this.dynCount > MAX_DYN) { const old = this.items.find((q) => q.dyn && !q.gone); if (!old) break; this._remove(old); }
  }

  /** everything a dead fighter was carrying (the pistol stays: you can always find one) */
  dropFrom(f) {
    if (!this.sim.opts.loot) return;
    const list = [];
    for (const k of SLOT_ORDER) {
      const st = f.weapons[k];
      if (k === 'pistol' || !st.have) continue;
      list.push({ type: 'weapon', sub: k, qty: st.ammo, qty2: st.reserve });
    }
    const pr = f.weapons.pistol.reserve; if (pr >= 15) list.push({ type: 'ammo', sub: 'pistol', qty: pr, qty2: 0 });
    if (f.armor > 12) list.push({ type: 'armor', sub: String(f.armorLv || 1), qty: Math.round(f.armor), qty2: 0 });
    if (f.meds > 0) list.push({ type: 'med', sub: '', qty: f.meds, qty2: 0 });
    if (f.nades > 0) list.push({ type: 'nade', sub: '', qty: f.nades, qty2: 0 });
    if (list.length) this.drop(f.x, f.z, list);
  }

  /** an airdrop crate was opened: the good stuff */
  dropCrate(x, z, rng) {
    const w = rankedPick(rng, { dmr: 3, lmg: 3, ar: 2 });
    this.drop(x, z, [
      { type: 'weapon', sub: w, qty: WEAPONS[w].mag, qty2: Math.floor(WEAPONS[w].reserve * 0.7) },
      { type: 'armor', sub: '3', qty: ARMOR[3].pts, qty2: 0 },
      { type: 'med', sub: '', qty: 2, qty2: 0 },
      { type: 'ammo', sub: w, qty: Math.round(WEAPONS[w].mag * 2), qty2: 0 },
      { type: 'nade', sub: '', qty: 2, qty2: 0 },
    ]);
  }

  /** for bots: the most attractive item within `maxD` metres (or null). `need` is 0..1 */
  wantedBy(f, maxD = 50, skip = null) {
    let best = null, bs = 0;
    for (const it of this.items) {
      if (it.gone || (skip && skip(it.id))) continue;
      const d = Math.hypot(it.x - f.x, it.z - f.z); if (d > maxD) continue;
      const n = this.need(f, it); if (n <= 0) continue;
      const s = n * (1 - 0.55 * d / maxD);
      if (s > bs) { bs = s; best = it; }
    }
    return best ? { it: best, score: bs, x: best.x, z: best.z } : null;
  }

  /* ---------------- the wire ---------------- */

  /** [gone starting ids, dropped items still on the ground as [id, typeIdx, sub, x, z, qty, qty2]] */
  pack() {
    return { g: this.gone, d: this.items.filter((q) => q.dyn && !q.gone).map((q) => [q.id, ITEM_TYPES.indexOf(q.type), q.sub, Math.round(q.x * 100) / 100, Math.round(q.z * 100) / 100, q.qty, q.qty2]) };
  }

  /** a browser mirrors what the server says (it never picks anything up itself) */
  applyState(s) {
    if (!s) return;
    let changed = false;
    if (s.g.length !== this.gone.length) {
      for (const id of s.g) { const it = this.byId.get(id); if (it && !it.gone) { it.gone = true; changed = true; } }
      this.gone = s.g.slice();
    }
    const live = new Set(s.d.map((r) => r[0]));
    for (const it of this.items) if (it.dyn && !live.has(it.id)) { it.gone = true; changed = true; }
    this.items = this.items.filter((q) => !(q.dyn && q.gone));
    for (const r of s.d) {
      if (this.byId.has(r[0]) && !this.byId.get(r[0]).gone) continue;
      const it = { id: r[0], type: ITEM_TYPES[r[1]], sub: r[2], x: r[3], z: r[4], qty: r[5], qty2: r[6], dyn: true, gone: false };
      this.items.push(it); this.byId.set(it.id, it); changed = true;
    }
    for (const id of [...this.byId.keys()]) { const it = this.byId.get(id); if (it.dyn && it.gone) this.byId.delete(id); }
    if (changed) this.rev++;
  }
}
