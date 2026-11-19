// The wire format shared by the server and the browser. Plain JSON-able arrays/objects (Colyseus packs them as msgpack).
// Rule of thumb: the client sends INPUTS only; the server sends the TRUTH. Nothing here is trusted on the server without sanitizeCmd().
import { SLOT_ORDER } from '../sim/weapons.js';
import { isCloaked } from '../sim/abilities.js';

export const STEP = 1 / 60;
export const SNAP_EVERY = 3;                  // server sends a snapshot every 3rd tick = 20 per second
export const TICKS_PER_MS = 60 / 1000;
export const INTERP_TICKS = 6;                // remote players are drawn 6 ticks (100 ms) in the past, so there are always 2 snapshots to blend

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

/* ---------- input: client -> server (one tick of keys, packed into a small array) ---------- */
export const CF = { jump: 1, sprint: 2, fire: 4, ads: 8, reload: 16, grenade: 32, mortar: 64, use: 128, heal: 256, ability: 512, crouch: 1024 };
export function packCmd(c) {
  const flags = (c.jump ? CF.jump : 0) | (c.sprint ? CF.sprint : 0) | (c.fire ? CF.fire : 0) | (c.ads ? CF.ads : 0) | (c.reload ? CF.reload : 0) | (c.grenade ? CF.grenade : 0) | (c.mortar ? CF.mortar : 0) | (c.use ? CF.use : 0) | (c.heal ? CF.heal : 0) | (c.ability ? CF.ability : 0) | (c.crouch ? CF.crouch : 0);
  return [c.seq, r3(c.yaw), r3(c.pitch), c.forward, c.strafe, flags, c.slot | 0, c.vt | 0];
}
export function unpackCmd(a) {
  if (!Array.isArray(a) || a.length < 8) return null;
  const f = a[5] | 0;
  return { seq: a[0], yaw: a[1], pitch: a[2], forward: a[3], strafe: a[4], jump: !!(f & CF.jump), sprint: !!(f & CF.sprint), fire: !!(f & CF.fire),
    ads: !!(f & CF.ads), reload: !!(f & CF.reload), grenade: !!(f & CF.grenade), mortar: !!(f & CF.mortar), use: !!(f & CF.use), heal: !!(f & CF.heal), ability: !!(f & CF.ability), crouch: !!(f & CF.crouch), slot: a[6], vt: a[7] };
}

/* ---------- state: server -> client ---------- */
export const FF = { alive: 1, ads: 2, sprint: 4, ground: 8, ab: 16, cloak: 32, stun: 64, dash: 128, crouch: 256, airShift: 9 };      // bits 9-10: 0 on foot, 1 plane, 2 free fall, 3 parachute

export function packFighter(f) {
  const flags = (f.alive ? FF.alive : 0) | (f.ads ? FF.ads : 0) | (f.sprinting ? FF.sprint : 0) | (f.grounded ? FF.ground : 0) | (f.abT > 0 ? FF.ab : 0) | (isCloaked(f) ? FF.cloak : 0) | (f.stunT > 0 ? FF.stun : 0) | (f.dashT > 0 ? FF.dash : 0) | (f.crouch ? FF.crouch : 0) | ((f.air & 3) << FF.airShift);
  return [f.id, r2(f.x), r2(f.y), r2(f.z), r3(f.yaw), r3(f.pitch), Math.ceil(f.hp), flags, SLOT_ORDER.indexOf(f.cur), r2(f.speedH), f.kills, r2(f.reloadT)];
}
/** write a packed fighter record into a live object (the object keeps the same identity so the renderer never loses it) */
export function unpackFighterInto(o, a) {
  o.x = a[1]; o.y = a[2]; o.z = a[3]; o.yaw = a[4]; o.pitch = a[5]; o.hp = a[6];
  const fl = a[7]; o.alive = !!(fl & FF.alive); o.ads = !!(fl & FF.ads); o.sprinting = !!(fl & FF.sprint); o.grounded = !!(fl & FF.ground);
  o.abOn = !!(fl & FF.ab); o.cloaked = !!(fl & FF.cloak); o.stunned = !!(fl & FF.stun); o.dashing = !!(fl & FF.dash); o.crouch = !!(fl & FF.crouch); o.air = (fl >> FF.airShift) & 3;
  o.cur = SLOT_ORDER[a[8]] ?? o.cur; o.speedH = a[9]; o.kills = a[10]; o.reloadT = a[11];
  return o;
}

export function packRoster(sim) {
  return sim.fighters.map((f) => ({ id: f.id, name: f.name, color: f.color, op: f.op.id, hp: f.maxHp, human: f.human ? 1 : 0, npc: f.npc ? 1 : 0, skin: f.skin ?? null, weapon: f.op.weapon }));
}

/** events carry many floats; 3 decimals is plenty and keeps packets small */
export function packEvent(e) {
  const o = {};
  for (const k in e) { const v = e[k]; o[k] = typeof v === 'number' && !Number.isInteger(v) ? r3(v) : v; }
  return o;
}

export function packZone(z) { return [r2(z.cx), r2(z.cz), r2(z.radius), r2(z.nextX), r2(z.nextZ), r2(z.nextR), z.phase, z.shrinking ? 1 : 0, r2(z.t), z.done ? 1 : 0]; }
export function unpackZoneInto(z, a) {
  z.cx = a[0]; z.cz = a[1]; z.radius = a[2]; z.nextX = a[3]; z.nextZ = a[4]; z.nextR = a[5]; z.phase = a[6]; z.shrinking = !!a[7]; z.t = a[8]; z.done = !!a[9];
}

/** loot state goes out only when something changed (a pickup or a drop), plus a refresh every 2 s in case a message was lost */
function lootWire(sim) {
  if (!sim.opts.loot) return {};
  const L = sim.loot;
  if (L.rev === L.wireRev && sim.tick % 120 !== 0) return {};
  L.wireRev = L.rev; return { lt: L.pack() };
}

/** the part of a snapshot that is identical for everybody */
export function packSnapshot(sim, events) {
  return {
    k: sim.tick, z: packZone(sim.zone), f: sim.fighters.map(packFighter),
    g: sim.grenades.map((g) => { const t = g.body.translation(); return [r2(t.x), r2(t.y), r2(t.z)]; }),
    e: events.map(packEvent), o: sim.state === 'playing' ? 0 : 1,
    pd: sim.destroyed, ct: sim.contracts.pack(), vh: sim.vehicles.pack(), ...lootWire(sim),
  };
}
