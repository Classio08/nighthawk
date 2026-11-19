// NetSim = what the browser plays when you are ONLINE. It looks exactly like the offline Simulation to the renderer/HUD
// (fighters, player, zone, crates, grenades, step(), drainEvents()) but the truth lives on the server:
//   * YOUR fighter is PREDICTED: your own keys move you instantly on a tiny local copy of the rules (a "predictor").
//     When the server's answer arrives we rewind to it and replay the inputs it has not seen yet ("reconciliation");
//     any small difference is blended away over a few frames instead of snapping.
//   * EVERYONE ELSE is drawn ~100 ms in the past, interpolated between the last two snapshots (smooth even at 20 snapshots/s).
//   * Shots are judged by the server on where the target was on YOUR screen (lag compensation, see Simulation._fire).
import { Simulation, OPERATORS } from '../sim/world.js';
import { Contracts } from '../sim/contracts.js';
import { Zone } from '../sim/zone.js';
import { makeRng } from '../sim/rng.js';
import { SLOT_ORDER } from '../sim/weapons.js';
import { isCloaked } from '../sim/abilities.js';
import { STEP, TICKS_PER_MS, INTERP_TICKS, packCmd, unpackFighterInto, unpackZoneInto } from './protocol.js';

const OWN_EVENTS = new Set(['shot', 'fire', 'reload', 'dry', 'switch', 'throw']);   // predicted locally, so the server's copy is ignored
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

/** a fighter that somebody else controls: just numbers that we fill from snapshots */
class RemoteFighter {
  constructor(r) {
    this.id = r.id; this.name = r.name; this.color = r.color; this.maxHp = r.hp; this.hp = r.hp; this.human = !!r.human; this.npc = !!r.npc; this.skin = r.skin ?? null; this.reloadTot = 1; this.reloadEmpty = false; this.isPlayer = false;
    this.op = OPERATORS.find((o) => o.id === r.op) ?? { id: r.op, name: r.name, color: r.color, hp: r.hp, speed: 9.5, weapon: r.weapon };
    this.alive = true; this.kills = 0; this.x = 0; this.y = 0.9; this.z = 0; this.yaw = 0; this.pitch = 0;
    this.speedH = 0; this.grounded = true; this.ads = false; this.sprinting = false; this.cur = r.weapon; this.reloadT = 0;
    this.weapons = {}; this.nades = 0; this.fireT = 0; this.switchT = 0; this.bloom = 0;
    this.abOn = false; this.cloaked = false; this.stunned = false; this.dashing = false; this.crouch = false;      // operator ability tells (flags from the snapshot)
  }
  get eyeY() { return this.y + (this.crouch ? 0.2 : 0.72); }
}

const DELEGATED = ['yaw', 'pitch', 'ads', 'sprinting', 'speedH', 'grounded', 'cur', 'weapons', 'reloadT', 'reloadTot', 'reloadEmpty', 'switchT', 'fireT', 'bloom', 'nades', 'nadeT', 'vy', 'mortar', 'streak', 'veh', 'seat', 'armor', 'armorLv', 'meds', 'healT', 'abCd', 'abT', 'dashT', 'dashVx', 'dashVz', 'stunT', 'dashHit', 'crouch'];

/** YOUR fighter: movement + weapon state come from the predictor, health/kills/alive from the server */
class Me {
  constructor(net, r, predictorPlayer) {
    this.net = net; this.pl = predictorPlayer;
    this.id = r.id; this.name = r.name; this.color = r.color; this.maxHp = r.hp; this.hp = r.hp; this.isPlayer = true; this.human = true;
    this.op = predictorPlayer.op; this.alive = true; this.kills = 0;
  }
  get x() { return this.pl.x + this.net.err.x; }
  get y() { return this.pl.y + this.net.err.y; }
  get z() { return this.pl.z + this.net.err.z; }
  get eyeY() { return this.y + (this.crouch ? 0.2 : 0.72); }
}
for (const k of DELEGATED) Object.defineProperty(Me.prototype, k, { get() { return this.pl[k]; }, set(v) { this.pl[k] = v; } });
// the ability tells for MY fighter come from my own predicted state (remote fighters get them as snapshot flags)
Object.defineProperties(Me.prototype, {
  abOn: { get() { return this.pl.abT > 0; } }, cloaked: { get() { return isCloaked(this.pl); } },
  stunned: { get() { return this.pl.stunT > 0; } }, dashing: { get() { return this.pl.dashT > 0; } },
});

export class NetSim {
  /** @param room a connected Colyseus room (or anything with send/onMessage/leave)  @param {{lag?:number, now?:()=>number}} o */
  constructor(room, o = {}) {
    this.room = room; this.lagMs = o.lag ?? 0; this.now = o.now ?? (() => performance.now());
    this.ready = false; this.inbox = []; this.onLobby = null; this.onOver = null; this.onClose = null;
    this.seq = 0; this.pending = []; this.outbox = []; this.err = { x: 0, y: 0, z: 0 };
    this.snaps = []; this.clockOff = null; this.evq = [];
    this.fighters = []; this.crates = []; this.barrels = []; this.grenades = []; this.humans = []; this.nDestroyed = 0; this.contracts = { list: [] }; this.strikes = []; this.vehicles = { list: [], byId: new Map() }; this.seated = false;
    this.time = 0; this.tick = 0; this.state = 'playing'; this.result = null; this.rtt = 0; this.stats = { snaps: 0, corrections: 0, maxErr: 0, lastErr: 0 };
    this._wait = new Promise((res, rej) => { this._resolve = res; this._reject = rej; });
    this._ping = null;

    const hook = (type, fn) => room.onMessage(type, (m) => { if (this.lagMs > 0) setTimeout(() => fn(m), this.lagMs / 2); else fn(m); });
    hook('lobby', (m) => this.onLobby?.(m));
    hook('welcome', (m) => this._onWelcome(m));
    hook('s', (m) => (this.ready ? this._onSnap(m) : this.inbox.push(m)));
    hook('over', (m) => { this.final = m; this.onOver?.(m); });
    hook('pong', (t) => { this.rtt = this.now() - t; });
    // the connection dropped (wifi blip, tab refresh): the Colyseus client retries by itself and the server keeps the fighter standing for a few seconds.
    // Old inputs are worthless after a gap, so nothing is queued while we are down.
    this.reconnecting = false; this.onReconnecting = null;
    if (room.reconnection) Object.assign(room.reconnection, { maxEnqueuedMessages: 0, minUptime: 1000, maxRetries: 10, maxDelay: 2000 });      // give up after ~10 s: the server only holds the seat for 12
    room.onDrop?.(() => { this.reconnecting = true; this.outbox.length = 0; this.onReconnecting?.(true); });
    room.onReconnect?.(() => { this.reconnecting = false; this.outbox.length = 0; this._ping = null; this.onReconnecting?.(false); });
    room.onLeave?.((code) => { this.closed = true; this.onClose?.(code); if (!this.ready) this._reject(new Error(`left before the match started (code ${code})`)); });
  }

  /** open a connection, join a match room and resolve once the server has built the match (lobby countdown included) */
  static async join(url, { name = 'Operator', operator = 'roms', skin = null, lag = 0, onLobby, now } = {}) {
    const { Client } = await import('@colyseus/sdk');
    const room = await new Client(url).joinOrCreate('match', { name, operator, skin });
    const ns = new NetSim(room, { lag, now }); ns.onLobby = onLobby;
    await ns._wait;
    return ns;
  }

  async _onWelcome(w) {
    this.welcome = w; this.myId = w.id;
    // the predictor: SAME seed and map => identical walls and crates, but only my fighter, no bots and no zone damage
    const me = w.roster[w.id];
    this.predictor = await Simulation.create({ seed: w.seed, mapSeed: w.mapSeed, bots: 0, humans: [{ operator: me.op, name: me.name, skin: me.skin }], propsFixed: true, predictor: true, weather: w.weather, ...(w.vehicles === false ? { vehicles: false } : {}), ...(w.loot ? { loot: true } : {}) });
    this.weather = this.predictor.weather; this.vehicles = this.predictor.vehicles; this.loot = this.predictor.loot;      // same vehicles as the server (same seed); their state comes from snapshots
    const pl = this.predictor.player; pl.rngKey = w.id; pl.yaw = w.self.yaw;
    pl.importSelf(w.self); this.predictor.world.propagateModifiedBodyPositionsToColliders();
    this.map = this.predictor.map; this.crates = this.predictor.crates; this.barrels = this.predictor.barrels;
    this.zone = new Zone(makeRng(1)); this.zone.update = () => {};
    this.fighters = w.roster.map((r) => (r.id === w.id ? new Me(this, r, pl) : new RemoteFighter(r)));
    this.me = this.fighters[w.id]; this.player = this.me; this.humans = this.fighters.filter((f) => f.human);
    this.nadeProxies = [];
    this.tick = w.tick; this.ready = true;
    for (const m of this.inbox.splice(0)) this._onSnap(m);
    this._resolve(this);
  }

  /* ---------- clock: which server tick is "now"? ---------- */
  estTick() { return this.now() * TICKS_PER_MS + (this.clockOff ?? 0); }
  /** the tick of the world the player is LOOKING at (remote players are drawn INTERP_TICKS behind) - sent with every shot for lag compensation */
  viewTick() { return Math.max(1, Math.round(this.estTick() - INTERP_TICKS)); }

  /* ---------- one fixed 60 Hz step (called by the game loop exactly like Simulation.step) ---------- */
  step(dt, cmd) {
    if (!this.ready) return;
    const c = { ...cmd, seq: ++this.seq, vt: this.viewTick() };
    this.pending.push(c); if (this.pending.length > 240) this.pending.shift();
    this.outbox.push(c);
    if (this.me.alive && this.seated) this._stepSeated(c);           // sitting in a vehicle: the server drives, I just look around and follow it
    else if (this.me.alive) {
      this.predictor.step(dt, c);
      for (const e of this.predictor.drainEvents()) if (OWN_EVENTS.has(e.t)) this.evq.push({ ...e, by: this.myId });
    }
    this.time += dt;
  }

  /** in a vehicle my movement is the vehicle's: no prediction, my body follows the (smoothed) vehicle state from the snapshots */
  _stepSeated(c) {
    const pl = this.predictor.player, v = pl.veh; if (!v) return;
    pl.yaw = c.yaw; pl.pitch = Math.max(-1.5, Math.min(1.5, c.pitch));
    const p = this.predictor.vehicles._seatPos(v, pl.seat); pl.x = p.x; pl.y = 0.95; pl.z = p.z; pl.speedH = Math.abs(v.speed);
    this.err.x = this.err.y = this.err.z = 0;
  }

  /** once per rendered frame: send inputs, blend remote players, fade the correction error */
  update(dt) {
    if (!this.ready) return;
    if (this.reconnecting) { this.outbox.length = 0; this.err.x *= 0.9; this.err.z *= 0.9; this._interpolate(); return; }          // connection is down: keep drawing, send nothing
    if (this.outbox.length) {
      const msg = this.outbox.splice(0).map(packCmd);
      if (this.lagMs > 0) setTimeout(() => this.room.send('c', msg), this.lagMs / 2); else this.room.send('c', msg);
    }
    const t = this.now();
    if (!this._ping || t - this._ping > 1000) { this._ping = t; this.room.send('ping', t); }
    // fade the prediction error: ~10 frames to disappear
    const k = Math.exp(-12 * dt); this.err.x *= k; this.err.y *= k; this.err.z *= k;
    this._interpolate();
  }

  /* ---------- snapshots from the server ---------- */
  _onSnap(s) {
    this.stats.snaps++;
    const sample = s.k - this.now() * TICKS_PER_MS;
    this.clockOff = this.clockOff === null ? sample : lerp(this.clockOff, sample, 0.05);
    this.tick = s.k;
    this.snaps.push(s); while (this.snaps.length > 40) this.snaps.shift();
    unpackZoneInto(this.zone, s.z);
    // health, kills, alive for EVERYONE (incl. me) come from the server
    for (const a of s.f) {
      const f = this.fighters[a[0]]; if (!f) continue;
      if (f === this.me) { f.hp = a[6]; f.kills = a[10]; f.alive = !!(a[7] & 1); } else { f.hp = a[6]; f.kills = a[10]; f.alive = !!(a[7] & 1); }
    }
    // grenades: draw them where the server says (they only live a couple of seconds)
    this.grenades = s.g.map((g) => ({ body: { translation: () => ({ x: g[0], y: g[1], z: g[2] }) } }));
    // broken crates / exploded barrels: apply to my copy of the world so my own movement collides with the same things the server has
    if (s.pd && s.pd.length !== this.nDestroyed) { this.predictor.syncDestroyed(s.pd); this.predictor.world.propagateModifiedBodyPositionsToColliders(); this.nDestroyed = s.pd.length; }
    if (s.vh) this.predictor.vehicles.applyState(s.vh, true);      // vehicle poses (their colliders move too, so my predicted walking bumps into the same things)
    if (s.lt) this.predictor.loot.applyState(s.lt);      // which starting items are gone + what dead players dropped
    if (s.ct) this.contracts.list = Contracts.unpack(s.ct);      // airdrops / hardpoints / bounty for the HUD and the 3D markers
    // events: skip what I already showed myself
    for (const e of s.e) {
      if (OWN_EVENTS.has(e.t) && e.by === this.myId && !this.seated) continue;      // (in a vehicle nothing is predicted, so the server's copy is the only one)
      if (e.t === 'end' && e.to === this.myId) { this.state = e.won ? 'won' : 'lost'; this.result = e; }
      if (e.t === 'over') this.state = this.state === 'playing' ? 'over' : this.state;
      this.evq.push(e);
    }
    if (s.me) this._reconcile(s.a, s.me);
  }

  /** rewind to the server's version of ME, then replay my inputs it has not processed yet */
  _reconcile(ack, me) {
    const pl = this.predictor.player;
    const shownX = pl.x + this.err.x, shownY = pl.y + this.err.y, shownZ = pl.z + this.err.z;
    while (this.pending.length && this.pending[0].seq <= ack) this.pending.shift();
    pl.importSelf(me); this.predictor.world.propagateModifiedBodyPositionsToColliders();
    pl.veh = me.sv >= 0 ? this.predictor.vehicles.byId.get(me.sv) ?? null : null; pl.seat = me.ss ?? -1; this.seated = !!pl.veh;
    if (this.seated) { this._stepSeated({ yaw: pl.yaw, pitch: pl.pitch }); return; }
    if (this.me.alive) { for (const c of this.pending) this.predictor.step(STEP, c); this.predictor.drainEvents(); }   // replay: effects were already shown the first time
    const ex = shownX - pl.x, ey = shownY - pl.y, ez = shownZ - pl.z, d = Math.hypot(ex, ey, ez);
    this.stats.lastErr = d; this.stats.maxErr = Math.max(this.stats.maxErr, d);
    if (d > 2.5) { this.err.x = this.err.y = this.err.z = 0; this.stats.corrections++; }      // way off (teleport, respawn): snap
    else { this.err.x = ex; this.err.y = ey; this.err.z = ez; if (d > 0.05) this.stats.corrections++; }
  }

  _interpolate() {
    const sn = this.snaps; if (!sn.length) return;
    const rt = this.estTick() - INTERP_TICKS;
    let i = sn.length - 1; while (i > 0 && sn[i - 1].k > rt) i--;
    // sn[i-1] <= rt < sn[i]  (or clamp to the ends)
    const b = sn[i], a = i > 0 ? sn[i - 1] : sn[i];
    const t = b.k === a.k ? 1 : Math.min(1, Math.max(0, (rt - a.k) / (b.k - a.k)));
    for (let n = 0; n < b.f.length; n++) {
      const fb = b.f[n], f = this.fighters[fb[0]];
      if (!f || f === this.me) continue;
      const fa = a.f[n] ?? fb;
      const alive = f.alive;
      unpackFighterInto(f, t > 0.5 ? fb : fa);                    // discrete things (flags, weapon) from the nearer snapshot
      f.alive = alive;                                            // alive/hp are set by _onSnap straight away (the kill event must not wait 100 ms)
      f.x = lerp(fa[1], fb[1], t); f.y = lerp(fa[2], fb[2], t); f.z = lerp(fa[3], fb[3], t);
      f.yaw = lerpAngle(fa[4], fb[4], t); f.pitch = lerp(fa[5], fb[5], t);
      f.hp = fb[6]; f.kills = fb[10];
    }
  }

  drainEvents() { return this.evq.splice(0); }
  aliveCount() { let n = 0; for (const f of this.fighters) if (f.alive && !f.npc) n++; return n; }
  leave() { try { this.room.leave(); } catch { /* already closed */ } }
  /** close the connection WITHOUT telling the server we are leaving (tests, and what a dead wifi looks like): the client reconnects by itself */
  drop() { try { this.room.leave(false); } catch { /* already closed */ } }
  dispose() { this.leave(); this.predictor?.dispose(); }
}
