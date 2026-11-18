// Camera convention (three.js): at yaw = 0 the player looks down -Z.
// Positive yaw turns the view to the LEFT. Moving the mouse right therefore DEcreases yaw.
//
// This tiny function is the one that was wrong in the old v0.2 build (A and D were mirrored).
// It is unit-tested in tests/move.test.js so that bug can never come back.
export function moveVector(yaw, forward, strafe) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw); // where the player looks
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);  // the player's right-hand side
  let x = fx * forward + rx * strafe;
  let z = fz * forward + rz * strafe;
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; } // no faster diagonals
  return { x, z };
}
