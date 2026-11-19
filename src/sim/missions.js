import { MissionAlertDirector } from './mission-alert.js';
// DUST LANTERN: first offline tactical operation. Pure simulation state; rendering lives in MissionView.
// This director is deliberately not enabled in online rooms until its state has a versioned server snapshot.
import { makeRng } from './rng.js';
import { findFreeSpot } from './map.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class DustLanternMission {
  constructor(sim) {
    this.sim = sim; this.id = 'dust-lantern'; this.name = 'DUST LANTERN'; this.title = 'OPERATION DUST LANTERN';
    this.rng = makeRng(((sim.seed | 0) ^ 0xD0571A7E) >>> 0 || 7);
    const sites = [
      { id: 'basin-yard', name: 'BASIN YARD', x: -31, z: -42 },
      { id: 'forward-outpost', name: 'FORWARD OUTPOST', x: -82, z: 63 },
    ];
    this.targetSite = sites[Math.floor(this.rng() * sites.length)];
    this.guardPost = findFreeSpot(sim.map, this.rng, this.targetSite.x, this.targetSite.z, 5, 2.2);
    this.insertion = findFreeSpot(sim.map, this.rng, -91, -82, 7, 2.2);
    this.extraction = { x: 56, z: 56, name: 'EXTRACTION PAD' };
    this.clues = [
      { id: 'radio', label: 'DAMAGED FIELD RADIO', ...findFreeSpot(sim.map, this.rng, -57, -38, 6, 1.2), found: false },
      { id: 'tracks', label: 'VEHICLE TRACKS', ...findFreeSpot(sim.map, this.rng, -4, 14, 7, 1.2), found: false },
      { id: 'access', label: 'ACCESS CARD', ...findFreeSpot(sim.map, this.rng, 43, -66, 7, 1.2), found: false },
    ];
    const hostageSpot = findFreeSpot(sim.map, this.rng, this.targetSite.x, this.targetSite.z, 5, 1.2);
    this.captive = { x: hostageSpot.x, z: hostageSpot.z, rescued: false, visible: false, path: [], pathAt: 0, separated: false };
    this.stage = 'recon';
    this.extractT = 0;
    this.elapsed = 0;
    this.finished = false;
    this.lastHint = '';
    this.alert = new MissionAlertDirector();
  }

  get foundCount() { return this.clues.reduce((n, clue) => n + (clue.found ? 1 : 0), 0); }
  get objective() {
    if (this.stage === 'recon') return `RECON: FIND 2 FIELD CLUES (${this.foundCount}/2)`;
    if (this.stage === 'recover') return `RECOVER TECHNICIAN AT ${this.targetSite.name}`;
    if (this.stage === 'extract') return 'ESCORT TECHNICIAN TO EXTRACTION';
    if (this.stage === 'complete') return 'OPERATION COMPLETE';
    return 'OPERATION FAILED';
  }

  // ---- what the HUD, minimap, event feed and debrief need (every mission offers these, so the UI never reads mission-specific fields) ----
  hudInfo(p) {
    const stage = this.stage;
    const nearClue = stage === 'recon' && this.clues.some((clue) => !clue.found && distance(p, clue) < 3.4);
    const nearCaptive = stage === 'recover' && distance(p, this.captive) < 3.5;
    return {
      title: this.title, objective: this.objective,
      detail: stage === 'recon' ? (nearClue ? 'PRESS E TO INVESTIGATE' : 'Search the marked evidence sites') : stage === 'recover' ? (nearCaptive ? 'PRESS E TO SECURE THE TECHNICIAN' : `Locate the technician · ${this.targetSite.name}`) : stage === 'extract' ? (this.captive.separated ? 'TECHNICIAN SEPARATED — MOVE CLOSER' : 'Keep the technician with you and reach the extraction pad') : stage === 'complete' ? 'Technician safely extracted' : 'Operation ended',
      progress: stage === 'recon' ? `${this.foundCount}/2 CLUES` : stage === 'extract' ? `${Math.min(100, Math.round(this.extractT / 4 * 100))}% EXTRACTION` : stage === 'recover' ? 'TARGET IDENTIFIED' : stage === 'complete' ? 'SUCCESS' : 'IN PROGRESS',
      bar: stage === 'recon' ? this.foundCount / 2 : stage === 'extract' ? this.extractT / 4 : stage === 'complete' ? 1 : 0,
    };
  }
  /** minimap markers: { kind: 'dot' | 'square' | 'ring', color, x, z } */
  mapMarkers(p) {
    const out = [];
    for (const clue of this.clues) if (!clue.found && distance(p, clue) < 22) out.push({ kind: 'dot', color: '#ffcf4d', x: clue.x, z: clue.z });
    if (this.stage === 'recover') out.push({ kind: 'square', color: '#ff9d45', x: this.captive.x, z: this.captive.z });
    if (this.stage === 'extract') out.push({ kind: 'ring', color: '#58d8ff', x: this.extraction.x, z: this.extraction.z });
    return out;
  }
  /** a sim 'mission' event -> the on-screen message (null = nothing to show) */
  eventMessage(e) {
    if (e.phase === 'clue') return { text: `EVIDENCE RECOVERED · ${e.count}/2`, color: '#ffcf4d', secs: 1.8, sfx: 'pickup' };
    if (e.phase === 'identified') return { text: `SITE IDENTIFIED · ${this.targetSite.name}`, color: '#58d8ff', secs: 2.6, sfx: 'contract', at: e };
    if (e.phase === 'rescued') return { text: 'TECHNICIAN SECURED · MOVE TO EXTRACTION', color: '#5be37a', secs: 2.8, sfx: 'healend' };
    return null;
  }
  debrief(won) { return won ? `Technician extracted safely · ${this.foundCount}/3 clues recovered · No persistent rewards yet` : 'The operator was lost before the technician could be extracted'; }
  get objectivesDone() { return this.foundCount; }

  /** E interaction. Returns true only when the mission consumed the interaction. */
  interact(operator) {
    if (!operator?.alive || this.finished) return false;
    if (this.stage === 'recon') {
      let best = null, bestD = 3.4;
      for (const clue of this.clues) {
        if (clue.found) continue;
        const d = distance(operator, clue);
        if (d < bestD) { best = clue; bestD = d; }
      }
      if (!best) return false;
      best.found = true;
      this.sim.emit({ t: 'mission', phase: 'clue', id: best.id, count: this.foundCount });
      if (this.foundCount >= 2) {
        this.stage = 'recover';
        this.captive.visible = true;
        this.sim.emit({ t: 'mission', phase: 'identified', site: this.targetSite.id, x: this.captive.x, z: this.captive.z });
      }
      return true;
    }
    if (this.stage === 'recover' && distance(operator, this.captive) < 3.5) {
      this.captive.rescued = true;
      this.stage = 'extract';
      this.sim.emit({ t: 'mission', phase: 'rescued', x: this.captive.x, z: this.captive.z });
      return true;
    }
    return false;
  }

  update(dt) {
    if (this.finished) return;
    this.elapsed += dt;
    this.alert.update(dt, this.sim.fighters);
    const operator = this.sim.player;
    if (this.stage !== 'extract' || !this.captive.rescued || !operator?.alive) return;

    const d = distance(operator, this.captive);
    this.captive.separated = d > 18;
    // Follow using the existing navigation grid; only one escort path is refreshed at a low rate.
    this.captive.pathAt -= dt;
    if (d > 3.1 && d < 30 && this.captive.pathAt <= 0) {
      this.captive.path = this.sim.nav?.findPath(this.captive.x, this.captive.z, operator.x, operator.z, 30000) ?? [];
      this.captive.pathAt = 0.8;
    }
    if (d > 3.1 && d < 30) {
      const waypoint = this.captive.path[0] ?? operator;
      const dx = waypoint.x - this.captive.x, dz = waypoint.z - this.captive.z, len = Math.hypot(dx, dz);
      if (len < 0.8 && this.captive.path.length) this.captive.path.shift();
      else if (len > 0.01) {
        const move = Math.min(len, 2.6 * dt);
        const nx = this.captive.x + dx / len * move, nz = this.captive.z + dz / len * move;
        if (!this.sim.nav?.blockedAt(nx, nz)) { this.captive.x = nx; this.captive.z = nz; }
      }
    }

    const atOperator = distance(operator, this.extraction) <= 8.5;
    const atCaptive = distance(this.captive, this.extraction) <= 10;
    if (atOperator && atCaptive) {
      this.extractT += dt;
      if (this.extractT >= 4) this.complete();
    } else this.extractT = Math.max(0, this.extractT - dt * 0.75);
  }

  complete() {
    if (this.finished) return;
    this.finished = true; this.stage = 'complete';
    this.sim.state = 'won';
    this.sim.result = { to: this.sim.player?.id ?? 0, won: true, placement: 1, kills: this.sim.player?.kills ?? 0, time: this.elapsed, mission: true, missionId: this.id ?? 'dust-lantern', missionName: this.name ?? 'DUST LANTERN' };
    this.sim.emit({ t: 'end', ...this.sim.result, mission: true, missionId: this.id ?? 'dust-lantern', missionName: this.name ?? 'DUST LANTERN', clues: this.foundCount, objectives: this.foundCount + 1 });
  }

  fail() {
    if (this.finished) return;
    this.finished = true; this.stage = 'failed';
  }

  snapshot() {
    return {
      id: 'dust-lantern', stage: this.stage, objective: this.objective, found: this.foundCount,
      clues: this.clues.map(({ id, x, z, found }) => ({ id, x, z, found })),
      captive: { x: this.captive.x, z: this.captive.z, rescued: this.captive.rescued, separated: this.captive.separated },
      extraction: { ...this.extraction }, extractT: clamp(this.extractT, 0, 4), elapsed: this.elapsed,
      alert: this.alert.snapshot(),
    };
  }
}


// ===================================================================================================================================================
// SIGNAL BLACKOUT: the second offline operation. A hostile signal-trace is closing on your unit: jam three relay nodes before it locks, then reach
// the extraction pad. Like the task lists in social-deduction games, the nodes can be done in ANY order, but every task is a held, interruptible
// action: start it with E, then stay within range for TASK.T seconds. Walking off or taking a hit cancels it (progress is lost), starting it
// pings the garrison, and finishing one sends the guards sweeping to the next node. The trace is a countdown, not an AI: it is plain arithmetic.
// Pure simulation state; rendering lives in mission-view.js. Not enabled online (no versioned snapshot protocol for mission state yet).
// ===================================================================================================================================================
export const TASK = { T: 5, RANGE: 3.4, HOLD_RANGE: 4.4 };
export const TRACE_T = 480;                                       // seconds until the trace locks on (8 minutes)
const GF_SITES = [
  { id: 'relay-ridge', name: 'RELAY RIDGE', x: 58, z: -54 },
  { id: 'basin-yard', name: 'BASIN YARD', x: -38, z: -28 },
  { id: 'forward-outpost', name: 'FORWARD OUTPOST', x: -62, z: 54 },
  { id: 'dry-river', name: 'DRY RIVER', x: 0, z: 12 },
];
const GREEK = ['ALPHA', 'BRAVO', 'CHARLIE'];

export class SignalBlackoutMission {
  constructor(sim) {
    this.sim = sim; this.id = 'signal-blackout'; this.name = 'SIGNAL BLACKOUT'; this.title = 'OPERATION SIGNAL BLACKOUT';
    this.rng = makeRng(((sim.seed | 0) ^ 0x6057F4E9) >>> 0 || 9);
    this.insertion = findFreeSpot(sim.map, this.rng, 88, -84, 7, 2.2);
    this.extraction = { x: 56, z: 56, name: 'EXTRACTION PAD' };
    const pool = GF_SITES.slice();                                 // seeded Fisher-Yates: which three of the four sites carry a relay
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    this.nodes = pool.slice(0, 3).map((site, i) => ({
      id: `relay-${GREEK[i].toLowerCase()}`, name: `RELAY ${GREEK[i]}`, site: site.id, siteName: site.name,
      ...findFreeSpot(sim.map, this.rng, site.x + (i - 1) * 3, site.z, 8, 2), progress: 0, done: false,
    }));
    const far = this.nodes.reduce((a, b) => (distance(b, this.insertion) > distance(a, this.insertion) ? b : a));
    this.guardPost = findFreeSpot(sim.map, this.rng, far.x, far.z, 6, 2.2);       // the garrison sits at the relay farthest from where you land
    this.active = null; this.lastHp = null; this._warned = 0;
    this.stage = 'tasks'; this.extractT = 0; this.elapsed = 0; this.finished = false; this.reason = '';
    this.alert = new MissionAlertDirector();
  }

  get doneCount() { return this.nodes.reduce((n, node) => n + (node.done ? 1 : 0), 0); }
  get foundCount() { return this.doneCount; }
  get objectivesDone() { return this.doneCount; }
  get trace() { return Math.max(0, TRACE_T - this.elapsed); }
  get objective() {
    if (this.stage === 'tasks') return `JAM THE RELAY NODES (${this.doneCount}/3)`;
    if (this.stage === 'extract') return 'EXTRACT BEFORE THE TRACE LOCKS';
    if (this.stage === 'complete') return 'OPERATION COMPLETE';
    return this.reason === 'trace' ? 'TRACE LOCKED: OPERATION FAILED' : 'OPERATION FAILED';
  }
  static fmt(t) { const s = Math.ceil(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  hudInfo(p) {
    const near = this.stage === 'tasks' ? this.nodes.find((n) => !n.done && distance(p, n) < TASK.RANGE) : null;
    const a = this.active;
    const detail = this.stage === 'tasks'
      ? (a ? `SPLICING ${a.name} · HOLD POSITION · ${Math.round(a.progress / TASK.T * 100)}%` : near ? `PRESS E TO JAM ${near.name}` : 'Reach a relay node: any order. Walking off or getting hit cancels a task.')
      : this.stage === 'extract' ? 'All relays jammed. Reach the extraction pad' : this.stage === 'complete' ? 'Signal dark: the unit is clear' : (this.reason === 'trace' ? 'The trace found your unit' : 'Operation ended');
    return {
      title: this.title, objective: this.objective, detail,
      progress: this.stage === 'extract' ? `${Math.min(100, Math.round(this.extractT / 4 * 100))}% EXTRACTION · TRACE ${SignalBlackoutMission.fmt(this.trace)}` : `${this.doneCount}/3 RELAYS · TRACE ${SignalBlackoutMission.fmt(this.trace)}`,
      bar: a ? a.progress / TASK.T : this.stage === 'extract' ? this.extractT / 4 : this.stage === 'complete' ? 1 : this.doneCount / 3,
    };
  }
  mapMarkers() {                                                    // like a task list, every node is always on the map
    const out = this.nodes.map((n) => ({ kind: n.done ? 'square' : 'dot', color: n.done ? '#5be37a' : n === this.active ? '#ffffff' : '#ffcf4d', x: n.x, z: n.z }));
    if (this.stage === 'extract') out.push({ kind: 'ring', color: '#58d8ff', x: this.extraction.x, z: this.extraction.z });
    return out;
  }
  eventMessage(e) {
    if (e.phase === 'task') return { text: `${e.name}: SPLICING · HOLD POSITION`, color: '#58d8ff', secs: 1.6, sfx: 'ping' };
    if (e.phase === 'taskfail') return { text: e.reason === 'hit' ? 'TASK INTERRUPTED: YOU WERE HIT' : 'TASK INTERRUPTED: STAY IN RANGE', color: '#ff4d4d', secs: 1.8, sfx: 'dry' };
    if (e.phase === 'taskdone') return { text: `${e.name} JAMMED · ${e.count}/3 · GUARDS SWEEPING`, color: '#5be37a', secs: 2.2, sfx: 'healend' };
    if (e.phase === 'unlocked') return { text: 'ALL RELAYS DARK · REACH EXTRACTION', color: '#58d8ff', secs: 2.8, sfx: 'contract', at: e };
    if (e.phase === 'trace') return { text: `TRACE LOCK IN ${e.secs} SECONDS`, color: '#ff9a4d', secs: 2, sfx: 'whistle' };
    return null;
  }
  debrief(won) {
    return won ? `All relays jammed · extracted with ${SignalBlackoutMission.fmt(this.trace)} left on the trace · No persistent rewards yet`
      : this.reason === 'trace' ? `The trace locked on with ${this.doneCount}/3 relays jammed` : `The operator was lost with ${this.doneCount}/3 relays jammed`;
  }

  /** E: start the task at the nearest unfinished relay in range (cancelling any other). Returns true if the mission consumed the press. */
  interact(operator) {
    if (!operator?.alive || this.finished || this.stage !== 'tasks') return false;
    let best = null, bestD = TASK.RANGE;
    for (const node of this.nodes) { if (node.done) continue; const d = distance(operator, node); if (d < bestD) { best = node; bestD = d; } }
    if (!best) return false;
    if (this.active === best) return true;                          // already splicing: the press is just swallowed
    if (this.active) { this.active.progress = 0; this.active = null; }
    best.progress = 0; this.active = best; this.lastHp = operator.hp;
    this.sim.emit({ t: 'mission', phase: 'task', id: best.id, name: best.name, x: best.x, z: best.z });
    this.sim.alertGarrison?.(best, 1);                              // jamming a relay is loud: the garrison goes to look
    return true;
  }

  update(dt) {
    if (this.finished) return;
    this.elapsed += dt;
    this.alert.update(dt, this.sim.fighters);
    const op = this.sim.player;
    const warn = Math.ceil(this.trace);
    if ((warn === 60 || warn === 30 || warn === 10) && this._warned !== warn && this.stage !== 'complete') { this._warned = warn; this.sim.emit({ t: 'mission', phase: 'trace', secs: warn }); }
    if (this.trace <= 0) { this.timeout(); return; }
    if (!op?.alive) return;

    const a = this.active;
    if (a) {
      const hit = this.lastHp !== null && op.hp < this.lastHp - 1e-6;
      if (hit || distance(op, a) > TASK.HOLD_RANGE) {
        a.progress = 0; this.active = null;
        this.sim.emit({ t: 'mission', phase: 'taskfail', id: a.id, reason: hit ? 'hit' : 'moved' });
      } else {
        a.progress += dt;
        if (a.progress >= TASK.T) this._finishTask(a);
      }
    }
    this.lastHp = op.hp;

    if (this.stage === 'extract') {
      if (distance(op, this.extraction) <= 8.5) { this.extractT += dt; if (this.extractT >= 4) this.complete(); }
      else this.extractT = Math.max(0, this.extractT - dt * 0.75);
    }
  }

  _finishTask(node) {
    node.done = true; node.progress = TASK.T; this.active = null;
    this.sim.emit({ t: 'mission', phase: 'taskdone', id: node.id, name: node.name, count: this.doneCount, x: node.x, z: node.z });
    const next = this.nodes.find((n) => !n.done);
    if (next) this.sim.alertGarrison?.(next, 1);                    // the guards sweep to the next node: the longer you take, the more they know
    else { this.stage = 'extract'; this.sim.emit({ t: 'mission', phase: 'unlocked', x: this.extraction.x, z: this.extraction.z }); }
  }

  complete() {
    if (this.finished) return;
    this.finished = true; this.stage = 'complete'; this.sim.state = 'won';
    this.sim.result = { to: this.sim.player?.id ?? 0, won: true, placement: 1, kills: this.sim.player?.kills ?? 0, time: this.elapsed, mission: true, missionId: this.id, missionName: this.name };
    this.sim.emit({ t: 'end', ...this.sim.result, mission: true, clues: this.doneCount, objectives: this.doneCount + 1 });
  }
  /** the trace locks on: the operation is lost even though the operator is alive */
  timeout() {
    if (this.finished) return;
    this.finished = true; this.stage = 'failed'; this.reason = 'trace'; this.active = null; this.sim.state = 'lost';
    this.sim.result = { to: this.sim.player?.id ?? 0, won: false, placement: 0, kills: this.sim.player?.kills ?? 0, time: this.elapsed, mission: true, missionId: this.id, missionName: this.name, reason: 'trace' };
    this.sim.emit({ t: 'end', ...this.sim.result, clues: this.doneCount });
  }
  fail() { if (this.finished) return; this.finished = true; this.stage = 'failed'; this.active = null; }

  snapshot() {
    return {
      id: this.id, stage: this.stage, objective: this.objective, found: this.doneCount,
      nodes: this.nodes.map(({ id, x, z, done, progress }) => ({ id, x, z, done, progress: +progress.toFixed(3) })),
      active: this.active?.id ?? null, trace: +this.trace.toFixed(2), extraction: { ...this.extraction }, extractT: clamp(this.extractT, 0, 4), elapsed: this.elapsed,
      alert: this.alert.snapshot(),
    };
  }
}

// ---- registry: the one place that knows which operations exist ----
export const MISSIONS = {
  'dust-lantern': { id: 'dust-lantern', name: 'DUST LANTERN', blurb: 'Recon, rescue, extract', create: (sim) => new DustLanternMission(sim) },
  'signal-blackout': { id: 'signal-blackout', name: 'SIGNAL BLACKOUT', blurb: 'Jam three relays before the trace locks', create: (sim) => new SignalBlackoutMission(sim) },
};
export const MISSION_IDS = Object.keys(MISSIONS);
/** a fresh mission director for `id`, or null for no / an unknown id */
export function createMission(id, sim) { return MISSIONS[id]?.create(sim) ?? null; }
