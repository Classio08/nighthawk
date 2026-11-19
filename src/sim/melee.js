// MELEE: a quick close-quarters strike (B). Server-authoritative like everything else: the swing is a one-shot cmd flag, the target is picked here
// (lag-compensated like bullets), and the result is an ordinary damage() call. From behind it is a kill outright; head on it is a hard shove-and-hit.
// Pure rules, no graphics: shared by solo, the server (the predictor only plays the swing, it never decides who got hit) and the bots.
export const MELEE = {
  REACH: 2.2,        // metres from my centre to theirs (the target's body adds a bit more)
  CONE: 0.55,        // cos of the half-angle in front of me that counts (about 57 degrees)
  COOLDOWN: 0.85,    // seconds between swings
  FRONT: 48,         // damage head on
  BACK: 230,         // damage from behind: more than any fighter can have, so it is a kill
  BACK_DOT: -0.3,    // the target counts as "facing away" when his forward vector points away from me by at least this much
  NOISE: 5,          // metres: a knife is quiet (a rifle is 60+)
  VERT: 1.3,         // maximum height difference
};

/** one swing by `f`. Returns true if the swing happened (cooldown started), whether or not it hit anybody. */
export function meleeSwing(sim, f) {
  if (!f.alive || f.air || f.veh || f.meleeT > 0) return false;
  f.meleeT = MELEE.COOLDOWN; f.healT = 0;
  const e = { t: 'melee', by: f.id, hit: -1, back: false };
  if (!sim.opts.predictor) {
    const fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw);                 // yaw 0 faces -z
    const viewTick = sim.tick - (f.lagTicks | 0);
    let best = null, bestD = Infinity;
    for (const o of sim.fighters) {
      if (o === f || !o.alive || o.air || o.veh) continue;
      const q = sim.posAt(o, viewTick);
      if (!q.alive) continue;
      const dx = q.x - f.x, dz = q.z - f.z, d = Math.hypot(dx, dz);
      if (d > MELEE.REACH + 0.4 || Math.abs(q.y - f.y) > MELEE.VERT) continue;
      if (d > 0.6 && (dx * fx + dz * fz) / d < MELEE.CONE) continue;     // not in front of me
      if (!sim.losClear(f.x, f.eyeY, f.z, q.x, q.y + 0.2, q.z)) continue; // a wall between us
      if (d < bestD) { bestD = d; best = { o, q, dx, dz, d }; }
    }
    if (best) {
      const { o, q, dx, dz, d } = best, tfx = -Math.sin(o.yaw), tfz = -Math.cos(o.yaw);
      const toMeX = d > 1e-6 ? -dx / d : 0, toMeZ = d > 1e-6 ? -dz / d : 0;            // from him to me
      const back = tfx * toMeX + tfz * toMeZ < MELEE.BACK_DOT;                        // his face points away from me
      e.hit = o.id; e.back = back;
      sim.emit(e);                                                                     // (before the damage, so the swing shows before the kill feed)
      sim.damage(o, back ? MELEE.BACK : MELEE.FRONT, f, { head: false, w: 'melee', cause: 'melee', dx: fx, dy: 0.1, dz: fz, x: q.x, y: q.y + 0.2, z: q.z });
      sim.makeNoise(f, MELEE.NOISE);
      return true;
    }
  }
  sim.emit(e);
  sim.makeNoise(f, MELEE.NOISE);
  return true;
}
