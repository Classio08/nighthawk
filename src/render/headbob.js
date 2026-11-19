// First-person body motion, derived from what the simulation already says (speed, stance, ground contact). Presentation only: it never touches the
// sim, hitboxes or the aim ray. Pure maths (no three.js, no DOM) so it is unit-tested; main.js adds the result on top of the eye height.
//   * footsteps and bob share ONE phase, so the sound lands at the lowest point of each step
//   * a hard landing dips the eyes and springs back; a slide tilts the view and widens the FOV; a mantle looks up at the ledge
// `enabled:false` (the accessibility toggle) zeroes every camera offset; the step and landing events still come out for audio.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const BOB = {
  STEP_WALK: 0.4, STEP_SPRINT: 0.27, STEP_CROUCH: 0.55,    // seconds per footstep
  AMP_WALK: 0.035, AMP_SPRINT: 0.055, AMP_CROUCH: 0.018,   // metres of vertical bob
  MIN_SPEED: 2,
  LAND_MIN_VY: -9.5,                                        // a flat jump lands at ~8.2 m/s (sim JUMP): only a real drop (about 3 m or more) dips the view
  LAND_MAX_DIP: 0.3,
  SLIDE_ROLL: 0.1, SLIDE_FOV: 6, MANTLE_PITCH: 0.14,
};

export class ViewMotion {
  constructor() {
    this.phase = 0; this.side = 1; this.moveK = 0; this.dip = 0; this.slideK = 0; this.mantleK = 0;
    this.wasGrounded = true; this.fallVy = 0;
  }
  /** @param s {speed, sprinting, crouch, grounded, vy, sliding, mantling, enabled} @returns {y, roll, pitch, fov, stepped, landed} */
  update(dt, s) {
    const moving = s.grounded && s.speed > BOB.MIN_SPEED && !s.sliding && !s.mantling;
    const interval = s.sprinting ? BOB.STEP_SPRINT : s.crouch ? BOB.STEP_CROUCH : BOB.STEP_WALK;
    let stepped = false;
    if (moving) { this.phase += dt / interval; while (this.phase >= 1) { this.phase -= 1; this.side = -this.side; stepped = true; } }
    else this.phase = this.phase > 0.5 ? Math.min(1, this.phase + dt * 4) % 1 : Math.max(0, this.phase - dt * 4);       // settle to the planted-foot pose
    this.moveK += ((moving ? 1 : 0) - this.moveK) * (1 - Math.exp(-10 * dt));

    // landing: remember the fall speed while airborne, dip when the feet touch down hard
    let landed = 0;
    if (!s.grounded) this.fallVy = Math.min(this.fallVy, s.vy);
    else if (!this.wasGrounded) {
      if (this.fallVy < BOB.LAND_MIN_VY) { landed = clamp((-this.fallVy + BOB.LAND_MIN_VY) / 10, 0, 1); this.dip = Math.max(this.dip, landed * BOB.LAND_MAX_DIP); }
      this.fallVy = 0;
    }
    this.wasGrounded = s.grounded;
    this.dip += (0 - this.dip) * (1 - Math.exp(-9 * dt));

    this.slideK += ((s.sliding ? 1 : 0) - this.slideK) * (1 - Math.exp(-12 * dt));
    this.mantleK += ((s.mantling ? 1 : 0) - this.mantleK) * (1 - Math.exp(-14 * dt));

    if (s.enabled === false) return { y: 0, roll: 0, pitch: 0, fov: 0, stepped, landed };
    const amp = (s.sprinting ? BOB.AMP_SPRINT : s.crouch ? BOB.AMP_CROUCH : BOB.AMP_WALK) * clamp(s.speed / 6, 0.4, 1.3) * this.moveK;
    const swing = Math.sin(Math.PI * this.phase);
    return {
      y: amp * (swing - 0.64) - this.dip,                                       // lowest at the footfall, highest mid-stride (0.64 = mean of the swing)
      roll: this.side * amp * 0.16 * swing + this.slideK * BOB.SLIDE_ROLL,
      pitch: this.mantleK * BOB.MANTLE_PITCH,
      fov: this.slideK * BOB.SLIDE_FOV,
      stepped, landed,
    };
  }
}
