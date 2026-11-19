// Data-driven offline operations built on the existing Simulation, garrison and contracts world.
// Each operation owns only objective state; movement, weapons, guards and extraction use shared systems.
import { makeRng } from './rng.js';
import { findFreeSpot } from './map.js';
import { MissionAlertDirector } from './mission-alert.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function pad(sim) {
  const landmark = sim.map.landmarks?.find((p) => p.id === 'extraction-pad');
  return landmark ? { x: landmark.x, z: landmark.z, name: 'EXTRACTION PAD' } : { x: 56, z: 56, name: 'EXTRACTION PAD' };
}
function finish(sim, mission) {
  if (mission.finished) return;
  mission.finished = true; mission.stage = 'complete'; sim.state = 'won';
  sim.result = { to: sim.player?.id ?? 0, won: true, placement: 1, kills: sim.player?.kills ?? 0, time: mission.elapsed, mission: true, missionId: mission.id };
  sim.emit({ t: 'end', ...sim.result, mission: true, missionId: mission.id, objectives: mission.objectiveCount ?? 0 });
}
function fail(mission) {
  if (mission.finished) return;
  mission.finished = true; mission.stage = 'failed';
}

export class GhostFrequencyMission {
  constructor(sim) {
    this.id = 'ghost-frequency'; this.name = 'GHOST FREQUENCY'; this.sim = sim;
    this.rng = makeRng(((sim.seed | 0) ^ 0x6A057F31) >>> 0 || 19);
    const anchors = [
      { x: -42, z: -24, label: 'BASIN YARD TRANSMITTER' },
      { x: 1, z: 18, label: 'DRY RIVER TRANSMITTER' },
      { x: 60, z: -55, label: 'RELAY RIDGE TRANSMITTER' },
    ];
    this.clues = anchors.map((a, i) => ({
      id: `transmitter-${i + 1}`, label: a.label,
      ...findFreeSpot(sim.map, this.rng, a.x, a.z, 5.5, 1.2), found: false,
    }));
    const ridge = sim.map.landmarks?.find((p) => p.id === 'relay-ridge') ?? { x: 58, z: -54 };
    this.target = findFreeSpot(sim.map, this.rng, ridge.x, ridge.z, 4, 2);
    this.target.name = 'ENCRYPTED RELAY TERMINAL';
    this.discoveryRange = 14;
    this.captive = { x: 0, z: 0, rescued: false, visible: false, separated: false };
    this.extraction = pad(sim);
    this.stage = 'recon'; this.hackStarted = false; this.hackT = 0; this.extractT = 0;
    this.hackDuration = 28; this.elapsed = 0; this.finished = false; this.alert = new MissionAlertDirector();
    this.lastHint = '';
  }
  get foundCount() { return this.clues.reduce((n, c) => n + (c.found ? 1 : 0), 0); }
  get objectiveCount() { return this.foundCount + (this.hackT >= this.hackDuration ? 1 : 0); }
  get objective() {
    if (this.stage === 'recon') return `LOCATE 3 TRANSMITTERS (${this.foundCount}/3)`;
    if (this.stage === 'hack') return this.hackStarted ? 'TRACE THE GHOST FREQUENCY' : 'ACTIVATE THE RELAY TRACE';
    if (this.stage === 'extract') return 'EXTRACT THE SIGNAL INTELLIGENCE';
    if (this.stage === 'complete') return 'INTELLIGENCE RECOVERED';
    return 'OPERATION FAILED';
  }
  detailFor(player) {
    if (this.stage === 'recon') {
      const next = this.clues.filter((c) => !c.found).sort((a, b) => distance(player, a) - distance(player, b))[0];
      const d = next ? distance(player, next) : Infinity;
      return next && d < this.discoveryRange ? `SIGNAL LOCK ${Math.round((1 - d / this.discoveryRange) * 100)}% · ${next.label}` : 'Follow the receiver tone; signal strength increases near an active transmitter';
    }
    if (this.stage === 'hack') return this.hackStarted ? `TRACE ${Math.round(this.hackT / this.hackDuration * 100)}% · stay near the terminal` : 'Reach Relay Ridge and activate the trace terminal';
    if (this.stage === 'extract') return 'Move to the extraction pad and hold the area';
    return 'Operation ended';
  }
  interact(operator) {
    if (!operator?.alive || this.finished) return false;
    if (this.stage === 'recon') {
      let best = null, bestD = 5.2;
      for (const clue of this.clues) if (!clue.found) {
        const d = distance(operator, clue);
        if (d < bestD) { best = clue; bestD = d; }
      }
      if (!best) return false;
      best.found = true;
      this.sim.emit({ t: 'mission', phase: 'transmitter', id: best.id, count: this.foundCount });
      if (this.foundCount === 3) {
        this.stage = 'hack';
        this.sim.emit({ t: 'mission', phase: 'trace-unlocked', x: this.target.x, z: this.target.z });
      }
      return true;
    }
    if (this.stage === 'hack' && distance(operator, this.target) < 8.5) {
      this.hackStarted = true;
      this.sim.emit({ t: 'mission', phase: 'trace-started' });
      return true;
    }
    return false;
  }
  signalFor(player) {
    let best = null;
    for (const clue of this.clues) {
      if (clue.found) continue;
      const d = distance(player, clue), strength = clamp(1 - d / 70, 0, 1);
      if (!best || strength > best.strength) best = { strength, distance: d, id: clue.id };
    }
    return best ?? { strength: 0, distance: Infinity, id: null };
  }
  update(dt) {
    if (this.finished) return;
    this.elapsed += dt; this.alert.update(dt, this.sim.fighters);
    const p = this.sim.player;
    if (this.stage === 'hack' && this.hackStarted) {
      if (distance(p, this.target) <= 10) {
        this.hackT = Math.min(this.hackDuration, this.hackT + dt);
        if (this.hackT >= this.hackDuration) {
          this.stage = 'extract';
          this.sim.emit({ t: 'mission', phase: 'trace-complete' });
        }
      } else this.hackT = Math.max(0, this.hackT - dt * 0.28);
    }
    if (this.stage === 'extract') {
      if (distance(p, this.extraction) <= 9) {
        this.extractT += dt;
        if (this.extractT >= 4) finish(this.sim, this);
      } else this.extractT = Math.max(0, this.extractT - dt * 0.7);
    }
  }
  complete() { finish(this.sim, this); }
  fail() { fail(this); }
  snapshot() {
    return {
      id: this.id, name: this.name, stage: this.stage, objective: this.objective, found: this.foundCount,
      clues: this.clues.map(({ id, label, x, z, found }) => ({ id, label, x, z, found })),
      target: { ...this.target }, captive: { ...this.captive }, extraction: { ...this.extraction },
      extractT: clamp(this.extractT, 0, 4), hackT: this.hackT, hackStarted: this.hackStarted,
      elapsed: this.elapsed, alert: this.alert.snapshot(),
    };
  }
}

export class RelayUplinkMission {
  constructor(sim) {
    this.id = 'relay-uplink'; this.name = 'RELAY UPLINK'; this.sim = sim;
    this.rng = makeRng(((sim.seed | 0) ^ 0x0A11CE55) >>> 0 || 23);
    const ridge = sim.map.landmarks?.find((p) => p.id === 'relay-ridge') ?? { x: 58, z: -54 };
    this.target = findFreeSpot(sim.map, this.rng, ridge.x, ridge.z, 3.5, 2);
    this.target.name = 'RELAY UPLINK TERMINAL';
    this.clues = [];
    this.captive = { x: 0, z: 0, rescued: false, visible: false, separated: false };
    this.extraction = pad(sim); this.stage = 'approach'; this.elapsed = 0; this.finished = false;
    this.hackT = 0; this.hackDuration = 42; this.hackStarted = false;
    this.holdT = 0; this.holdDuration = 20; this.extractT = 0; this.alert = new MissionAlertDirector();
  }
  get foundCount() { return 0; }
  get objectiveCount() { return (this.hackT >= this.hackDuration ? 1 : 0) + (this.holdT >= this.holdDuration ? 1 : 0); }
  get objective() {
    if (this.stage === 'approach') return 'SECURE RELAY RIDGE';
    if (this.stage === 'hack') return `UPLOAD ENCRYPTED INTEL ${Math.floor(this.hackT / this.hackDuration * 100)}%`;
    if (this.stage === 'hold') return `DEFEND THE UPLINK ${Math.floor(this.holdT / this.holdDuration * 100)}%`;
    if (this.stage === 'extract') return 'EXTRACT THE UPLINK DATA';
    if (this.stage === 'complete') return 'UPLINK SECURED';
    return 'OPERATION FAILED';
  }
  detailFor(player) {
    if (this.stage === 'approach') return distance(player, this.target) < 8.5 ? 'PRESS E TO ACTIVATE THE RELAY' : 'Move to Relay Ridge and secure the terminal';
    if (this.stage === 'hack') return 'Stay within 10m of the terminal; leaving pauses the upload';
    if (this.stage === 'hold') return 'Hold the relay perimeter; nearby defenders contest progress';
    if (this.stage === 'extract') return 'Reach the extraction pad and hold for 4 seconds';
    return 'Operation ended';
  }
  interact(operator) {
    if (!operator?.alive || this.finished) return false;
    if (this.stage === 'approach' && distance(operator, this.target) < 8.5) {
      this.stage = 'hack'; this.hackStarted = true;
      this.sim.alertGarrison?.(this.target, 2);
      this.sim.emit({ t: 'mission', phase: 'uplink-started', x: this.target.x, z: this.target.z });
      return true;
    }
    return false;
  }
  update(dt) {
    if (this.finished) return;
    this.elapsed += dt; this.alert.update(dt, this.sim.fighters);
    const p = this.sim.player;
    if (this.stage === 'hack') {
      if (distance(p, this.target) <= 10) {
        const nearbyHumans = this.sim.humans.filter((h) => h.alive && distance(h, this.target) <= 10).length;
        this.hackT = Math.min(this.hackDuration, this.hackT + dt * (nearbyHumans > 1 ? 1.7 : 1));
        if (this.hackT >= this.hackDuration) {
          this.stage = 'hold'; this.sim.alertGarrison?.(this.target, 2);
          this.sim.emit({ t: 'mission', phase: 'uplink-live', x: this.target.x, z: this.target.z });
        }
      } else this.hackT = Math.max(0, this.hackT - dt * 0.18);
    } else if (this.stage === 'hold') {
      const contested = this.sim.fighters.some((f) => f.alive && f.npc && f.brain?.p?.guard && distance(f, this.target) < 5.5);
      if (!contested && distance(p, this.target) <= 12) this.holdT = Math.min(this.holdDuration, this.holdT + dt);
      else this.holdT = Math.max(0, this.holdT - dt * 0.35);
      if (this.holdT >= this.holdDuration) { this.stage = 'extract'; this.sim.restoreGarrison?.(); this.sim.emit({ t: 'mission', phase: 'uplink-secured' }); }
    } else if (this.stage === 'extract') {
      if (distance(p, this.extraction) <= 9) {
        this.extractT += dt;
        if (this.extractT >= 4) finish(this.sim, this);
      } else this.extractT = Math.max(0, this.extractT - dt * 0.7);
    }
  }
  complete() { finish(this.sim, this); }
  fail() { fail(this); }
  snapshot() {
    return {
      id: this.id, name: this.name, stage: this.stage, objective: this.objective,
      found: 0, clues: [], target: { ...this.target }, captive: { ...this.captive }, extraction: { ...this.extraction },
      hackT: this.hackT, holdT: this.holdT, extractT: this.extractT, elapsed: this.elapsed,
      alert: this.alert.snapshot(),
    };
  }
}

export function createMission(id, sim) {
  if (id === 'dust-lantern') return new DustLanternPlaceholder(sim);
  if (id === 'ghost-frequency') return new GhostFrequencyMission(sim);
  if (id === 'relay-uplink') return new RelayUplinkMission(sim);
  return null;
}

// Kept as a late-bound import boundary to avoid changing the original mission's public module path.
import { DustLanternMission } from './missions.js';
class DustLanternPlaceholder extends DustLanternMission {
  constructor(sim) {
    super(sim);
    this.id = 'dust-lantern';
    this.name = 'DUST LANTERN';
  }
}
