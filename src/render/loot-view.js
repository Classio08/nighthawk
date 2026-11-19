// 3D loot on the ground: little low-poly shapes that spin and bob, with a light beam on the good stuff.
// Reads sim.loot.items only (solo: the real list, online: the browser's mirror of the server's list). Items far away are not drawn at all.
// Draw calls: every kind of pickup / ring / beam is ONE instanced mesh, so a map full of loot costs about a dozen draw calls in total.
import * as THREE from 'three';
import { WEAPON_RANK, ARMOR } from '../sim/loot.js';
import { bakeGeometries, placed } from './bake.js';

const SHOW_D = 75, BEAM_D = 60;
const basic = (c, o = 0.3) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending });
export const RARITY = [0xdfe6ee, 0x6fe08a, 0x58a6ff, 0xffc94d];          // white, green, blue, gold
const rarityOf = (it) => {
  if (it.type === 'weapon') { const r = WEAPON_RANK[it.sub] ?? 0; return r >= 3.5 ? 3 : r >= 3 ? 2 : r >= 1.5 ? 1 : 0; }
  if (it.type === 'armor') return Math.min(3, +it.sub);
  if (it.type === 'med') return it.qty >= 2 ? 2 : 1;
  return 0;
};

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _qr = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

export class LootView {
  constructor(scene, sim) {
    this.scene = scene; this.sim = sim; this.items = new Map(); this.rev = -1; this.t = 0;
    this.geo = {
      gun: new THREE.BoxGeometry(0.95, 0.16, 0.2), stock: new THREE.BoxGeometry(0.3, 0.26, 0.18), box: new THREE.BoxGeometry(0.34, 0.22, 0.22), med: new THREE.BoxGeometry(0.42, 0.3, 0.3),
      crossA: new THREE.BoxGeometry(0.28, 0.06, 0.32), crossB: new THREE.BoxGeometry(0.08, 0.32, 0.32), vest: new THREE.BoxGeometry(0.46, 0.52, 0.2), nade: new THREE.SphereGeometry(0.14, 8, 6),
      beam: new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6, 1, true), ring: new THREE.RingGeometry(0.42, 0.55, 20),
    };
    this.mat = {
      body: new THREE.MeshLambertMaterial({ vertexColors: true }),
      ring: RARITY.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })),
      beam: RARITY.map((c) => basic(c, 0.22)),
    };
    this.bodies = {};                                                      // pickup kind -> merged geometry (cached)
    this.pools = new Map();                                                // pool name -> { geo, mat, mesh, cap, n, have }
    this.group = new THREE.Group(); scene.add(this.group);
  }

  /** merged shape of one pickup kind (colours baked in) */
  _bodyGeo(key, it) {
    let g = this.bodies[key]; if (g) return g;
    const G = this.geo, lvl = Math.min(3, Math.max(1, +it.sub));
    const list = it.type === 'weapon' ? [[placed(G.gun), 0x2a2d33], [placed(G.stock, -0.42, -0.04, 0), 0x5a4632]]
      : it.type === 'ammo' ? [[placed(G.box), 0x8a7a2e], [placed(G.box, 0.2, 0.2, 0.05, 0.8), 0x8a7a2e]]
      : it.type === 'med' ? [[placed(G.med), 0xf3f3f3], [placed(G.crossA, 0, 0.14, 0, 1, 0.3, 1), 0xe0312b], [placed(G.crossB, 0, 0.14, 0, 1, 0.3, 1, Math.PI / 2), 0xe0312b]]
      : it.type === 'armor' ? [[placed(G.vest), [0x6c7f6a, 0x3f6fb0, 0x7a4bb4][lvl - 1]]]
      : [[placed(G.nade), 0x39452f], [placed(G.nade, 0.28, 0, 0.05, 0.85), 0x39452f]];
    return (this.bodies[key] = bakeGeometries(list));
  }

  _pool(name, geo, mat) {
    let p = this.pools.get(name);
    if (!p) { p = { name, geo, mat, mesh: null, cap: 0, n: 0, have: 0 }; this.pools.set(name, p); }
    return p;
  }
  _fit(p) {                                                                // make room for p.have instances (re-creates the mesh bigger when needed)
    if (p.mesh && p.have <= p.cap) return;
    if (p.mesh) { this.group.remove(p.mesh); p.mesh.dispose(); }
    p.cap = Math.max(32, p.have * 2); p.mesh = new THREE.InstancedMesh(p.geo, p.mat, p.cap);
    p.mesh.frustumCulled = false; p.mesh.count = 0; this.group.add(p.mesh);
  }

  _make(it) {
    const r = rarityOf(it), key = it.type === 'armor' ? 'armor' + Math.min(3, Math.max(1, +it.sub)) : it.type;
    const rec = {
      r, ph: (it.id * 1.7) % 6.28, tilt: it.type === 'weapon' ? 0.12 : 0,
      scale: it.type === 'weapon' ? (it.sub === 'lmg' || it.sub === 'dmr' ? 1.2 : it.sub === 'smg' ? 0.8 : 1) : 1,
      body: this._pool('body:' + key, this._bodyGeo(key, it), this.mat.body), ring: this._pool('ring:' + r, this.geo.ring, this.mat.ring[r]),
      beam: r >= 1 && it.type !== 'ammo' ? this._pool('beam:' + r, this.geo.beam, this.mat.beam[r]) : null,
    };
    this.items.set(it.id, rec);
    return rec;
  }

  update(dt, camPos) {
    this.t += dt;
    const L = this.sim.loot; if (!L) return;
    if (L.rev !== this.rev) {                                                // something was picked up or dropped: sync the list
      this.rev = L.rev;
      const live = new Set();
      for (const it of L.items) if (!it.gone) { live.add(it.id); if (!this.items.has(it.id)) this._make(it); }
      for (const id of this.items.keys()) if (!live.has(id)) this.items.delete(id);
      for (const p of this.pools.values()) p.have = 0;
      for (const rec of this.items.values()) { rec.body.have++; rec.ring.have++; if (rec.beam) rec.beam.have++; }
      for (const p of this.pools.values()) this._fit(p);
    }
    for (const p of this.pools.values()) p.n = 0;
    for (const it of L.items) {
      const rec = this.items.get(it.id); if (!rec) continue;
      const d = Math.hypot(it.x - camPos.x, it.z - camPos.z);
      if (d >= SHOW_D) continue;
      const spin = this.t * 1.3 + rec.ph, bob = Math.sin(this.t * 2 + rec.ph) * 0.07;
      rec.body.mesh.setMatrixAt(rec.body.n++, _m.compose(_p.set(it.x, 0.55 + bob, it.z), _q.setFromEuler(_e.set(0, spin, rec.tilt)), _s.setScalar(rec.scale)));
      rec.ring.mesh.setMatrixAt(rec.ring.n++, _m.compose(_p.set(it.x, 0.04, it.z), _qr, _s.setScalar(1)));
      if (rec.beam && d < BEAM_D) rec.beam.mesh.setMatrixAt(rec.beam.n++, _m.compose(_p.set(it.x, 1.4, it.z), _q.identity(), _s.setScalar(1)));
    }
    for (const p of this.pools.values()) { p.mesh.count = p.n; p.mesh.instanceMatrix.needsUpdate = true; }
  }

  dispose() {
    this.scene.remove(this.group); this.items.clear();
    for (const p of this.pools.values()) p.mesh?.dispose();
    for (const k of [...Object.values(this.geo), ...Object.values(this.bodies)]) k.dispose();
    for (const m of [this.mat.body, ...this.mat.ring, ...this.mat.beam]) m.dispose();
  }
}

export { ARMOR };
