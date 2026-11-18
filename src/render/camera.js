// Pure third-person camera placement. Keeps the shoulder camera out of solid map geometry.
export function thirdPersonCameraPosition(player, yaw, map, distance = 4.6, shoulder = 0.55) {
  const originY = player.y + 1.25;
  const dx = Math.sin(yaw) * distance + Math.cos(yaw) * shoulder;
  const dz = Math.cos(yaw) * distance - Math.sin(yaw) * shoulder;
  let scale = 1;

  // Sample the camera boom from the player's upper body to the desired camera point.
  // A short pull-in is preferable to allowing the camera to pass through a wall.
  for (let i = 1; i <= 20; i++) {
    const t = i / 20;
    const x = player.x + dx * t;
    const y = originY + 0.8 * t;
    const z = player.z + dz * t;
    const blocked = (map?.boxes ?? []).some((b) =>
      x > b.x - b.w / 2 - 0.12 && x < b.x + b.w / 2 + 0.12 &&
      z > b.z - b.d / 2 - 0.12 && z < b.z + b.d / 2 + 0.12 &&
      y > b.y - b.h / 2 - 0.12 && y < b.y + b.h / 2 + 0.12
    );
    if (blocked) {
      scale = Math.max(0.18, (i - 1) / 20);
      break;
    }
  }

  return {
    x: player.x + dx * scale,
    y: player.y + 2.05,
    z: player.z + dz * scale,
  };
}
