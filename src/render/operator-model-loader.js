// Optional GLB operator pipeline. It is loaded only when a licensed project asset exists;
// procedural FighterView remains the always-available fallback.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

const normalize = (name) => String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const CLIP_ALIASES = Object.freeze({
  idle: ['idle', 'stand', 'breathing'],
  walk: ['walk', 'walking', 'locomotion'],
  run: ['run', 'running', 'sprint'],
  crouch: ['crouch', 'crouched', 'crouchidle'],
  reload: ['reload', 'riflereload', 'reloading'],
  fire: ['fire', 'shoot', 'rifleshoot'],
  death: ['death', 'die', 'dying'],
  revive: ['revive', 'healing', 'medic'],
});

export class OperatorModel {
  constructor(gltf, { scale = 1, animationFade = 0.16 } = {}) {
    this.root = cloneSkeleton(gltf.scene);
    this.root.scale.setScalar(scale);
    this.root.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = true;
    });
    this.mixer = new THREE.AnimationMixer(this.root);
    this.animationFade = animationFade;
    this.actions = new Map();
    this.current = null;
    for (const [key, aliases] of Object.entries(CLIP_ALIASES)) {
      const clip = gltf.animations.find((candidate) => {
        const name = normalize(candidate.name);
        return aliases.some((alias) => name.includes(alias));
      });
      if (clip) this.actions.set(key, this.mixer.clipAction(clip));
    }
    this.play(this.actions.has('idle') ? 'idle' : this.actions.keys().next().value, 0);
  }

  hasAnimation(name) { return this.actions.has(name); }

  play(name, fade = this.animationFade) {
    const next = this.actions.get(name);
    if (!next || next === this.current) return false;
    next.reset().fadeIn(Math.max(0, fade)).play();
    if (this.current) this.current.fadeOut(Math.max(0, fade));
    this.current = next;
    return true;
  }

  update(dt) {
    if (Number.isFinite(dt) && dt > 0) this.mixer.update(Math.min(dt, 0.1));
  }

  setPose({ speed = 0, sprinting = false, crouching = false, reloading = false, firing = false, dead = false } = {}) {
    const requested = dead ? 'death' : reloading ? 'reload' : firing ? 'fire' : crouching ? 'crouch' : speed > 0.2 ? (sprinting ? 'run' : 'walk') : 'idle';
    return this.play(this.actions.has(requested) ? requested : this.actions.has('idle') ? 'idle' : requested);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.root.removeFromParent();
  }
}

export async function loadOperatorModel(url, { loader = new GLTFLoader(), scale = 1, signal } = {}) {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url) && !url.startsWith('/')) throw new TypeError('Operator model URL must be HTTP(S) or a project-relative path');
  if (signal?.aborted) throw new DOMException('Model load aborted', 'AbortError');
  const gltf = await loader.loadAsync(url);
  if (signal?.aborted) throw new DOMException('Model load aborted', 'AbortError');
  if (!gltf?.scene) throw new Error('The GLB file contains no scene');
  return new OperatorModel(gltf, { scale });
}
