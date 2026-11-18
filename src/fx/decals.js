// Bullet holes and blood stains: little flat discs stuck on walls/ground. Two InstancedMeshes used as ring buffers
// (new ones overwrite the oldest), so it is always the same tiny cost no matter how long you play.
import * as THREE from 'three';

const Z = new THREE.Vector3(0, 0, 1);

class Ring {
  constructor(scene, max, color, opacity, segs) {
    this.max = max; this.i = 0; this.filled = 0;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, segs), mat, max);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    scene.add(this.mesh);
    this.q = new THREE.Quaternion(); this.qr = new THREE.Quaternion(); this.m = new THREE.Matrix4();
    this.p = new THREE.Vector3(); this.s = new THREE.Vector3(); this.n = new THREE.Vector3();
  }
  add(x, y, z, nx, ny, nz, size) {
    this.n.set(nx, ny, nz).normalize();
    this.q.setFromUnitVectors(Z, this.n);
    this.qr.setFromAxisAngle(Z, Math.random() * 6.283);
    this.q.multiply(this.qr);
    this.p.set(x + this.n.x * 0.012, y + this.n.y * 0.012, z + this.n.z * 0.012);
    this.s.set(size, size * (0.7 + Math.random() * 0.5), 1);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(this.i, this.m);
    this.i = (this.i + 1) % this.max; this.filled = Math.min(this.max, this.filled + 1);
    this.mesh.count = this.filled; this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { this.i = 0; this.filled = 0; this.mesh.count = 0; }
}

export class Decals {
  constructor(scene) {
    this.holes = new Ring(scene, 200, 0x15110d, 0.8, 8);
    this.blood = new Ring(scene, 120, 0x6a0b0b, 0.85, 10);
  }
  hole(x, y, z, nx, ny, nz) { this.holes.add(x, y, z, nx, ny, nz, 0.09 + Math.random() * 0.04); }
  stain(x, y, z, nx, ny, nz, size = 0.5) { this.blood.add(x, y, z, nx, ny, nz, size * (0.6 + Math.random() * 0.8)); }
  clear() { this.holes.clear(); this.blood.clear(); }
}
