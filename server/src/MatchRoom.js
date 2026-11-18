// One match = one room. The server runs the REAL game rules (src/sim/world.js - the same file the browser uses offline),
// takes inputs from players, and tells everybody what happened. Players can never say "I hit him" - only "I pressed fire".
import { Room } from '@colyseus/core';
import { Simulation, OPERATORS } from '../../src/sim/world.js';
import { skinOk } from '../../src/sim/weapons.js';
import { sanitizeCmd, repeatCmd } from '../../src/sim/cmd.js';
import { STEP, SNAP_EVERY, packSnapshot, packRoster, unpackCmd } from '../../src/net/protocol.js';

const STEP_MS = 1000 / 60;
export const DEFAULTS = { lobbySecs: 15, total: 16, maxClients: 16, overLingerSecs: 12, vehicles: true };
const MAX_QUEUE = 40;           // never hold more than this many unprocessed inputs per player (stops flooding)
const REPEAT_MAX = 3;           // if a player's input is late, repeat the last one for at most 3 ticks, then stand still

const cleanName = (n) => String(n ?? 'Operator').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16) || 'Operator';

export class MatchRoom extends Room {
  static cfg = { ...DEFAULTS };
  static instances = new Set();   // (tests peek into running matches)
  maxClients = MatchRoom.cfg.maxClients;

  onCreate() {
    MatchRoom.instances.add(this);
    this.cfg = MatchRoom.cfg;
    this.lobby = new Map();       // sessionId -> { client, name, operator }
    this.sim = null;
    this.q = new Map();           // fighter id -> { cmds:[], last, ack, started, repeats }
    this.byClient = new Map();    // sessionId -> fighter
    this.lobbyLeft = this.cfg.lobbySecs;
    this.evBuf = []; this.acc = 0; this.last = performance.now();
    this.onMessage('c', (client, data) => this._onCmds(client, data));
    this.onMessage('ping', (client, t) => client.send('pong', t));
    this.clock.setInterval(() => this._lobbyTick(), 500);
  }

  onJoin(client, options) {
    this.lobby.set(client.sessionId, { client, name: cleanName(options?.name), operator: String(options?.operator ?? ''), skin: skinOk(options?.skin) });
    if (this.lobby.size >= this.maxClients) this._start();
    else this._sendLobby();
  }

  onLeave(client) {
    this.lobby.delete(client.sessionId);
    const f = this.byClient.get(client.sessionId);
    if (f && this.sim) {
      this.sim.botify(f); this.q.delete(f.id); this.byClient.delete(client.sessionId);
      if (!this.sim.humans.length) this.disconnect();
    } else if (!this.sim) this._sendLobby();
  }

  onDispose() { MatchRoom.instances.delete(this); this.sim?.dispose(); }

  /* ---------------- lobby ---------------- */
  _sendLobby() { this.broadcast('lobby', { n: this.lobby.size, max: this.maxClients, left: Math.max(0, Math.ceil(this.lobbyLeft)) }); }
  _lobbyTick() {
    if (this.sim || !this.lobby.size) return;
    this.lobbyLeft -= 0.5;
    if (this.lobbyLeft <= 0) this._start(); else this._sendLobby();
  }

  async _start() {
    if (this.sim || this.starting) return;
    this.starting = true;
    await this.lock();
    const humans = []; const used = new Set();
    for (const [sid, p] of this.lobby) {
      let op = OPERATORS.find((o) => o.id === p.operator && !used.has(o.id)) ?? OPERATORS.find((o) => !used.has(o.id));
      if (!op) op = OPERATORS[humans.length % OPERATORS.length];
      used.add(op.id); humans.push({ operator: op.id, name: p.name, skin: p.skin, sessionId: sid });
    }
    const seed = (Math.random() * 1e9) | 0;
    this.sim = await Simulation.create({ seed, bots: Math.max(0, this.cfg.total - humans.length), humans, propsFixed: true, ...(this.cfg.vehicles === false ? { vehicles: false } : {}) });
    const roster = packRoster(this.sim);
    for (const f of this.sim.humans) {
      this.byClient.set(f.sessionId, f);
      this.q.set(f.id, { cmds: [], last: null, ack: 0, started: false, repeats: 0 });
      this.lobby.get(f.sessionId)?.client.send('welcome', { id: f.id, seed, mapSeed: this.sim.opts.mapSeed ?? 7, weather: this.sim.weather.id, vehicles: this.cfg.vehicles === false ? false : true, tick: this.sim.tick, roster, self: f.exportSelf() });
    }
    this.last = performance.now(); this.acc = 0;
    this.setSimulationInterval(() => this._pump(), 8);
  }

  /* ---------------- inputs ---------------- */
  _onCmds(client, data) {
    const f = this.byClient.get(client.sessionId); if (!f || !Array.isArray(data)) return;
    const q = this.q.get(f.id); if (!q) return;
    for (const a of data.slice(0, 12)) {
      const raw = unpackCmd(a); if (!raw) continue;
      const c = sanitizeCmd(raw);
      if (c.seq <= (q.lastSeq ?? 0)) continue;          // old or duplicated
      q.lastSeq = c.seq;
      if (q.cmds.length < MAX_QUEUE) q.cmds.push(c);
    }
  }

  /* ---------------- the game loop ---------------- */
  _pump() {
    const sim = this.sim; if (!sim) return;
    const now = performance.now();
    this.acc += Math.min(now - this.last, 250); this.last = now;
    let n = 0;
    while (this.acc >= STEP_MS && n++ < 5) { this.acc -= STEP_MS; this._tick(); if (sim.state === 'over') break; }
  }

  _tick() {
    const sim = this.sim, cmds = new Map();
    for (const h of sim.humans) {
      const q = this.q.get(h.id); if (!q) continue;
      if (!q.started) { if (q.cmds.length >= 2) q.started = true; else continue; }      // a tiny jitter buffer before we start consuming
      while (q.cmds.length > 6) q.cmds.shift();                                          // far behind (a lag spike): skip ahead
      const c = q.cmds.shift();
      if (c) { q.last = c; q.ack = c.seq; q.repeats = 0; cmds.set(h.id, c); }
      else if (q.last && q.repeats++ < REPEAT_MAX) cmds.set(h.id, repeatCmd(q.last));
    }
    sim.step(STEP, cmds);
    for (const e of sim.drainEvents()) this.evBuf.push(e);
    if (sim.tick % SNAP_EVERY === 0 || sim.state === 'over') this._snapshot();
    if (sim.state === 'over' && !this.overSent) {
      this.overSent = true;
      const over = this.evBuf.find((e) => e.t === 'over');
      this.broadcast('over', over ?? { winner: -1 });
      this.clock.setTimeout(() => this.disconnect(), this.cfg.overLingerSecs * 1000);
      this.setSimulationInterval(() => {}, 1000);      // stop stepping the finished match
    }
  }

  _snapshot() {
    const sim = this.sim, base = packSnapshot(sim, this.evBuf); this.evBuf = [];
    for (const h of sim.humans) {
      const client = this.lobby.get(h.sessionId)?.client; if (!client) continue;
      const q = this.q.get(h.id);
      client.send('s', h.alive ? { ...base, a: q?.ack ?? 0, me: h.exportSelf() } : { ...base, a: q?.ack ?? 0 });
    }
  }
}
