// "Trauma" screen shake (the trick from Squirrel Eiserloh's GDC talk): hits add trauma, trauma decays,
// the shake strength is trauma squared so small hits are subtle and big explosions are violent.
export class CameraFx {
  constructor() { this.trauma = 0; this.t = 0; this.out = { yaw: 0, pitch: 0, roll: 0 }; }
  add(a) { this.trauma = Math.min(1, this.trauma + a); }
  update(dt) {
    this.t += dt; this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const k = this.trauma * this.trauma, t = this.t * 38;
    this.out.yaw = k * 0.045 * (Math.sin(t * 1.1) + Math.sin(t * 2.3 + 1.7) * 0.5);
    this.out.pitch = k * 0.045 * (Math.sin(t * 1.3 + 4) + Math.sin(t * 2.9 + 0.4) * 0.5);
    this.out.roll = k * 0.06 * (Math.sin(t * 0.9 + 2) + Math.sin(t * 2.1) * 0.4);
    return this.out;
  }
}
