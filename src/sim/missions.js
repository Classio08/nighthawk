import { MissionAlertDirector } from './mission-alert.js';
// DUST LANTERN: first offline tactical operation. Pure simulation state; rendering lives in MissionView.
// This director is deliberately not enabled in online rooms until its state has a versioned server snapshot.
import { makeRng } from './rng.js';
import { findFreeSpot } from './map.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class DustLanternMission {
  constructor(sim) {
    this.sim = sim;
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
