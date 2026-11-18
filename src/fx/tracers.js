// Bullet tracers: a short bright streak from the muzzle to wherever the bullet landed. A pool of 48 lines, reused forever.
import * as THREE from 'three';

export class Tracers {
  constructor(scene, n = 48) {
    this.items = [];
    for (let i = 0; i < n; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const m = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9, depthWrite: false }));
      m.visible = false; m.frustumCulled = false; scene.add(m);
      this.items.push({ line: m, t: 0 });
    }
    this.next = 0;
  }
  add(ax, ay, az, bx, by, bz, color = 0xffe9a0) {
    const it = this.items[this.next]; this.next = (this.next + 1) % this.items.length;
    const p = it.line.geometry.attributes.position;
    p.setXYZ(0, ax, ay, az); p.setXYZ(1, bx, by, bz); p.needsUpdate = true;
    it.line.material.color.setHex(color); it.line.visible = true; it.t = 0.07;
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.line.visible) continue;
      it.t -= dt;
      if (it.t <= 0) it.line.visible = false; else it.line.material.opacity = Math.min(0.9, it.t / 0.07);
    }
  }
}
