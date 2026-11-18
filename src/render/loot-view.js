// 3D loot on the ground: little low-poly shapes that spin and bob, with a light beam on the good stuff.
// Reads sim.loot.items only (solo: the real list, online: the browser's mirror of the server's list). Items far away are not drawn at all.
import * as THREE from 'three';
import { WEAPON_RANK, ARMOR } from '../sim/loot.js';

const SHOW_D = 75, BEAM_D = 60;
const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
const basic = (c, o = 0.3) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending });
export const RARITY = [0xdfe6ee, 0x6fe08a, 0x58a6ff, 0xffc94d];          // white, green, blue, gold
const rarityOf = (it) => {
  if (it.type === 'weapon') { const r = WEAPON_RANK[it.sub] ?? 0; return r >= 3.5 ? 3 : r >= 3 ? 2 : r >= 1.5 ? 1 : 0; }
  if (it.type === 'armor') return Math.min(3, +it.sub);
  if (it.type === 'med') return it.qty >= 2 ? 2 : 1;
  return 0;
};

export class LootView {
  constructor(scene, sim) {
    this.scene = scene; this.sim = sim; this.items = new Map(); this.rev = -1; this.t = 0;
    this.geo = {
      gun: new THREE.BoxGeometry(0.95, 0.16, 0.2), stock: new THREE.BoxGeometry(0.3, 0.26, 0.18), box: new THREE.BoxGeometry(0.34, 0.22, 0.22), med: new THREE.BoxGeometry(0.42, 0.3, 0.3),
      crossA: new THREE.BoxGeometry(0.28, 0.06, 0.32), crossB: new THREE.BoxGeometry(0.08, 0.32, 0.32), vest: new THREE.BoxGeometry(0.46, 0.52, 0.2), nade: new THREE.SphereGeometry(0.14, 8, 6),
      beam: new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6, 1, true), ring: new THREE.RingGeometry(0.42, 0.55, 20),
    };
    this.mat = {
      gun: lam(0x2a2d33), stock: lam(0x5a4632), ammo: lam(0x8a7a2e), med: lam(0xf3f3f3), cross: lam(0xe0312b), nade: lam(0x39452f),
      armor: [null, lam(0x6c7f6a), lam(0x3f6fb0), lam(0x7a4bb4)], ring: RARITY.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })),
      beam: RARITY.map((c) => basic(c, 0.22)),
    };
    this.group = new THREE.Group(); scene.add(this.group);
  }

  _make(it) {
    const g = new THREE.Group(), r = rarityOf(it);
    const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    const body = new THREE.Group(); g.add(body);
    const put = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); body.add(m); return m; };
    if (it.type === 'weapon') { put(this.geo.gun, this.mat.gun); put(this.geo.stock, this.mat.stock, -0.42, -0.04, 0); body.rotation.z = 0.12; body.scale.setScalar(it.sub === 'lmg' || it.sub === 'dmr' ? 1.2 : it.sub === 'smg' ? 0.8 : 1); }
    else if (it.type === 'ammo') { put(this.geo.box, this.mat.ammo); put(this.geo.box, this.mat.ammo, 0.2, 0.2, 0.05).scale.setScalar(0.8); }
    else if (it.type === 'med') { put(this.geo.med, this.mat.med); put(this.geo.crossA, this.mat.cross, 0, 0.14, 0).scale.set(1, 0.3, 1); const cb = put(this.geo.crossB, this.mat.cross, 0, 0.14, 0); cb.scale.set(1, 0.3, 1); cb.rotation.x = Math.PI / 2; }
    else if (it.type === 'armor') put(this.geo.vest, this.mat.armor[Math.min(3, Math.max(1, +it.sub))] ?? this.mat.armor[1]);
    else { put(this.geo.nade, this.mat.nade); put(this.geo.nade, this.mat.nade, 0.28, 0, 0.05).scale.setScalar(0.85); }
    const ring = add(this.geo.ring, this.mat.ring[r], 0, 0.04 - 0.55, 0); ring.rotation.x = -Math.PI / 2;
    let beam = null; if (r >= 1 && it.type !== 'ammo') { beam = add(this.geo.beam, this.mat.beam[r], 0, 1.4 - 0.55, 0); }
    g.position.set(it.x, 0.55, it.z); g.userData = { body, beam, ph: (it.id * 1.7) % 6.28, r };
    this.group.add(g); this.items.set(it.id, g);
    return g;
  }

  update(dt, camPos) {
    this.t += dt;
    const L = this.sim.loot; if (!L) return;
    if (L.rev !== this.rev) {                                                // something was picked up or dropped: sync the list
      this.rev = L.rev;
      const live = new Set();
      for (const it of L.items) if (!it.gone) { live.add(it.id); if (!this.items.has(it.id)) this._make(it); }
      for (const [id, g] of this.items) if (!live.has(id)) { this.group.remove(g); this.items.delete(id); }
    }
    for (const it of L.items) {
      const g = this.items.get(it.id); if (!g) continue;
      const d = Math.hypot(it.x - camPos.x, it.z - camPos.z);
      g.visible = d < SHOW_D; if (!g.visible) continue;
      const u = g.userData;
      u.body.rotation.y = this.t * 1.3 + u.ph; u.body.position.y = Math.sin(this.t * 2 + u.ph) * 0.07;
      if (u.beam) u.beam.visible = d < BEAM_D;
    }
  }

  dispose() {
    this.scene.remove(this.group); this.items.clear();
    for (const k of Object.values(this.geo)) k.dispose();
    for (const m of Object.values(this.mat)) for (const x of Array.isArray(m) ? m : [m]) x?.dispose();
  }
}

export { ARMOR };
