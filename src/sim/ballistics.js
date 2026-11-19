// Fixed-step ballistic integration shared by offline prediction and the authoritative server.
// Rapier remains responsible for world collision queries; this module only integrates projectile motion.
export const MAX_ACTIVE_PROJECTILES = 512;
export const PROJECTILE_MAX_AGE = 1.5;
export const PROJECTILE_GRAVITY = 9.81;

const finite = (value) => Number.isFinite(value);

export function integrateBallisticStep(projectile, dt) {
  if (!projectile || !finite(dt) || dt <= 0 || dt > 0.1) {
    throw new RangeError('Ballistic step requires a projectile and a fixed positive timestep');
  }
  const from = { x: projectile.x, y: projectile.y, z: projectile.z };
  const speed = Math.hypot(projectile.vx, projectile.vy, projectile.vz);
  const drag = Math.max(0, Math.min(0.01, Number(projectile.dragCoefficient) || 0));
  const attenuation = Math.exp(-drag * speed * dt);
  projectile.vx *= attenuation;
  projectile.vy = (projectile.vy - PROJECTILE_GRAVITY * (projectile.gravityScale ?? 1) * dt) * attenuation;
  projectile.vz *= attenuation;
  const to = {
    x: from.x + projectile.vx * dt,
    y: from.y + projectile.vy * dt,
    z: from.z + projectile.vz * dt,
  };
  const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  projectile.age = (projectile.age ?? 0) + dt;
  projectile.ageTicks = (projectile.ageTicks ?? 0) + 1;
  return { from, to, distance };
}

export function reflectBallisticVelocity(velocity, normal, speedRetention = 0.72) {
  if (!velocity || !normal || !finite(speedRetention)) throw new TypeError('Velocity, normal and speed retention are required');
  const nLength = Math.hypot(normal.x, normal.y, normal.z);
  if (!(nLength > 0)) return { x: -velocity.x, y: -velocity.y, z: -velocity.z };
  const nx = normal.x / nLength, ny = normal.y / nLength, nz = normal.z / nLength;
  const dot = velocity.x * nx + velocity.y * ny + velocity.z * nz;
  const retention = Math.max(0, Math.min(1, speedRetention));
  return {
    x: (velocity.x - 2 * dot * nx) * retention,
    y: (velocity.y - 2 * dot * ny) * retention,
    z: (velocity.z - 2 * dot * nz) * retention,
  };
}
