// A squad = 2-3 bots that radio each other. One shared "blackboard": who the squad is fighting and where the enemy was last seen.
//   * RADIO: when one member sees an enemy, the others (within radio range) learn the position after a short human-like delay.
//   * FLANK: the member who is NOT the closest to the enemy swings round to the side while the others pin the enemy down.
//   * SUPPRESS: the pinner keeps firing bursts at the last known position (even without line of sight) while the flanker moves.
//   * Allies never shoot each other - until the zone gets small (phase 3): then the alliance breaks, "last one standing" must be decided.
const RADIO_RANGE = 75, CONTACT_LIFE = 6;
const SQUAD_BREAK_PHASE = 3;

export class Squad {
  constructor(sim, id) { this.sim = sim; this.id = id; this.members = []; this.contact = null; this.radioLog = 0; }
  add(f) { this.members.push(f); f.squad = this; }
  get alive() { return this.members.filter((m) => m.alive); }
  /** are squad-mates still allies right now? */
  get united() { return this.sim.zone.phase < SQUAD_BREAK_PHASE; }
  allies(a, b) { return this.united && a !== b && a.squad === this && b.squad === this; }

  /** a member saw an enemy: update the blackboard and call it out on the radio */
  report(reporter, enemy) {
    const t = this.sim.time, c = this.contact;
    if (c && c.id === enemy.id && t - c.t < 0.4) { c.x = enemy.x; c.z = enemy.z; c.t = t; return; }   // same enemy, just refresh
    this.contact = { id: enemy.id, x: enemy.x, z: enemy.z, t, by: reporter.id };
    for (const m of this.alive) {
      if (m === reporter || !m.brain) continue;
      if (Math.hypot(m.x - reporter.x, m.z - reporter.z) > RADIO_RANGE) continue;
      m.brain.radioIn(this.contact, 0.45 + this.sim.rng() * 0.6);
    }
    this.radioLog++;
  }

  fresh() { return this.contact && this.sim.time - this.contact.t < CONTACT_LIFE ? this.contact : null; }

  /** the member closest to the contact is the "pinner" (keeps the enemy busy), everybody else may flank */
  pinner() {
    const c = this.fresh(); if (!c) return null;
    let best = null, bd = 1e9;
    for (const m of this.alive) { const d = Math.hypot(m.x - c.x, m.z - c.z); if (d < bd) { bd = d; best = m; } }
    return best;
  }

  /** where should `f` go to get at the enemy from the side? (null = no flank for you) */
  flankPoint(f, insideAnyBox) {
    const c = this.fresh(); if (!c || !this.united || this.alive.length < 2) return null;
    if (this.pinner() === f) return null;
    const dx = f.x - c.x, dz = f.z - c.z, d = Math.hypot(dx, dz);
    if (d < 9 || d > 70) return null;
    const ux = dx / d, uz = dz / d;
    const side = (f.id % 2 ? 1 : -1);
    const px = -uz * side, pz = ux * side;                   // sideways
    const r = Math.min(16, d * 0.7);
    for (const k of [1, 0.75, 0.5]) {
      const x = c.x + (ux * 0.45 + px * 0.9) * r * k, z = c.z + (uz * 0.45 + pz * 0.9) * r * k;
      if (!insideAnyBox(this.sim.map, x, z, 1.5)) return { x, z };
    }
    return null;
  }
}
