// One match = one room. The server runs the REAL game rules (src/sim/world.js - the same file the browser uses offline),
// takes inputs from players, and tells everybody what happened. Players can never say "I hit him" - only "I pressed fire".
import { Room } from '@colyseus/core';
import { Simulation, OPERATORS } from '../../src/sim/world.js';
import { skinOk } from '../../src/sim/weapons.js';
import { sanitizeCmd, repeatCmd } from '../../src/sim/cmd.js';
import { STEP, SNAP_EVERY, packSnapshot, packRoster, unpackCmd } from '../../src/net/protocol.js';
import { ClientGuard, TickStats } from './limits.js';
import { accountService } from './account-service.js';

const STEP_MS = 1000 / 60;
export const DEFAULTS = { lobbySecs: 15, total: 16, maxClients: 16, overLingerSecs: 12, vehicles: true, loot: true, difficulty: 'normal', reconnectSecs: 12, maxRooms: 40, compress: true };
const MAX_QUEUE = 40;           // never hold more than this many unprocessed inputs per player (stops flooding)
const REPEAT_MAX = 3;           // if a player's input is late, repeat the last one for at most 3 ticks, then stand still

const cleanName = (n) => String(n ?? 'Operator').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16) || 'Operator';

export class MatchRoom extends Room {
  static cfg = { ...DEFAULTS };
  static async onAuth(token) {
    if (!token) return { accountId: null };
    return await accountService.consumeRoomTicket(token) ?? false;
  }
  static instances = new Set();   // (tests peek into running matches)
  /** counters for /metrics (all matches on this process) */
  static stats = { started: Date.now(), roomsCreated: 0, joins: 0, kicks: 0, dropped: 0, badMessages: 0, reconnects: 0, reconnectsFailed: 0, refused: 0, matchesStarted: 0, matchesFinished: 0, tick: new TickStats() };
  maxClients = MatchRoom.cfg.maxClients;

  onCreate() {
    this.cfg = MatchRoom.cfg;
    if (MatchRoom.instances.size >= this.cfg.maxRooms) { MatchRoom.stats.refused++; throw new Error('server busy - try again in a minute'); }       // never run more matches than the machine can host
    MatchRoom.instances.add(this); MatchRoom.stats.roomsCreated++;
    this.guards = new Map();      // sessionId -> ClientGuard (rate limits)
    this.lobby = new Map();       // sessionId -> { client, name, operator }
    this.sim = null;
    this.q = new Map();           // fighter id -> { cmds:[], last, ack, started, repeats }
    this.byClient = new Map();    // sessionId -> fighter
    this.accountByFighter = new Map();
    this.awardedResults = new Set();
    this.lobbyLeft = this.cfg.lobbySecs;
    this.evBuf = []; this.acc = 0; this.last = performance.now();
    this.onMessage('c', (client, data) => { if (this._allow(client, 'c')) this._onCmds(client, data); });
    this.onMessage('ping', (client, t) => { if (this._allow(client, 'ping') && Number.isFinite(t)) client.send('pong', t); });
    this.onMessage('*', (client) => { MatchRoom.stats.badMessages++; this._allow(client, 'other'); });             // unknown message types are never legitimate
    this.clock.setInterval(() => this._lobbyTick(), 500);
  }

  /** per-connection rate limit; kicks a client that keeps flooding after being told to slow down */
  _allow(client, type) {
    let g = this.guards.get(client.sessionId); if (!g) this.guards.set(client.sessionId, (g = new ClientGuard(performance.now())));
    const r = g.check(type, performance.now());
    if (r === 'ok') return true;
    if (g.kicked) return false;                                                            // already being thrown out: ignore the rest of the flood
    MatchRoom.stats.dropped++;
    if (r === 'kick') { g.kicked = true; MatchRoom.stats.kicks++; client.leave(4003, 'too many messages'); }
    return false;
  }

  onJoin(client, options, auth = null) {
    MatchRoom.stats.joins++;
    this.lobby.set(client.sessionId, { client, name: cleanName(options?.name), operator: String(options?.operator ?? ''), skin: skinOk(options?.skin), accountId: typeof auth?.accountId === 'string' ? auth.accountId : null });
    if (this.lobby.size >= this.maxClients) this._start();
    else this._sendLobby();
  }

  /** the connection died without the player leaving (wifi blip, tab refresh): keep the fighter standing for a few seconds so they can come back */
  onDrop(client, code) {
    const f = this.byClient.get(client.sessionId);
    if (!f || !this.sim || this.sim.state === 'over' || !f.alive) return;                 // lobby, finished match or dead player: nothing to come back to
    const q = this.q.get(f.id); if (q) { q.offline = true; q.cmds.length = 0; }
    this.allowReconnection(client, this.cfg.reconnectSecs);                                // Colyseus calls onReconnect when they are back, or onLeave when the window runs out
  }

  onReconnect(client) {
    MatchRoom.stats.reconnects++;
    const p = this.lobby.get(client.sessionId); if (p) p.client = client;
    const f = this.byClient.get(client.sessionId), q = f && this.q.get(f.id);
    if (q) { q.offline = false; q.cmds.length = 0; q.started = false; q.repeats = 0; }
    this.guards.delete(client.sessionId);
  }

  onLeave(client, code) {
    this.guards.delete(client.sessionId);
    const gone = this.byClient.get(client.sessionId); if (gone && this.q.get(gone.id)?.offline) MatchRoom.stats.reconnectsFailed++;
    this.lobby.delete(client.sessionId);
    const f = this.byClient.get(client.sessionId);
    if (f && this.sim) {
      this.sim.botify(f); this.q.delete(f.id); this.byClient.delete(client.sessionId);
      if (!this.sim.humans.length) this.disconnect();
    } else if (!this.sim) this._sendLobby();
  }

  /** numbers for /metrics and /health (everything on this process) */
  static metrics() {
    const rooms = [...MatchRoom.instances], s = MatchRoom.stats;
    let playing = 0, lobby = 0, humans = 0, bots = 0, offline = 0;
    for (const r of rooms) {
      if (r.sim) { playing++; humans += r.sim.humans.length; bots += r.sim.fighters.filter((f) => f.brain && f.alive).length; for (const q of r.q.values()) if (q.offline) offline++; } else { lobby++; humans += r.lobby.size; }
    }
    const m = process.memoryUsage();
    return {
      ok: true, uptimeSecs: Math.round((Date.now() - s.started) / 1000), rooms: { total: rooms.length, playing, lobby, max: MatchRoom.cfg.maxRooms },
      players: { humans, botsAlive: bots, offline }, tick: s.tick.summary(),
      counters: { roomsCreated: s.roomsCreated, joins: s.joins, matchesStarted: s.matchesStarted, matchesFinished: s.matchesFinished, rateLimited: s.dropped, kicks: s.kicks, badMessages: s.badMessages, reconnects: s.reconnects, reconnectsFailed: s.reconnectsFailed, refused: s.refused },
      memoryMB: { rss: Math.round(m.rss / 1048576), heapUsed: Math.round(m.heapUsed / 1048576) },
    };
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
    MatchRoom.stats.matchesStarted++;
    this.sim = await Simulation.create({ seed, bots: Math.max(0, this.cfg.total - humans.length), humans, propsFixed: true, difficulty: this.cfg.difficulty, ...(this.cfg.vehicles === false ? { vehicles: false } : {}), ...(this.cfg.loot === false ? {} : { loot: true }), ...(this.cfg.drop ? { drop: true } : {}) });
    const roster = packRoster(this.sim);
    for (const f of this.sim.humans) {
      this.byClient.set(f.sessionId, f);
      const accountId = this.lobby.get(f.sessionId)?.accountId;
      if (accountId) this.accountByFighter.set(f.id, accountId);
      this.q.set(f.id, { cmds: [], last: null, ack: 0, started: false, repeats: 0 });
      this.lobby.get(f.sessionId)?.client.send('welcome', { id: f.id, seed, mapSeed: this.sim.opts.mapSeed ?? 7, weather: this.sim.weather.id, vehicles: this.cfg.vehicles === false ? false : true, loot: this.cfg.loot === false ? false : true, drop: !!this.cfg.drop, tick: this.sim.tick, roster, self: f.exportSelf() });
    }
    this.last = performance.now(); this.acc = 0;
    this.setSimulationInterval(() => this._pump(), 8);
  }


  _awardAccountResult(event) {
    const fighterId = event.to;
    if (this.awardedResults.has(fighterId)) return;
    const accountId = this.accountByFighter.get(fighterId);
    if (!accountId) return;
    this.awardedResults.add(fighterId);
    const result = {
      placement: event.placement,
      total: this.sim?.fighters.length ?? this.cfg.total,
      kills: event.kills,
      time: event.time,
      won: event.won === true,
    };
    const matchId = `${this.roomId ?? 'room'}:${this.sim?.seed ?? 0}:${fighterId}`;
    void accountService.recordServerMatch(accountId, result, matchId).catch((error) => {
      // Progression persistence failures must not interrupt a running match.
      console.error('[nighthawk] account result persistence failed', error?.message ?? error);
    });
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
    const t0 = performance.now();
    sim.step(STEP, cmds);
    MatchRoom.stats.tick.add(performance.now() - t0);
    for (const e of sim.drainEvents()) {
      if (e.t === 'end' && e.to !== undefined) this._awardAccountResult(e);
      this.evBuf.push(e);
    }
    if (sim.tick % SNAP_EVERY === 0 || sim.state === 'over') this._snapshot();
    if (sim.state === 'over' && !this.overSent) {
      this.overSent = true; MatchRoom.stats.matchesFinished++;
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
      const q = this.q.get(h.id); if (q?.offline) continue;                   // connection is down, they have a few seconds to come back
      client.send('s', h.alive ? { ...base, a: q?.ack ?? 0, me: h.exportSelf() } : { ...base, a: q?.ack ?? 0 });
    }
  }
}
