// Navigation grid + A* for bots. Graphics-free and deterministic (no RNG, no time): the same map gives the same paths on the server and in the browser.
//
// The map is a square of axis-aligned boxes, so a 1 m grid is plenty. A cell is blocked when a box tall enough to stop a soldier
// (top above 0.5 m, the auto-step height) comes within `PAD` metres of it (a soldier is 0.4 m wide, the rest is a safety margin so bots do not scrape walls).
// Paths are 8-directional (no corner cutting), then "string-pulled": waypoints that can be skipped because the straight line is clear are dropped.
// Bots only ask for a path when the straight line to where they want to go is blocked, and the simulation caps how many searches run per tick.
import { MAP_HALF } from './map.js';

const CELL = 1, PAD = 0.55, TALL = 0.5, EDGE = 1.5;
const SQRT2 = Math.SQRT2;

export class NavGrid {
  /** @param map {boxes:[{x,y,z,w,h,d}]} as returned by buildMap */
  constructor(map) {
    this.min = -(MAP_HALF + 4); this.n = Math.ceil((2 * (MAP_HALF + 4)) / CELL);
    this.block = new Uint8Array(this.n * this.n); this.solid = [];
    for (const b of map.boxes) {
      if (b.y + b.h / 2 <= TALL || b.y - b.h / 2 > 2.2) continue;               // low things can be stepped / hopped over, floating things cannot stop anyone
      this.solid.push(b);
      const x0 = this._ci(b.x - b.w / 2 - PAD), x1 = this._ci(b.x + b.w / 2 + PAD), z0 = this._ci(b.z - b.d / 2 - PAD), z1 = this._ci(b.z + b.d / 2 + PAD);
      for (let iz = Math.max(0, z0); iz <= Math.min(this.n - 1, z1); iz++) for (let ix = Math.max(0, x0); ix <= Math.min(this.n - 1, x1); ix++) this.block[iz * this.n + ix] = 1;
    }
    const N = this.n * this.n;
    this.g = new Float32Array(N); this.parent = new Int32Array(N); this.stamp = new Uint32Array(N); this.closed = new Uint32Array(N); this.ver = 0;
    this.heap = new Int32Array(N + 8); this.hf = new Float32Array(N);          // binary heap of cell indices, ordered by hf[cell]
    this.searches = 0; this.expanded = 0;
  }

  _ci(v) { return Math.floor((v - this.min) / CELL); }
  _cx(i) { return this.min + (i + 0.5) * CELL; }
  inside(ix, iz) { return ix >= 0 && iz >= 0 && ix < this.n && iz < this.n; }
  blockedCell(ix, iz) { return !this.inside(ix, iz) || this.block[iz * this.n + ix] === 1; }
  /** is the world point inside a blocked cell? (outside the grid counts as blocked) */
  blockedAt(x, z) { return this.blockedCell(this._ci(x), this._ci(z)); }

  /** exact test (not grid): is this world point clear of every tall box by the soldier's width? */
  freePoint(x, z, m = 0.45) { for (const b of this.solid) if (Math.abs(x - b.x) < b.w / 2 + m && Math.abs(z - b.z) < b.d / 2 + m) return false; return true; }

  /** nearest free cell to a world point (ring search); null if the grid is full (it never is) */
  nearestFree(x, z, maxR = 8) {
    const cx = this._ci(x), cz = this._ci(z);
    if (!this.blockedCell(cx, cz)) return { ix: cx, iz: cz };
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = 1e9;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || this.blockedCell(cx + dx, cz + dz)) continue;
        const d = Math.hypot(this._cx(cx + dx) - x, this._cx(cz + dz) - z); if (d < bd) { bd = d; best = { ix: cx + dx, iz: cz + dz }; }
      }
      if (best) return best;
    }
    return null;
  }

  /** is the straight line between two world points free of blocked cells? Samples every ~0.6 m; the first and last EDGE metres are forgiven so a bot hugging a wall (cover spot, nest, doorway) can still leave and arrive. */
  segmentClear(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    if (len <= 2 * EDGE) return true;
    const steps = Math.ceil(len / 0.6);
    for (let i = 1; i < steps; i++) { const t = i / steps, d = t * len; if (d < EDGE || len - d < EDGE) continue; if (this.blockedAt(x0 + dx * t, z0 + dz * t)) return false; }
    return true;
  }

  /**
   * A* from (sx,sz) to (gx,gz). Returns waypoints (world points, start excluded, goal last) or null if there is no way.
   * A blocked start or goal is moved to the nearest free cell; the real goal point is appended when it is reachable.
   */
  findPath(sx, sz, gx, gz, maxExpand = 30000) {
    const s = this.nearestFree(sx, sz), t = this.nearestFree(gx, gz);
    if (!s || !t) return null;
    this.searches++;
    const n = this.n, ver = ++this.ver, tIdx = t.iz * n + t.ix, sIdx = s.iz * n + s.ix;
    if (sIdx === tIdx) return [{ x: gx, z: gz }];
    const { g, parent, stamp, closed, heap, hf } = this; let hn = 0;
    const h = (i) => { const dx = Math.abs((i % n) - t.ix), dz = Math.abs(((i / n) | 0) - t.iz); return (dx + dz + (SQRT2 - 2) * Math.min(dx, dz)) * CELL; };
    const push = (i, f) => { hf[i] = f; let k = hn++; while (k > 0) { const p = (k - 1) >> 1; if (hf[heap[p]] <= f) break; heap[k] = heap[p]; k = p; } heap[k] = i; };
    const pop = () => {
      const top = heap[0], last = heap[--hn];
      if (hn > 0) { const f = hf[last]; let k = 0; for (;;) { let c = 2 * k + 1; if (c >= hn) break; if (c + 1 < hn && hf[heap[c + 1]] < hf[heap[c]]) c++; if (hf[heap[c]] >= f) break; heap[k] = heap[c]; k = c; } heap[k] = last; }
      return top;
    };
    g[sIdx] = 0; parent[sIdx] = -1; stamp[sIdx] = ver; push(sIdx, h(sIdx));
    let found = false, expanded = 0;
    while (hn > 0 && expanded < maxExpand) {
      const cur = pop(); if (closed[cur] === ver) continue; closed[cur] = ver; expanded++;
      if (cur === tIdx) { found = true; break; }
      const cx = cur % n, cz = (cur / n) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (this.blockedCell(nx, nz)) continue;
        if (dx && dz && (this.blockedCell(cx + dx, cz) || this.blockedCell(cx, cz + dz))) continue;      // no cutting corners
        const ni = nz * n + nx; if (closed[ni] === ver) continue;
        const ng = g[cur] + (dx && dz ? SQRT2 : 1) * CELL;
        if (stamp[ni] !== ver || ng < g[ni]) { stamp[ni] = ver; g[ni] = ng; parent[ni] = cur; push(ni, ng + h(ni)); }
      }
    }
    this.expanded += expanded;
    if (!found) return null;
    const cells = []; for (let i = tIdx; i !== -1; i = parent[i]) cells.push(i); cells.reverse();
    const pts = cells.map((i) => ({ x: this._cx(i % n), z: this._cx((i / n) | 0) }));
    pts[0] = { x: sx, z: sz };
    if (this.freePoint(gx, gz)) pts[pts.length - 1] = { x: gx, z: gz };       // the grid cell may be padded shut while the exact spot (a nest by a wall) is fine
    // string pulling: from each kept point, jump to the furthest later point that can be reached in a straight line
    const out = []; let a = 0;
    while (a < pts.length - 1) {
      let b = pts.length - 1;
      while (b > a + 1 && !this.segmentClear(pts[a].x, pts[a].z, pts[b].x, pts[b].z)) b--;
      out.push(pts[b]); a = b;
    }
    return out;
  }
}
