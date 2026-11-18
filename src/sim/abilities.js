// Operator abilities (key Q). Graphics-free, deterministic, and server-authoritative: the same code runs in the browser solo game,
// on the Colyseus server and inside the client predictor. The predictor only runs the OWN-state part (cooldown, buff timer,
// dash, stun); everything that touches other fighters (EMP, blast, strike, healing) happens on the server / solo sim only.
//
// One active ability per operator, one cooldown, clear tells (an `ability` event + a flag on the snapshot so everybody can see
// that a Cloak or a Bulwark is up) and counterplay: stuns and dashes have a short range, a Cloak is only perfect at a distance,
// Deadeye is one shot, a Crimson Rush has to connect.

export const ABILITIES = {
  roms:          { id: 'overclock', name: 'Overclock',   cd: 16, dur: 5,  fireMul: 1.3, takeMul: 0.6, color: '#ffb020', hint: 'faster fire, takes 40% less damage' },
  shadow:        { id: 'cloak',     name: 'Cloak',       cd: 15, dur: 4,  speedMul: 1.3, cloak: true, cloakRange: 9, color: '#9fb4d6', hint: 'bots lose you beyond 9 m, run faster' },
  douglas:       { id: 'traumakit', name: 'Trauma Kit',  cd: 13, dur: 5,  burst: 25, regen: 14, color: '#5be37a', hint: 'instant +25 HP, then +14 HP/s' },
  cliffhanger:   { id: 'blastdash', name: 'Blast Dash',  cd: 9,  dash: 11, dashT: 0.2, blastR: 5.5, blastDmg: 85, color: '#ff7a2e', hint: 'dash forward, charge goes off where you land' },
  'navy-blue':   { id: 'deadeye',   name: 'Deadeye',     cd: 11, dur: 8,  shotMul: 3, pierceMul: 0.6, color: '#58a6ff', hint: 'next shot: 3x damage, ignores armor, goes through bodies' },
  rampol:        { id: 'bulwark',   name: 'Bulwark',     cd: 12, dur: 5,  takeMul: 0.35, color: '#c9a46a', hint: 'takes 65% less damage' },
  maetja:        { id: 'emp',       name: 'EMP Breach',  cd: 14, radius: 24, stun: 3, color: '#7df9ff', hint: 'stuns every enemy within 24 m for 3 s' },
  cleiseis:      { id: 'rush',      name: 'Crimson Rush', cd: 10, dash: 9, dashT: 0.16, strikeDmg: 70, finishFrac: 0.4, color: '#ff3b5c', hint: 'dash strike; kills anyone under 40% HP' },
};
export const STUN_MOVE = 0.3;                                   // a stunned fighter crawls at 30% speed and cannot shoot or jump

export const abilityOf = (f) => ABILITIES[f.op?.id] ?? null;
/** the ability definition IF its timed effect is running right now (Overclock, Bulwark, Cloak, Trauma Kit, Deadeye ready) */
export const activeAbility = (f) => (f.abT > 0 ? abilityOf(f) : null);
export const isCloaked = (f) => !!(f.abT > 0 && ABILITIES[f.op?.id]?.cloak);

/** try to fire the operator's ability. `aim` = optional {x,z} horizontal direction for dashes (bots use it, humans use their view). */
export function useAbility(sim, f, aim = null) {
  const A = abilityOf(f);
  if (!A || !f.alive || f.veh || f.abCd > 0 || f.stunT > 0 || f.dashT > 0) return false;
  const pred = !!sim.opts.predictor;
  if (A.burst && !pred && f.hp >= f.maxHp) return false;          // a medic does not waste the kit at full health
  f.abCd = A.cd; f.abT = A.dur ?? 0;
  if (f.healT > 0) f.healT = 0;
  if (A.dash) {
    let dx = aim ? aim.x : -Math.sin(f.yaw), dz = aim ? aim.z : -Math.cos(f.yaw);
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    f.dashT = A.dashT; f.dashVx = dx * A.dash / A.dashT; f.dashVz = dz * A.dash / A.dashT; f.dashHit = [];
    if (f.grounded) f.vy = 2.2;                                   // a little hop so low cover does not stop the dash
  }
  if (pred) return true;                                           // a predicting browser only tracks its own state; the server does the rest
  sim.emit({ t: 'ability', by: f.id, kind: A.id, x: f.x, y: f.y, z: f.z, r: A.radius ?? A.blastR ?? 0, dur: A.dur ?? A.dashT ?? 0 });
  if (A.burst) f.hp = Math.min(f.maxHp, f.hp + A.burst);
  if (A.radius) {                                                  // EMP: everybody who is not on my team and close enough
    for (const o of sim.fighters) {
      if (o === f || !o.alive || (f.squad && f.squad.allies(f, o))) continue;
      if (Math.hypot(o.x - f.x, o.z - f.z) > A.radius) continue;
      o.stunT = A.stun; o.healT = 0; o.reloadT = 0; o.dashT = 0;
      sim.emit({ t: 'stun', target: o.id, by: f.id, dur: A.stun });
      o.brain?.onHurt(f);
    }
  }
  return true;
}

/** one tick of timers for ANY fighter (humans: end of stepPlayer, bots: the main loop). Runs on the predictor too (own timers only). */
export function tickAbility(sim, f, dt) {
  const A = abilityOf(f), pred = !!sim.opts.predictor;
  if (f.abCd > 0) f.abCd = Math.max(0, f.abCd - dt);
  if (f.stunT > 0) f.stunT = Math.max(0, f.stunT - dt);
  if (f.abT > 0) {
    if (!pred && A?.regen && f.alive) f.hp = Math.min(f.maxHp, f.hp + A.regen * dt);
    f.abT = Math.max(0, f.abT - dt);
  }
  if (f.dashT > 0) {
    if (!pred && A?.strikeDmg && f.alive) {                        // Crimson Rush: hit everybody the blade touches (once each)
      for (const o of sim.fighters) {
        if (o === f || !o.alive || f.dashHit.includes(o.id) || (f.squad && f.squad.allies(f, o))) continue;
        if (Math.hypot(o.x - f.x, o.z - f.z) > 1.9 || Math.abs(o.y - f.y) > 1.6) continue;
        f.dashHit.push(o.id);
        const finish = o.hp <= o.maxHp * A.finishFrac;
        sim.emit({ t: 'ability', by: f.id, kind: 'rush-hit', x: o.x, y: o.y, z: o.z, r: 0, dur: 0, finish });
        sim.damage(o, finish ? o.hp + 1 : A.strikeDmg, f, { head: false, w: 'rush', dx: -Math.sin(f.yaw), dy: 0.1, dz: -Math.cos(f.yaw), x: o.x, y: o.y + 0.4, z: o.z, cause: 'melee' });
      }
    }
    f.dashT -= dt;
    if (f.dashT <= 0) {
      f.dashT = 0; f.dashVx = f.dashVz = 0;
      if (!pred && A?.blastR && f.alive) sim._blast(f.x, f.y + 0.3, f.z, A.blastR, A.blastDmg, f, 'dash', f);
    }
  }
}

/** bots decide when to press Q (called a few times a second from the brain) */
export function botUseAbility(sim, f, { tgt, dist, hpF, hurtRecently }) {
  const A = abilityOf(f);
  if (!A || f.abCd > 0 || f.stunT > 0 || f.dashT > 0 || f.veh || !f.alive) return false;
  let go = false;
  switch (A.id) {
    case 'overclock': case 'bulwark': go = !!tgt && dist < 28 && (hurtRecently || dist < 16); break;
    case 'cloak': go = (!!tgt && dist > 14 && dist < 45) || (hpF < 0.5 && hurtRecently); break;
    case 'traumakit': go = hpF < 0.62 && (!tgt || hpF < 0.45); break;
    case 'blastdash': go = !!tgt && dist > 4 && dist < 10; break;
    case 'deadeye': go = !!tgt && dist > 14 && f.fireT <= 0 && f.reloadT <= 0; break;
    case 'emp': go = (hurtRecently || (!!tgt && dist < 18)) && sim.fighters.some((o) => o !== f && o.alive && !(f.squad && f.squad.allies(f, o)) && Math.hypot(o.x - f.x, o.z - f.z) < A.radius * 0.75); break;
    case 'rush': go = !!tgt && dist > 2 && dist < 8.5; break;
    default: break;
  }
  if (!go) return false;
  const aim = tgt && A.dash ? { x: tgt.x - f.x, z: tgt.z - f.z } : null;
  return useAbility(sim, f, aim);
}
