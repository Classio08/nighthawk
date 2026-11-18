// A tiny damped spring. This one idea makes the gun feel alive:
//   - mouse look  -> the gun LAGS behind, then swings back (sway)
//   - firing      -> impulse() kicks it, it overshoots, settles (recoil)
//   - landing, sprint, reload, camera shake all reuse it.
// k = stiffness (bigger = snappier), d = damping (bigger = less wobble).
// It sub-steps so a slow frame (big dt) can never explode the spring.
export class Spring {
  constructor(k = 120, d = 14, x = 0) { this.k = k; this.d = d; this.x = x; this.v = 0; this.target = x; }
  impulse(v) { this.v += v; return this; }
  set(x) { this.x = x; this.v = 0; this.target = x; return this; }
  step(dt) {
    dt = Math.min(dt, 0.1);
    const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (this.k * (this.target - this.x) - this.d * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}
