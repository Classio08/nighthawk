// Deterministic, evidence-based alert pressure for offline mission NPCs.
// It observes only information already held by living guard brains; it never grants omniscient player tracking.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class MissionAlertDirector {
  constructor() {
    this.pressure = 0;
    this.level = 'routine';
    this.observers = 0;
    this.lastEvidence = 'none';
  }

  update(dt, fighters) {
    const guards = fighters.filter((fighter) => fighter.alive && fighter.npc && fighter.brain?.p?.guard);
    let evidence = 0, observers = 0, kind = 'none';
    for (const guard of guards) {
      const brain = guard.brain;
      if (brain.visible && brain.target?.alive) {
        evidence = Math.max(evidence, 1);
        observers++;
        kind = 'visual-contact';
      } else if (brain.heard && brain.heardT < 3) {
        evidence = Math.max(evidence, 0.68);
        kind = kind === 'visual-contact' ? kind : 'sound-investigation';
      } else if (brain.lastSeen && brain.lastSeenT < 8) {
        evidence = Math.max(evidence, 0.48);
        kind = kind === 'visual-contact' || kind === 'sound-investigation' ? kind : 'last-known-position';
      }
    }

    // Escalation is quick when guards have evidence; cooling off is deliberately slower.
    if (evidence > this.pressure) this.pressure = Math.min(evidence, this.pressure + dt * 2.4);
    else this.pressure = Math.max(evidence, this.pressure - dt * 0.11);
    this.pressure = clamp(this.pressure, 0, 1);
    this.observers = observers;
    if (evidence > 0) this.lastEvidence = kind;

    const next = this.pressure >= 0.92 ? 'crisis'
      : this.pressure >= 0.72 ? 'alert'
      : this.pressure >= 0.43 ? 'searching'
      : this.pressure >= 0.18 ? 'uneasy' : 'routine';
    const changed = next !== this.level;
    this.level = next;
    return changed;
  }

  snapshot() {
    return {
      level: this.level,
      pressure: +this.pressure.toFixed(3),
      observers: this.observers,
      evidence: this.lastEvidence,
    };
  }
}
