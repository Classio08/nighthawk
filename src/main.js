// NIGHTHAWK - technology proof.
// Goal of this file: prove the whole stack works together, in one small readable place:
//   three.js  = what you SEE        (rendering)
//   Rapier    = what is SOLID       (physics, character controller, raycast shooting)
//   Yuka      = what bots THINK     (state machine + steering)
// The real game will split this into modules (see docs/ROADMAP.md).
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import * as YUKA from 'yuka';
import { Input } from './input/input.js';
import { moveVector } from './input/move.js';

const GRAV = -22, SPEED = 7, SPRINT = 1.55, JUMP = 8.5, STEP = 1 / 60;
const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);

async function main() {
  await RAPIER.init();

  /* ---------- three.js ---------- */
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcdbf9d);
  scene.fog = new THREE.Fog(0xcdbf9d, 40, 230);
  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 500);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x8a7752, 1.0));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.3);
  sun.position.set(60, 100, 30);
  scene.add(sun);
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize); resize();

  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });

  /* ---------- physics world ---------- */
  const world = new RAPIER.World({ x: 0, y: GRAV, z: 0 });
  world.timestep = STEP;

  // ground (visual + solid)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(0xc4ab76));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setTranslation(0, -0.5, 0));

  // static buildings/cover (also registered as obstacles for the bots' steering)
  const obstacles = [];
  const addWall = (x, z, w, h, d, color) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, h / 2, z); scene.add(m);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, h / 2, z));
    world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2), body);
    const ob = new YUKA.GameEntity();
    ob.position.set(x, 0, z); ob.boundingRadius = Math.hypot(w, d) / 2 + 0.5;
    obstacles.push(ob);
  };
  const cols = [0x8d9aa8, 0xa2764f, 0x7f8c6b, 0xb7a98a];
  for (let i = 0; i < 16; i++) {
    const x = rnd(-80, 80), z = rnd(-80, 60);
    if (Math.hypot(x, z - 8) < 14) continue;
    addWall(x, z, rnd(5, 14), rnd(3, 9), rnd(5, 14), cols[i % 4]);
  }

  // dynamic crates: shove them, shoot them, blow them up
  const crates = [];
  const addCrate = (x, y, z) => {
    const s = 1.2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat(0x8b6a3f));
    scene.add(m);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z));
    world.createCollider(RAPIER.ColliderDesc.cuboid(s / 2, s / 2, s / 2).setRestitution(0.1).setFriction(0.8).setDensity(0.6), body);
    crates.push({ body, mesh: m });
  };
  for (let row = 0; row < 4; row++)
    for (let i = 0; i < 4 - row; i++) addCrate(-4 + i * 1.3 + row * 0.65, 0.61 + row * 1.22, -6);

  /* ---------- player: kinematic capsule + Rapier character controller ---------- */
  const pBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1.0, 8));
  const pCol = world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.4), pBody); // 1.8 m tall
  const cc = world.createCharacterController(0.02);
  cc.enableAutostep(0.45, 0.2, true);
  cc.enableSnapToGround(0.3);
  cc.setApplyImpulsesToDynamicBodies(true);
  let yaw = 0, pitch = 0, vy = 0, grounded = false;

  // first-person gun (viewmodel) glued to the camera
  const gun = new THREE.Group();
  const gm = mat(0x1a1d24);
  const part = (w, h, d, x, y, z, m = gm) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); gun.add(b); return b; };
  part(0.07, 0.1, 0.5, 0, 0, 0); part(0.04, 0.04, 0.32, 0, 0.02, -0.4, mat(0x2d323b)); part(0.05, 0.16, 0.08, 0, -0.12, 0.08); part(0.06, 0.12, 0.2, 0, -0.03, 0.3);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffdd88 }));
  flash.position.set(0, 0.02, -0.62); flash.visible = false; gun.add(flash);
  gun.scale.setScalar(0.6);
  gun.position.set(0.2, -0.17, -0.5);
  camera.add(gun);

  /* ---------- bots: Yuka brain + Rapier body ---------- */
  const botByHandle = new Map();
  const target = new YUKA.Vector3(); // always = player position
  const ctx = { obstacles, target };

  class Wander extends YUKA.State {
    enter(o) { o.steering.clear(); o.steering.add(new YUKA.WanderBehavior(1.5, 8, 2)); o.steering.add(new YUKA.ObstacleAvoidanceBehavior(ctx.obstacles)); o.maxSpeed = 2.2; }
    execute(o) { if (o.position.distanceTo(ctx.target) < 28) o.stateMachine.changeTo('chase'); }
  }
  class Chase extends YUKA.State {
    enter(o) { o.steering.clear(); o.steering.add(new YUKA.SeekBehavior(ctx.target)); o.steering.add(new YUKA.ObstacleAvoidanceBehavior(ctx.obstacles)); }
    execute(o) {
      const d = o.position.distanceTo(ctx.target);
      o.maxSpeed = d < 7 ? 0.6 : 3.8;
      if (d > 40) o.stateMachine.changeTo('wander');
    }
  }
  class Bot extends YUKA.Vehicle {
    constructor() {
      super();
      this.maxSpeed = 2.2; this.boundingRadius = 0.6; this.hp = 100;
      this.stateMachine = new YUKA.StateMachine(this);
      this.stateMachine.add('wander', new Wander());
      this.stateMachine.add('chase', new Chase());
      this.stateMachine.changeTo('wander');
    }
    update(delta) { super.update(delta); this.stateMachine.update(); this.position.y = 0.9; this.velocity.y = 0; return this; }
  }

  const entities = new YUKA.EntityManager();
  const bots = [];
  const botGeo = [new THREE.BoxGeometry(0.7, 1.0, 0.45), new THREE.SphereGeometry(0.28, 10, 8)];
  const spawnBot = (b) => {
    b.position.set(rnd(-60, 60), 0.9, rnd(-60, 20));
    if (b.position.distanceTo(target) < 25) b.position.x += 40;
    b.hp = 100;
  };
  for (let i = 0; i < 8; i++) {
    const b = new Bot(); spawnBot(b);
    b.mesh = new THREE.Group();
    const body = new THREE.Mesh(botGeo[0], mat(0xb85c5c)); body.position.y = -0.05;
    const head = new THREE.Mesh(botGeo[1], mat(0xd9c3a0)); head.position.y = 0.72;
    b.mesh.add(body, head); b.bodyMat = body.material; scene.add(b.mesh);
    b.rb = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(b.position.x, 0.9, b.position.z));
    const col = world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.4), b.rb);
    botByHandle.set(col.handle, b);
    entities.add(b); bots.push(b);
  }

  /* ---------- shooting (hitscan via Rapier raycast), grenades, effects ---------- */
  const input = new Input(canvas);
  let kills = 0, fireT = 0, kick = 0, flashT = 0, resetT = 0;
  const tracers = [], grenades = [], booms = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8 });
  const dir = new THREE.Vector3(), org = new THREE.Vector3();

  const killBot = (b) => { kills++; spawnBot(b); };
  const hurtBot = (b, dmg) => {
    b.hp -= dmg; b.bodyMat.emissive.setScalar(0.8); b.flashT = 0.1;
    if (b.hp <= 0) killBot(b);
  };

  function shoot() {
    camera.getWorldDirection(dir);
    org.copy(camera.position);
    const spread = 0.004;
    dir.x += rnd(-spread, spread); dir.y += rnd(-spread, spread); dir.z += rnd(-spread, spread); dir.normalize();
    const hit = world.castRay(new RAPIER.Ray(org, dir), 250, true, undefined, undefined, pCol);
    const t = hit ? hit.timeOfImpact : 250;
    const end = org.clone().addScaledVector(dir, t);
    if (hit) {
      const bot = botByHandle.get(hit.collider.handle);
      if (bot) hurtBot(bot, 34);
      const rb = hit.collider.parent();
      if (rb && rb.isDynamic()) rb.applyImpulseAtPoint({ x: dir.x * 4, y: dir.y * 4, z: dir.z * 4 }, end, true);
    }
    const start = org.clone().addScaledVector(dir, 0.8).add(new THREE.Vector3(0.1, -0.12, 0).applyQuaternion(camera.quaternion));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), tracerMat);
    scene.add(line); tracers.push({ line, life: 0.06 });
    kick = 1; flashT = 0.04;
  }

  function throwGrenade() {
    camera.getWorldDirection(dir);
    const p = camera.position;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mat(0x2c3a2a));
    scene.add(m);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x + dir.x, p.y + dir.y, p.z + dir.z).setLinvel(dir.x * 15, dir.y * 15 + 4, dir.z * 15));
    world.createCollider(RAPIER.ColliderDesc.ball(0.15).setRestitution(0.55).setFriction(0.6), body);
    grenades.push({ body, mesh: m, t: 0 });
  }

  function explode(pos) {
    const R = 9;
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9 }));
    m.position.set(pos.x, pos.y, pos.z); scene.add(m); booms.push({ m, life: 0.35 });
    for (const c of crates) {
      const q = c.body.translation(), dx = q.x - pos.x, dy = q.y - pos.y, dz = q.z - pos.z, d = Math.hypot(dx, dy, dz) || 1;
      if (d < R) { const k = 14 * (1 - d / R); c.body.applyImpulse({ x: dx / d * k, y: dy / d * k + k * 0.6, z: dz / d * k }, true); }
    }
    for (const b of bots) {
      const d = Math.hypot(b.position.x - pos.x, b.position.z - pos.z);
      if (d < R) hurtBot(b, 110 * (1 - d / R));
    }
  }

  function resetScene() { // R key: put everything back
    pBody.setTranslation({ x: 0, y: 1.0, z: 8 }, true); vy = 0; yaw = 0; pitch = 0;
    crates.forEach((c, i) => c.body.setTranslation({ x: -4 + (i % 4) * 1.3, y: 0.7 + Math.floor(i / 4) * 1.3, z: -6 }, true));
    bots.forEach(spawnBot);
  }

  /* ---------- main loop: fixed physics step + smooth rendering ---------- */
  let acc = 0, last = performance.now(), fpsT = 0, fpsN = 0;
  const time = new YUKA.Time();

  function step() {
    const mv = moveVector(yaw, input.readMove().forward, input.readMove().strafe);
    const im = input.readMove();
    const sp = SPEED * (im.sprint ? SPRINT : 1);
    if (grounded && im.jump) vy = JUMP;
    vy += GRAV * STEP;
    if (grounded && vy < 0) vy = 0;
    cc.computeColliderMovement(pCol, { x: mv.x * sp * STEP, y: vy * STEP, z: mv.z * sp * STEP });
    const m = cc.computedMovement(); grounded = cc.computedGrounded();
    const t = pBody.translation();
    pBody.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });

    // bots: Yuka thinks, Rapier body follows
    target.set(t.x, 0.9, t.z);
    entities.update(STEP);
    for (const b of bots) b.rb.setNextKinematicTranslation({ x: b.position.x, y: 0.9, z: b.position.z });

    world.step();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    time.update();

    const look = input.readLook(dt);
    yaw += look.yaw; pitch = Math.max(-1.45, Math.min(1.45, pitch + look.pitch));
    if (input.wasPressed('KeyG')) throwGrenade();
    if (input.wasPressed('KeyR')) resetScene();

    acc += dt;
    while (acc >= STEP) { step(); acc -= STEP; }

    // auto fire
    fireT -= dt;
    if (input.fire && fireT <= 0) { shoot(); fireT = 0.11; }

    // sync visuals from physics
    const p = pBody.translation();
    camera.position.set(p.x, p.y + 0.7, p.z);
    camera.rotation.set(pitch, yaw, 0);
    for (const c of crates) { const q = c.body.translation(), r = c.body.rotation(); c.mesh.position.set(q.x, q.y, q.z); c.mesh.quaternion.set(r.x, r.y, r.z, r.w); }
    for (const b of bots) {
      b.mesh.position.set(b.position.x, b.position.y, b.position.z);
      if (b.velocity.length() > 0.2) b.mesh.rotation.y = Math.atan2(b.velocity.x, b.velocity.z);
      if (b.flashT > 0) { b.flashT -= dt; if (b.flashT <= 0) b.bodyMat.emissive.setScalar(0); }
    }
    for (let i = grenades.length - 1; i >= 0; i--) {
      const g = grenades[i], q = g.body.translation(); g.t += dt; g.mesh.position.set(q.x, q.y, q.z);
      if (g.t > 2.2) { explode(q); scene.remove(g.mesh); world.removeRigidBody(g.body); grenades.splice(i, 1); }
    }
    for (let i = booms.length - 1; i >= 0; i--) { const b = booms[i]; b.life -= dt; b.m.scale.setScalar(1 + (0.35 - b.life) * 22); b.m.material.opacity = Math.max(0, b.life / 0.35); if (b.life <= 0) { scene.remove(b.m); booms.splice(i, 1); } }
    for (let i = tracers.length - 1; i >= 0; i--) { const t = tracers[i]; t.life -= dt; if (t.life <= 0) { scene.remove(t.line); t.line.geometry.dispose(); tracers.splice(i, 1); } }
    kick = Math.max(0, kick - dt * 10);
    gun.position.z = -0.5 + kick * 0.05; gun.rotation.x = kick * 0.05;
    if (flashT > 0) { flashT -= dt; flash.visible = flashT > 0; }

    // HUD
    $('click').style.display = (input.locked || input.lockFailed) ? 'none' : 'block';
    $('bots').textContent = bots.length; $('kills').textContent = kills;
    fpsN++; fpsT += dt; if (fpsT >= 0.5) { $('fps').textContent = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }

    renderer.render(scene, camera);
    input.endFrame();
    requestAnimationFrame(frame);
  }
  // debug handle for automated tests
  window.__nh = { world, pBody, bots, crates, get yaw() { return yaw; }, set yaw(v) { yaw = v; }, input, shoot };
  requestAnimationFrame(frame);
}

main();
