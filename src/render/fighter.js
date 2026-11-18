// A blocky soldier (box parts only) with procedural animation: legs swing with the distance walked,
// arms+gun follow the aim pitch, body bobs, hit flash, a name/health label above the head.
import * as THREE from 'three';
import { makeGun } from './guns.js';

const box = new THREE.BoxGeometry(1, 1, 1);
const SKIN = [0xe0b48f, 0xc68c5e, 0x8d5a3a, 0x6b4128];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function lambert(c) { return new THREE.MeshLambertMaterial({ color: c }); }

export class FighterView {
  constructor(f, scene) {
    this.f = f; this.scene = scene;
    this.root = new THREE.Group(); scene.add(this.root);
    const body = lambert(f.color), dark = lambert(0x2a2d33), skin = lambert(SKIN[f.id % SKIN.length]), accent = lambert(0x16181c);
    this.mats = [body, dark, skin, accent];
    const part = (m, w, h, d, x, y, z, parent = this.root) => { const o = new THREE.Mesh(box, m); o.scale.set(w, h, d); o.position.set(x, y, z); parent.add(o); return o; };

    this.body = new THREE.Group(); this.root.add(this.body);                 // everything that bobs
    part(body, 0.52, 0.6, 0.28, 0, 1.15, 0, this.body);                     // torso
    part(dark, 0.54, 0.16, 0.3, 0, 0.9, 0, this.body);                      // belt / vest bottom
    part(dark, 0.4, 0.32, 0.06, 0, 1.2, -0.17, this.body);                  // chest plate (front)
    part(skin, 0.3, 0.3, 0.3, 0, 1.6, 0, this.body);                        // head
    part(body, 0.34, 0.13, 0.34, 0, 1.74, 0, this.body);                    // helmet
    part(accent, 0.26, 0.07, 0.03, 0, 1.62, -0.155, this.body);             // visor
    this.legs = [-0.14, 0.14].map((x) => {
      const pivot = new THREE.Group(); pivot.position.set(x, 0.82, 0); this.root.add(pivot);
      part(dark, 0.19, 0.78, 0.2, 0, -0.39, 0, pivot); return pivot;
    });
    this.aim = new THREE.Group(); this.aim.position.set(0, 1.4, 0); this.body.add(this.aim);   // arms + gun pitch together
    for (const s of [-1, 1]) { const a = part(body, 0.1, 0.1, 0.62, s * 0.27, -0.04, -0.3, this.aim); a.rotation.y = -s * 0.28; }
    this.guns = {}; this.gunId = null;

    this.flashMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.flashMesh.visible = false; this.flashT = 0;

    // fake blob shadow
    const sh = new THREE.Mesh(new THREE.CircleGeometry(0.62, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; this.root.add(sh);

    // name + health label
    this.canvas = document.createElement('canvas'); this.canvas.width = 256; this.canvas.height = 64;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    this.label.scale.set(1.6, 0.4, 1); this.label.position.y = 2.25; this.root.add(this.label);
    this.lastHpDrawn = -1; this._drawLabel(1);

    this.phase = 0; this.hurtT = 0; this.visible = true; this.init = false; this.sx = f.x; this.sy = f.y; this.sz = f.z; this.stepSign = 1;
    this.muzzleV = new THREE.Vector3();
  }

  _drawLabel(frac) {
    const c = this.canvas.getContext('2d'); c.clearRect(0, 0, 256, 64);
    c.font = 'bold 26px system-ui,sans-serif'; c.textAlign = 'center'; c.lineWidth = 5; c.strokeStyle = 'rgba(0,0,0,.8)'; c.fillStyle = '#fff';
    c.strokeText(this.f.name, 128, 26); c.fillText(this.f.name, 128, 26);
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(48, 38, 160, 10);
    c.fillStyle = frac > 0.5 ? '#5be37a' : frac > 0.25 ? '#ffcf4d' : '#ff5b5b'; c.fillRect(49, 39, 158 * clamp(frac, 0, 1), 8);
    this.tex.needsUpdate = true; this.lastHpDrawn = frac;
  }

  _gun(id) {
    let g = this.guns[id];
    if (!g) { g = makeGun(id, undefined, this.f.skin); g.scale.setScalar(0.9); g.position.set(0.15, -0.1, -0.5); this.aim.add(g); this.guns[id] = g; }
    return g;
  }

  /** @param distToCam metres from the camera (labels only show for close fighters) */
  update(dt, distToCam) {
    const f = this.f;
    // the simulation ticks at 60 Hz; ease towards it so 120/144 Hz screens still look smooth
    const k = this.init ? 1 - Math.exp(-28 * dt) : 1; this.init = true;
    if (k >= 1 || Math.hypot(f.x - this.sx, f.z - this.sz) > 4) { this.sx = f.x; this.sy = f.y; this.sz = f.z; }
    else { this.sx += (f.x - this.sx) * k; this.sy += (f.y - this.sy) * k; this.sz += (f.z - this.sz) * k; }
    this.root.position.set(this.sx, this.sy - 0.9, this.sz);
    this.root.rotation.y = f.yaw;
    const sp = Math.min(1.3, f.speedH / 6);
    this.phase += f.speedH * dt * 1.35;
    const sgn = Math.sin(this.phase) >= 0 ? 1 : -1; this.stepped = sgn !== this.stepSign && f.grounded && f.speedH > 2; this.stepSign = sgn;
    const swing = Math.sin(this.phase) * 0.85 * sp;
    this.legs[0].rotation.x = swing; this.legs[1].rotation.x = -swing;
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.05 * sp;
    this.aim.rotation.x = clamp(f.pitch, -1.2, 1.2) + (f.sprinting ? 0.5 : 0) - (f.reloadT > 0 ? 0.5 : 0);
    this.body.rotation.x = f.sprinting ? 0.18 : 0;
    if (f.cur !== this.gunId) {
      if (this.gunId) { const old = this.guns[this.gunId]; old.visible = false; old.userData.muzzle.remove(this.flashMesh); }
      this.gunId = f.cur; const g = this._gun(f.cur); g.visible = true; g.userData.muzzle.add(this.flashMesh);
    }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flashMesh.visible = false; }
    if (this.hurtT > 0) { this.hurtT -= dt; const k = Math.max(0, this.hurtT / 0.12); for (const m of this.mats) m.emissive.setScalar(k * 0.8); }
    const near = distToCam < 38;
    this.label.visible = near && f.alive;
    if (near) { const frac = f.hp / f.maxHp; if (Math.abs(frac - this.lastHpDrawn) > 0.04) this._drawLabel(frac); }
  }

  flash() { this.hurtT = 0.12; }
  shotFlash() { this.flashMesh.visible = true; this.flashT = 0.05; this.flashMesh.rotation.z = Math.random() * 6; }
  /** world position of the gun (where a dropped magazine starts) */
  gunWorld(out) { const g = this.guns[this.gunId]; if (g) { this.root.updateWorldMatrix(true, true); const m = g.userData.mag ?? g; m.getWorldPosition(out); } else out.set(this.f.x, this.f.y, this.f.z); return out; }
  /** world position of the barrel tip */
  muzzleWorld(out = this.muzzleV) { const g = this.guns[this.gunId]; if (g) { this.root.updateWorldMatrix(true, true); g.userData.muzzle.getWorldPosition(out); } return out; }

  setVisible(v) { this.root.visible = v; this.visible = v; }

  dispose() {
    this.scene.remove(this.root);
    for (const m of this.mats) m.dispose();
    this.tex.dispose(); this.label.material.dispose();
  }
}
