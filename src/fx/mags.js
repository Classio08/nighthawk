// Dropped magazines: tiny physical props (cosmetic only, never sent over the network - each browser makes its own from the 'reload' event).
// A full mag (tactical reload) shows brass at the top, an empty one does not. They bounce, clink once, lie around for a while, then shrink away.
import * as THREE from 'three';

const body = new THREE.BoxGeometry(0.04, 0.15, 0.07), top = new THREE.BoxGeometry(0.034, 0.02, 0.06);
const matBody = new THREE.MeshLambertMaterial({ color: 0x23272d }), matBrass = new THREE.MeshLambertMaterial({ color: 0xc9a227 });
const G = 17, MAX = 28, LIFE = 14;

export class MagDrops {
  constructor(scene, onClink) {
    this.onClink = onClink;
    this.items = [];
    for (let i = 0; i < MAX; i++) {
      const m = new THREE.Mesh(body, matBody); const t = new THREE.Mesh(top, matBrass); t.position.y = 0.085; m.add(t);
      m.visible = false; scene.add(m);
      this.items.push({ m, t, on: false, age: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, clinked: false });
    }
    this.n = 0;
  }

  /** @param p position, v velocity (m/s), empty = no rounds left in the magazine */
  drop(p, v, empty) {
    const it = this.items[this.n++ % MAX];
    it.on = true; it.age = 0; it.clinked = false;
    it.m.position.set(p.x, p.y, p.z); it.m.rotation.set(Math.random() * 0.5, Math.random() * 6.28, Math.random() * 0.5); it.m.scale.setScalar(1); it.m.visible = true; it.t.visible = !empty;
    it.vx = v.x; it.vy = v.y; it.vz = v.z; it.wx = (Math.random() - 0.5) * 12; it.wy = (Math.random() - 0.5) * 8; it.wz = (Math.random() - 0.5) * 12;
    return it;
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.on) continue;
      it.age += dt;
      const m = it.m;
      if (it.age > LIFE) { it.on = false; m.visible = false; continue; }
      if (it.age > LIFE - 1.5) m.scale.setScalar(Math.max(0.01, (LIFE - it.age) / 1.5));
      if (it.vy === 0 && it.rest) continue;
      it.vy -= G * dt;
      m.position.x += it.vx * dt; m.position.y += it.vy * dt; m.position.z += it.vz * dt;
      m.rotation.x += it.wx * dt; m.rotation.y += it.wy * dt; m.rotation.z += it.wz * dt;
      if (m.position.y < 0.04) {
        m.position.y = 0.04;
        if (!it.clinked) { it.clinked = true; this.onClink?.(m.position.x, m.position.z); }
        if (Math.abs(it.vy) > 1.2) { it.vy *= -0.32; it.vx *= 0.6; it.vz *= 0.6; it.wx *= 0.5; it.wy *= 0.5; it.wz *= 0.5; }
        else { it.vx = it.vy = it.vz = 0; it.wx = it.wy = it.wz = 0; it.rest = true; m.rotation.x = Math.round(m.rotation.x / 1.5708) * 1.5708; m.rotation.z = Math.round(m.rotation.z / 1.5708) * 1.5708; }
      }
      if (it.rest && it.vy !== 0) it.rest = false;
    }
  }

  clear() { for (const it of this.items) { it.on = false; it.m.visible = false; it.rest = false; } }
}
