import test from 'node:test';
import assert from 'node:assert/strict';
import { initPhysics } from '../src/sim/world.js';
import { buildMap } from '../src/sim/map.js';
import { RagdollWorld, RIG } from '../src/render/ragdoll.js';

test('ragdoll: falls, stays together, settles on the ground, never NaN', async () => {
  await initPhysics();
  const rw = new RagdollWorld(buildMap(7), { max: 10, life: 9 });
  const rag = rw.spawn({ x: 0, y: 0, z: 0, yaw: 0.7, vx: 1, vz: -2, dx: 0, dy: 0.1, dz: -1, power: 1.5, head: true });
  for (let i = 0; i < 60 * 6; i++) {
    rw.update(1 / 60);
    for (const b of Object.values(rag.parts)) {
      const t = b.translation();
      assert.ok(Number.isFinite(t.x + t.y + t.z), 'finite');
      assert.ok(t.y > -0.05, `part under the ground: y=${t.y}`);
    }
  }
  // limbs are still attached to the torso (joint did not explode)
  const T = rag.parts.torso.translation();
  for (const name of ['head', 'armL', 'armR', 'legL', 'legR']) {
    const p = rag.parts[name].translation();
    assert.ok(Math.hypot(p.x - T.x, p.y - T.y, p.z - T.z) < 1.3, `${name} drifted away`);
  }
  // settled: slow
  for (const b of Object.values(rag.parts)) { const v = b.linvel(); assert.ok(Math.hypot(v.x, v.y, v.z) < 1.5, 'still moving fast after 6 s'); }
  assert.equal(Object.keys(RIG).length, 6);
  rw.clear();
});

test('ragdoll: capped at max, oldest removed; expire after their life', async () => {
  await initPhysics();
  const rw = new RagdollWorld(buildMap(7), { max: 3, life: 1 });
  for (let i = 0; i < 6; i++) rw.spawn({ x: i * 3, y: 0, z: 0, yaw: 0, dx: 1, dy: 0, dz: 0, power: 1 });
  assert.equal(rw.list.length, 3);
  for (let i = 0; i < 90; i++) rw.update(1 / 60);
  assert.equal(rw.list.length, 0);
});
