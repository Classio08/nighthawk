// Optional shipped art. Missing files must not break the game: TextureLoader
// shows the material colour until the image arrives, and GLTF loads are best-effort.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const texLoader = new TextureLoaderSafe();

function TextureLoaderSafe() {
  return new THREE.TextureLoader();
}

/** Repeat a texture. sRGB for colour, linear for normals/data. */
export function loadRepeatTexture(url, repeat, srgb) {
  const t = texLoader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

const gltf = new GLTFLoader();

/**
 * Drop cleared exports at these URLs (see docs/MODEL_DROP.md).
 * The game keeps the box stand-in until a file is actually there.
 */
export const MODEL_URLS = {
  operator: '/models/characters/superhero-male.glb',
  anims: '/models/anims/ual1.glb',
  sedan: '/models/vehicles/police-sedan.glb',
  barrel: '/models/props/barrel.glb',
  crate: '/models/props/crate.glb',
};

export function loadGltf(url) {
  return new Promise((resolve) => {
    gltf.load(url, (g) => resolve(g), undefined, () => resolve(null));
  });
}
