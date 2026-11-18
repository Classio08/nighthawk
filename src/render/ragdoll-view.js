// The visible boxes that follow a RagdollWorld ragdoll (see ragdoll.js for the physics).
import * as THREE from 'three';
import { RIG } from './ragdoll.js';

const box = new THREE.BoxGeometry(1, 1, 1);
const SKIN = [0xe0b48f, 0xc68c5e, 0x8d5a3a, 0x6b4128];

export class RagdollView {
  constructor(scene, rag, color, id, life) {
    this.scene = scene; this.rag = rag; this.life = life; this.meshes = {};
    const body = new THREE.MeshLambertMaterial({ color }), dark = new THREE.MeshLambertMaterial({ color: 0x2a2d33 }), skin = new THREE.MeshLambertMaterial({ color: SKIN[id % SKIN.length] });
    this.mats = [body, dark, skin];
    const mats = { torso: body, armL: body, armR: body, legL: dark, legR: dark, head: skin };
    for (const [name, p] of Object.entries(RIG)) {
      const m = new THREE.Mesh(box, mats[name]); m.scale.set(p.half[0] * 2, p.half[1] * 2, p.half[2] * 2);
      scene.add(m); this.meshes[name] = m;
    }
  }
  update() {
    const fade = Math.max(0, Math.min(1, (this.life - this.rag.age) / 1.2));   // shrink away in the last 1.2 s
    for (const [name, m] of Object.entries(this.meshes)) {
      const b = this.rag.parts[name]; if (!b) continue;
      const t = b.translation(), r = b.rotation();
      m.position.set(t.x, t.y, t.z); m.quaternion.set(r.x, r.y, r.z, r.w);
      const h = RIG[name].half; m.scale.set(h[0] * 2 * fade, h[1] * 2 * fade, h[2] * 2 * fade);
    }
  }
  torso() { const b = this.rag.parts.torso; return b ? b.translation() : null; }
  dispose() { for (const m of Object.values(this.meshes)) this.scene.remove(m); for (const m of this.mats) m.dispose(); }
}
