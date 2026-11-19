// Every weapon number lives here (single source of truth for client, server and bots).
// Angles are radians. Distances are metres. Times are seconds.
export const WEAPONS = {
  ar: {
    id: 'ar', name: 'AR-91', auto: true, dmg: 21, headMul: 2.0, rof: 0.095, mag: 30, reserve: 150, reload: 1.7, reloadEmpty: 2.25, chamber: true,
    range: 130, falloffStart: 35, falloffEnd: 120, minMul: 0.55, pellets: 1,
    spreadHip: 0.014, spreadAds: 0.002, bloom: 0.0035, bloomMax: 0.03,
    recoilUp: 0.0105, recoilSide: 0.0035, kick: 1.0, adsFov: 54, adsTime: 0.13, moveMul: 0.95, noise: 60, ideal: 24, recoilUp: 0.012, recoilSide: 0.0038, recoilReturn: 7.5,
  },
  smg: {
    id: 'smg', name: 'VEKTOR SMG', auto: true, dmg: 14, headMul: 1.8, rof: 0.062, mag: 36, reserve: 216, reload: 1.4, reloadEmpty: 1.9, chamber: true,
    range: 80, falloffStart: 18, falloffEnd: 65, minMul: 0.5, pellets: 1,
    spreadHip: 0.02, spreadAds: 0.005, bloom: 0.0035, bloomMax: 0.035,
    recoilUp: 0.0065, recoilSide: 0.0045, kick: 0.7, adsFov: 62, adsTime: 0.1, moveMul: 1.05, noise: 48, ideal: 13, recoilUp: 0.009, recoilSide: 0.0048, recoilReturn: 9,
  },
  shotgun: {
    id: 'shotgun', name: 'BREACH-12', auto: false, dmg: 12, headMul: 1.6, rof: 0.82, mag: 7, reserve: 42, reload: 2.3, reloadEmpty: 2.8, chamber: false,
    range: 40, falloffStart: 8, falloffEnd: 32, minMul: 0.25, pellets: 9,
    spreadHip: 0.055, spreadAds: 0.038, bloom: 0, bloomMax: 0,
    recoilUp: 0.055, recoilSide: 0.012, kick: 2.6, adsFov: 66, adsTime: 0.14, moveMul: 0.95, noise: 70, ideal: 7, recoilUp: 0.034, recoilSide: 0.012, recoilReturn: 5.5,
  },
  dmr: {
    id: 'dmr', name: 'KUDU DMR', auto: false, dmg: 64, headMul: 2.0, rof: 0.52, mag: 10, reserve: 50, reload: 2.1, reloadEmpty: 2.7, chamber: true,
    range: 220, falloffStart: 120, falloffEnd: 220, minMul: 0.8, pellets: 1,
    spreadHip: 0.03, spreadAds: 0.0006, bloom: 0.01, bloomMax: 0.04,
    recoilUp: 0.03, recoilSide: 0.006, kick: 1.9, adsFov: 28, adsTime: 0.2, moveMul: 0.85, noise: 85, ideal: 55, recoilUp: 0.028, recoilSide: 0.006, recoilReturn: 6,
  },
  lmg: {
    id: 'lmg', name: 'PKX LMG', auto: true, dmg: 19, headMul: 1.8, rof: 0.082, mag: 80, reserve: 240, reload: 3.6, reloadEmpty: 4.6, chamber: true,
    range: 130, falloffStart: 40, falloffEnd: 120, minMul: 0.55, pellets: 1,
    spreadHip: 0.02, spreadAds: 0.004, bloom: 0.003, bloomMax: 0.04,
    recoilUp: 0.009, recoilSide: 0.006, kick: 1.2, adsFov: 58, adsTime: 0.2, moveMul: 0.82, noise: 70, ideal: 28, recoilUp: 0.01, recoilSide: 0.006, recoilReturn: 7,
  },
  pistol: {
    id: 'pistol', name: 'SIDEARM', auto: false, dmg: 28, headMul: 2.2, rof: 0.18, mag: 15, reserve: 90, reload: 1.2, reloadEmpty: 1.6, chamber: true,
    range: 90, falloffStart: 25, falloffEnd: 80, minMul: 0.5, pellets: 1,
    spreadHip: 0.012, spreadAds: 0.002, bloom: 0.008, bloomMax: 0.03,
    recoilUp: 0.016, recoilSide: 0.004, kick: 1.0, adsFov: 64, adsTime: 0.09, moveMul: 1.0, noise: 40, ideal: 14, recoilUp: 0.018, recoilSide: 0.0045, recoilReturn: 10,
  },
};

export const SLOT_ORDER = ['ar', 'smg', 'shotgun', 'dmr', 'lmg', 'pistol']; // keys 1-6

/** Damage of ONE bullet/pellet at a distance. Falls off linearly between falloffStart and falloffEnd. */
export function damageAt(w, dist, head = false) {
  let mul = 1;
  if (dist > w.falloffStart) {
    const t = Math.min(1, (dist - w.falloffStart) / Math.max(1e-6, w.falloffEnd - w.falloffStart));
    mul = 1 - t * (1 - w.minMul);
  }
  return w.dmg * mul * (head ? w.headMul : 1);
}

/**
 * RELOADS (two kinds, like the real thing):
 *   tactical  - magazine still has rounds: quick swap, and the round in the chamber stays: mag + 1 (not for the pump shotgun)
 *   empty     - bolt/slide was locked back: slower, because you have to charge the weapon again
 * The animation / sound stages are fractions of the total reload time (viewmodel + audio read these).
 */
export const RELOAD_STAGES = {
  tactical: { drop: 0.28, insert: 0.68 },
  empty: { drop: 0.2, insert: 0.52, charge: 0.8 },
};
export const reloadTime = (w, ammo) => (ammo <= 0 ? (w.reloadEmpty ?? w.reload) : w.reload);
export const magCap = (w, ammo) => w.mag + (ammo > 0 && w.chamber ? 1 : 0);

/** weapon skins: GLSL materials, purely cosmetic (see render/skins.js) */
export const SKINS = ['gold', 'damascus', 'magma', 'carbon', 'reactive'];
export const skinOk = (s) => (SKINS.includes(s) ? s : null);
