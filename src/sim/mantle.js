// MANTLE: grab a ledge in front of you while airborne and pull yourself up. Pure rules over the shared map boxes (no graphics, no physics query),
// so the solo sim, the server and the browser predictor all agree on exactly where a mantle lands.
//
// Reach is measured from the player's CURRENT feet, so a standing jump (apex about 1.5 m) can top out a wall of roughly 2.2 m but not a 2.6 m
// container; a crate or a ramp to stand on is what gets you up there. Falling past a ledge and catching it works too (not when plummeting).
export const MANTLE = {
  T: 0.4,            // seconds the pull-up takes (no shooting, no steering while it plays)
  REACH: 0.95,       // metres in front of the capsule centre where the ledge must be
  DEPTH: 0.55,       // metres further in where you end up standing (must still be on top of the same box)
  EDGE: 0.15,        // keep at least this far from the far edge of the box top
  RISE_MIN: 0.15,    // the ledge top must be at least this far above the feet (smaller steps are handled by the controller's auto-step)
  RISE_MAX: 0.7,     // ...and at most this far (hands reach about feet + 0.7 at the top of the jump)
  HEAD: 1.85,        // free height needed above the ledge for the capsule
  RADIUS: 0.4,       // capsule radius
  MAX_FALL: -6,      // do not catch a ledge while falling faster than this (m/s)
  FEET: 0.9,         // capsule centre height above the feet
};

/**
 * Look for a ledge ahead of a player. `x,z` = capsule centre, `feetY` = feet height, (dx,dz) = unit direction of travel.
 * @returns {{x:number,y:number,z:number,top:number}|null} the standing spot (capsule centre) on top of the ledge, or null
 */
export function findLedge(map, x, feetY, z, dx, dz) {
  const px = x + dx * MANTLE.REACH, pz = z + dz * MANTLE.REACH;
  const lx = x + dx * (MANTLE.REACH + MANTLE.DEPTH), lz = z + dz * (MANTLE.REACH + MANTLE.DEPTH);
  let best = null;
  for (const b of map.boxes) {
    if (b.kind === 'edge') continue;                                      // the map border is never climbable
    const top = b.y + b.h / 2, rise = top - feetY;
    if (rise < MANTLE.RISE_MIN || rise > MANTLE.RISE_MAX) continue;
    if (Math.abs(px - b.x) > b.w / 2 || Math.abs(pz - b.z) > b.d / 2) continue;                       // the reach probe must touch this box
    if (Math.abs(lx - b.x) > b.w / 2 - MANTLE.EDGE || Math.abs(lz - b.z) > b.d / 2 - MANTLE.EDGE) continue;   // and the landing spot must be on top of it
    if (!best || top > best.top) best = { x: lx, z: lz, top, box: b };
  }
  if (!best) return null;
  for (const b of map.boxes) {                                            // something low overhead (a roof, a beam) blocks the landing
    if (b === best.box) continue;
    if (Math.abs(best.x - b.x) < b.w / 2 + MANTLE.RADIUS && Math.abs(best.z - b.z) < b.d / 2 + MANTLE.RADIUS
      && b.y - b.h / 2 < best.top + MANTLE.HEAD && b.y + b.h / 2 > best.top + 0.05) return null;
  }
  return { x: best.x, y: best.top + MANTLE.FEET + 0.02, z: best.z, top: best.top };
}

/** position of the climber `u` (0..1) of the way through the pull-up: up first, then over */
export function mantlePos(from, to, u) {
  const k = Math.min(1, Math.max(0, u));
  const up = Math.min(1, k * 1.7), over = Math.max(0, (k - 0.35) / 0.65);
  const e = (t) => t * t * (3 - 2 * t);
  return { x: from.x + (to.x - from.x) * e(over), y: from.y + (to.y - from.y) * e(up), z: from.z + (to.z - from.z) * e(over) };
}
