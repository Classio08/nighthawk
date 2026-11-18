// Deterministic local sweep points for garrison search behaviour.
export function searchWaypoint(anchor, index, radius = 5.5) {
  const i = Math.max(0, Math.floor(index));
  const ring = Math.floor(i / 8);
  const angle = (i % 8) * (Math.PI / 4) + Math.PI / 8;
  const r = radius * (1 + ring * 0.55);
  return { x: anchor.x + Math.cos(angle) * r, z: anchor.z + Math.sin(angle) * r };
}
