// Small, reusable weapon-top / barrel / underbarrel details. These are cosmetic meshes only:
// weapon statistics and attachment balance remain in the authoritative simulation.
import * as THREE from 'three';
import { bakeBoxes } from './bake.js';

const DARK = 0x20262d, METAL = 0x58616a, GLASS = 0x253b4c, RUBBER = 0x171b20;
const MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });
const cache = new Map();

const VISUALS = Object.freeze({
  ar: { optic: 'red-dot', muzzle: 'compensator', underbarrel: 'grip' },
  smg: { optic: 'micro-dot', muzzle: 'compact-brake' },
  shotgun: { optic: 'ghost-ring', underbarrel: 'pump-grip' },
  dmr: { optic: 'scope', muzzle: 'precision-brake', underbarrel: 'bipod' },
  lmg: { optic: 'holo', muzzle: 'heavy-brake', underbarrel: 'bipod' },
  pistol: { optic: 'micro-dot' },
});

function partsFor(weaponId, loadout = VISUALS[weaponId] ?? {}) {
  const p = [];
  const add = (...part) => p.push(part);

  // Receiver/rail positions are in the same local coordinate system as guns.js (muzzle points -Z).
  if (loadout.optic) {
    const scope = loadout.optic === 'scope';
    const holo = loadout.optic === 'holo';
    const width = scope ? 0.052 : 0.044;
    const depth = scope ? 0.15 : 0.075;
    add(width, 0.018, depth, 0, 0.073, -0.12, DARK);                  // rail clamp
    add(width * 0.86, scope ? 0.075 : 0.044, depth * 0.68, 0, scope ? 0.12 : 0.105, -0.12, RUBBER);
    add(width * 0.66, 0.009, 0.008, 0, scope ? 0.14 : 0.115, -0.12 - depth * 0.34, GLASS); // front lens glint
    if (holo) add(0.008, 0.045, 0.009, 0, 0.118, -0.12, METAL);
  }

  if (loadout.muzzle) {
    const heavy = loadout.muzzle === 'heavy-brake' || loadout.muzzle === 'precision-brake';
    const compact = loadout.muzzle === 'compact-brake';
    const length = compact ? 0.07 : heavy ? 0.12 : 0.095;
    const width = heavy ? 0.055 : 0.044;
    add(width, 0.045, length, 0, 0.004, -0.57, METAL);
    add(width * 0.35, 0.052, 0.008, 0, 0.004, -0.57 - length * 0.5, DARK);
    if (heavy) {
      add(width * 1.35, 0.009, 0.04, 0, 0.028, -0.57, DARK);
      add(width * 1.35, 0.009, 0.04, 0, -0.02, -0.57, DARK);
    }
  }

  if (loadout.underbarrel) {
    if (loadout.underbarrel === 'bipod') {
      for (const x of [-0.035, 0.035]) {
        add(0.009, 0.10, 0.012, x, -0.055, -0.49, METAL);
        add(0.018, 0.01, 0.045, x, -0.108, -0.49, RUBBER);
      }
    } else {
      add(0.045, 0.028, 0.16, 0, -0.055, -0.24, DARK);
      add(0.052, 0.025, 0.055, 0, -0.074, -0.23, RUBBER);
    }
  }
  return p;
}

export function buildWeaponAttachmentParts(weaponId, loadout) {
  return partsFor(weaponId, loadout).map((part) => [...part]);
}

export function buildWeaponAttachmentMesh(weaponId, loadout) {
  const visual = loadout ?? VISUALS[weaponId] ?? {};
  const key = `${weaponId}:${JSON.stringify(visual)}`;
  if (!cache.has(key)) {
    const parts = partsFor(weaponId, visual);
    cache.set(key, parts.length ? bakeBoxes(parts) : null);
  }
  const geometry = cache.get(key);
  return geometry ? new THREE.Mesh(geometry, MATERIAL) : null;
}

export function defaultWeaponVisuals(weaponId) {
  return { ...(VISUALS[weaponId] ?? {}) };
}

export const WEAPON_VISUAL_PRESETS = VISUALS;
