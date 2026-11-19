// Procedurally generated surface textures (concrete, corrugated metal, desert ground). Authored in this repository: no downloads, no licence.
// All are SEAMLESS (the noise wraps), drawn once at start-up on small canvases, and used with mipmaps + anisotropic filtering.
// They are a stand-in until a licensed PBR set is integrated (docs/ASSET_CATALOG.md); visuals only, never read by the simulation.
import * as THREE from 'three';

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** tileable value-noise fBm on an n x n grid, values 0..1 */
function fbm(n, seed, base = 4, octaves = 4) {
  const r = rng(seed), out = new Float32Array(n * n); let amp = 1, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const p = base << o, lat = new Float32Array(p * p); for (let i = 0; i < lat.length; i++) lat[i] = r();
    const at = (x, y) => lat[((y % p) + p) % p * p + (((x % p) + p) % p)];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const fx = (x / n) * p, fy = (y / n) * p, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const v = at(x0, y0) * (1 - sx) * (1 - sy) + at(x0 + 1, y0) * sx * (1 - sy) + at(x0, y0 + 1) * (1 - sx) * sy + at(x0 + 1, y0 + 1) * sx * sy;
      out[y * n + x] += v * amp;
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

function toTexture(canvas, repeat = 1, aniso = 8) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}
function paint(n, fn) {                                                   // fn(x, y) -> [r,g,b] 0..255
  const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const [r, gg, b] = fn(x, y), i = (y * n + x) * 4; img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0); return { c, g };
}
const clamp8 = (v) => Math.max(0, Math.min(255, v));

/** Desert ground: two sand tones in soft patches, fine grain, scattered pebbles. One tile covers about 8 m. Replaces the old 8-pixel blocks. */
export function makeGroundTexture(repeat = 75) {
  const n = 512, patch = fbm(n, 11, 3, 5), fine = fbm(n, 12, 32, 2), r = rng(13);
  const { c, g } = paint(n, (x, y) => {
    const i = y * n + x, k = patch[i], f = fine[i] - 0.5;
    const R = 216 - 28 * k + f * 26, G = 196 - 30 * k + f * 24, B = 148 - 28 * k + f * 20;
    return [clamp8(R), clamp8(G), clamp8(B)];
  });
  for (let p = 0; p < 420; p++) {                                         // pebbles: a darker core with a lighter rim, wrapped at the edges so the tile stays seamless
    const x = r() * n, y = r() * n, s = 0.8 + r() * 1.7, dark = r() < 0.6;
    for (const [ox, oy] of [[0, 0], [-n, 0], [n, 0], [0, -n], [0, n]]) {
      g.fillStyle = dark ? 'rgba(92,76,56,.55)' : 'rgba(236,222,190,.5)'; g.beginPath(); g.ellipse(x + ox, y + oy, s, s * 0.75, r() * 3, 0, 6.3); g.fill();
    }
  }
  return toTexture(c, repeat);
}

/** Weathered concrete / plaster, mean brightness about 0.93 so the colour of the material still decides the look. One tile = 4 m (formwork lines every metre). */
export function makeConcreteTexture() {
  const n = 256, blot = fbm(n, 21, 3, 4), grain = fbm(n, 22, 64, 2), stain = fbm(n, 23, 2, 3);
  const { c, g } = paint(n, (x, y) => {
    const i = y * n + x; let v = 0.9 + (blot[i] - 0.5) * 0.16 + (grain[i] - 0.5) * 0.12;
    const streak = Math.max(0, stain[i] - 0.52) * 0.5 * (0.4 + 0.6 * (y / n));      // darker run-off streaks, heavier towards the bottom
    v -= streak;
    if (y % 64 < 2) v -= 0.055;                                                       // formwork joints
    if (x % 128 < 1 && ((y / 64) | 0) % 2 === 0) v -= 0.04;                            // staggered panel edges
    const w = clamp8(v * 255); return [w, w, w];
  });
  const r = rng(24); g.lineWidth = 1;
  for (let k = 0; k < 5; k++) {                                                       // a few hairline cracks (drawn twice, wrapped, to stay seamless)
    let x = r() * n, y = r() * n; g.strokeStyle = 'rgba(40,40,40,.32)';
    for (const ox of [0, -n, n]) { g.beginPath(); let px = x + ox, py = y; g.moveTo(px, py); for (let s = 0; s < 14; s++) { px += (r() - 0.5) * 12; py += 3 + r() * 7; g.lineTo(px, py); } g.stroke(); }
  }
  return toTexture(c);
}

/** Corrugated shipping-container steel: vertical ribs (one tile = 2.4 m, 8 ribs), grain, light scuffs. */
export function makeMetalTexture() {
  const n = 256, grain = fbm(n, 31, 48, 2), blot = fbm(n, 32, 3, 3), r = rng(33);
  const { c, g } = paint(n, (x, y) => {
    const i = y * n + x, rib = Math.cos((x / n) * Math.PI * 2 * 8);
    const v = 0.88 + 0.1 * rib + (grain[i] - 0.5) * 0.1 + (blot[i] - 0.5) * 0.12;
    const w = clamp8(v * 255); return [w, w, w];
  });
  for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(255,255,255,${0.04 + r() * 0.06})`; g.lineWidth = 1; const x = r() * n, y = r() * n; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 18, y + (r() - 0.5) * 18); g.stroke(); }
  return toTexture(c);
}


/** Weathered desert rock / exposed stone. One tile is about 3.4 m; colour noise and warm mineral flecks break up flat grey boxes. */
export function makeRockTexture() {
  const n = 256, broad = fbm(n, 41, 3, 4), grain = fbm(n, 42, 40, 2), r = rng(43);
  const { c, g } = paint(n, (x, y) => {
    const i = y * n + x, b = broad[i], f = grain[i] - 0.5;
    const vein = Math.max(0, 0.47 - Math.abs(b - 0.5)) * 15;
    return [
      clamp8(112 + b * 28 + f * 28 + vein),
      clamp8(103 + b * 24 + f * 24 + vein * 0.72),
      clamp8(88 + b * 19 + f * 20 + vein * 0.35),
    ];
  });
  for (let i = 0; i < 160; i++) {
    const x = r() * n, y = r() * n, radius = 0.45 + r() * 1.4;
    g.fillStyle = r() < 0.55 ? 'rgba(52,43,34,.28)' : 'rgba(214,187,139,.22)';
    g.beginPath(); g.ellipse(x, y, radius * 1.6, radius, r() * Math.PI, 0, Math.PI * 2); g.fill();
  }
  return toTexture(c, 2);
}

/** Replace a box-like geometry's UVs with world-space ones (projected along the face's dominant axis), so a texture keeps the same scale on every wall however big the box is. */
export function worldUV(geo, metresPerTile) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv, k = 1 / metresPerTile;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, pos.getX(i) * k, pos.getZ(i) * k);          // top / bottom
    else if (ax >= az) uv.setXY(i, pos.getZ(i) * k, pos.getY(i) * k);                  // east / west faces
    else uv.setXY(i, pos.getX(i) * k, pos.getY(i) * k);                                // north / south faces
  }
  uv.needsUpdate = true; return geo;
}

/** Large-scale colour mottling for a subdivided PlaneGeometry (vertex colours multiply the tiling texture, so patches of 10-40 m break up the repetition). */
export function mottlePlane(geo, segments, seed = 5, lo = 0.88, hi = 1.08) {
  const n = 64, f = fbm(n, seed, 3, 4), col = new Float32Array(geo.attributes.position.count * 3), c = new THREE.Color();
  for (let iy = 0; iy <= segments; iy++) for (let ix = 0; ix <= segments; ix++) {
    const v = f[Math.min(n - 1, Math.round((iy / segments) * (n - 1))) * n + Math.min(n - 1, Math.round((ix / segments) * (n - 1)))], k = lo + (hi - lo) * Math.min(1, Math.max(0, (v - 0.3) / 0.4));
    c.setRGB(k * 1.0, k * 0.985, k * 0.95); const i = (iy * (segments + 1) + ix) * 3; col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); return geo;
}
