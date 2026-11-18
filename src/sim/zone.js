// The shrinking safe zone (PUBG-style). Pure maths: no physics, no graphics.
import { START_RADIUS } from './map.js';

// wait = seconds the circle stays still, shrink = seconds it takes to close, radius = size after shrinking, dps = damage/s outside
export const ZONE_PHASES = [
  { wait: 22, shrink: 28, radius: 68, dps: 1.5 },
  { wait: 18, shrink: 24, radius: 42, dps: 3 },
  { wait: 14, shrink: 20, radius: 22, dps: 5 },
  { wait: 10, shrink: 16, radius: 9, dps: 8 },
  { wait: 8, shrink: 12, radius: 2, dps: 12 },
];

export class Zone {
  constructor(rng, startRadius = START_RADIUS) {
    this.rng = rng;
    this.cx = 0; this.cz = 0; this.radius = startRadius;
    this.fromX = 0; this.fromZ = 0; this.fromR = startRadius;
    this.phase = 0;            // index into ZONE_PHASES
    this.shrinking = false;
    this.t = 0;                // time inside current stage
    this.done = false;
    this._pickNext();
  }

  _pickNext() {
    const p = ZONE_PHASES[this.phase];
    if (!p) { this.done = true; this.nextX = this.cx; this.nextZ = this.cz; this.nextR = this.radius; return; }
    const room = Math.max(0, this.radius - p.radius) * 0.85; // new circle always stays inside the old one
    const a = this.rng() * Math.PI * 2, d = Math.sqrt(this.rng()) * room;
    this.nextX = this.cx + Math.cos(a) * d; this.nextZ = this.cz + Math.sin(a) * d; this.nextR = p.radius;
  }

  get dps() { return ZONE_PHASES[Math.min(this.phase, ZONE_PHASES.length - 1)].dps; }

  /** seconds until the next stage change (shrink starts / shrink ends) */
  get timeLeft() {
    const p = ZONE_PHASES[this.phase];
    if (!p) return 0;
    return (this.shrinking ? p.shrink : p.wait) - this.t;
  }

  update(dt) {
    if (this.done) return;
    const p = ZONE_PHASES[this.phase];
    this.t += dt;
    if (!this.shrinking) {
      if (this.t >= p.wait) { this.shrinking = true; this.t = 0; this.fromX = this.cx; this.fromZ = this.cz; this.fromR = this.radius; }
    } else {
      const k = Math.min(1, this.t / p.shrink);
      this.cx = this.fromX + (this.nextX - this.fromX) * k;
      this.cz = this.fromZ + (this.nextZ - this.fromZ) * k;
      this.radius = this.fromR + (this.nextR - this.fromR) * k;
      if (k >= 1) { this.shrinking = false; this.t = 0; this.phase++; this._pickNext(); }
    }
  }

  /** how far outside the safe circle (<= 0 means inside) */
  outside(x, z) { return Math.hypot(x - this.cx, z - this.cz) - this.radius; }
  /** is the point outside the circle that the zone is heading to? (bots start moving early) */
  outsideNext(x, z, margin = 0) { return Math.hypot(x - this.nextX, z - this.nextZ) - this.nextR > margin; }
}
