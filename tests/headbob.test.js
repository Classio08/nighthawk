import test from 'node:test';
import assert from 'node:assert/strict';
import { ViewMotion, BOB } from '../src/render/headbob.js';

const DT = 1 / 60;
const run = (vm, secs, s) => { let steps = 0, last = null; for (let i = 0; i < Math.round(secs / DT); i++) { last = vm.update(DT, s); if (last.stepped) steps++; } return { steps, last }; };
const walk = { speed: 6, sprinting: false, crouch: false, grounded: true, vy: -1, sliding: false, mantling: false, enabled: true };

test('headbob: steps come at the walking / sprinting / crouching cadence and only while moving on the ground', () => {
  const vm = new ViewMotion();
  assert.ok(Math.abs(run(vm, 4, walk).steps - 4 / BOB.STEP_WALK) <= 1, 'walk cadence');
  assert.ok(Math.abs(run(new ViewMotion(), 4, { ...walk, sprinting: true, speed: 9 }).steps - 4 / BOB.STEP_SPRINT) <= 1, 'sprint cadence');
  assert.ok(Math.abs(run(new ViewMotion(), 4, { ...walk, crouch: true, speed: 3 }).steps - 4 / BOB.STEP_CROUCH) <= 1, 'crouch cadence');
  assert.equal(run(new ViewMotion(), 3, { ...walk, speed: 0.5 }).steps, 0, 'standing still: silent');
  assert.equal(run(new ViewMotion(), 3, { ...walk, grounded: false }).steps, 0, 'airborne: silent');
  assert.equal(run(new ViewMotion(), 3, { ...walk, sliding: true }).steps, 0, 'sliding: no footsteps');
});

test('headbob: the eye dips and rises with each step, small and bounded; disabled means no camera offset at all (but steps still report)', () => {
  const vm = new ViewMotion(); let lo = 9, hi = -9;
  for (let i = 0; i < 240; i++) { const o = vm.update(DT, { ...walk, sprinting: true, speed: 9 }); if (i > 30) { lo = Math.min(lo, o.y); hi = Math.max(hi, o.y); } }
  assert.ok(hi - lo > 0.02 && hi - lo < 0.09, `bob range ${(hi - lo).toFixed(3)} m is noticeable but small`);
  const off = new ViewMotion(); let steps = 0;
  for (let i = 0; i < 240; i++) { const o = off.update(DT, { ...walk, sprinting: true, speed: 9, enabled: false }); steps += o.stepped ? 1 : 0; assert.deepEqual([o.y, o.roll, o.pitch, o.fov], [0, 0, 0, 0]); }
  assert.ok(steps > 5, 'audio still gets its steps with the bob off');
});

test('headbob: a hard landing dips the view and recovers; a normal jump landing does not', () => {
  const vm = new ViewMotion(); run(vm, 0.5, { ...walk, speed: 0 });
  run(vm, 0.2, { ...walk, speed: 0, grounded: false, vy: -14 });
  const hit = vm.update(DT, { ...walk, speed: 0, grounded: true, vy: -1 });
  assert.ok(hit.landed > 0.4, `landed strength ${hit.landed.toFixed(2)}`); assert.ok(hit.y < -0.1, `eyes dipped ${hit.y.toFixed(3)}`);
  const later = run(vm, 1.2, { ...walk, speed: 0 }).last; assert.ok(Math.abs(later.y) < 0.01, 'and the eyes come back up');
  const vm2 = new ViewMotion(); run(vm2, 0.3, { ...walk, speed: 0 });
  run(vm2, 0.3, { ...walk, speed: 0, grounded: false, vy: -8.2 });                  // an ordinary jump lands at about 8 m/s
  const soft = vm2.update(DT, { ...walk, speed: 0, grounded: true, vy: -1 });
  assert.equal(soft.landed, 0); assert.ok(soft.y > -0.02, 'no dip for a normal jump');
});

test('headbob: slide tilts and widens the view, mantle looks up, both ease back to zero', () => {
  const vm = new ViewMotion();
  const s = run(vm, 0.4, { ...walk, sliding: true, speed: 8, crouch: true }).last;
  assert.ok(s.roll > BOB.SLIDE_ROLL * 0.8 && s.fov > BOB.SLIDE_FOV * 0.8, 'slide tilt + fov');
  const back = run(vm, 1, walk).last; assert.ok(Math.abs(back.fov) < 0.05);
  const m = run(new ViewMotion(), 0.4, { ...walk, mantling: true, grounded: false, vy: 0, speed: 1 }).last;
  assert.ok(m.pitch > BOB.MANTLE_PITCH * 0.8, 'mantle: looking up at the ledge');
});
