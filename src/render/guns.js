// Low-poly guns built from boxes (no model files = no licence worries, tiny download).
// Every gun points down -Z (muzzle at the front). userData: muzzle (Object3D), adsY (height of the sight), len.
import * as THREE from 'three';
import { skinMaterial } from './skins.js';
import { bakeBoxes } from './bake.js';
import { buildWeaponAttachmentMesh } from './weapon-attachments.js';

const DARK = 0x2d3139, MID = 0x4a505a, LIGHT = 0x6d7683, WOOD = 0x7a5534, TAN = 0x9d8a62;

// [width, height, depth, x, y, z, color]   (metres)
const PARTS = {
  ar: { muzzle: -0.62, adsY: 0.098, mag: 3, parts: [
    [0.06, 0.09, 0.40, 0, 0, 0, MID], [0.034, 0.034, 0.26, 0, 0.012, -0.32, DARK], [0.052, 0.055, 0.22, 0, -0.004, -0.2, LIGHT],
    [0.036, 0.15, 0.07, 0, -0.115, 0.03, DARK], [0.05, 0.1, 0.20, 0, -0.01, 0.30, WOOD], [0.04, 0.09, 0.05, 0, -0.09, 0.15, DARK],
    [0.03, 0.035, 0.09, 0, 0.065, -0.02, DARK], [0.012, 0.03, 0.012, 0, 0.055, -0.45, DARK]] },
  smg: { muzzle: -0.48, adsY: 0.092, mag: 2, parts: [
    [0.055, 0.085, 0.30, 0, 0, 0, MID], [0.03, 0.03, 0.16, 0, 0.01, -0.22, DARK], [0.034, 0.17, 0.05, 0, -0.13, 0.0, DARK],
    [0.04, 0.09, 0.05, 0, -0.085, 0.12, DARK], [0.04, 0.06, 0.12, 0, 0.0, 0.22, LIGHT], [0.028, 0.03, 0.07, 0, 0.06, 0, DARK]] },
  shotgun: { muzzle: -0.7, adsY: 0.085, parts: [
    [0.06, 0.085, 0.36, 0, 0, 0.02, MID], [0.036, 0.036, 0.46, 0, 0.012, -0.42, DARK], [0.04, 0.04, 0.36, 0, -0.03, -0.34, LIGHT],
    [0.07, 0.055, 0.14, 0, -0.035, -0.3, WOOD], [0.05, 0.1, 0.24, 0, -0.01, 0.3, WOOD], [0.04, 0.09, 0.05, 0, -0.09, 0.12, DARK], [0.01, 0.025, 0.01, 0, 0.055, -0.62, TAN]] },
  dmr: { muzzle: -0.78, adsY: 0.118, mag: 3, parts: [
    [0.058, 0.09, 0.44, 0, 0, 0, MID], [0.03, 0.03, 0.4, 0, 0.012, -0.42, DARK], [0.05, 0.05, 0.2, 0, -0.005, -0.25, LIGHT],
    [0.034, 0.12, 0.06, 0, -0.1, 0.05, DARK], [0.052, 0.11, 0.24, 0, -0.01, 0.34, WOOD], [0.04, 0.09, 0.05, 0, -0.09, 0.16, DARK],
    [0.045, 0.05, 0.22, 0, 0.075, -0.02, DARK], [0.05, 0.055, 0.04, 0, 0.075, -0.15, LIGHT], [0.05, 0.055, 0.04, 0, 0.075, 0.11, LIGHT]] },
  lmg: { muzzle: -0.72, adsY: 0.108, mag: 3, parts: [
    [0.075, 0.11, 0.46, 0, 0, 0, MID], [0.04, 0.04, 0.34, 0, 0.015, -0.4, DARK], [0.06, 0.06, 0.2, 0, -0.01, -0.26, LIGHT],
    [0.1, 0.12, 0.12, 0, -0.12, 0.02, DARK], [0.055, 0.11, 0.22, 0, -0.01, 0.34, DARK], [0.04, 0.09, 0.05, 0, -0.1, 0.17, DARK],
    [0.04, 0.04, 0.1, 0, 0.08, -0.02, DARK], [0.012, 0.07, 0.012, -0.04, -0.03, -0.55, LIGHT], [0.012, 0.07, 0.012, 0.04, -0.03, -0.55, LIGHT]] },
  pistol: { muzzle: -0.2, adsY: 0.07, mag: 2, parts: [
    [0.034, 0.05, 0.2, 0, 0.02, -0.02, MID], [0.03, 0.03, 0.06, 0, 0.01, -0.14, DARK], [0.032, 0.09, 0.05, 0, -0.045, 0.06, DARK],
    [0.01, 0.014, 0.01, 0, 0.052, 0.07, TAN], [0.01, 0.014, 0.01, 0, 0.052, -0.1, TAN]] },
};

const cache = {};
const geo = new THREE.BoxGeometry(1, 1, 1);
function mat(c) { return (cache[c] ??= new THREE.MeshLambertMaterial({ color: c })); }
const GUN_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });   // the whole gun body is one mesh with the colours baked in
const bodyCache = new Map();                                            // gun definition -> its merged body geometry (shared by every copy of that gun)

/**
 * @param skin optional skin id (see skins.js): then every part is baked into gun space so the shader pattern runs smoothly over the whole gun
 * userData.mag = the magazine mesh (the viewmodel animates it during reloads), null for the pump shotgun
 * @returns {THREE.Group}
 */
export function makeGun(id, tint, skin = null) {
  const def = PARTS[id] ?? PARTS.ar;
  const g = new THREE.Group();
  const sm = skin ? skinMaterial(skin) : null;
  let magMesh = null;
  const rest = [];                                                      // everything except the magazine is rigid: bake it into ONE mesh
  def.parts.forEach((p, i) => {
    if (i !== def.mag) { rest.push(p); return; }
    const [w, h, d, x, y, z, c] = p;                                    // the magazine stays its own mesh: the viewmodel slides it during reloads
    let m;
    if (sm) { m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(x, y, z), sm); }
    else { m = new THREE.Mesh(geo, mat(c)); m.scale.set(w, h, d); m.position.set(x, y, z); }
    m.userData.base = m.position.clone(); magMesh = m; g.add(m);
  });
  if (rest.length) {
    if (sm) g.add(new THREE.Mesh(bakeBoxes(rest, false), sm));          // skinned: baked into gun space so the shader pattern runs smoothly over the whole gun
    else { let b = bodyCache.get(def); if (!b) bodyCache.set(def, b = bakeBoxes(rest)); g.add(new THREE.Mesh(b, GUN_MAT)); }
  }
  const attachments = buildWeaponAttachmentMesh(id);
  if (attachments) g.add(attachments);                                  // one baked cosmetic detail mesh; no simulation stats change
  g.userData.mag = magMesh; g.userData.skin = skin;
  if (tint) { // small colour stripe so each operator's gun looks a bit theirs
    const s = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: tint }));
    s.scale.set(0.062, 0.012, 0.1); s.position.set(0, 0.052, -0.05); g.add(s);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.015, def.muzzle); g.add(muzzle);
  g.userData.muzzle = muzzle; g.userData.adsY = def.adsY; g.userData.len = Math.abs(def.muzzle);
  return g;
}

export const GUN_IDS = Object.keys(PARTS);
