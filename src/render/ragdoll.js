// Ragdoll deaths. Physics lives in its OWN small Rapier world (cosmetic only - it never affects gameplay,
// so it can never desync a multiplayer match). Six boxes (torso, head, 2 arms, 2 legs) tied together with
// spherical joints; when someone dies we copy their pose + velocity and shove them with the killing bullet.
import RAPIER from '@dimforge/rapier3d-compat';

// half-extents and centre (relative to the feet, rig faces -Z) of every body part
export const RIG = {
  torso: { half: [0.26, 0.30, 0.14], at: [0, 1.15, 0] },
  head:  { half: [0.15, 0.15, 0.15], at: [0, 1.60, 0] },
  armL:  { half: [0.08, 0.28, 0.08], at: [-0.36, 1.12, 0] },
  armR:  { half: [0.08, 0.28, 0.08], at: [0.36, 1.12, 0] },
  legL:  { half: [0.10, 0.42, 0.10], at: [-0.14, 0.43, 0] },
  legR:  { half: [0.10, 0.42, 0.10], at: [0.14, 0.43, 0] },
};
// [partA, partB, anchor in rig space]
const JOINTS = [['torso', 'head', [0, 1.45, 0]], ['torso', 'armL', [-0.33, 1.38, 0]], ['torso', 'armR', [0.33, 1.38, 0]],
  ['torso', 'legL', [-0.14, 0.82, 0]], ['torso', 'legR', [0.14, 0.82, 0]]];

const GROUP_RAGDOLL = (0x0002 << 16) | 0x0001;  // ragdoll parts collide with the world only, not with each other

export class RagdollWorld {
  constructor(map, { max = 10, life = 9, rng = Math.random } = {}) {
    this.rng = rng; this.max = max; this.life = life; this.list = []; this.acc = 0;
    this.world = new RAPIER.World({ x: 0, y: -22, z: 0 });
    this.world.timestep = 1 / 60;
    this.world.numSolverIterations = 12;
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(300, 2, 300).setTranslation(0, -2, 0));
    for (const b of map.boxes) this.world.createCollider(RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2).setTranslation(b.x, b.y, b.z));
  }

  /**
   * @param o {x,y,z (feet), yaw, vx, vz (the dead fighter's own velocity), dx,dy,dz (direction of the killing hit), power, head}
   */
  spawn(o) {
    while (this.list.length >= this.max) this._free(this.list.shift());
    const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
    const q = { x: 0, y: Math.sin(o.yaw / 2), z: 0, w: Math.cos(o.yaw / 2) };
    const rag = { age: 0, parts: {}, joints: [] };
    for (const [name, p] of Object.entries(RIG)) {
      // rotate the rig offset by yaw around Y (three.js: x' = x*c + z*s, z' = -x*s + z*c)
      const lx = p.at[0], ly = p.at[1], lz = p.at[2];
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(o.x + lx * c + lz * s, o.y + ly, o.z - lx * s + lz * c).setRotation(q)
        .setLinearDamping(0.25).setAngularDamping(1.6).setCcdEnabled(true)); // CCD: thin limbs must not tunnel through the floor
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(p.half[0], p.half[1], p.half[2])
        .setDensity(name === 'torso' ? 1.4 : 1).setFriction(0.9).setRestitution(0.05).setCollisionGroups(GROUP_RAGDOLL), body);
      rag.parts[name] = body;
    }
    for (const [a, b, anc] of JOINTS) {
      const pa = RIG[a].at, pb = RIG[b].at;
      const j = RAPIER.JointData.spherical(
        { x: anc[0] - pa[0], y: anc[1] - pa[1], z: anc[2] - pa[2] },
        { x: anc[0] - pb[0], y: anc[1] - pb[1], z: anc[2] - pb[2] });
      rag.joints.push(this.world.createImpulseJoint(j, rag.parts[a], rag.parts[b], true));
    }
    // knockback: everybody gets the same shove (so the body stays together), plus a pop upward and a random tumble
    const k = 5 + (o.power ?? 1) * 5, up = 2.2 + (o.power ?? 1) * 2;
    for (const [name, body] of Object.entries(rag.parts)) {
      const extra = name === 'head' && o.head ? 1.5 : 1;
      body.setLinvel({ x: (o.vx ?? 0) * 0.5 + (o.dx ?? 0) * k * extra, y: up + (o.dy ?? 0) * k * 0.5, z: (o.vz ?? 0) * 0.5 + (o.dz ?? 0) * k * extra }, true);
      body.setAngvel({ x: (this.rng() - 0.5) * 6, y: (this.rng() - 0.5) * 4, z: (this.rng() - 0.5) * 6 }, true);
    }
    this.list.push(rag);
    return rag;
  }

  _free(rag) {
    if (!rag || rag.freed) return;
    rag.freed = true;
    for (const body of Object.values(rag.parts)) this.world.removeRigidBody(body);
  }   // also removes colliders + joints

  update(dt) {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= 1 / 60) { this.world.step(); this.acc -= 1 / 60; }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i]; r.age += dt;
      if (!r.calm && r.age > 2.2) {                       // after the first tumble, bleed off the remaining wobble so bodies come to rest
        r.calm = true;
        for (const b of Object.values(r.parts)) { b.setLinearDamping(2.5); b.setAngularDamping(6); }
      }
      if (r.calm && !r.asleep && r.age > 2.6) {           // once it has (nearly) stopped, freeze it: no more twitching, and it costs nothing
        let fast = 0;
        for (const b of Object.values(r.parts)) { const v = b.linvel(); fast = Math.max(fast, Math.hypot(v.x, v.y, v.z)); }
        if (fast < 0.7) { r.asleep = true; for (const b of Object.values(r.parts)) b.setBodyType(RAPIER.RigidBodyType.Fixed, false); }
      }
      if (r.age > this.life) { this._free(r); this.list.splice(i, 1); }
    }
  }

  clear() { for (const r of this.list) this._free(r); this.list.length = 0; }
}
