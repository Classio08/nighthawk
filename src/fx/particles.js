// Voxel particles: blood, sparks, dust, explosion fire/smoke, shell casings. ONE draw call for all of them
// (a single InstancedMesh of little cubes), so hundreds of them cost almost nothing.
import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
const BLOOD = [0x8a0b0b, 0xb01212, 0x5a0606, 0x9c1010];
const SPARK = [0xffd27a, 0xffa43a, 0xfff2b0];
const FIRE = [0xffd24a, 0xff8c1a, 0xff5a0a, 0xffb030];
const SMOKE = [0x3a3a3a, 0x555555, 0x2a2a2a];
const DIRT = [0x8d7a55, 0xa8946a, 0x6e5e3f];

export class Particles {
  constructor(scene, max = 900) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.size = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.bounce = new Float32Array(max);
    this.kind = new Uint8Array(max);                 // 1 = blood (can leave a stain)
    this.col = new Float32Array(max * 3);
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(this.col, 3);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    scene.add(this.mesh);
    this.onBloodLand = null;                         // (x, z) => void  (decals.js hooks in here)
    this._c = new THREE.Color();
  }

  spawn(x, y, z, vx, vy, vz, life, size, color, grav = -22, drag = 0.8, bounce = 0.25, kind = 0) {
    let i = this.n;
    if (i >= this.max) i = Math.floor(Math.random() * this.max); // full: overwrite a random one (looks fine, never crashes)
    else this.n++;
    const p = i * 3;
    this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z;
    this.vel[p] = vx; this.vel[p + 1] = vy; this.vel[p + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size;
    this.grav[i] = grav; this.drag[i] = drag; this.bounce[i] = bounce; this.kind[i] = kind;
    this._c.setHex(color); this.col[p] = this._c.r; this.col[p + 1] = this._c.g; this.col[p + 2] = this._c.b;
  }

  update(dt) {
    const m = this.mesh.instanceMatrix.array;
    for (let i = 0; i < this.n;) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this._remove(i); continue; }
      const p = i * 3;
      const damp = Math.exp(-this.drag[i] * dt);
      this.vel[p] *= damp; this.vel[p + 2] *= damp; this.vel[p + 1] = this.vel[p + 1] * damp + this.grav[i] * dt;
      this.pos[p] += this.vel[p] * dt; this.pos[p + 1] += this.vel[p + 1] * dt; this.pos[p + 2] += this.vel[p + 2] * dt;
      const half = this.size[i] * 0.5;
      if (this.pos[p + 1] < half) {                  // hit the ground
        this.pos[p + 1] = half;
        if (this.vel[p + 1] < -1.2) this.vel[p + 1] = -this.vel[p + 1] * this.bounce[i]; else this.vel[p + 1] = 0;
        this.vel[p] *= 0.6; this.vel[p + 2] *= 0.6;
        if (this.kind[i] === 1) { this.kind[i] = 0; if (this.onBloodLand && Math.random() < 0.3) this.onBloodLand(this.pos[p], this.pos[p + 2]); }
      }
      const fade = Math.min(1, this.life[i] / (this.maxLife[i] * 0.4));
      const s = this.size[i] * fade, o = i * 16;
      m[o] = s; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
      m[o + 4] = 0; m[o + 5] = s; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = s; m[o + 11] = 0;
      m[o + 12] = this.pos[p]; m[o + 13] = this.pos[p + 1]; m[o + 14] = this.pos[p + 2]; m[o + 15] = 1;
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  _remove(i) {
    const last = --this.n;
    if (i !== last) {
      const a = i * 3, b = last * 3;
      for (let k = 0; k < 3; k++) { this.pos[a + k] = this.pos[b + k]; this.vel[a + k] = this.vel[b + k]; this.col[a + k] = this.col[b + k]; }
      this.life[i] = this.life[last]; this.maxLife[i] = this.maxLife[last]; this.size[i] = this.size[last];
      this.grav[i] = this.grav[last]; this.drag[i] = this.drag[last]; this.bounce[i] = this.bounce[last]; this.kind[i] = this.kind[last];
    }
  }

  clear() { this.n = 0; this.mesh.count = 0; }

  /* ---------- ready-made effects ---------- */

  blood(x, y, z, dx, dy, dz, n = 10, power = 1) {
    for (let i = 0; i < n; i++) {
      const sp = rnd(2, 7) * power;
      this.spawn(x, y, z, dx * sp + rnd(-2.2, 2.2), dy * sp + rnd(0.5, 3.5), dz * sp + rnd(-2.2, 2.2),
        rnd(0.5, 1.2), rnd(0.05, 0.13), BLOOD[(Math.random() * BLOOD.length) | 0], -22, 0.7, 0.1, 1);
    }
  }
  sparks(x, y, z, nx, ny, nz, n = 6) {
    for (let i = 0; i < n; i++) {
      const sp = rnd(2, 6);
      this.spawn(x, y, z, nx * sp + rnd(-2, 2), ny * sp + rnd(-1, 2), nz * sp + rnd(-2, 2),
        rnd(0.12, 0.3), rnd(0.025, 0.05), SPARK[(Math.random() * SPARK.length) | 0], -12, 1.2, 0.3);
    }
  }
  dust(x, y, z, nx, ny, nz, n = 4) {
    for (let i = 0; i < n; i++) {
      this.spawn(x, y, z, nx * rnd(0.5, 2) + rnd(-0.7, 0.7), ny * rnd(0.5, 2) + rnd(0, 1), nz * rnd(0.5, 2) + rnd(-0.7, 0.7),
        rnd(0.35, 0.7), rnd(0.08, 0.16), DIRT[(Math.random() * DIRT.length) | 0], -1.5, 3, 0);
    }
  }
  casing(x, y, z, rx, rz) {
    this.spawn(x, y, z, rx * rnd(1.5, 3) + rnd(-0.4, 0.4), rnd(1.5, 3), rz * rnd(1.5, 3) + rnd(-0.4, 0.4), 1.6, 0.03, 0xd9b44a, -26, 0.3, 0.45);
  }
  explosion(x, y, z, r = 9) {
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * 6.283, e = rnd(-0.2, 1), sp = rnd(4, 15);
      this.spawn(x, y, z, Math.cos(a) * sp * (1 - Math.abs(e) * 0.4), e * sp * 0.9 + 3, Math.sin(a) * sp * (1 - Math.abs(e) * 0.4),
        rnd(0.3, 0.8), rnd(0.25, 0.6), FIRE[(Math.random() * FIRE.length) | 0], -4, 2.2, 0.1);
    }
    for (let i = 0; i < 30; i++) {
      this.spawn(x + rnd(-1, 1), y + rnd(0, 1), z + rnd(-1, 1), rnd(-3, 3), rnd(2, 7), rnd(-3, 3),
        rnd(1, 1.9), rnd(0.5, 1.0), SMOKE[(Math.random() * SMOKE.length) | 0], 1.5, 1.2, 0);
    }
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * 6.283, sp = rnd(5, 16);
      this.spawn(x, y + 0.3, z, Math.cos(a) * sp, rnd(5, 14), Math.sin(a) * sp, rnd(0.8, 1.6), rnd(0.1, 0.25), DIRT[(Math.random() * DIRT.length) | 0], -24, 0.4, 0.4);
    }
  }
}
