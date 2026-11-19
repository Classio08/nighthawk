// Faction intelligence is evidence-based and deterministic: guards can only report bodies
// they personally discover, and teammates receive a delayed, less precise radio estimate.
export class FactionIntelligence {
  constructor(sim, { scanInterval = 0.6, discoveryRange = 14, radioRange = 78 } = {}) {
    this.sim = sim;
    this.scanInterval = scanInterval;
    this.discoveryRange = discoveryRange;
    this.radioRange = radioRange;
    this.scanT = 0;
    this.knownBodies = new Set();
    this.pending = [];
    this.reports = [];
    this.discoveries = 0;
    this.delivered = 0;
  }

  _guards() {
    return this.sim.fighters.filter((f) => f.alive && f.npc && f.brain?.p?.guard);
  }

  _discover(guard, body) {
    const key = body.id;
    if (this.knownBodies.has(key)) return;
    this.knownBodies.add(key);
    this.discoveries++;
    const report = {
      kind: 'body',
      targetId: body.id,
      reporterId: guard.id,
      x: body.x,
      z: body.z,
      time: this.sim.time,
      confidence: 0.92,
    };
    this.reports.push(report);
    if (this.reports.length > 32) this.reports.shift();
    this.sim.emit?.({ t: 'intel', kind: 'body-found', by: guard.id, target: body.id, x: body.x, z: body.z });

    // A witness radios only guards who were plausibly in the same local patrol area.
    for (const receiver of this._guards()) {
      if (receiver === guard) continue;
      const d = Math.hypot(receiver.x - guard.x, receiver.z - guard.z);
      if (d > this.radioRange) continue;
      const uncertainty = 1.8 + this.sim.rng() * 3.4;
      const angle = this.sim.rng() * Math.PI * 2;
      const contact = {
        kind: 'body',
        x: body.x + Math.cos(angle) * uncertainty,
        z: body.z + Math.sin(angle) * uncertainty,
        confidence: Math.max(0.38, 0.92 - d / (this.radioRange * 1.8)),
      };
      const delay = 0.55 + this.sim.rng() * 0.8 + d / 150;
      this.pending.push({ receiverId: receiver.id, contact, at: this.sim.time + delay, report });
    }
  }

  _scanBodies() {
    const guards = this._guards();
    const bodies = this.sim.fighters.filter((f) => !f.alive && f.id !== undefined);
    for (const guard of guards) {
      for (const body of bodies) {
        if (this.knownBodies.has(body.id)) continue;
        const d = Math.hypot(body.x - guard.x, body.z - guard.z);
        if (d > this.discoveryRange) continue;
        if (!this.sim.canSee(guard, body, this.discoveryRange, 2.2)) continue;
        this._discover(guard, body);
      }
    }
  }

  _deliver() {
    const keep = [];
    for (const message of this.pending) {
      if (message.at > this.sim.time) { keep.push(message); continue; }
      const receiver = this.sim.fighters[message.receiverId];
      if (!receiver?.alive || !receiver.brain?.p?.guard) continue;
      receiver.brain.radioIn(message.contact, 0);
      this.delivered++;
    }
    this.pending = keep;
  }

  update(dt) {
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = this.scanInterval;
      this._scanBodies();
    }
    this._deliver();
  }

  snapshot() {
    return {
      discoveries: this.discoveries,
      delivered: this.delivered,
      pending: this.pending.length,
      last: this.reports.length ? { ...this.reports[this.reports.length - 1] } : null,
    };
  }
}
