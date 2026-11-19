// Shared physical response curves for the authoritative Rapier simulation.
// This is a rules module, not a second physics engine. World integration stays in src/sim/world.js.
export const MATERIALS = Object.freeze({
  sand: Object.freeze({ density: 1600, friction: 1.2, restitution: 0.02, bullet: 'stop', penetration: 0, ricochet: 0, thickness: 0, impact: 'dust', cover: 0.08, sound: 0.65 }),
  flesh: Object.freeze({ density: 1050, friction: 0.6, restitution: 0.1, bullet: 'stop', penetration: 0, ricochet: 0, thickness: 0, impact: 'blood', cover: 0, sound: 0.8 }),
  wood: Object.freeze({ density: 600, friction: 0.7, restitution: 0.3, bullet: 'penetrate', penetration: 0.62, ricochet: 0, thickness: 0.42, impact: 'splinter', cover: 0.2, sound: 0.72 }),
  glass: Object.freeze({ density: 2500, friction: 0.2, restitution: 0.1, bullet: 'penetrate', penetration: 0.82, ricochet: 0, thickness: 0.08, impact: 'shatter', cover: 0.04, sound: 0.9 }),
  metal: Object.freeze({ density: 7800, friction: 0.4, restitution: 0.5, bullet: 'ricochet', penetration: 0, ricochet: 0.2, thickness: 0, impact: 'spark', cover: 0.6, sound: 1 }),
  concrete: Object.freeze({ density: 2400, friction: 0.9, restitution: 0.08, bullet: 'stop', penetration: 0, ricochet: 0.03, thickness: 0, impact: 'dust', cover: 0.8, sound: 0.92 }),
  rock: Object.freeze({ density: 2700, friction: 0.95, restitution: 0.06, bullet: 'stop', penetration: 0, ricochet: 0.02, thickness: 0, impact: 'dust', cover: 0.82, sound: 0.88 }),
  water: Object.freeze({ density: 1000, friction: 1.8, restitution: 0, bullet: 'slow', penetration: 0.4, ricochet: 0, thickness: 0, impact: 'splash', cover: 0, sound: 0.5 }),
  armor: Object.freeze({ density: 7800, friction: 0.4, restitution: 0.3, bullet: 'stop', penetration: 0, ricochet: 0.12, thickness: 0, impact: 'spark', cover: 0.9, sound: 1 }),
});

const MAP_SURFACE = Object.freeze({
  ground: 'sand',
  block: 'concrete',
  'poi-building': 'concrete',
  'poi-wall': 'concrete',
  wall: 'concrete',
  edge: 'concrete',
  container: 'metal',
  'poi-container': 'metal',
  'poi-fence': 'metal',
  'poi-mast': 'metal',
  'poi-rock': 'rock',
  crates: 'wood',
});

export function materialForMapKind(kind) { return MAP_SURFACE[kind] ?? 'concrete'; }
export function materialForPropKind(kind) {
  if (kind === 'barrel' || kind === 'vehicle') return 'metal';
  if (kind === 'glass') return 'glass';
  if (kind === 'sandbag' || kind === 'terrain') return 'sand';
  if (kind === 'crate' || kind === 'wood') return 'wood';
  return 'concrete';
}

export function surfaceImpact(material, roll = 1) {
  const profile = MATERIALS[material] ?? MATERIALS.concrete;
  const value = Number.isFinite(roll) ? Math.max(0, Math.min(0.999999, roll)) : 1;
  if (profile.ricochet > 0 && value < profile.ricochet) {
    return { kind: 'ricochet', material, effect: profile.impact, damageMultiplier: 0.28, thickness: 0, penetrates: false };
  }
  if (profile.penetration > 0) {
    return { kind: 'penetration', material, effect: profile.impact, damageMultiplier: profile.penetration, thickness: profile.thickness, penetrates: true };
  }
  return { kind: 'stop', material, effect: profile.impact, damageMultiplier: 0, thickness: 0, penetrates: false };
}

export function classifyHitZone(hitY, feetY, crouched = false) {
  const height = crouched ? 1.12 : 1.8;
  const relative = (hitY - feetY) / height;
  if (relative >= 0.82) return 'head';
  if (relative <= 0.36) return 'leg';
  return 'torso';
}

export function hitZoneMultiplier(zone) {
  return zone === 'leg' ? 0.72 : zone === 'arm' ? 0.78 : 1;
}

export function blastImpulse(distance, radius, power, dx, dy, dz, mass = 20, upBias = 0.6) {
  if (!(radius > 0) || !(distance < radius) || !(power > 0)) return { x: 0, y: 0, z: 0, strength: 0 };
  const length = Math.hypot(dx, dy, dz) || 1;
  const falloff = (1 - Math.max(0, distance) / radius) ** 2;
  const strength = Math.min(420, power * falloff);
  const inverseMassScale = Math.max(0.2, Math.min(4, 20 / Math.max(1, mass)));
  const impulse = strength * inverseMassScale;
  return {
    x: dx / length * impulse,
    y: (dy / length + upBias) * impulse,
    z: dz / length * impulse,
    strength: impulse,
  };
}

export function projectileDrop(distance, speed, gravity = 9.81) {
  if (!(distance > 0) || !(speed > 0) || !(gravity > 0)) return 0;
  const travelTime = distance / speed;
  return 0.5 * gravity * travelTime * travelTime;
}

export const gunshotDelay = (distance, speedOfSound = 343) =>
  speedOfSound > 0 ? Math.max(0, distance) / speedOfSound : 0;

export function hitPushImpulse(damage, direction, zone = 'torso') {
  const scale = zone === 'head' ? 0.018 : zone === 'leg' ? 0.012 : 0.02;
  const magnitude = Math.max(0, Math.min(1.8, damage * scale));
  return {
    x: (Number(direction?.x) || 0) * magnitude,
    z: (Number(direction?.z) || 0) * magnitude,
    magnitude,
  };
}
