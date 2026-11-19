// Draw-call savers: bake several pieces into ONE geometry (colours stored per vertex), so a soldier, a gun, a barrel or a loot item
// costs one draw call per rigid piece instead of one per box.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _c = new THREE.Color();

/** a copy of `geo` placed like an Object3D would be: scale, then rotation (x then y), then position */
export function placed(geo, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0) {
  return geo.clone().applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, 0)), _s.set(sx, sy, sz)));
}

/**
 * @param list [[geometry already in place, hex colour], ...] (all indexed, with position/normal/uv: Box, Cylinder, Sphere are)
 * @param colours true = write each piece's colour into a `color` attribute (use with a vertexColors material);
 *                false = no colour attribute (use with a shader / skin material that ignores it)
 * Colours go through THREE.Color so they look exactly like a normal `material.color` would. The inputs are disposed.
 */
export function bakeGeometries(list, colours = true) {
  for (const [g, color] of list) {
    if (!colours) continue;
    _c.set(color); const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  const merged = mergeGeometries(list.map(([g]) => g), false);
  for (const [g] of list) g.dispose();
  return merged;
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
/** @param parts [width, height, depth, x, y, z, colour, rotationY?] per box (metres / hex colour) */
export function bakeBoxes(parts, colours = true) {
  return bakeGeometries(parts.map(([w, h, d, x, y, z, color, ry = 0]) => [placed(UNIT_BOX, x, y, z, w, h, d, 0, ry), color]), colours);
}
