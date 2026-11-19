// The transport plane for the drop-in: a low-poly aircraft that flies the straight line from sim/drop.js. Pure decoration (the rules never look at it).
import * as THREE from 'three';
import { planeAt } from '../sim/drop.js';

const box = new THREE.BoxGeometry(1, 1, 1);

export class PlaneView {
  constructor(scene, plane) {
    this.plane = plane; this.scene = scene;
    this.root = new THREE.Group(); scene.add(this.root);
    const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
    const hull = lam(0x59615a), dark = lam(0x23272b), accent = lam(0xffcf4d);
    const part = (mat, w, h, d, x, y, z) => { const o = new THREE.Mesh(box, mat); o.scale.set(w, h, d); o.position.set(x, y, z); this.root.add(o); return o; };
    part(hull, 3.4, 3.4, 16, 0, 0, 0);            // fuselage (the nose points to -z, which is "forward" in the sim's yaw convention)
    part(hull, 2.4, 2.4, 3, 0, -0.2, -9);         // nose
    part(dark, 2.7, 1.1, 3.2, 0, 0.95, -5.6);     // cockpit glass
    part(hull, 26, 0.45, 4, 0, -0.5, 1);          // wings
    part(accent, 1.2, 0.5, 4.1, -12.4, -0.5, 1); part(accent, 1.2, 0.5, 4.1, 12.4, -0.5, 1);   // wing tips
    part(hull, 9, 0.4, 2.6, 0, 0.6, 7.2);         // tail plane
    part(hull, 0.45, 3.6, 2.8, 0, 2.3, 7.4);      // tail fin
    part(dark, 1.4, 2.2, 0.2, 0, -0.2, 8.1);      // rear ramp
    this.props = [-7, -3.5, 3.5, 7].map((x) => { const p = part(dark, 0.25, 3, 0.25, x, -0.5, -1.2); return p; });
    this.root.visible = false;
  }
  /** t = seconds the plane has been flying */
  update(t, now = performance.now()) {
    const pl = this.plane, show = t < pl.T + 1.5;
    this.root.visible = show; if (!show) return;
    const q = planeAt(pl, t);
    this.root.position.set(q.x, q.y, q.z); this.root.rotation.y = pl.yaw;
    for (const p of this.props) p.rotation.z = now * 0.05;          // blur of the propellers
  }
  dispose() { this.scene.remove(this.root); }
}
