// Everything you SEE that belongs to the world: sky, ground, buildings, crates, grenades and the shrinking zone wall.
// It only reads from the Simulation (never changes it).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bakeGeometries, placed } from './bake.js';
import { makeGroundTexture, makeConcreteTexture, makeMetalTexture, makeSurfacePbrMaps, mottlePlane, worldUV } from './proc-textures.js';
import { settings } from '../settings.js';

const lambert = (c) => new THREE.MeshLambertMaterial({ color: c });

/** Static meshes that share a material become ONE mesh (one draw call each). Only for things that never move or change: the map's boxes.
 *  A mesh with userData.tex ('concrete' | 'metal') gets that procedural texture with world-space UVs (same scale on every wall). */
function mergeStatic(scene, meshes, textures) {
  const byMat = new Map();
  for (const m of meshes) {
    m.updateMatrix();
    const g = m.geometry.clone().applyMatrix4(m.matrix), tex = m.userData.tex ?? null;
    if (tex) worldUV(g, textures[tex].metres);
    const key = m.material.color.getHex() + '|' + tex;
    let e = byMat.get(key); if (!e) {
      const surface = tex ? textures[tex] : null;
      const color = m.material.color;
      const mat = surface?.pbr
        ? new THREE.MeshStandardMaterial({ color, map: surface.map, normalMap: surface.pbr.normalMap, roughnessMap: surface.pbr.roughnessMap, roughness: surface.roughness, metalness: surface.metalness })
        : new THREE.MeshLambertMaterial({ color, map: surface?.map ?? null });
      byMat.set(key, e = { mat, geos: [] });
    }
    e.geos.push(g); m.geometry.dispose(); m.material.dispose();
  }
  for (const { mat, geos } of byMat.values()) { const merged = mergeGeometries(geos, false); geos.forEach((g) => g.dispose()); const mesh = new THREE.Mesh(merged, mat); mesh.frustumCulled = false; scene.add(mesh); }
  return byMat.size;
}
const KIND_COLORS = {
  block: [0x8d8f93, 0x9a8f7e, 0x7c8591, 0xa39a86, 0x777b80],
  container: [0xb23a2e, 0x2f5f8f, 0x4a6b3a, 0xc08a2d],
  wall: [0x7a7f86, 0x8a7a5e],
  crates: [0x8a6a3e],
  edge: [0x3a3f47],
  'poi-building': [0x9a8d75],
  'poi-container': [0x4d6650],
  'poi-wall': [0x8c806c],
  'poi-mast': [0x454b52],
  'poi-rock': [0x756d60],
  'poi-fence': [0x6d7478],
};

export class WorldView {
  constructor(scene, sim) {
    this.scene = scene; this.sim = sim;
    scene.background = new THREE.Color(0xcfc4a6);
    scene.fog = new THREE.Fog(0xcfc4a6, 45, 240);
    this.hemi = new THREE.HemisphereLight(0xdce8ff, 0x8a7752, 1.05); scene.add(this.hemi);        // atmosphere.js changes these for rain / fog / night
    this.sun = new THREE.DirectionalLight(0xfff0d0, 1.35); this.sun.position.set(60, 100, 30); scene.add(this.sun);

    // sky dome: warm haze at the horizon fading to blue overhead (follows the camera, ignores fog)
    const sg = new THREE.SphereGeometry(500, 24, 12), pos = sg.attributes.position, cols = [];
    const hz = new THREE.Color(0xcfc4a6), zn = new THREE.Color(0x6e9fd6), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { const k = Math.pow(Math.max(0, pos.getY(i) / 500), 0.55); c.copy(hz).lerp(zn, k); cols.push(c.r, c.g, c.b); }
    sg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.sky = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -10; scene.add(this.sky);

    const highQualityPbr = settings.quality === 'high';
    const groundTex = makeGroundTexture();
    const groundPbr = highQualityPbr ? makeSurfacePbrMaps('sand', 256) : null;
    if (groundPbr) { groundPbr.normalMap.repeat.set(75, 75); groundPbr.roughnessMap.repeat.set(75, 75); }
    const groundMat = highQualityPbr
      ? new THREE.MeshStandardMaterial({ map: groundTex, vertexColors: true, normalMap: groundPbr.normalMap, roughnessMap: groundPbr.roughnessMap, roughness: 0.94, metalness: 0 })
      : new THREE.MeshLambertMaterial({ map: groundTex, vertexColors: true });
    const ground = new THREE.Mesh(mottlePlane(new THREE.PlaneGeometry(600, 600, 48, 48), 48), groundMat);   // procedural sand + large soft patches
    ground.rotation.x = -Math.PI / 2; scene.add(ground);

    const textures = {
      concrete: { map: makeConcreteTexture(), metres: 4, pbr: highQualityPbr ? makeSurfacePbrMaps('concrete', 256) : null, roughness: 0.92, metalness: 0.02 },
      metal: { map: makeMetalTexture(), metres: 2.4, pbr: highQualityPbr ? makeSurfacePbrMaps('metal', 256) : null, roughness: 0.52, metalness: 0.58 },
    };
    let k = 0; const statics = [];
    for (const b of sim.map.boxes) {
      if (b.kind === 'poi-mast') continue; // the detailed cylinder below replaces this collision-only box visually
      const cols = KIND_COLORS[b.kind] ?? KIND_COLORS.block;
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), lambert(cols[k++ % cols.length]));
      m.position.set(b.x, b.y, b.z); m.userData.tex = b.kind === 'container' || b.kind === 'poi-container' ? 'metal' : 'concrete'; statics.push(m);
      if (b.kind === 'block' || b.kind === 'poi-building') {
        const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.5, 0.35, b.d + 0.5), lambert(0x3d4249));
        roof.position.set(b.x, b.h + 0.17, b.z); roof.userData.tex = 'concrete'; statics.push(roof);
        const door = new THREE.Mesh(new THREE.BoxGeometry(Math.min(2.2, b.w * 0.3), 2.4, 0.12), lambert(0x22262b));
        door.position.set(b.x, 1.2, b.z + b.d / 2 + 0.03); statics.push(door);
        for (const s of [-1, 1]) { // dark windows on two sides
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, Math.min(2.4, b.d * 0.3)), lambert(0x1b2a3a));
          win.position.set(b.x + s * (b.w / 2 + 0.03), Math.min(b.h - 1, 3), b.z); statics.push(win);
        }
      } else if (b.kind === 'container' || b.kind === 'poi-container') {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.04, 0.3, b.d + 0.04), lambert(0x222222));
        stripe.position.set(b.x, b.y + 0.4, b.z); statics.push(stripe);
      }
    }
    this.staticDrawCalls = mergeStatic(scene, statics, textures);     // (the map never changes: roughly 150 meshes become about a dozen draw calls)

    // Kavari Basin landmark dressing. These meshes are visual-only; collision remains in sim.map.boxes.
    this.poiMeshes = [];
    const addPoiMesh = (mesh) => { scene.add(mesh); this.poiMeshes.push(mesh); return mesh; };
    const riverTex = groundTex.clone(); riverTex.repeat.set(13 / 8, 34 / 8); riverTex.needsUpdate = true;    // the same procedural sand, darker and greyer = gravel (one tile is 8 m)
    const riverPbr = highQualityPbr ? makeSurfacePbrMaps('gravel', 256) : null;
    if (riverPbr) { riverPbr.normalMap.repeat.set(13 / 8, 34 / 8); riverPbr.roughnessMap.repeat.set(13 / 8, 34 / 8); }
    const padMat = highQualityPbr
      ? new THREE.MeshStandardMaterial({ color: 0xa09c92, map: riverTex, normalMap: riverPbr.normalMap, roughnessMap: riverPbr.roughnessMap, roughness: 0.96, metalness: 0 })
      : new THREE.MeshLambertMaterial({ color: 0xa09c92, map: riverTex });
    const paintMat = new THREE.MeshBasicMaterial({ color: 0xd8d0b5 });
    // Dry River: a shallow, winding gravel wash through the centre of the arena.
    const riverSegments = [
      [-20, -48, -0.18], [-13, -20, 0.12], [0, 8, 0.22], [13, 37, -0.12], [18, 66, -0.28],
    ];
    for (const [x, z, angle] of riverSegments) {
      const bed = new THREE.Mesh(new THREE.PlaneGeometry(13, 34), padMat);
      bed.rotation.x = -Math.PI / 2; bed.rotation.z = angle; bed.position.set(x, 0.012, z);
      addPoiMesh(bed);
    }
    // Relay Ridge: a visible mast and cross-arms above the collision mast footprint.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 10, 8), lambert(0x50545a));
    mast.position.set(64, 5, -49); addPoiMesh(mast);
    for (const y of [8.4, 9.2]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.09, 0.09), lambert(0x343a40));
      arm.position.set(64, y, -49); addPoiMesh(arm);
    }
    // Forward Outpost: elevated water tank on a simple four-leg stand.
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 2.4, 12), lambert(0x667b83));
    tank.position.set(-57, 3.6, 60); addPoiMesh(tank);
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 6), lambert(0x41474a));
      leg.position.set(-57 + dx, 1.4, 60 + dz); addPoiMesh(leg);
    }
    // Extraction Pad: flat marked landing zone, intentionally not a physics obstacle.
    const pad = new THREE.Mesh(new THREE.CircleGeometry(7.5, 48), lambert(0x686b65));
    pad.rotation.x = -Math.PI / 2; pad.position.set(56, 0.025, 56); addPoiMesh(pad);
    const ring = new THREE.Mesh(new THREE.RingGeometry(6.8, 7.1, 48), paintMat);
    ring.rotation.x = -Math.PI / 2; ring.position.set(56, 0.04, 56); addPoiMesh(ring);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.025, 10), paintMat);
    stripe.position.set(56, 0.05, 56); addPoiMesh(stripe);
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(10, 0.025, 0.45), paintMat);
    crossbar.position.set(56, 0.05, 56); addPoiMesh(crossbar);

    // loose crates (their bodies are simulated, we just copy their pose)
    const cg = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    // ONE instanced mesh for all crates (one draw call). The material is white; every crate's own colour darkens as it takes damage.
    this.crates = new THREE.InstancedMesh(cg, new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, sim.crates.length));
    this.crates.frustumCulled = false; this.crates.count = sim.crates.length; this.crateDmg = sim.crates.map(() => -1);
    this._cm = new THREE.Matrix4(); this._cp = new THREE.Vector3(); this._cq = new THREE.Quaternion(); this._cs = new THREE.Vector3(1, 1, 1); this._c0 = new THREE.Vector3(0, 0, 0);
    scene.add(this.crates);
    // explosive barrels: red drums with a hazard band (they never move, only disappear in a bang); drum + band + lid are ONE baked mesh
    const barrelGeo = bakeGeometries([[new THREE.CylinderGeometry(0.42, 0.42, 1.1, 14), 0xb3281d], [placed(new THREE.CylinderGeometry(0.435, 0.435, 0.22, 14), 0, 0.12, 0), 0xe0b020], [placed(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 12), 0, 0.56, 0), 0x6d1710]]);
    const barrelMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.barrels = (sim.barrels ?? []).map((b) => { const m = new THREE.Mesh(barrelGeo, barrelMat); m.position.set(b.x, b.y, b.z); scene.add(m); return m; });
    this.dmgColor = new THREE.Color(); this._dmgTo = new THREE.Color();
    this.nadeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), lambert(0x394a2b));
    this.smokeNadeMat = lambert(0xb9b9b2);      // smoke canisters are pale grey
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
      const c = sim.crates[i];
      if (c.dead) { this._cm.compose(this._c0, this._cq.identity(), this._c0); }   // a crate that broke: squashed to nothing
      else { const t = c.body.translation(), r = c.body.rotation(); this._cm.compose(this._cp.set(t.x, t.y, t.z), this._cq.set(r.x, r.y, r.z, r.w), this._cs); }
      this.crates.setMatrixAt(i, this._cm);
      const dmg = c.dead ? 0 : 1 - c.hp / c.maxHp;                     // wood darkens with damage
      if (dmg !== this.crateDmg[i]) { this.crateDmg[i] = dmg; this.crates.setColorAt(i, this.dmgColor.setHex(0xa87a3c).lerp(this._dmgTo.setHex(0x3b2a14), Math.min(1, dmg * 1.1))); }
    }
    if (sim.crates.length) { this.crates.instanceMatrix.needsUpdate = true; if (this.crates.instanceColor) this.crates.instanceColor.needsUpdate = true; }
    for (let i = 0; i < this.barrels.length; i++) {
      const b = sim.barrels[i], m = this.barrels[i];
      if (b.dead) { m.visible = false; continue; }
      m.visible = true;
      if (b.fuse >= 0) { const k = 1 + Math.sin(performance.now() * 0.06) * 0.04; m.scale.set(k, 1, k); }   // about to go: it shudders
    }
    // grenades come and go
    while (this.nades.length < sim.grenades.length) { const m = this.nadeMesh.clone(); this.scene.add(m); this.nades.push(m); }
    while (this.nades.length > sim.grenades.length) this.scene.remove(this.nades.pop());
    sim.grenades.forEach((g, i) => { const t = g.body.translation(); this.nades[i].position.set(t.x, t.y, t.z); this.nades[i].material = g.smoke ? this.smokeNadeMat : this.nadeMesh.material; });
    const z = sim.zone;
    this.zoneWall.position.x = z.cx; this.zoneWall.position.z = z.cz; this.zoneWall.scale.set(z.radius, 1, z.radius);
    this.zoneRing.position.x = z.nextX; this.zoneRing.position.z = z.nextZ; this.zoneRing.scale.set(z.nextR, z.nextR, 1);
    const edge = Math.abs(Math.hypot(px - z.cx, pz - z.cz) - z.radius);   // metres to the wall
    this.zoneWall.material.opacity = 0.05 + 0.3 * Math.max(0, 1 - edge / 35);
    this.zoneRing.visible = !z.done && z.nextR < z.radius - 0.5;
  }
}
