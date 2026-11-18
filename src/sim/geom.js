// Tiny pure-maths helpers (no physics engine, no graphics). Used for lag-compensated bullet hits.

/** Distance along a ray to a sphere, or -1 (ray origin o, UNIT direction d). */
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const px = ox - cx, py = oy - cy, pz = oz - cz;
  const b = px * dx + py * dy + pz * dz, c = px * px + py * py + pz * pz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc), t = -b - s;
  if (t >= 0) return t;
  return -b + s >= 0 ? 0 : -1;               // origin is inside the sphere
}

/**
 * Distance along a ray to a VERTICAL capsule: axis from (cx,y0,cz) up to (cx,y1,cz), radius r. Returns -1 for a miss.
 * This is exactly the shape of a fighter's physics capsule, so hits feel fair.
 */
export function rayCapsule(ox, oy, oz, dx, dy, dz, cx, y0, cz, y1, r) {
  let best = -1;
  const take = (t) => { if (t >= 0 && (best < 0 || t < best)) best = t; };
  // 1) the straight side (an infinite vertical cylinder, then clip by height)
  const a = dx * dx + dz * dz, px = ox - cx, pz = oz - cz;
  if (a > 1e-9) {
    const b = px * dx + pz * dz, c = px * px + pz * pz - r * r, disc = b * b - a * c;
    if (disc >= 0) {
      const s = Math.sqrt(disc), t = (-b - s) / a;
      if (t >= 0) { const y = oy + dy * t; if (y >= y0 && y <= y1) take(t); }
      else if (c <= 0) { const y = oy; if (y >= y0 && y <= y1) take(0); }   // started inside the cylinder
    }
  }
  // 2) the two rounded ends
  take(raySphere(ox, oy, oz, dx, dy, dz, cx, y0, cz, r));
  take(raySphere(ox, oy, oz, dx, dy, dz, cx, y1, cz, r));
  return best;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
