// 3D markers for contracts (airdrop on a parachute, hardpoint ring, bounty diamond) and for mortar strikes (red smoke column, falling shells).
// It only READS sim.contracts.list (same shape offline and online) and the events main.js forwards.
import * as THREE from 'three';

const FALL_T = 9;
const basic = (c, o = 1, add = false) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, fog: false, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide });
const lam = (c) => new THREE.MeshLambertMaterial({ color: c });

export class ContractsView {
  constructor(scene, sim) {
    this.scene = scene; this.sim = sim; this.items = new Map(); this.fx = [];
    this.crateGeo = new THREE.BoxGeometry(1.4, 1.1, 1.4);
    this.chuteGeo = new THREE.SphereGeometry(2.6, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    this.beamGeo = new THREE.CylinderGeometry(0.28, 0.28, 140, 8, 1, true); this.beamGeo.translate(0, 70, 0);
    this.ringGeo = new THREE.RingGeometry(0.93, 1, 72);
    this.discGeo = new THREE.CircleGeometry(1, 48);
    this.wallGeo = new THREE.CylinderGeometry(1, 1, 7, 56, 1, true); this.wallGeo.translate(0, 3.5, 0);
    this.diaGeo = new THREE.OctahedronGeometry(0.55);
    this.shellGeo = new THREE.SphereGeometry(0.22, 8, 6);
  }

  _make(c) {
    const g = new THREE.Group();
    if (c.type === 'airdrop') {
      const crate = new THREE.Mesh(this.crateGeo, lam(0x4d6b3a)); crate.position.y = 0.55; g.add(crate);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.22, 1.46), lam(0xf2f2f2)); stripe.position.y = 0.55; g.add(stripe);
      const chute = new THREE.Mesh(this.chuteGeo, new THREE.MeshLambertMaterial({ color: 0xff8a2a, side: THREE.DoubleSide })); chute.position.y = 4.4; g.add(chute);
      for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {      // four ropes
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4, 4), lam(0xeeeeee)); r.position.set(x * 0.35, 2.55, z * 0.35); r.rotation.set(z * 0.22, 0, -x * 0.22); g.add(r);
      }
      g.userData = { chute, rope: g.children.slice(3) };
      const beam = new THREE.Mesh(this.beamGeo, basic(0xffcf4d, 0.32, true)); g.add(beam); g.userData.beam = beam;
      const ring = new THREE.Mesh(this.ringGeo, basic(0xffffff, 0.9)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; ring.scale.setScalar(2.8); g.add(ring); g.userData.ring = ring;
      const fill = new THREE.Mesh(this.discGeo, basic(0xffcf4d, 0.45)); fill.rotation.x = -Math.PI / 2; fill.position.y = 0.07; fill.scale.setScalar(0.01); g.add(fill); g.userData.fill = fill;
    } else if (c.type === 'hardpoint') {
      const ring = new THREE.Mesh(this.ringGeo, basic(0x5be37a, 0.95)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; ring.scale.setScalar(c.r); g.add(ring);
      const wall = new THREE.Mesh(this.wallGeo, basic(0x5be37a, 0.12)); wall.scale.set(c.r, 1, c.r); g.add(wall);
      const fill = new THREE.Mesh(this.discGeo, basic(0x5be37a, 0.3)); fill.rotation.x = -Math.PI / 2; fill.position.y = 0.09; fill.scale.setScalar(0.01); g.add(fill);
      const beam = new THREE.Mesh(this.beamGeo, basic(0x5be37a, 0.2, true)); g.add(beam);
      g.userData = { ring, wall, fill, beam };
    } else {
      const d = new THREE.Mesh(this.diaGeo, new THREE.MeshBasicMaterial({ color: 0xff3b3b, fog: false, depthTest: false, transparent: true })); d.renderOrder = 999; g.add(d);
      const beam = new THREE.Mesh(this.beamGeo, basic(0xff3b3b, 0.22, true)); g.add(beam);
      g.userData = { d, beam };
    }
    this.scene.add(g); return g;
  }

  /** red smoke column over a mortar target for a few seconds */
  mark(x, z, secs = 3.2) {
    const m = new THREE.Mesh(this.beamGeo, basic(0xff4a2a, 0.45, true)); m.position.set(x, 0, z); this.scene.add(m);
    const r = new THREE.Mesh(this.ringGeo, basic(0xff4a2a, 0.9)); r.rotation.x = -Math.PI / 2; r.position.set(x, 0.12, z); r.scale.setScalar(12); this.scene.add(r);
    this.fx.push({ kind: 'mark', t: 0, life: secs + 6, m, r });
  }
  /** a falling mortar shell (the explosion itself comes as its own event) */
  shell(x, z, eta) {
    const m = new THREE.Mesh(this.shellGeo, new THREE.MeshBasicMaterial({ color: 0xffa040, fog: false })); m.scale.set(1, 2.4, 1); this.scene.add(m);
    this.fx.push({ kind: 'shell', t: 0, life: eta, x, z, m });
  }

  update(dt, camX, camZ, myId) {
    const list = this.sim.contracts?.list ?? [], seen = new Set(), now = performance.now() / 1000;
    for (const c of list) {
      seen.add(c.id); let g = this.items.get(c.id);
      if (!g) { g = this._make(c); this.items.set(c.id, g); }
      const u = g.userData;
      if (c.type === 'airdrop') {
        const falling = c.state === 'falling', k = Math.min(1, c.age / FALL_T);
        g.position.set(c.x + (falling ? Math.sin(now * 1.3 + c.id) * 1.2 * (1 - k) : 0), falling ? 0.1 + Math.pow(1 - k, 1.15) * 90 : 0.1, c.z);
        u.chute.visible = falling; for (const r of u.rope) r.visible = falling;
        u.ring.visible = u.fill.visible = !falling; u.ring.material.opacity = 0.55 + 0.4 * Math.sin(now * 5);
        u.fill.scale.setScalar(Math.max(0.01, 2.7 * Math.sqrt(c.prog)));
        u.beam.material.opacity = falling ? 0.2 : 0.3 + 0.12 * Math.sin(now * 4);
      } else if (c.type === 'hardpoint') {
        g.position.set(c.x, 0, c.z);
        const col = c.who === -2 ? 0xff9a2a : c.who >= 0 ? (c.who === myId ? 0x5be37a : 0xff4d4d) : 0xffffff;
        for (const m of [u.ring, u.wall, u.fill, u.beam]) m.material.color.setHex(col);
        u.fill.scale.setScalar(Math.max(0.01, c.r * Math.sqrt(c.prog)));
      } else {
        g.position.set(c.x, 0, c.z);
        u.d.position.y = 3.1 + Math.sin(now * 3) * 0.25; u.d.rotation.y = now * 2;
        u.beam.visible = Math.hypot(c.x - camX, c.z - camZ) > 14;
      }
    }
    for (const [id, g] of this.items) if (!seen.has(id)) { this.scene.remove(g); g.traverse((o) => { if (o.material && o.material !== undefined) o.material.dispose?.(); }); this.items.delete(id); }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.t += dt;
      if (f.kind === 'shell') { f.m.position.set(f.x, 90 * Math.max(0, 1 - f.t / f.life) ** 1.4 + 0.3, f.z); }
      else { const a = Math.max(0, 1 - f.t / f.life); f.m.material.opacity = 0.45 * Math.min(1, a * 3); f.r.material.opacity = 0.9 * Math.min(1, a * 3); f.r.scale.setScalar(12 + Math.sin(f.t * 8) * 0.6); }
      if (f.t >= f.life) { for (const o of [f.m, f.r]) if (o) { this.scene.remove(o); o.material.dispose(); } this.fx.splice(i, 1); }
    }
  }

  dispose() { for (const g of this.items.values()) this.scene.remove(g); for (const f of this.fx) for (const o of [f.m, f.r]) if (o) this.scene.remove(o); this.items.clear(); this.fx.length = 0; }
}
