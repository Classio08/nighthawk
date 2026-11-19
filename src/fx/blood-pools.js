// Small pooled blood marks that follow the corpse's torso while the cosmetic ragdoll settles.
// One InstancedMesh keeps the effect cheap; this is presentation-only and never enters src/sim.
import * as THREE from 'three';

const BLOOD = new THREE.Color(0x4b0808);
const DUST = new THREE.Color(0x8a7551);

export class BloodPools {
  constructor(scene, { max = 24, growSeconds = 2.2, lifeSeconds = 30 } = {}) {
    this.max = Math.max(1, Math.min(64, Math.trunc(max)));
    this.growSeconds = Math.max(0.1, growSeconds);
    this.lifeSeconds = Math.max(this.growSeconds + 1, lifeSeconds);
    this.items = new Array(this.max).fill(null);
    this.next = 0;

    const geometry = new THREE.CircleGeometry(0.5, 24);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, this.max);
    this.mesh.frustumCulled = false;
    this.mesh.count = this.max;
    this.scene = scene;
    this.scene.add(this.mesh);

    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.rotation = new THREE.Quaternion();
    this.matrix = new THREE.Matrix4();
    this.color = new THREE.Color();
    for (let i = 0; i < this.max; i++) {
      this.matrix.compose(this.position.set(0, -100, 0), this.rotation.identity(), this.scale.set(0, 0, 1));
      this.mesh.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(i, DUST);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Follow a cosmetic ragdoll until it settles, then leave the pool on the ground. */
  add(ragdoll, { size = 0.85 } = {}) {
    if (!ragdoll?.parts?.torso) return false;
    const radius = Math.max(0.35, Math.min(1.5, Number(size) || 0.85));
    this.items[this.next] = {
      ragdoll,
      age: 0,
      radius,
      oval: 0.78 + ((this.next * 37) % 31) / 100,
      angle: ((this.next * 97) % 360) * Math.PI / 180,
      x: 0, z: 0,
      follow: true,
    };
    this.next = (this.next + 1) % this.max;
    return true;
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (let i = 0; i < this.max; i++) {
      const item = this.items[i];
      if (!item) continue;
      item.age += Math.min(dt, 0.1);

      const torso = item.ragdoll?.parts?.torso;
      if (item.follow && torso) {
        const p = torso.translation();
        item.x = p.x;
        item.z = p.z;
        if (item.ragdoll.asleep || item.ragdoll.age >= 2.8) item.follow = false;
      } else item.follow = false;

      if (item.age >= this.lifeSeconds) {
        this.items[i] = null;
        this.matrix.compose(this.position.set(0, -100, 0), this.rotation.identity(), this.scale.set(0, 0, 1));
        this.mesh.setMatrixAt(i, this.matrix);
        this.mesh.setColorAt(i, DUST);
        continue;
      }

      const growth = Math.min(1, item.age / this.growSeconds);
      const fadeStart = this.lifeSeconds - 7;
      const fade = item.age <= fadeStart ? 0 : Math.min(1, (item.age - fadeStart) / 7);
      const radius = item.radius * (0.16 + 0.84 * growth);
      const c = BLOOD.clone().lerp(DUST, fade);
      this.color.copy(c);
      this.position.set(item.x, 0.026, item.z);
      this.rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), item.angle);
      this.scale.set(radius * 2, radius * 2 * item.oval, 1);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(i, this.color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.items.fill(null);
    for (let i = 0; i < this.max; i++) {
      this.matrix.compose(this.position.set(0, -100, 0), this.rotation.identity(), this.scale.set(0, 0, 1));
      this.mesh.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(i, DUST);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
