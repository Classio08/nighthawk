// DROP-IN: every battle royale starts in the air. A plane crosses the map; you jump (Space), free-fall (dive with W), the parachute opens by
// itself at 60 m (or when you press Space again) and you steer it down to wherever you want to land. Bots pick a landing spot too.
//   - Graphics-free and deterministic, shared by the solo game, the server and the browser's predictor.
//   - The plane's position is a pure function of the seed and of how long a fighter has been aboard (`f.airT`), so nothing but the
//     fighter's own state has to be synced (see exportSelf / the FF flags in net/protocol.js).
//   - Airborne fighters cannot be hurt or shot, cannot shoot, loot, or use vehicles. The zone only starts once everyone has had time to land.
import { makeRng } from './rng.js';
import { MAP_HALF, findFreeSpot } from './map.js';
import { moveVector } from '../input/move.js';

export const AIR = { NONE: 0, PLANE: 1, FALL: 2, CHUTE: 3 };
export const DROP = {
  ALT: 230,              // plane height (m)
  SPEED: 18,             // plane speed (m/s): a ~14 s window to pick your jump
  DEPLOY_Y: 60,          // the parachute opens by itself below this height
  OPEN_DELAY: 0.8,       // pressing Space again opens it early, but not in the first 0.8 s of free fall
  FALL_VY: -50, FALL_ACC: 30,        // free fall: terminal speed and how fast you reach it
  CHUTE_VY: -6.5, CHUTE_ACC: 40,     // parachute: slow, steady descent (well under the fall-damage threshold of 12 m/s)
  DIVE: 26, DRIFT: 9, GLIDE: 11,     // horizontal top speed: diving (W), falling without input, under the canopy
  H_ACC_FALL: 16, H_ACC_CHUTE: 9,    // how quickly horizontal speed follows the input
  EJECT_MARGIN: 20,      // nobody who stays aboard is carried out of the map: they are thrown out this far inside the far edge
  ZONE_DELAY: 14,        // the safe zone starts counting this long after the last possible jump (a 230 m fall + parachute takes about 13 s)
};
const approach = (v, to, step) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));

/** the flight line: a straight pass through the map, up to 25 m off-centre, in a seeded direction */
export function makePlane(seed) {
  const rng = makeRng((((seed | 0) ^ 0xd20b) >>> 0) || 5);
  const a = rng() * Math.PI * 2, off = (rng() - 0.5) * 50;
  const dx = Math.cos(a), dz = Math.sin(a), len = 2 * (MAP_HALF + 10);
  return { dx, dz, x0: -dx * len / 2 - dz * off, z0: -dz * len / 2 + dx * off, len, speed: DROP.SPEED, alt: DROP.ALT, T: len / DROP.SPEED,
    Te: (len / 2 + MAP_HALF - DROP.EJECT_MARGIN) / DROP.SPEED, yaw: Math.atan2(-dx, -dz) };            // T = the whole line, Te = when a passenger who never jumps is thrown out
}
/** where the plane is after `t` seconds of flight */
export function planeAt(pl, t) { const s = Math.min(Math.max(t, 0), pl.T) * pl.speed; return { x: pl.x0 + pl.dx * s, y: pl.alt, z: pl.z0 + pl.dz * s }; }

/** put everybody (except the garrison guards, who are already on the ground at their post) in the plane */
export function startDrop(sim) {
  sim.plane = makePlane(sim.seed);
  sim.zoneStart = sim.plane.Te + DROP.ZONE_DELAY;
  const p0 = planeAt(sim.plane, 0);
  for (const f of sim.fighters) {
    if (f.npc) continue;
    f.air = AIR.PLANE; f.airT = 0; f.avx = 0; f.avz = 0; f.jumpPrev = true;       // jumpPrev: a Space key already held at the start must not jump at once
    place(f, p0.x, p0.y, p0.z); f.grounded = false; f.vy = 0;
    if (f.brain) { f.brain.px = f.x; f.brain.pz = f.z; f.brain.vehicle.position.set(f.x, 0, f.z); }
  }
}

function place(f, x, y, z) {
  f.x = x; f.y = y; f.z = z;
  f.rb.setTranslation({ x, y, z }, true); f.rb.setNextKinematicTranslation({ x, y, z });
}

function eject(sim, f) {
  const pl = sim.plane;
  f.air = AIR.FALL; f.airT = 0; f.vy = 0; f.avx = pl.dx * pl.speed; f.avz = pl.dz * pl.speed;          // you leave the plane with its momentum
  sim.emit({ t: 'eject', by: f.id, x: f.x, z: f.z });
}

/**
 * One tick of a fighter who is in the plane, falling or under a parachute. `c` is the input (a human's cmd or a bot's synthesized one):
 * { yaw, pitch, forward, strafe, jump }. Only the rising edge of `jump` counts (one press = one action).
 */
export function stepAir(sim, f, c, dt) {
  const D = DROP, pl = sim.plane;
  f.yaw = c.yaw; f.pitch = Math.max(-1.5, Math.min(1.5, c.pitch ?? 0));
  f.ads = false; f.sprinting = false; f.crouch = false; f.healT = 0;
  const press = !!c.jump && !f.jumpPrev; f.jumpPrev = !!c.jump;
  f.airT += dt;

  if (f.air === AIR.PLANE) {                                                   // riding the plane: the plane carries you
    const p = planeAt(pl, f.airT);
    place(f, p.x, p.y, p.z); f.moveX = pl.dx * pl.speed; f.moveZ = pl.dz * pl.speed; f.speedH = pl.speed;
    if (press || f.airT >= pl.Te) eject(sim, f);
    return;
  }

  if (f.air === AIR.FALL && (f.y <= D.DEPLOY_Y || (press && f.airT > D.OPEN_DELAY))) {      // open the parachute
    f.air = AIR.CHUTE; f.airT = 0; sim.emit({ t: 'chute', by: f.id, x: f.x, z: f.z, y: f.y });
  }
  const fall = f.air === AIR.FALL;
  f.vy = approach(f.vy, fall ? D.FALL_VY : D.CHUTE_VY, (fall ? D.FALL_ACC : D.CHUTE_ACC) * dt);
  const { x: mx, z: mz } = moveVector(f.yaw, c.forward, c.strafe);
  const top = fall ? (c.forward > 0 ? D.DIVE : D.DRIFT) : D.GLIDE, hAcc = (fall ? D.H_ACC_FALL : D.H_ACC_CHUTE) * dt;
  f.avx = approach(f.avx, mx * top, hAcc); f.avz = approach(f.avz, mz * top, hAcc);

  // other fighters are ignored in the air (everyone leaves the plane from the same point; the browser's predictor does not know the others anyway)
  sim._airFilter ??= (c) => { const e = sim.colMap.get(c.handle); return !(e && 'maxHp' in e); };
  sim.cc.computeColliderMovement(f.col, { x: f.avx * dt, y: f.vy * dt, z: f.avz * dt }, undefined, undefined, sim._airFilter);
  const m = sim.cc.computedMovement(), t = f.rb.translation();
  const lim = MAP_HALF - 1, nx = Math.max(-lim, Math.min(lim, t.x + m.x)), ny = t.y + m.y, nz = Math.max(-lim, Math.min(lim, t.z + m.z));   // the map edge is a wall in the air too
  f.rb.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
  m.x = nx - t.x; m.z = nz - t.z;
  f.moveX = m.x / dt; f.moveZ = m.z / dt; f.speedH = Math.hypot(f.moveX, f.moveZ);
  f.x = nx; f.y = ny; f.z = nz;
  if (sim.cc.computedGrounded()) {                                             // touched down (ground, a roof, a crate...)
    f.air = AIR.NONE; f.airT = 0; f.vy = -1; f.avx = 0; f.avz = 0; f.grounded = true; f.noHurtT = 0;
    sim.emit({ t: 'land', by: f.id, x: f.x, z: f.z });
  }
}

/* ---------------- bots ---------------- */

/** choose where this bot wants to land (and how close to it the plane must be before it jumps). Squads land together. */
export function chooseLanding(sim, f, brain) {
  if (brain.dropTo) return brain.dropTo;
  const rng = makeRng((((sim.seed | 0) ^ 0xd20b) + f.id * 7919 + 17) >>> 0), map = sim.map;
  const lead = f.squad && f.squad.members[0] !== f ? f.squad.members[0] : null;
  let x, z;
  if (lead?.brain) {                                                            // follow the squad leader: land within a few metres of them
    const lt = chooseLanding(sim, lead, lead.brain);
    const s = findFreeSpot(map, rng, lt.x, lt.z, 9, 2.5); x = s.x; z = s.z;
  } else {
    const pois = (map.landmarks ?? []).filter((l) => l.kind !== 'river');
    const greed = brain.p?.greed ?? 0.5;
    if (pois.length && rng() < 0.3 + 0.5 * greed) {                              // a named place: the best loot (and the most company)
      const poi = pois[Math.floor(rng() * pois.length)], a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * poi.radius * 0.7;
      x = poi.x + Math.cos(a) * r; z = poi.z + Math.sin(a) * r;
    } else { const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 80; x = Math.cos(a) * r; z = Math.sin(a) * r; }
    const s = findFreeSpot(map, rng, x, z, 8, 2.5); x = s.x; z = s.z;
  }
  brain.dropTo = { x, z, range: 55 + rng() * 85 };
  return brain.dropTo;
}

/** a bot's whole turn while it is in the air: jump when the target is in reach (or the plane is moving away from it), dive, steer, land */
export function botAir(sim, f, brain, dt) {
  const to = chooseLanding(sim, f, brain), pl = sim.plane;
  const dx = to.x - f.x, dz = to.z - f.z, d = Math.hypot(dx, dz);
  const c = brain._airCmd ??= { yaw: 0, pitch: 0.4, forward: 0, strafe: 0, jump: false };
  c.yaw = Math.atan2(-dx, -dz); c.forward = 0; c.jump = false; c.pitch = f.air === AIR.PLANE ? 0 : 0.5;
  if (f.air === AIR.PLANE) {
    const lead = f.squad && f.squad.members[0] !== f ? f.squad.members[0] : null;
    const passed = dx * pl.dx + dz * pl.dz < 0;                                 // the plane has gone past the target: jump now
    c.jump = lead?.alive ? lead.air !== AIR.PLANE : (d < to.range || passed);   // squad mates jump right after their leader, so they land together
  } else if (f.air === AIR.FALL) c.forward = d > 12 ? 1 : 0;                      // dive towards it
  else c.forward = d > 3 ? 1 : 0;                                                // glide in, hover over it when there
  stepAir(sim, f, c, dt);
  brain.px = f.x; brain.pz = f.z; brain.vehicle.position.set(f.x, 0, f.z);        // the brain's own copy of "where am I" follows
}
