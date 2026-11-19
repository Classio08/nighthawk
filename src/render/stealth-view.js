// Visual-only presentation of the SIGNAL BLACKOUT searchlights (stealth.js). Reads sim.stealth, never writes simulation state.
import * as THREE from 'three';
import { SEARCHLIGHT } from '../sim/stealth.js';

const TOWER_R = 30, TOWER_H = SEARCHLIGHT.HEIGHT;

export class StealthView {
  constructor(scene, sim) {
    this.sim = sim; this.scene = scene;
    this.root = new THREE.Group(); scene.add(this.root);
    const ex = sim.mission.extraction;
    const steel = new THREE.MeshStandardMaterial({ color: 0x59616a, roughness: 0.8 });
    this.mats = [];
    this.lamps = [];
    for (let i = 0; i < SEARCHLIGHT.COUNT; i++) {
      const a = 0.4 + i * Math.PI;                                              // two towers on opposite sides of the pad
      const tx = ex.x + Math.cos(a) * TOWER_R, tz = ex.z + Math.sin(a) * TOWER_R;
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.45, TOWER_H, 0.45), steel); pole.position.set(tx, TOWER_H / 2, tz); this.root.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1c2 })); head.position.set(tx, TOWER_H + 0.3, tz); this.root.add(head);
      const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff1c2, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.12, SEARCHLIGHT.RADIUS, 1, 18, 1, true), coneMat); this.root.add(cone);
      const poolMat = new THREE.MeshBasicMaterial({ color: 0xfff1c2, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const pool = new THREE.Mesh(new THREE.CircleGeometry(SEARCHLIGHT.RADIUS, 28), poolMat); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.06; this.root.add(pool);
      this.mats.push(coneMat, poolMat);
      this.lamps.push({ tx, tz, pole, head, cone, pool, coneMat, poolMat });
    }
    this.dir = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.down = new THREE.Vector3(0, -1, 0);
    this.root.visible = true;
  }

  update() {
    const st = this.sim.stealth;
    if (!st) return;
    const on = st.lightsOn, spots = on ? st.spots() : [];
    for (let i = 0; i < this.lamps.length; i++) {
      const l = this.lamps[i], s = spots[i];
      l.cone.visible = l.pool.visible = !!s;
      l.head.material.color.setHex(s ? 0xfff1c2 : 0x40464c);
      if (!s) continue;
      this.dir.set(s.x - l.tx, 0.06 - (TOWER_H + 0.3), s.z - l.tz);
      const len = this.dir.length();
      l.cone.position.set((l.tx + s.x) / 2, (TOWER_H + 0.3 + 0.06) / 2, (l.tz + s.z) / 2);
      l.cone.scale.set(1, len, 1);
      l.cone.quaternion.copy(this.q.setFromUnitVectors(this.down, this.dir.normalize()));
      l.pool.position.x = s.x; l.pool.position.z = s.z;
      const hot = st.lit ? 0xff6a4d : 0xfff1c2;                                    // the beams go red while you are standing in one
      l.coneMat.color.setHex(hot); l.poolMat.color.setHex(hot);
    }
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose?.()); });
  }
}
