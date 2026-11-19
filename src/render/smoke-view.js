// Smoke clouds: a handful of soft billboard puffs per cloud that grow, drift up a little and thin out (rules in sim/smoke.js; the cloud blocks bot sight,
// this is only the picture). Works for solo (sim.smokes are real) and online (NetSim.smokes come from the snapshots).
import * as THREE from 'three';
import { SMOKE, smokeRadius } from '../sim/smoke.js';

let puffTex = null;
function puffTexture() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.55, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c); puffTex.colorSpace = THREE.SRGBColorSpace;
  return puffTex;
}
const PUFFS = 18;

export class SmokeView {
  constructor(scene, sim) { this.scene = scene; this.sim = sim; this.clouds = new Map(); this.t = 0; }

  _make(seed) {
    const group = new THREE.Group(), puffs = []; let s = seed >>> 0 || 1;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < PUFFS; i++) {
      const mat = new THREE.SpriteMaterial({ map: puffTexture(), color: new THREE.Color().setHSL(0.1, 0.03, 0.62 + rnd() * 0.18), transparent: true, depthWrite: false, opacity: 0 });
      const sprite = new THREE.Sprite(mat); group.add(sprite);
      // a point inside the unit sphere
      let x, y, z; do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; } while (x * x + y * y + z * z > 1);
      puffs.push({ sprite, mat, ox: x, oy: y, oz: z, size: 0.75 + rnd() * 0.7, phase: rnd() * 6.28 });
    }
    this.scene.add(group);
    return { group, puffs };
  }

  update(dt) {
    this.t += dt;
    const seen = new Set();
    for (const c of this.sim.smokes ?? []) {
      const key = `${c.x.toFixed(1)},${c.z.toFixed(1)}`; seen.add(key);
      let v = this.clouds.get(key);
      if (!v) { v = this._make(Math.round(c.x * 100) * 7919 + Math.round(c.z * 100)); this.clouds.set(key, v); }
      const r = Math.max(0.01, smokeRadius(c.age)), fade = c.age > SMOKE.LIFE - SMOKE.FADE ? Math.max(0, (SMOKE.LIFE - c.age) / SMOKE.FADE) : 1;
      const rise = Math.min(1.5, c.age * 0.12);
      v.group.position.set(c.x, c.y + rise, c.z);
      for (const p of v.puffs) {
        p.sprite.position.set(p.ox * r * 0.8 + Math.sin(this.t * 0.4 + p.phase) * 0.35, p.oy * r * 0.55 + Math.sin(this.t * 0.3 + p.phase * 2) * 0.2, p.oz * r * 0.8 + Math.cos(this.t * 0.35 + p.phase) * 0.35);
        p.sprite.scale.setScalar(Math.max(0.1, r * 1.25 * p.size));
        p.mat.opacity = 0.62 * fade * Math.min(1, c.age / 0.35);
      }
    }
    for (const [key, v] of this.clouds) {
      if (seen.has(key)) continue;
      this.scene.remove(v.group); for (const p of v.puffs) p.mat.dispose();
      this.clouds.delete(key);
    }
  }

  /** 0..1: how deep inside a cloud this point is (for the screen-filling haze) */
  depthAt(x, y, z) {
    let best = 0;
    for (const c of this.sim.smokes ?? []) {
      const r = smokeRadius(c.age) * 0.95; if (r < 0.6) continue;
      const d = Math.hypot(x - c.x, (y - c.y) * 0.7, z - c.z);
      if (d < r) best = Math.max(best, 1 - d / r);
    }
    return best;
  }
}
