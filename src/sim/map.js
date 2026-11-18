// The arena. Built from a seed so the browser and the future server get the SAME map.
import { makeRng } from './rng.js';

export const MAP_HALF = 115;      // playable square half-size
export const START_RADIUS = 100;  // first safe zone

/** @returns {{boxes: Array, half:number, seed:number}} boxes are axis-aligned, (x,y,z) = centre */
export function buildMap(seed = 7) {
  const rng = makeRng(seed);
  const boxes = [];
  const overlaps = (b, margin) => boxes.some((o) =>
    Math.abs(b.x - o.x) < (b.w + o.w) / 2 + margin && Math.abs(b.z - o.z) < (b.d + o.d) / 2 + margin);
  const place = (kind, count, size, margin) => {
    let placed = 0, tries = 0;
    while (placed < count && tries++ < 400) {
      const [w, h, d] = size();
      const x = rng.range(-92, 92), z = rng.range(-92, 92);
      const b = { kind, x, y: h / 2, z, w, h, d };
      if (Math.hypot(x, z) > 96) continue;
      if (overlaps(b, margin)) continue;
      b.color = null; boxes.push(b); placed++;
    }
  };
  place('block', 15, () => { const s = rng() < 0.5; return [rng.range(8, 16) * (s ? 1 : 0.7), rng.range(4, 8), rng.range(8, 16) * (s ? 0.7 : 1)]; }, 7);
  place('container', 7, () => (rng() < 0.5 ? [12, 2.6, 2.6] : [2.6, 2.6, 12]), 4);
  place('wall', 26, () => (rng() < 0.5 ? [rng.range(6, 12), 1.5, 0.7] : [0.7, 1.5, rng.range(6, 12)]), 3);
  place('crates', 14, () => [2, 2, 2], 3);
  // perimeter so nobody walks off the world
  const E = MAP_HALF + 1;
  boxes.push({ kind: 'edge', x: 0, y: 5, z: -E, w: 2 * E + 4, h: 10, d: 2 });
  boxes.push({ kind: 'edge', x: 0, y: 5, z: E, w: 2 * E + 4, h: 10, d: 2 });
  boxes.push({ kind: 'edge', x: -E, y: 5, z: 0, w: 2, h: 10, d: 2 * E + 4 });
  boxes.push({ kind: 'edge', x: E, y: 5, z: 0, w: 2, h: 10, d: 2 * E + 4 });
  return { boxes, half: MAP_HALF, seed };
}

export function insideAnyBox(map, x, z, margin = 0) {
  return map.boxes.some((b) => Math.abs(x - b.x) < b.w / 2 + margin && Math.abs(z - b.z) < b.d / 2 + margin);
}

/** n spawn points that are not inside buildings and are at least minDist apart. */
export function pickSpawns(map, n, rng, minDist = 18, radius = 88) {
  const pts = [];
  let tries = 0, dist = minDist;
  while (pts.length < n && tries++ < 6000) {
    if (tries % 1000 === 0) dist *= 0.8; // relax if the map is crowded
    const x = rng.range(-radius, radius), z = rng.range(-radius, radius);
    if (Math.hypot(x, z) > radius) continue;
    if (insideAnyBox(map, x, z, 2.5)) continue;
    if (pts.some((p) => Math.hypot(p.x - x, p.z - z) < dist)) continue;
    pts.push({ x, z });
  }
  return pts;
}

/** Closest place to hide from `threat`: just behind a box (as seen from the threat). Pure maths, unit tested. */
export function findCover(map, from, threat, maxDist = 30) {
  let best = null, bestScore = Infinity;
  for (const b of map.boxes) {
    if (b.kind === 'edge' || b.h < 1.2) continue;
    const dx = b.x - threat.x, dz = b.z - threat.z, dl = Math.hypot(dx, dz) || 1;
    const ux = dx / dl, uz = dz / dl;
    const reach = Math.abs(ux) * b.w / 2 + Math.abs(uz) * b.d / 2 + 1.3;
    const p = { x: b.x + ux * reach, z: b.z + uz * reach };
    if (insideAnyBox(map, p.x, p.z, 0.6)) continue;
    const d = Math.hypot(p.x - from.x, p.z - from.z);
    if (d > maxDist) continue;
    const exposure = Math.hypot(p.x - threat.x, p.z - threat.z) < 6 ? 25 : 0; // do not hide right next to the enemy
    if (d + exposure < bestScore) { bestScore = d + exposure; best = p; }
  }
  return best;
}
