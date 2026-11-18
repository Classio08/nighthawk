// WEATHER LOOK: sky colours, fog, light levels, rain streaks, lightning + thunder, stars and the night flashlight.
// (How weather changes GAMEPLAY - shorter sight, muffled sound - lives in src/sim/weather.js.)
import * as THREE from 'three';

const PRESETS = {
  clear: null,
  rain:  { hz: 0x7d8790, zn: 0x4d5963, fog: 0x7d8790, near: 14, far: 125, hemi: 0.85, hemiSky: 0xb4c0cc, hemiGnd: 0x5e5a50, sun: 0.5, sunCol: 0xdfe6f0 },
  fog:   { hz: 0xb8bcbd, zn: 0x9aa3a8, fog: 0xb8bcbd, near: 5, far: 62, hemi: 1.0, hemiSky: 0xe0e4e6, hemiGnd: 0x8c8a82, sun: 0.65, sunCol: 0xf2f0e6 },
  night: { hz: 0x16213a, zn: 0x04060d, fog: 0x0b1224, near: 12, far: 115, hemi: 0.34, hemiSky: 0x5a6c9c, hemiGnd: 0x1c1f2a, sun: 0.4, sunCol: 0x8aa0e0, stars: true },
  storm: { hz: 0x1a222e, zn: 0x07090f, fog: 0x10161f, near: 8, far: 88, hemi: 0.3, hemiSky: 0x5a6a88, hemiGnd: 0x181b22, sun: 0.28, sunCol: 0x7f90b8, stars: false },
};

function paintSky(geo, hz, zn) {
  const pos = geo.attributes.position, cols = [], c = new THREE.Color(), a = new THREE.Color(hz), b = new THREE.Color(zn);
  for (let i = 0; i < pos.count; i++) { const k = Math.pow(Math.max(0, pos.getY(i) / 500), 0.55); c.copy(a).lerp(b, k); cols.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
}

const RAIN_V = `
uniform float uTime; uniform vec3 uCam; uniform float uSpeed; uniform vec2 uWind; uniform float uLen;
attribute vec3 aSeed; attribute float aEnd;
varying float vA;
void main(){
  vec3 box = vec3(46., 30., 46.);
  float f = fract(aSeed.y - uTime * uSpeed / box.y);
  vec2 rel = mod(aSeed.xz * box.xz - uCam.xz + box.xz * 0.5, box.xz) - box.xz * 0.5;
  vec3 p = vec3(uCam.x + rel.x, f * box.y, uCam.z + rel.y);
  p.xz += uWind * aEnd * uLen * 0.1;
  p.y += aEnd * uLen;
  vA = (1.0 - aEnd * 0.8) * smoothstep(0.0, 0.08, f) * (1.0 - smoothstep(0.85, 1.0, length(rel) / 23.0));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const RAIN_F = `varying float vA; void main(){ gl_FragColor = vec4(0.72, 0.8, 0.95, 0.5 * vA); }`;

export class Atmosphere {
  /** @param world WorldView  @param camera the player camera (the flashlight is attached to it) @param audio fx/audio */
  constructor(scene, world, camera, weather, audio) {
    this.scene = scene; this.world = world; this.camera = camera; this.weather = weather; this.audio = audio;
    this.flash = 0; this.nextBolt = 4 + Math.random() * 6; this.thunder = []; this.rainT = 0; this.t = 0;
    this.light = null; this.rain = null; this.stars = null; this.baseHemi = world.hemi.intensity;
    const P = PRESETS[weather.id];
    if (P) {
      scene.background = new THREE.Color(P.fog); scene.fog = new THREE.Fog(P.fog, P.near, P.far);
      world.hemi.intensity = P.hemi; world.hemi.color.setHex(P.hemiSky); world.hemi.groundColor.setHex(P.hemiGnd);
      world.sun.intensity = P.sun; world.sun.color.setHex(P.sunCol);
      if (weather.night) world.sun.position.set(-40, 90, 20);
      paintSky(world.sky.geometry, P.hz, P.zn);
      this.baseHemi = P.hemi; this.baseBg = new THREE.Color(P.fog);
    }
    if (P?.stars) {
      const n = 420, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const th = Math.random() * 6.283, ph = Math.acos(Math.random() * 0.92 + 0.08); a[i * 3] = 470 * Math.sin(ph) * Math.cos(th); a[i * 3 + 1] = 470 * Math.cos(ph); a[i * 3 + 2] = 470 * Math.sin(ph) * Math.sin(th); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
      this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 2.2, sizeAttenuation: false, fog: false, depthWrite: false }));
      this.stars.renderOrder = -9; world.sky.add(this.stars);
      const moon = new THREE.Mesh(new THREE.SphereGeometry(16, 12, 8), new THREE.MeshBasicMaterial({ color: 0xe8eeff, fog: false, depthWrite: false }));
      moon.position.set(-190, 300, 260); moon.renderOrder = -9; world.sky.add(moon);
    }
    if (weather.rain > 0) this._makeRain(weather.rain);
    if (weather.night) {
      this.light = new THREE.SpotLight(0xfff1d0, 2.1, 75, 0.5, 0.65, 0);        // no distance falloff, so the gun in your hands is not blown out white
      this.light.position.set(0.15, -0.1, 0.4); this.light.target.position.set(0, 0, -6);
      camera.add(this.light); camera.add(this.light.target);
      this.on = true;
    }
  }

  _makeRain(density) {
    const N = Math.round(2200 * Math.min(1.5, density)), seed = new Float32Array(N * 2 * 3), end = new Float32Array(N * 2), pos = new Float32Array(N * 2 * 3);
    for (let i = 0; i < N; i++) {
      const sx = Math.random(), sy = Math.random(), sz = Math.random();
      for (let k = 0; k < 2; k++) { seed.set([sx, sy, sz], (i * 2 + k) * 3); end[i * 2 + k] = k; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.rainMat = new THREE.ShaderMaterial({
      vertexShader: RAIN_V, fragmentShader: RAIN_F, transparent: true, depthWrite: false, fog: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uSpeed: { value: 26 }, uWind: { value: new THREE.Vector2(-2.2, 0.8) }, uLen: { value: 1.1 } },
    });
    this.rain = new THREE.LineSegments(g, this.rainMat); this.rain.frustumCulled = false; this.rain.renderOrder = 5;
    this.scene.add(this.rain);
  }

  toggleFlashlight() { if (!this.light) return false; this.on = !this.on; this.light.visible = this.on; this.audio?.play('switch', { vol: 0.8 }); return this.on; }

  update(dt, camPos) {
    this.t += dt;
    if (this.rain) {
      this.rainMat.uniforms.uTime.value = this.t; this.rainMat.uniforms.uCam.value.copy(camPos);
      this.rainT -= dt; if (this.rainT <= 0) { this.rainT = 1.1; this.audio?.play('rain', { vol: 0.5 * Math.min(1.5, this.weather.rain) }); }
    }
    if (this.weather.storm) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 6 + Math.random() * 11; this.flash = 1; this.double = Math.random() < 0.5 ? 0.12 : 0;
        this.thunder.push(0.35 + Math.random() * 2.2);
      }
      if (this.double > 0) { this.double -= dt; if (this.double <= 0) this.flash = 0.8; }
      this.flash = Math.max(0, this.flash - dt * 3.2);
      for (let i = this.thunder.length - 1; i >= 0; i--) { this.thunder[i] -= dt; if (this.thunder[i] <= 0) { this.thunder.splice(i, 1); this.audio?.play('thunder', { vol: 1 }); } }
      this.world.hemi.intensity = this.baseHemi + this.flash * 2.6;
      this.world.sky.material.color.setScalar(1 + this.flash * 3.2);
    }
  }

  dispose() { if (this.light) { this.camera.remove(this.light); this.camera.remove(this.light.target); } }
}
