// 3D buggies and bikes (low-poly boxes + cylinders). Reads sim.vehicles.list only. Online the pose changes at 20 Hz, so every frame we
// drive the drawn vehicle forward by its speed and ease it towards the latest pose: smooth motion without simulating anything.
import * as THREE from 'three';

const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
const BODY_COLORS = { buggy: [0xc9772b, 0x3a6ea5, 0x5a7d3a, 0xb23a2e], bike: [0x2f2f35, 0xd8d8d8] };

export class VehiclesView {
  constructor(scene, sim) {
    this.scene = scene; this.sim = sim; this.items = new Map();
    this.wheelGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.36, 14); this.wheelGeo.rotateZ(Math.PI / 2);
    this.tyre = lam(0x151515); this.hub = lam(0xb9bcc2); this.dark = lam(0x20242a); this.seatM = lam(0x2b2b30);
    this.wreckM = lam(0x121212); this.scorch = new THREE.Color(0x1a1a1a);
    for (const v of sim.vehicles.list) this._make(v);
  }

  _make(v) {
    const g = new THREE.Group(), u = { wheels: [], front: [], body: [], rot: 0, px: v.x, pz: v.z, py: v.yaw, dummy: [] };
    const color = BODY_COLORS[v.kind][v.id % BODY_COLORS[v.kind].length], bodyM = lam(color); u.bodyM = bodyM; u.base = new THREE.Color(color);
    const box = (w, h, d, m, x, y, z) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z); g.add(mesh); u.body.push(mesh); return mesh; };
    const wheel = (x, y, z, front) => { const m = new THREE.Mesh(this.wheelGeo, this.tyre); const h = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.38, 8), this.hub); h.rotation.z = Math.PI / 2; m.add(h); const pivot = new THREE.Group(); pivot.position.set(x, y, z); pivot.add(m); g.add(pivot); u.wheels.push(m); if (front) u.front.push(pivot); u.body.push(m); return pivot; };
    if (v.kind === 'buggy') {
      box(1.7, 0.35, 3.3, bodyM, 0, 0.55, 0);                       // chassis
      box(1.3, 0.5, 1.1, bodyM, 0, 0.75, -1.35);                    // hood
      box(1.4, 0.12, 0.9, this.dark, 0, 0.93, 1.55);                // rear deck
      for (const s of [-1, 1]) { box(0.07, 1.25, 0.07, this.dark, s * 0.8, 1.2, -0.45); box(0.07, 1.25, 0.07, this.dark, s * 0.8, 1.2, 1.1); box(0.07, 0.07, 1.65, this.dark, s * 0.8, 1.82, 0.32); }
      box(1.7, 0.07, 0.07, this.dark, 0, 1.82, -0.45); box(1.7, 0.07, 0.07, this.dark, 0, 1.82, 1.1);   // roll cage
      for (const s of [-0.42, 0.42]) { box(0.55, 0.12, 0.5, this.seatM, s, 0.78, 0.15); box(0.55, 0.65, 0.12, this.seatM, s, 1.08, 0.4); }
      for (const s of [-1, 1]) { wheel(s * 1.0, 0.46, -1.15, true); wheel(s * 1.0, 0.46, 1.2, false); }
      const lamp = box(0.35, 0.18, 0.1, new THREE.MeshBasicMaterial({ color: 0xfff4c0 }), 0, 0.85, -1.92); void lamp;
    } else {
      box(0.34, 0.45, 1.5, bodyM, 0, 0.78, 0);                      // frame + tank
      box(0.3, 0.14, 0.7, this.seatM, 0, 1.03, 0.45);               // seat
      box(0.9, 0.07, 0.07, this.dark, 0, 1.25, -0.7);               // handlebar
      wheel(0, 0.46, -0.85, true); wheel(0, 0.46, 0.9, false);
      box(0.18, 0.14, 0.1, new THREE.MeshBasicMaterial({ color: 0xfff4c0 }), 0, 0.98, -1.05);
    }
    this.scene.add(g); this.items.set(v.id, { g, u, v });
  }

  /** a stand-in for MY driver / passenger (other fighters are drawn by FighterView) */
  _dummy(it, seat, color) {
    const { g, u, v } = it; const key = seat; let d = u.dummy[key];
    if (!d) {
      d = new THREE.Group();
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), lam(color)); torso.position.set(0, 0.3, 0); d.add(torso);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), lam(0xd8b08a)); head.position.set(0, 0.78, 0); d.add(head);
      const side = v.kind === 'bike' ? 0 : (seat === 0 ? -0.42 : 0.42); d.position.set(side, 0.95, v.kind === 'bike' ? 0.3 : 0.15); g.add(d); u.dummy[key] = d;
    }
    return d;
  }

  update(dt, myId, particles) {
    const sim = this.sim;
    for (const it of this.items.values()) {
      const { g, u, v } = it;
      // ease the drawn pose towards the latest known one (and keep driving it forward in between snapshots)
      const k = Math.min(1, dt * 9);
      u.px += -Math.sin(v.yaw) * v.speed * dt; u.pz += -Math.cos(v.yaw) * v.speed * dt;
      if (Math.hypot(u.px - v.x, u.pz - v.z) > 6) { u.px = v.x; u.pz = v.z; }
      u.px += (v.x - u.px) * k; u.pz += (v.z - u.pz) * k;
      let dy = v.yaw - u.py; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); u.py += dy * Math.min(1, dt * 14);
      g.position.set(u.px, 0, u.pz); g.rotation.y = u.py;
      u.rot += v.speed * dt / 0.46; for (const w of u.wheels) w.rotation.x = -u.rot;
      for (const f of u.front) f.rotation.y = -v.steerVis * 0.45;
      if (v.dead) { if (!u.wreck) { u.wreck = true; for (const m of u.body) m.material = this.wreckM; for (const d of u.dummy) if (d) d.visible = false; g.rotation.z = 0.08; } continue; }
      const dmg = 1 - v.hp / v.maxHp; if (dmg !== u.dmg) { u.dmg = dmg; u.bodyM.color.copy(u.base).lerp(this.scorch, Math.min(0.75, dmg * 0.8)); }       // scorched as it takes damage
      if (dmg > 0.6 && particles && Math.random() < dt * 8) particles.dust(u.px, 1.2, u.pz, 0, 1, 0, 1);       // a damaged vehicle trails dust
      for (const seat of [0, 1]) {                                          // my own rider (everybody else has a FighterView)
        const id = seat === 0 ? v.driver : v.pass, mine = id === myId && id >= 0;
        if (mine) { const d = this._dummy(it, seat, sim.fighters[id]?.color ? new THREE.Color(sim.fighters[id].color).getHex() : 0x4a6a4a); d.visible = true; }
        else if (u.dummy[seat]) u.dummy[seat].visible = false;
      }
    }
  }

  /** where the DRAWN vehicle is (for the chase camera) */
  pose(id) { const it = this.items.get(id); return it ? { x: it.u.px, z: it.u.pz, yaw: it.u.py } : null; }
  dispose() { for (const it of this.items.values()) this.scene.remove(it.g); this.items.clear(); }
}
