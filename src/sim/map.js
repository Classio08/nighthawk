// The arena. Built from a seed so the browser and the future server get the SAME map.
import { makeRng } from './rng.js';

export const MAP_HALF = 115;      // playable square half-size
export const START_RADIUS = 100;  // first safe zone

/** @returns {{boxes: Array, half:number, seed:number}} boxes are axis-aligned, (x,y,z) = centre */
export function buildMap(seed = 7) {
  const rng = makeRng(seed);
  // Fixed POI structures are inserted first so the seeded filler layout never blocks them.
  // Every gameplay-solid structure lives in this shared map data (server and clients agree).
  const landmarks = [
    { id: 'basin-yard', name: 'BASIN YARD', kind: 'yard', x: -38, z: -28, radius: 24 },
    { id: 'dry-river', name: 'DRY RIVER', kind: 'river', x: 0, z: 12, radius: 76 },
    { id: 'relay-ridge', name: 'RELAY RIDGE', kind: 'relay', x: 58, z: -54, radius: 22 },
    { id: 'forward-outpost', name: 'FORWARD OUTPOST', kind: 'outpost', x: -62, z: 54, radius: 22 },
    { id: 'extraction-pad', name: 'EXTRACTION PAD', kind: 'extraction', x: 56, z: 56, radius: 20 },
  ];
  const boxes = [
    // Basin Yard: loading shed, storage container and hard cover.
    { kind: 'poi-building', poi: 'basin-yard', x: -43, y: 2.5, z: -29, w: 16, h: 5, d: 10 },
    { kind: 'poi-container', poi: 'basin-yard', x: -25, y: 1.3, z: -31, w: 12, h: 2.6, d: 2.6 },
    { kind: 'poi-wall', poi: 'basin-yard', x: -39, y: 0.8, z: -19, w: 13, h: 1.6, d: 0.8 },
    { kind: 'poi-wall', poi: 'basin-yard', x: -52, y: 0.8, z: -29, w: 0.8, h: 1.6, d: 9 },
    // Relay Ridge: generator shelter, mast and rock cover.
    { kind: 'poi-building', poi: 'relay-ridge', x: 52, y: 1.8, z: -55, w: 8, h: 3.6, d: 7 },
    { kind: 'poi-mast', poi: 'relay-ridge', x: 64, y: 5, z: -49, w: 0.8, h: 10, d: 0.8 },
    { kind: 'poi-rock', poi: 'relay-ridge', x: 48, y: 1.4, z: -43, w: 5, h: 2.8, d: 4 },
    { kind: 'poi-rock', poi: 'relay-ridge', x: 69, y: 1.1, z: -61, w: 4, h: 2.2, d: 5 },
    // Forward Outpost: shelter and low defensive perimeter with an open entry.
    { kind: 'poi-building', poi: 'forward-outpost', x: -66, y: 1.8, z: 54, w: 9, h: 3.6, d: 7 },
    { kind: 'poi-wall', poi: 'forward-outpost', x: -62, y: 0.8, z: 43, w: 19, h: 1.6, d: 0.8 },
    { kind: 'poi-wall', poi: 'forward-outpost', x: -73, y: 0.8, z: 55, w: 0.8, h: 1.6, d: 23 },
    { kind: 'poi-wall', poi: 'forward-outpost', x: -51, y: 0.8, z: 55, w: 0.8, h: 1.6, d: 23 },
    // Extraction Pad: four low barriers, leaving a clear vehicle/foot approach.
    { kind: 'poi-fence', poi: 'extraction-pad', x: 56, y: 0.65, z: 43, w: 20, h: 1.3, d: 0.7 },
    { kind: 'poi-fence', poi: 'extraction-pad', x: 46, y: 0.65, z: 56, w: 0.7, h: 1.3, d: 26 },
    { kind: 'poi-fence', poi: 'extraction-pad', x: 66, y: 0.65, z: 56, w: 0.7, h: 1.3, d: 26 },
    { kind: 'poi-fence', poi: 'extraction-pad', x: 50, y: 0.65, z: 69, w: 8, h: 1.3, d: 0.7 },
    { kind: 'poi-fence', poi: 'extraction-pad', x: 62, y: 0.65, z: 69, w: 8, h: 1.3, d: 0.7 },
  ];
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
  return { boxes, landmarks, half: MAP_HALF, seed };
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

/** a free spot (no building within `margin`) inside a circle: used for outposts and perches */
export function findFreeSpot(map, rng, cx, cz, r, margin = 5) {
  for (let i = 0; i < 400; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (Math.abs(x) > MAP_HALF - 8 || Math.abs(z) > MAP_HALF - 8) continue;
    if (!insideAnyBox(map, x, z, margin)) return { x, z };
  }
  return { x: cx, z: cz };
}

/** a sniper's nest: stand 2 m behind a solid wall/container on its OUTER side (wall at your back, the safe circle in front) */
export function findPerch(map, rng, cx, cz, r) {
  const cands = map.boxes.filter((b) => b.kind !== 'edge' && b.kind !== 'crates' && b.h >= 2 && Math.hypot(b.x - cx, b.z - cz) < r && Math.hypot(b.x - cx, b.z - cz) > r * 0.25);
  for (let i = 0; i < 24 && cands.length; i++) {
    const b = cands[Math.floor(rng() * cands.length)];
    const dx = cx - b.x, dz = cz - b.z, dl = Math.hypot(dx, dz) || 1, ux = dx / dl, uz = dz / dl;
    const reach = Math.abs(ux) * b.w / 2 + Math.abs(uz) * b.d / 2 + 1.8;
    const p = { x: b.x + ux * reach, z: b.z + uz * reach };
    if (!insideAnyBox(map, p.x, p.z, 0.7) && Math.abs(p.x) < MAP_HALF - 6 && Math.abs(p.z) < MAP_HALF - 6) return { x: p.x, z: p.z, faceX: cx, faceZ: cz };
  }
  return null;
}
