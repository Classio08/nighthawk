// SUPPRESSION: a bullet that cracks past your head should rattle you even when it misses. Client-only juice (camera shake, screen edge
// darkening, a whizz sound); the server and the sim never see it and it changes no damage, so it cannot desync anything.

export const SUPPRESS_R = 1.7;                         // metres: bullets passing closer than this suppress you
export const SUPPRESS_MIN = 0.3;                       // ...but closer than this it is basically a hit, which already has its own feedback

/**
 * Strength 0..1 of the suppression a shot causes at `eye`, or 0 when it does not pass close enough.
 * The shot is the segment (ox,oy,oz) -> (ex,ey,ez), where it started and where it ended (a wall or a body, or max range).
 * It only counts when the bullet travelled PAST the eye: a shot that ended short of you (hit a wall in front) is not a near miss.
 */
export function suppression(ox, oy, oz, ex, ey, ez, eyeX, eyeY, eyeZ) {
  const dx = ex - ox, dy = ey - oy, dz = ez - oz, len2 = dx * dx + dy * dy + dz * dz;
  if (len2 < 1e-6) return 0;
  const t = ((eyeX - ox) * dx + (eyeY - oy) * dy + (eyeZ - oz) * dz) / len2;
  if (t <= 0.02 || t >= 0.995) return 0;                // behind the muzzle, or the bullet never got that far
  const cx = ox + dx * t - eyeX, cy = oy + dy * t - eyeY, cz = oz + dz * t - eyeZ, d = Math.hypot(cx, cy, cz);
  if (d >= SUPPRESS_R || d < SUPPRESS_MIN) return 0;
  if (Math.hypot(eyeX - ox, eyeY - oy, eyeZ - oz) < 3) return 0;   // point blank: the muzzle flash is the story, not a whizz
  return 1 - d / SUPPRESS_R;
}
