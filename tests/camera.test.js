import test from 'node:test';
import assert from 'node:assert/strict';
import { thirdPersonCameraPosition } from '../src/render/camera.js';

const player = { x: 0, y: 0.9, z: 0 };

test('third-person camera sits behind the player when the boom is clear', () => {
  const p = thirdPersonCameraPosition(player, 0, { boxes: [] });
  assert.ok(p.z > 4.4 && p.z < 4.8);
  assert.ok(p.y > player.y + 2);
});

test('third-person camera pulls in before crossing a solid wall', () => {
  const map = { boxes: [{ kind: 'block', x: 0.55, y: 2.5, z: 2.5, w: 3, h: 5, d: 0.6 }] };
  const p = thirdPersonCameraPosition(player, 0, map);
  assert.ok(p.z < 2.5, `camera should pull in before wall, got z=${p.z}`);
});

test('third-person camera can rise above low cover without unnecessary pull-in', () => {
  const map = { boxes: [{ kind: 'poi-fence', x: 0.55, y: 0.65, z: 2.5, w: 3, h: 1.3, d: 0.7 }] };
  const p = thirdPersonCameraPosition(player, 0, map);
  assert.ok(p.z > 4.4, `camera should clear low fence, got z=${p.z}`);
});

test('third-person camera ignores obstacles beyond its desired endpoint', () => {
  const map = { boxes: [{ kind: 'block', x: 0.55, y: 2.5, z: 8, w: 3, h: 5, d: 1 }] };
  const p = thirdPersonCameraPosition(player, 0, map);
  assert.ok(p.z > 4.4);
});
