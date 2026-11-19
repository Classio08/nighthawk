// RELAY UPLINK: the third offline operation, from the owner's story pack ("hack it, hold it 60 seconds, get the truth out. Then run.").
//   approach  walk to Relay Ridge tower                     (the garrison sits at a separate post and is alerted when you start the hack)
//   hack      press E, then stay within range for HACK_T    (a hit or walking off cancels it: same rule as SIGNAL BLACKOUT's jams)
//   hold      the uplink needs HOLD_T seconds INSIDE the circle around the tower. While you are outside it the upload stalls, then bleeds back.
//             The Jackal sends raiders in three waves (3, then 5, then 7) from three directions around the tower, on a fixed clock.
//   extract   run to the pad; raiders still alive chase you.
// Waves are plain arithmetic on a clock plus the existing bot brain (a guard-type 'raider' personality whose post is the tower). Nothing here
// decides hits, movement or damage; the simulation does. Fighters are added through Simulation.spawnMissionFighter (the single audited spawn path).
// Offline only: no versioned server snapshot protocol for mission state yet (see docs/MISSION_RELAY_UPLINK.md).
import { MissionAlertDirector } from './mission-alert.js';
import { makeRng } from './rng.js';
import { findFreeSpot } from './map.js';
import { BotBrain } from './bot.js';
import { stealthTag } from './stealth.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const UPLINK = {
  HACK_T: 6, HACK_RANGE: 3.6, HACK_HOLD_RANGE: 4.6,       // seconds to start the upload / how close to press E / how far you may drift while it runs
  HOLD_T: 60, CIRCLE: 9, GRACE: 1.5, DECAY: 0.5,           // seconds of upload needed / circle radius (m) / seconds outside before it counts as a break / bleed-back rate while outside
  EXTRACT_T: 4, EXTRACT_R: 8.5, TIME_LIMIT: 900,           // dwell at the pad / pad radius / the whole operation must be done by then (seconds)
  RING: 40, LEASH: 14, CHASE_LEASH: 20, CHASE_EVERY: 1.5,  // raider spawn distance from the tower / how far from their post they range / run-phase chase
};
/** the owner's "first three, then five, then seven"; `at` is seconds on the hold clock (which keeps running while you are out of the circle) */
export const WAVES = [
  { at: 0, guns: ['smg', 'smg', 'smg'] },
  { at: 18, guns: ['smg', 'smg', 'smg', 'ar', 'ar'] },
  { at: 36, guns: ['smg', 'smg', 'smg', 'ar', 'ar', 'shotgun', 'lmg'] },
];
export const RAIDER = { HP: 100, SPEED: 9.5, COLOR: '#c9602a' };
const SITE = { x: 58, z: -54 };                              // Relay Ridge (same site SIGNAL BLACKOUT lists)
const GARRISON_SITE = { x: -38, z: -28 };                    // the garrison sits at Basin Yard, away from the tower

/** map north is -z, east is +x (the minimap's orientation). 8-point compass of the direction from `from` to `to`. */
export function compassOf(from, to) {
  const a = Math.atan2(to.x - from.x, -(to.z - from.z));      // 0 = north, clockwise
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
}

export class RelayUplinkMission {
  constructor(sim) {
    this.sim = sim; this.id = 'relay-uplink'; this.name = 'RELAY UPLINK'; this.title = 'OPERATION RELAY UPLINK';
    this.rng = makeRng(((sim.seed | 0) ^ 0x5E1A70B1) >>> 0 || 11);
    this.insertion = findFreeSpot(sim.map, this.rng, 88, 72, 7, 2.2);
    this.extraction = { x: -62, z: 60, name: 'EXTRACTION PAD' };
    this.tower = { id: 'relay-ridge', name: 'RELAY RIDGE', ...findFreeSpot(sim.map, this.rng, SITE.x, SITE.z, 6, 2.2) };
    this.guardPost = findFreeSpot(sim.map, this.rng, GARRISON_SITE.x, GARRISON_SITE.z, 5, 2.2);
    const base = this.rng() * Math.PI * 2;
    this.bearings = [0, 1, 2].map((i) => base + i * Math.PI * 2 / 3);        // three approach lines, 120 degrees apart
    this.stage = 'approach';
    this.hackP = 0; this.hackFails = 0; this.lastHp = null;
    this.uplink = 0; this.holdClock = 0; this.outsideT = 0; this.broken = false; this.holdBreaks = 0;
    this.waveIndex = 0; this.raiders = []; this.raidersKilled = 0;
    this.chaseT = 0; this.extractT = 0; this.elapsed = 0; this.finished = false; this.reason = ''; this._warned = 0;
    this.alert = new MissionAlertDirector();
  }

  /* ---------------- read-only views (HUD, minimap, debrief) ---------------- */
  get wavesSpawned() { return this.waveIndex; }
  get foundCount() { return { hold: 1, extract: 2, complete: 2 }[this.stage] ?? 0; }          // objectives done: hack, uplink (the pad is the third)
  get objectivesDone() { return this.foundCount; }
  get timeLeft() { return Math.max(0, UPLINK.TIME_LIMIT - this.elapsed); }
  get raidersAlive() { let n = 0; for (const f of this.raiders) if (f.alive) n++; return n; }
  get objective() {
    if (this.stage === 'approach') return 'REACH THE RELAY TOWER';
    if (this.stage === 'hack') return 'HACK STARTED: HOLD POSITION';
    if (this.stage === 'hold') return this.broken ? 'RETURN TO THE CIRCLE' : `HOLD THE UPLINK (${Math.floor(this.uplink)}/${UPLINK.HOLD_T} s)`;
    if (this.stage === 'extract') return 'UPLINK SENT: RUN TO EXTRACTION';
    if (this.stage === 'complete') return 'OPERATION COMPLETE';
    return this.reason === 'time' ? 'TIME UP: OPERATION FAILED' : 'OPERATION FAILED';
  }
  stats(won) {
    return { won: !!won, elapsed: this.elapsed, alertMax: this.alert.maxIndex, found: this.foundCount, total: 2,
      taskFails: this.hackFails + this.holdBreaks, hackFails: this.hackFails, holdBreaks: this.holdBreaks, uplink: this.uplink, wavesTotal: WAVES.length, wavesSpawned: this.waveIndex,
      raidersKilled: this.raidersKilled, raidersTotal: WAVES.reduce((n, w) => n + w.guns.length, 0), kills: this.sim.player?.kills ?? 0 };
  }

  hudInfo(p) { const info = this._hudInfo(p), tag = stealthTag(this.sim); return tag ? { ...info, detail: `${info.detail} · ${tag}` } : info; }
  _hudInfo(p) {
    const near = this.stage === 'approach' && p && distance(p, this.tower) < UPLINK.HACK_RANGE;
    const left = `${this.raidersAlive} RAIDERS`;
    const detail = this.stage === 'approach' ? (near ? 'PRESS E TO START THE UPLINK' : 'Reach the tower on Relay Ridge. Starting the hack is loud: the garrison will come.')
      : this.stage === 'hack' ? `SPLICING THE UPLINK · HOLD POSITION · ${Math.round(this.hackP / UPLINK.HACK_T * 100)}%`
      : this.stage === 'hold' ? `${this.broken ? 'UPLINK STALLED: GET BACK IN THE CIRCLE · ' : 'STAY IN THE CIRCLE · '}WAVE ${Math.max(1, this.waveIndex)}/${WAVES.length} · ${left}`
      : this.stage === 'extract' ? `Uplink sent. ${left} still hunting you. Reach the extraction pad`
      : this.stage === 'complete' ? 'The basin hears you' : (this.reason === 'time' ? 'The window closed' : 'Operation ended');
    const bar = this.stage === 'hack' ? this.hackP / UPLINK.HACK_T : this.stage === 'hold' ? this.uplink / UPLINK.HOLD_T : this.stage === 'extract' ? this.extractT / UPLINK.EXTRACT_T : this.stage === 'complete' ? 1 : 0;
    const progress = this.stage === 'hold' ? `UPLINK ${Math.round(this.uplink / UPLINK.HOLD_T * 100)}% · WAVE ${Math.max(1, this.waveIndex)}/${WAVES.length}`
      : this.stage === 'extract' ? `${Math.min(100, Math.round(this.extractT / UPLINK.EXTRACT_T * 100))}% EXTRACTION` : this.stage === 'hack' ? `HACK ${Math.round(this.hackP / UPLINK.HACK_T * 100)}%` : `UPLINK 0% · ${mmss(this.timeLeft)} LEFT`;
    return { title: this.title, objective: this.objective, detail, progress, bar };
  }
  mapMarkers() {
    const out = [{ kind: this.stage === 'extract' || this.stage === 'complete' ? 'square' : 'dot', color: this.stage === 'hold' ? '#ffffff' : this.stage === 'extract' || this.stage === 'complete' ? '#5be37a' : '#ffcf4d', x: this.tower.x, z: this.tower.z }];
    if (this.stage === 'hold') out.push({ kind: 'ring', color: '#58d8ff', x: this.tower.x, z: this.tower.z });
    if (this.stage === 'extract') out.push({ kind: 'ring', color: '#58d8ff', x: this.extraction.x, z: this.extraction.z });
    return out;
  }
  eventMessage(e) {
    if (e.phase === 'hack') return { text: 'UPLINK HACK STARTED · HOLD POSITION', color: '#58d8ff', secs: 1.8, sfx: 'ping' };
    if (e.phase === 'hackfail') return { text: e.reason === 'hit' ? 'HACK INTERRUPTED: YOU WERE HIT' : 'HACK INTERRUPTED: STAY IN RANGE', color: '#ff4d4d', secs: 1.8, sfx: 'dry' };
    if (e.phase === 'uplink') return { text: 'UPLINK OPEN · STAY IN THE CIRCLE · 60 SECONDS', color: '#58d8ff', secs: 2.6, sfx: 'contract', at: e };
    if (e.phase === 'wave') return { text: `WAVE ${e.n}/${WAVES.length} · ${e.count} RAIDERS FROM ${e.dirs.join(', ')}`, color: '#ff9a4d', secs: 3, sfx: 'whistle' };
    if (e.phase === 'holdbreak') return { text: 'UPLINK STALLED: GET BACK IN THE CIRCLE', color: '#ff4d4d', secs: 2, sfx: 'dry' };
    if (e.phase === 'holdresume') return { text: 'UPLINK RESUMED', color: '#5be37a', secs: 1.2, sfx: 'ping' };
    if (e.phase === 'sent') return { text: 'UPLINK COMPLETE · RUN TO EXTRACTION', color: '#5be37a', secs: 3, sfx: 'healend', at: e };
    if (e.phase === 'timewarn') return { text: `WINDOW CLOSES IN ${e.secs} SECONDS`, color: '#ff9a4d', secs: 2, sfx: 'whistle' };
    return null;
  }
  debrief(won) {
    return won ? `Uplink sent · ${this.raidersKilled}/${WAVES.reduce((n, w) => n + w.guns.length, 0)} raiders down · cosmetic ribbons only`
      : this.reason === 'time' ? `The window closed with the uplink at ${Math.round(this.uplink / UPLINK.HOLD_T * 100)}%`
        : `The operator was lost with the uplink at ${Math.round(this.uplink / UPLINK.HOLD_T * 100)}%`;
  }

  /* ---------------- E: start the hack ---------------- */
  interact(operator) {
    if (!operator?.alive || this.finished || this.stage !== 'approach') return false;
    if (distance(operator, this.tower) > UPLINK.HACK_RANGE) return false;
    this.stage = 'hack'; this.hackP = 0; this.lastHp = operator.hp;
    this.sim.emit({ t: 'mission', phase: 'hack', x: this.tower.x, z: this.tower.z });
    this.sim.alertGarrison?.(this.tower, 1);                      // splicing a tower is loud
    return true;
  }

  /* ---------------- tick ---------------- */
  update(dt) {
    if (this.finished) return;
    this.elapsed += dt;
    this.alert.update(dt, this.sim.fighters);
    const warn = Math.ceil(this.timeLeft);
    if ((warn === 60 || warn === 30 || warn === 10) && this._warned !== warn && this.stage !== 'complete') { this._warned = warn; this.sim.emit({ t: 'mission', phase: 'timewarn', secs: warn }); }
    if (this.timeLeft <= 0) { this.timeout(); return; }
    this._countRaiders();
    const op = this.sim.player;
    if (!op?.alive) return;

    if (this.stage === 'hack') this._tickHack(op, dt);
    else if (this.stage === 'hold') this._tickHold(op, dt);
    else if (this.stage === 'extract') this._tickExtract(op, dt);
    this.lastHp = op.hp;
  }

  _countRaiders() {                                               // raiders killed so far (by anyone): counted once each, from the live roster
    let dead = 0; for (const f of this.raiders) if (!f.alive) dead++;
    this.raidersKilled = dead;
  }

  _tickHack(op, dt) {
    const hit = this.lastHp !== null && op.hp < this.lastHp - 1e-6;
    if (hit || distance(op, this.tower) > UPLINK.HACK_HOLD_RANGE) {
      this.hackP = 0; this.stage = 'approach'; this.hackFails++;
      this.sim.emit({ t: 'mission', phase: 'hackfail', reason: hit ? 'hit' : 'moved' });
      return;
    }
    this.hackP += dt;
    if (this.hackP >= UPLINK.HACK_T) {
      this.stage = 'hold'; this.hackP = UPLINK.HACK_T; this.holdClock = 0; this.waveIndex = 0;
      this.sim.emit({ t: 'mission', phase: 'uplink', x: this.tower.x, z: this.tower.z });
      this._spawnDueWaves();                                      // wave 1 is on the clock at 0
    }
  }

  _tickHold(op, dt) {
    this.holdClock += dt;
    this._spawnDueWaves();
    if (distance(op, this.tower) <= UPLINK.CIRCLE) {
      this.outsideT = 0;
      if (this.broken) { this.broken = false; this.sim.emit({ t: 'mission', phase: 'holdresume' }); }
      this.uplink = Math.min(UPLINK.HOLD_T, this.uplink + dt);
    } else {
      this.outsideT += dt;
      if (this.outsideT > UPLINK.GRACE) {
        if (!this.broken) { this.broken = true; this.holdBreaks++; this.sim.emit({ t: 'mission', phase: 'holdbreak' }); }
        this.uplink = Math.max(0, this.uplink - dt * UPLINK.DECAY);
      }
    }
    if (this.uplink >= UPLINK.HOLD_T) this._uplinkSent();
  }

  _uplinkSent() {
    this.stage = 'extract'; this.broken = false; this.chaseT = 0;
    this._spawnDueWaves(true);                                    // (a wave still on the clock never gets skipped: the count the debrief shows is always 3/3 once the uplink is sent)
    this.sim.emit({ t: 'mission', phase: 'sent', x: this.extraction.x, z: this.extraction.z });
  }

  _tickExtract(op, dt) {
    this.chaseT -= dt;
    if (this.chaseT <= 0) {                                       // survivors turn from defending the tower to hunting the operator, like the hunter's trail but on a fixed beat
      this.chaseT = UPLINK.CHASE_EVERY;
      for (const f of this.raiders) if (f.alive && f.brain) { f.brain.post = { x: op.x, z: op.z }; f.brain.leash = UPLINK.CHASE_LEASH; }
    }
    if (distance(op, this.extraction) <= UPLINK.EXTRACT_R) { this.extractT += dt; if (this.extractT >= UPLINK.EXTRACT_T) this.complete(); }
    else this.extractT = Math.max(0, this.extractT - dt * 0.75);
  }

  /* ---------------- waves ---------------- */
  _spawnDueWaves(all = false) {
    while (this.waveIndex < WAVES.length && (all || this.holdClock >= WAVES[this.waveIndex].at)) this._spawnWave(this.waveIndex++);
  }

  _spawnWave(index) {
    const sim = this.sim, wave = WAVES[index], dirs = new Set(); let made = 0;
    wave.guns.forEach((gun, i) => {
      const b = this.bearings[i % 3];
      const spot = findFreeSpot(sim.map, this.rng, this.tower.x + Math.cos(b) * UPLINK.RING, this.tower.z + Math.sin(b) * UPLINK.RING, 7, 2.2);
      const op = { id: `raider${this.raiders.length}`, name: `Raider-${String(this.raiders.length + 1).padStart(2, '0')}`, color: RAIDER.COLOR, hp: RAIDER.HP, speed: RAIDER.SPEED, weapon: gun };
      const f = sim.spawnMissionFighter(op, spot);
      if (!f) return;                                             // roster full: the wave is smaller, never an error
      if (sim.opts.loot) f.loadoutRaider(gun); else f.cur = gun;
      f.brain = new BotBrain(sim, f, 0.55 + this.rng() * 0.25, 'raider');
      f.brain.post = { x: this.tower.x, z: this.tower.z }; f.brain.leash = UPLINK.LEASH;
      this.raiders.push(f); dirs.add(compassOf(this.tower, spot)); made++;
    });
    sim.emit({ t: 'mission', phase: 'wave', n: index + 1, count: made, dirs: [...dirs], x: this.tower.x, z: this.tower.z });
  }

  /* ---------------- endings ---------------- */
  complete() {
    if (this.finished) return;
    this.finished = true; this.stage = 'complete'; this._countRaiders(); this.sim.state = 'won';
    this.sim.result = { to: this.sim.player?.id ?? 0, won: true, placement: 1, kills: this.sim.player?.kills ?? 0, time: this.elapsed, mission: true, missionId: this.id, missionName: this.name };
    this.sim.emit({ t: 'end', ...this.sim.result, mission: true, clues: 2, objectives: 3 });
  }
  /** the window closed: the operation is lost even though the operator is alive */
  timeout() {
    if (this.finished) return;
    this.finished = true; this.stage = 'failed'; this.reason = 'time'; this._countRaiders(); this.sim.state = 'lost';
    this.sim.result = { to: this.sim.player?.id ?? 0, won: false, placement: 0, kills: this.sim.player?.kills ?? 0, time: this.elapsed, mission: true, missionId: this.id, missionName: this.name, reason: 'time' };
    this.sim.emit({ t: 'end', ...this.sim.result, clues: this.foundCount });
  }
  fail() { if (this.finished) return; this.finished = true; this.stage = 'failed'; this._countRaiders(); }

  snapshot() {
    return {
      id: this.id, stage: this.stage, objective: this.objective, tower: { x: this.tower.x, z: this.tower.z }, extraction: { ...this.extraction },
      hack: +clamp(this.hackP / UPLINK.HACK_T, 0, 1).toFixed(3), uplink: +this.uplink.toFixed(2), holdClock: +this.holdClock.toFixed(2), broken: this.broken,
      wave: this.waveIndex, raidersAlive: this.raidersAlive, raidersKilled: this.raidersKilled, extractT: clamp(this.extractT, 0, UPLINK.EXTRACT_T),
      timeLeft: +this.timeLeft.toFixed(1), elapsed: this.elapsed, alert: this.alert.snapshot(),
    };
  }
}

function mmss(t) { const s = Math.max(0, Math.ceil(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
