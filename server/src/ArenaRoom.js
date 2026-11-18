// Authoritative match room: the SERVER owns the truth (positions, hits, health).
// Clients only send inputs; they never tell the server "I hit him".
import { Room } from '@colyseus/core';
import RAPIER from '@dimforge/rapier3d-compat';
import { moveVector } from '../../src/input/move.js'; // the SAME movement maths the browser uses
import { MoveInput, Player, ArenaState } from './schema.js';

const GRAV = -22, SPEED = 7, SPRINT = 1.55, JUMP = 8.5, EYE = 0.7;
const FIRE_DAMAGE = 34, FIRE_INTERVAL = 0.11, HIT_RADIUS = 0.8, MAX_RANGE = 250;
const SPAWNS = [[0, 8], [0, 2], [10, 5], [-10, 5]];

let rapierReady = null;

// ray vs sphere: returns distance along the ray or -1
function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : -1;
}

export class ArenaRoom extends Room {
  maxClients = 16;
  state = new ArenaState();
  inputs = this.defineInput(MoveInput, {
    bufferMaxSize: 64,
    sanitize: { forward: [-1, 1], strafe: [-1, 1], pitch: [-1.45, 1.45] },
  });
  rewind = this.allowRewindState({ maxRewindMs: 300 }); // lag compensation

  async onCreate() {
    rapierReady ??= RAPIER.init();
    await rapierReady;
    this.world = new RAPIER.World({ x: 0, y: GRAV, z: 0 });
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setTranslation(0, -0.5, 0));
    // a test wall in the middle of the arena
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(2, 1.5, 0.25).setTranslation(0, 1.5, 5));
    this.cc = this.world.createCharacterController(0.02);
    this.cc.enableAutostep(0.45, 0.2, true);
    this.cc.enableSnapToGround(0.3);
    this.bodies = new Map(); // sessionId -> { rb, col, vy, grounded, cooldown, spawn }
    this.colliders = new Set(); // player collider handles (rays skip these; players are tested with lag compensation)
    this.rewind.attachAll(this.state.players, { fields: ['x', 'y', 'z'] });
    this.setFixedTimestep((ctx) => this.step(ctx), 30, { subSteps: 2 }); // 30 inputs/s, 60 Hz physics
  }

  onJoin(client, options) {
    const idx = this.state.players.size % SPAWNS.length;
    const [sx, sz] = SPAWNS[idx];
    const p = new Player();
    p.name = String(options?.name ?? 'Operator').slice(0, 16);
    p.x = sx; p.y = 0.9; p.z = sz; p.hp = 100; p.kills = 0;
    this.state.players.set(client.sessionId, p);
    const rb = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(sx, 0.9, sz));
    const col = this.world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.4), rb);
    this.colliders.add(col.handle);
    this.bodies.set(client.sessionId, { rb, col, vy: 0, grounded: false, cooldown: 0, spawn: [sx, sz] });
  }

  onLeave(client) {
    const b = this.bodies.get(client.sessionId);
    if (b) { this.colliders.delete(b.col.handle); this.world.removeRigidBody(b.rb); this.bodies.delete(client.sessionId); }
    this.state.players.delete(client.sessionId);
  }

  step(ctx) {
    for (const [sid, p] of this.state.players) {
      const b = this.bodies.get(sid);
      const cmd = this.inputs.get(sid).next(); // one input per client per step
      b.cooldown = Math.max(0, b.cooldown - ctx.dt);
      if (cmd) {
        const mv = moveVector(cmd.yaw, cmd.forward, cmd.strafe);
        const sp = SPEED * (cmd.sprint ? SPRINT : 1);
        if (b.grounded && cmd.jump) b.vy = JUMP;
        b.vy += GRAV * ctx.dt;
        if (b.grounded && b.vy < 0) b.vy = 0;
        this.cc.computeColliderMovement(b.col, { x: mv.x * sp * ctx.dt, y: b.vy * ctx.dt, z: mv.z * sp * ctx.dt });
        const m = this.cc.computedMovement();
        b.grounded = this.cc.computedGrounded();
        const t = b.rb.translation();
        b.rb.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
        p.yaw = cmd.yaw; p.pitch = cmd.pitch;
        if (cmd.fire && b.cooldown <= 0 && p.hp > 0) { b.cooldown = FIRE_INTERVAL; this.fire(sid, p, cmd); }
      }
    }
    for (let i = 0; i < ctx.subSteps; i++) { this.world.timestep = ctx.subDt; this.world.step(); }
    for (const [sid, p] of this.state.players) { // copy physics result to the network state
      const t = this.bodies.get(sid).rb.translation();
      p.x = t.x; p.y = t.y; p.z = t.z;
    }
  }

  fire(shooterId, shooter, cmd) {
    const cp = Math.cos(cmd.pitch);
    const dir = { x: -Math.sin(cmd.yaw) * cp, y: Math.sin(cmd.pitch), z: -Math.cos(cmd.yaw) * cp };
    const origin = { x: shooter.x, y: shooter.y + EYE, z: shooter.z };
    // 1) how far until a wall stops the bullet?
    const wall = this.world.castRay(new RAPIER.Ray(origin, dir), MAX_RANGE, true, undefined, undefined, undefined, undefined,
      (c) => !this.colliders.has(c.handle));
    const wallDist = wall ? wall.timeOfImpact : MAX_RANGE;
    // 2) which player is hit first, judged on where the shooter SAW them (lag compensation)
    const seen = this.rewind.lastSeenBy(shooterId);
    let best = null, bestT = wallDist;
    for (const [sid, target] of this.state.players) {
      if (sid === shooterId || target.hp <= 0) continue;
      const pos = seen.read(target, ['x', 'y', 'z']);
      const t = raySphere(origin, dir, { x: pos.x, y: pos.y + 0.2, z: pos.z }, HIT_RADIUS);
      if (t >= 0 && t < bestT) { best = { sid, target }; bestT = t; }
    }
    if (!best) return;
    best.target.hp -= FIRE_DAMAGE;
    if (best.target.hp <= 0) {
      shooter.kills += 1;
      const b = this.bodies.get(best.sid);
      b.rb.setNextKinematicTranslation({ x: b.spawn[0], y: 0.9, z: b.spawn[1] });
      b.vy = 0; best.target.hp = 100; // instant respawn for the spike
    }
  }
}
