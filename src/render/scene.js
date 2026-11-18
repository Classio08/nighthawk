// Everything you SEE that belongs to the world: sky, ground, buildings, crates, grenades and the shrinking zone wall.
// It only reads from the Simulation (never changes it).
import * as THREE from 'three';

const lambert = (c) => new THREE.MeshLambertMaterial({ color: c });
const KIND_COLORS = {
  block: [0x8d8f93, 0x9a8f7e, 0x7c8591, 0xa39a86, 0x777b80],
  container: [0xb23a2e, 0x2f5f8f, 0x4a6b3a, 0xc08a2d],
  wall: [0x7a7f86, 0x8a7a5e],
  crates: [0x8a6a3e],
  edge: [0x3a3f47],
};

export function makeSand() {                       // little noise texture so you can SEE yourself moving
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = 150 + ((x * 7 + y * 13 + ((x * y) % 5) * 11) % 28);
    g.fillStyle = `rgb(${v + 38},${v + 22},${v - 28})`; g.fillRect(x * 8, y * 8, 8, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(90, 90); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class WorldView {
  constructor(scene, sim) {
    this.scene = scene; this.sim = sim;
    scene.background = new THREE.Color(0xcfc4a6);
    scene.fog = new THREE.Fog(0xcfc4a6, 45, 240);
    scene.add(new THREE.HemisphereLight(0xdce8ff, 0x8a7752, 1.05));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.35); sun.position.set(60, 100, 30); scene.add(sun);

    // sky dome: warm haze at the horizon fading to blue overhead (follows the camera, ignores fog)
    const sg = new THREE.SphereGeometry(500, 24, 12), pos = sg.attributes.position, cols = [];
    const hz = new THREE.Color(0xcfc4a6), zn = new THREE.Color(0x6e9fd6), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { const k = Math.pow(Math.max(0, pos.getY(i) / 500), 0.55); c.copy(hz).lerp(zn, k); cols.push(c.r, c.g, c.b); }
    sg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.sky = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -10; scene.add(this.sky);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ map: makeSand() }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);

    let k = 0;
    for (const b of sim.map.boxes) {
      const cols = KIND_COLORS[b.kind] ?? KIND_COLORS.block;
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), lambert(cols[k++ % cols.length]));
      m.position.set(b.x, b.y, b.z); scene.add(m);
      if (b.kind === 'block') {
        const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.5, 0.35, b.d + 0.5), lambert(0x3d4249));
        roof.position.set(b.x, b.h + 0.17, b.z); scene.add(roof);
        const door = new THREE.Mesh(new THREE.BoxGeometry(Math.min(2.2, b.w * 0.3), 2.4, 0.12), lambert(0x22262b));
        door.position.set(b.x, 1.2, b.z + b.d / 2 + 0.03); scene.add(door);
        for (const s of [-1, 1]) { // dark windows on two sides
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, Math.min(2.4, b.d * 0.3)), lambert(0x1b2a3a));
          win.position.set(b.x + s * (b.w / 2 + 0.03), Math.min(b.h - 1, 3), b.z); scene.add(win);
        }
      } else if (b.kind === 'container') {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.04, 0.3, b.d + 0.04), lambert(0x222222));
        stripe.position.set(b.x, b.y + 0.4, b.z); scene.add(stripe);
      }
    }

    // loose crates (their bodies are simulated, we just copy their pose)
    const cg = new THREE.BoxGeometry(1.2, 1.2, 1.2), cm = lambert(0xa87a3c);
    this.crates = sim.crates.map(() => { const m = new THREE.Mesh(cg, cm); scene.add(m); return m; });
    this.nadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), lambert(0x394a2b));
    this.nades = [];

    // the zone: a red see-through wall + a white ring where the NEXT circle will be
    this.zoneWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 50, 72, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }));
    this.zoneWall.position.y = 25; scene.add(this.zoneWall);
    this.zoneRing = new THREE.Mesh(new THREE.RingGeometry(0.9965, 1, 96),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    this.zoneRing.rotation.x = -Math.PI / 2; this.zoneRing.position.y = 0.1; scene.add(this.zoneRing);
  }

  /** @param px,pz where the camera is (the zone wall only glows when you are near it) */
  update(dt, px = 0, pz = 0) {
    const sim = this.sim;
    this.sky.position.set(px, 0, pz);
    for (let i = 0; i < sim.crates.length; i++) {
      const b = sim.crates[i].body, t = b.translation(), r = b.rotation();
      this.crates[i].position.set(t.x, t.y, t.z); this.crates[i].quaternion.set(r.x, r.y, r.z, r.w);
    }
    // grenades come and go
    while (this.nades.length < sim.grenades.length) { const m = this.nadeMesh.clone(); this.scene.add(m); this.nades.push(m); }
    while (this.nades.length > sim.grenades.length) this.scene.remove(this.nades.pop());
    sim.grenades.forEach((g, i) => { const t = g.body.translation(); this.nades[i].position.set(t.x, t.y, t.z); });
    const z = sim.zone;
    this.zoneWall.position.x = z.cx; this.zoneWall.position.z = z.cz; this.zoneWall.scale.set(z.radius, 1, z.radius);
    this.zoneRing.position.x = z.nextX; this.zoneRing.position.z = z.nextZ; this.zoneRing.scale.set(z.nextR, z.nextR, 1);
    const edge = Math.abs(Math.hypot(px - z.cx, pz - z.cz) - z.radius);   // metres to the wall
    this.zoneWall.material.opacity = 0.05 + 0.3 * Math.max(0, 1 - edge / 35);
    this.zoneRing.visible = !z.done && z.nextR < z.radius - 0.5;
  }
}
