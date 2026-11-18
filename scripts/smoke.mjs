// Headless check that the three engine libraries really do what the plan says they do.
// Run with:  npm run smoke
import RAPIER from '@dimforge/rapier3d-compat';
import * as YUKA from 'yuka';

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) failed++; };

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -22, z: 0 });
world.timestep = 1 / 60;
world.createCollider(RAPIER.ColliderDesc.cuboid(100, 0.5, 100).setTranslation(0, -0.5, 0));

// 1. a bouncing grenade-like ball falls, bounces, then comes to rest on the ground
const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 6, 0));
world.createCollider(RAPIER.ColliderDesc.ball(0.15).setRestitution(0.55).setFriction(0.6), ball);
let minY = 99, bounced = false, prevVy = 0;
for (let i = 0; i < 60 * 6; i++) {
  world.step();
  const v = ball.linvel(); if (prevVy < -1 && v.y > 0.5) bounced = true; prevVy = v.y;
  minY = Math.min(minY, ball.translation().y);
}
check('physics: ball bounces', bounced);
check('physics: ball rests on the ground (y ~ 0.15)', Math.abs(ball.translation().y - 0.15) < 0.05, `y=${ball.translation().y.toFixed(3)}`);

// 2. character controller walks on flat ground, is grounded, and is blocked by a wall
const wall = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 2, -6));
world.createCollider(RAPIER.ColliderDesc.cuboid(5, 2, 0.5), wall);
const pBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1.0, 0));
const pCol = world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.4), pBody);
const cc = world.createCharacterController(0.02);
cc.enableAutostep(0.45, 0.2, true); cc.enableSnapToGround(0.3);
let grounded = false, vy = 0;
for (let i = 0; i < 60 * 3; i++) {
  vy += -22 / 60; if (grounded && vy < 0) vy = 0;
  cc.computeColliderMovement(pCol, { x: 0, y: vy / 60, z: -7 / 60 }); // walk toward -Z (the wall)
  const m = cc.computedMovement(); grounded = cc.computedGrounded();
  const t = pBody.translation(); pBody.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
  world.step();
}
const pz = pBody.translation().z;
check('character: stands on ground', grounded);
check('character: stopped by the wall (z ~ -5.1)', pz < -4.5 && pz > -5.6, `z=${pz.toFixed(2)}`);

// 3. hitscan raycast hits a bot collider and reports distance
const bot = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(20, 0.9, 0));
const botCol = world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.4), bot);
world.step();
const hit = world.castRay(new RAPIER.Ray({ x: 0, y: 1.0, z: 0 }, { x: 1, y: 0, z: 0 }), 100, true, undefined, undefined, pCol);
check('raycast: hits the bot', hit && hit.collider.handle === botCol.handle, hit ? `toi=${hit.timeOfImpact.toFixed(2)}` : 'no hit');
check('raycast: distance is right (~19.6)', hit && Math.abs(hit.timeOfImpact - 19.6) < 0.2);

// 4. Yuka: a state machine switches from wander to chase and the bot closes the distance
const target = new YUKA.Vector3(30, 0, 0);
class Wander extends YUKA.State {
  enter(o) { o.steering.clear(); o.steering.add(new YUKA.WanderBehavior()); }
  execute(o) { if (o.position.distanceTo(target) < 100) o.stateMachine.changeTo('chase'); }
}
class Chase extends YUKA.State {
  enter(o) { o.steering.clear(); o.steering.add(new YUKA.SeekBehavior(target)); o.chasing = true; }
}
const v = new YUKA.Vehicle(); v.maxSpeed = 4;
v.stateMachine = new YUKA.StateMachine(v);
v.stateMachine.add('wander', new Wander()); v.stateMachine.add('chase', new Chase()); v.stateMachine.changeTo('wander');
const em = new YUKA.EntityManager(); em.add(v);
const d0 = v.position.distanceTo(target);
for (let i = 0; i < 60 * 5; i++) { em.update(1 / 60); v.stateMachine.update(); }
check('ai: state machine reached chase', v.chasing === true);
check('ai: bot closed the distance', v.position.distanceTo(target) < d0 - 10, `${d0.toFixed(1)} -> ${v.position.distanceTo(target).toFixed(1)}`);

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll engine checks passed');
process.exit(failed ? 1 : 0);
