// SMOKE GRENADES: a canister is thrown like a grenade, pops after a short fuse and leaves a cloud that blocks LINE OF SIGHT (not bullets) for ~16 s.
// Bots lose sight of anything on the other side; the browser draws the cloud (render/smoke-view.js). Pure rules: shared by solo, server and predictor.
export const SMOKE = {
  FUSE: 1.5,         // seconds from the throw to the pop
  R: 7.5,            // final radius of the cloud (m)
  GROW: 1.8,         // seconds to reach full size
  LIFE: 16,          // total lifetime; the cloud thins out over the last FADE seconds and no longer blocks sight after that
  FADE: 3.5,
  MAX_CLOUDS: 8,     // hard cap (oldest is dropped) so a spammer cannot flood snapshots
};

/** radius of a cloud that is `age` seconds old (0 once it has thinned out) */
export function smokeRadius(age) {
  if (age < 0 || age >= SMOKE.LIFE - SMOKE.FADE * 0.35) return 0;
  const k = Math.min(1, age / SMOKE.GROW);
  const fade = age > SMOKE.LIFE - SMOKE.FADE ? Math.max(0, (SMOKE.LIFE - age) / SMOKE.FADE) : 1;
  return SMOKE.R * (0.3 + 0.7 * (1 - (1 - k) * (1 - k))) * (0.55 + 0.45 * fade);
}

/** a cloud is a sphere centred a little above the ground */
export function popSmoke(sim, x, y, z, owner = null) {
  sim.smokes.push({ x, y: Math.max(1.2, y), z, age: 0, owner: owner ? owner.id : -1 });
  if (sim.smokes.length > SMOKE.MAX_CLOUDS) sim.smokes.shift();
  sim.emit({ t: 'smoke', x, y, z, by: owner ? owner.id : -1 });
}

export function updateSmokes(sim, dt) {
  for (let i = sim.smokes.length - 1; i >= 0; i--) { const s = sim.smokes[i]; s.age += dt; if (s.age >= SMOKE.LIFE) sim.smokes.splice(i, 1); }
}

/** does the straight line a -> b pass through a cloud? (an end point deep inside a cloud counts too: you cannot see out of it) */
export function smokeBlocks(smokes, ax, ay, az, bx, by, bz) {
  if (!smokes || smokes.length === 0) return false;
  const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy + dz * dz;
  for (const s of smokes) {
    const r = smokeRadius(s.age) * 0.9;           // the thin edge of the puff does not block
    if (r <= 0.5) continue;
    let t = L2 > 1e-9 ? ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t - s.x, py = ay + dy * t - s.y, pz = az + dz * t - s.z;
    if (px * px + py * py + pz * pz < r * r) return true;
  }
  return false;
}
