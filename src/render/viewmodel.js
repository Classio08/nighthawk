// The gun you see in first person. It is NOT animated by artists - every motion is a spring or a sine wave:
//   look sway (gun lags the mouse) · walk bob · sprint pose · ADS (aim down sights) · recoil kick · reload dip · weapon raise
import * as THREE from 'three';
import { Spring } from './spring.js';
import { makeGun, GUN_IDS } from './guns.js';
import { RELOAD_STAGES } from '../sim/weapons.js';
import { skinReact } from './skins.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SCALE = 0.62;                                   // viewmodel size (the gun models are life-size; this keeps them from filling the screen)
const HIP = { x: 0.19, y: -0.21, z: -0.56 };
const SPRINT = { x: 0.1, y: -0.28, z: -0.5 };

export class Viewmodel {
  constructor(camera) {
    this.root = new THREE.Group();
    camera.add(this.root);
    this.guns = {}; this.skin = null; this.cur = null;
    this._build();
    // muzzle flash: two crossed quads, shown for ~0.05 s
    const fm = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.flash = new THREE.Group();
    const q = new THREE.PlaneGeometry(0.22, 0.22);
    this.flash.add(new THREE.Mesh(q, fm));
    const q2 = new THREE.Mesh(q, fm); q2.rotation.y = Math.PI / 2; this.flash.add(q2);
    this.flash.visible = false; this.flashT = 0;
    // springs
    this.sx = new Spring(90, 11); this.sy = new Spring(90, 11);          // sway position
    this.rx = new Spring(110, 12); this.ry = new Spring(90, 11); this.rz = new Spring(90, 11); // sway rotation
    this.kz = new Spring(220, 17); this.krx = new Spring(180, 13);       // recoil: push back + muzzle climb
    this.prevK = -1; this.adsT = 0; this.sprintT = 0; this.bobT = 0; this.bobAmp = 0; this.landDip = new Spring(160, 12);
    this.wasGrounded = true;
  }

  _build() {
    for (const id of GUN_IDS) { const g = makeGun(id, undefined, this.skin); g.scale.setScalar(SCALE); g.visible = false; this.root.add(g); this.guns[id] = g; }
  }

  /** change the cosmetic skin (null = plain). Rebuilds the guns, which only happens when a match starts. */
  setSkin(skin) {
    skin = skin || null;
    if (skin === this.skin) return;
    const was = this.cur;
    if (was) this.guns[was].userData.muzzle.remove(this.flash);
    for (const id of GUN_IDS) { const g = this.guns[id]; this.root.remove(g); g.traverse((o) => { if (o.isMesh && o.geometry !== undefined && g.userData.skin) o.geometry.dispose(); }); }
    this.skin = skin; this.cur = null; this._build();
    if (was) this.setWeapon(was);
  }

  /** world position of the magazine well (where the dropped magazine starts) */
  magWorld(out) { const g = this.guns[this.cur]; const m = g?.userData.mag; if (!m) return g ? g.getWorldPosition(out) : out; m.getWorldPosition(out); out.y -= 0.05; return out; }

  setWeapon(id) {
    if (this.cur === id) return;
    if (this.cur) { this.guns[this.cur].visible = false; this.guns[this.cur].userData.muzzle.remove(this.flash); }
    this.cur = id; const g = this.guns[id]; g.visible = true; g.userData.muzzle.add(this.flash);
  }

  /** a melee strike: the gun lunges forward and dips (there is no knife model yet, it is a rifle-butt strike) */
  slash() {
    skinReact(0.1);
    this.kz.impulse(-3.4); this.krx.impulse(-6); this.ry.impulse(2.2);
  }

  /** call when the player fires a shot */
  kick(w) {
    skinReact(0.12);
    this.kz.impulse(w.kick * 1.15);
    this.krx.impulse(w.kick * 2.4);
    this.ry.impulse((Math.random() - 0.5) * w.kick * 1.2);
    this.flash.visible = true; this.flashT = 0.05; this.flash.rotation.z = Math.random() * 6.28;
    const s = 0.7 + Math.random() * 0.8; this.flash.scale.set(s, s, s);
  }

  /**
   * @param s {weapon, adsTime, ads, sprint, grounded, speed, lookYaw, lookPitch, reloadK (0..1 or -1), reloadTime, switchK (1..0 or 0)}
   */
  update(dt, s) {
    this.setWeapon(s.weapon);
    const g = this.guns[this.cur];
    this.adsT = clamp(this.adsT + (s.ads ? 1 : -1) * dt / Math.max(0.05, s.adsTime), 0, 1);
    this.sprintT = clamp(this.sprintT + (s.sprint ? 1 : -1) * dt / 0.18, 0, 1);
    const a = this.adsT * this.adsT * (3 - 2 * this.adsT);       // smoothstep
    const sp = this.sprintT * this.sprintT * (3 - 2 * this.sprintT);

    // sway: the gun lags behind how fast we are turning
    const rate = (v) => v / Math.max(dt, 1e-3);
    const sway = 1 - a * 0.75;
    this.sx.target = clamp(rate(s.lookYaw) * 0.0045, -0.06, 0.06) * sway;
    this.sy.target = clamp(-rate(s.lookPitch) * 0.0045, -0.05, 0.05) * sway;
    this.ry.target = clamp(rate(s.lookYaw) * 0.006, -0.12, 0.12) * sway;
    this.rx.target = clamp(rate(s.lookPitch) * 0.005, -0.1, 0.1) * sway;
    this.rz.target = clamp(rate(s.lookYaw) * 0.004, -0.08, 0.08) * sway;

    // landing dip
    if (s.grounded && !this.wasGrounded) this.landDip.impulse(-0.9);
    this.wasGrounded = s.grounded;

    // walk bob (bigger when sprinting, tiny when aiming)
    const moving = s.grounded ? clamp(s.speed / 7, 0, 1.6) : 0;
    this.bobAmp = lerp(this.bobAmp, moving, 1 - Math.exp(-10 * dt));
    this.bobT += dt * (6 + s.speed * 0.9);
    const bobK = this.bobAmp * (1 - a * 0.85) * (1 + sp * 0.8);
    const bobX = Math.cos(this.bobT) * 0.009 * bobK, bobY = Math.abs(Math.sin(this.bobT)) * 0.012 * bobK;

    // reload: gun tilts away (rl), the magazine drops out, a new one slides in, an EMPTY gun is charged at the end
    const k = s.reloadK, stg = RELOAD_STAGES[s.reloadEmpty ? 'empty' : 'tactical'];
    const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    let rl = 0, rack = 0;
    if (k >= 0) {
      rl = sstep(0, 0.14, k) * (1 - sstep(0.88, 1, k));
      if (s.reloadEmpty || s.weapon === 'shotgun') { const c = s.reloadEmpty ? stg.charge : 0.82; rack = Math.sin(Math.PI * clamp((k - c) / 0.14, 0, 1)); }
      if (this.prevK >= 0 && this.prevK < stg.insert && k >= stg.insert) { this.kz.impulse(-0.55); this.krx.impulse(-0.4); }    // magazine seats: a thump
    }
    this.prevK = k;
    const mag = g.userData.mag;
    if (mag) {
      const base = mag.userData.base;
      let off = 0, vis = true;
      if (k >= 0) {
        if (k >= stg.drop && k < stg.insert - 0.14) { off = -sstep(stg.drop, stg.drop + 0.07, k) * 0.3; vis = k < stg.drop + 0.05; }          // slides out and is gone
        else if (k >= stg.insert - 0.14 && k < stg.insert) off = -(1 - sstep(stg.insert - 0.14, stg.insert, k)) * 0.22;                     // new one comes up from below
      }
      mag.position.set(base.x, base.y + off, base.z); mag.visible = vis;
    }
    const sw = s.switchK;                                         // 1 -> 0 while raising

    const adsY = -g.userData.adsY * SCALE;
    let x = lerp(lerp(HIP.x, SPRINT.x, sp), 0, a);
    let y = lerp(lerp(HIP.y, SPRINT.y, sp), adsY, a);
    let z = lerp(lerp(HIP.z, SPRINT.z, sp), -0.5, a);
    x += this.sx.step(dt) + bobX; y += this.sy.step(dt) + bobY * -1 + this.landDip.step(dt) * 0.03;
    y -= rl * 0.16 + sw * sw * 0.32;
    z += this.kz.step(dt) * 0.03 + rack * 0.07;
    x -= rack * 0.02;

    g.position.set(x, y, z);
    g.rotation.set(
      this.rx.step(dt) + this.krx.step(dt) * 0.03 + sp * 0.35 - rl * 0.55 - sw * 0.9,
      this.ry.step(dt) + sp * 0.55,
      this.rz.step(dt) + sp * -0.25 + rl * 0.5,
    );
    g.rotation.order = 'YXZ';

    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    return a; // aim-down-sights amount 0..1 (main.js uses it for FOV and the crosshair)
  }
}
