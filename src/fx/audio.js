// Sound = zzfx (MIT, ~1 KB): every sound is a small list of numbers that the browser turns into audio.
// No sound files to download or license. Design/tweak sounds at https://killedbyapixel.github.io/ZzFX/
// and paste the numbers into SOUNDS below.
//
// zzfx parameter order: volume, randomness, frequency, attack, sustain, release, shape(0 sin 1 tri 2 saw 3 tan 4 noise),
//   shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter
const SOUNDS = {
  ar:        [1.0, .08, 130, 0, .01, .10, 4, 2.0, -8, 0, 0, 0, 0, 3, 0, .10, 0, .50, .04],
  smg:       [0.8, .10, 180, 0, .01, .07, 4, 2.0, -9, 0, 0, 0, 0, 3, 0, .10, 0, .50, .03],
  shotgun:   [1.4, .05, 70,  0, .02, .30, 4, 2.4, -5, 0, 0, 0, 0, 8, 0, .35, 0, .60, .12],
  dmr:       [1.3, .03, 55,  0, .02, .38, 4, 2.2, -4, 0, 0, 0, 0, 5, 0, .20, 0, .60, .16],
  lmg:       [1.0, .08, 105, 0, .01, .12, 4, 2.0, -7, 0, 0, 0, 0, 4, 0, .15, 0, .55, .05],
  pistol:    [0.9, .06, 210, 0, .01, .11, 4, 2.0, -10, 0, 0, 0, 0, 2, 0, .10, 0, .50, .03],
  hit:       [0.55, 0, 1900, 0, .006, .035, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .8, .01],
  headshot:  [0.7, 0, 2700, 0, .012, .09, 0, 1, 0, 0, 900, .02, 0, 0, 0, 0, 0, .8, .02],
  kill:      [0.8, 0, 520, 0, .03, .22, 1, 1.5, 0, 0, 340, .06, 0, 0, 0, 0, 0, .7, .06],
  hurt:      [0.8, .1, 150, 0, .02, .16, 2, 1, -12, 0, 0, 0, 0, 1, 0, .2, 0, .5, .05],
  explosion: [1.6, .1, 55,  .01, .06, .85, 4, 2.2, -3, 0, 0, 0, 0, 9, 0, .45, 0, .70, .22],
  reload1:   [0.35, .1, 520, 0, .005, .035, 4, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, .5, .01],
  reload2:   [0.45, .1, 330, 0, .008, .05, 4, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, .6, .01],
  magin:     [0.5, .08, 240, 0, .012, .06, 4, 1, 0, 0, 0, 0, 0, 2, 0, .05, 0, .6, .02],
  charge:    [0.55, .1, 420, 0, .02, .09, 4, 1, 0, 0, 0, 0, .06, 3, 0, .1, 0, .6, .02],
  magdrop:   [0.4, .15, 1500, 0, .004, .07, 0, 1, 0, 0, 300, .01, 0, .5, 0, 0, 0, .7, .01],
  dry:       [0.35, 0, 900, 0, 0, .02, 4, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, .4, .005],
  switch:    [0.3, .05, 700, 0, .005, .04, 4, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, .5, .01],
  throw:     [0.4, .2, 280, .05, .08, .18, 4, 1, 3, 0, 0, 0, 0, 1, 0, 0, 0, .5, .05],
  step:      [0.18, .3, 70, 0, .01, .06, 4, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, .4, .01],
  zone:      [0.5, 0, 440, .02, .18, .30, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .5, .08],
  win:       [0.8, 0, 440, .02, .2, .6, 1, 1, 0, 0, 220, .12, 0, 0, 0, 0, 0, .7, .1],
  lose:      [0.8, 0, 200, .02, .3, .7, 2, 1, -2, 0, -80, .2, 0, 0, 0, 0, 0, .6, .1],
};

class Audio {
  constructor() { this.ok = false; this.z = null; this.cache = new Map(); this.lx = 0; this.lz = 0; this.lyaw = 0; this.active = 0; this.volume = 0.5; }

  /** Call from a click/key handler (browsers only allow sound after a user gesture). Safe to call many times. */
  async unlock() {
    if (this.ok || typeof window === 'undefined' || typeof AudioContext === 'undefined') return;
    try {
      this.z = await import('zzfx');
      this.z.ZZFX.volume = this.volume * 0.6;
      await this.z.ZZFX.audioContext.resume();
      this.ok = true;
    } catch { this.ok = false; }
  }

  setListener(x, z, yaw) { this.lx = x; this.lz = z; this.lyaw = yaw; }

  /**
   * play('ar', {x, z}) -> positional (volume falls with distance, pans left/right). Without x/z it is a UI sound.
   * `vol` multiplies, `rate` changes pitch/speed (1 = normal).
   */
  play(name, o = {}) {
    if (!this.ok || this.active > 22) return;
    const def = SOUNDS[name]; if (!def) return;
    let vol = (o.vol ?? 1), pan = 0;
    if (o.x !== undefined) {
      const dx = o.x - this.lx, dz = o.z - this.lz, d = Math.hypot(dx, dz), maxD = o.maxD ?? 110;
      if (d > maxD) return;
      vol *= Math.pow(1 - d / maxD, 1.6) * (d < 3 ? 1 : 1);
      if (d > 0.5) pan = Math.max(-1, Math.min(1, (dx * Math.cos(this.lyaw) - dz * Math.sin(this.lyaw)) / d)); // dot with the right vector
    }
    if (vol < 0.01) return;
    try {
      let samples = this.cache.get(name);
      if (!samples) { samples = this.z.ZZFX.buildSamples(...def); this.cache.set(name, samples); }
      this.active++;
      const node = this.z.ZZFX.playSamples([samples], vol, (o.rate ?? 1) * (1 + (Math.random() - 0.5) * 0.08), pan);
      const ms = (samples.length / this.z.ZZFX.sampleRate) * 1000 / (o.rate ?? 1);
      setTimeout(() => { this.active = Math.max(0, this.active - 1); }, ms + 30);
      return node;
    } catch { this.active = Math.max(0, this.active - 1); }
  }
}

export const audio = new Audio();
export const SOUND_NAMES = Object.keys(SOUNDS);
