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
  whiz:      [0.5, .15, 2400, 0, .004, .09, 4, 1.4, -55, 0, 0, 0, 0, 2.2, 0, 0, 0, .7, .03],   // a near miss: short, bright, falling crack (untuned by ear)
  hit:       [0.55, 0, 1900, 0, .006, .035, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .8, .01],
  headshot:  [0.7, 0, 2700, 0, .012, .09, 0, 1, 0, 0, 900, .02, 0, 0, 0, 0, 0, .8, .02],
  kill:      [0.8, 0, 520, 0, .03, .22, 1, 1.5, 0, 0, 340, .06, 0, 0, 0, 0, 0, .7, .06],
  hurt:      [0.8, .1, 150, 0, .02, .16, 2, 1, -12, 0, 0, 0, 0, 1, 0, .2, 0, .5, .05],
  explosion: [1.6, .1, 55,  .01, .06, .85, 4, 2.2, -3, 0, 0, 0, 0, 9, 0, .45, 0, .70, .22],
  reload1:   [0.35, .1, 520, 0, .005, .035, 4, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, .5, .01],
  reload2:   [0.45, .1, 330, 0, .008, .05, 4, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, .6, .01],
  crate:     [0.8, .2, 160, 0, .03, .18, 4, 1.5, -6, 0, 0, 0, 0, 3, 0, .1, 0, .6, .05],
  magin:     [0.5, .08, 240, 0, .012, .06, 4, 1, 0, 0, 0, 0, 0, 2, 0, .05, 0, .6, .02],
  charge:    [0.55, .1, 420, 0, .02, .09, 4, 1, 0, 0, 0, 0, .06, 3, 0, .1, 0, .6, .02],
  magdrop:   [0.4, .15, 1500, 0, .004, .07, 0, 1, 0, 0, 300, .01, 0, .5, 0, 0, 0, .7, .01],
  dry:       [0.35, 0, 900, 0, 0, .02, 4, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, .4, .005],
  switch:    [0.3, .05, 700, 0, .005, .04, 4, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, .5, .01],
  throw:     [0.4, .2, 280, .05, .08, .18, 4, 1, 3, 0, 0, 0, 0, 1, 0, 0, 0, .5, .05],
  ping:      [0.5, 0, 1250, .005, .09, .38, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .6, .2],               // a sonar-style ping when a relay task starts (untuned by ear)
  slide:     [0.45, .3, 140, 0, .02, .30, 4, 1, -3, 0, 0, 0, 0, 5, 0, .1, 0, .5, .08],            // a hard slide: gravel scrape that falls away (untuned by ear)
  vault:     [0.4, .1, 190, 0, .01, .12, 4, 1, 4, 0, 0, 0, 0, 1.5, 0, 0, 0, .5, .03],               // a short grunt-and-scrape as you pull up onto a ledge (untuned by ear)
  land:      [0.7, .1, 80, 0, .01, .14, 4, 1.4, -6, 0, 0, 0, 0, 2, 0, .1, 0, .6, .04],             // soft landing thud for the local player (untuned by ear)
  step:      [0.18, .3, 70, 0, .01, .06, 4, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, .4, .01],
  zone:      [0.5, 0, 440, .02, .18, .30, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .5, .08],
  engine:    [0.32, .04, 62, .01, .07, .09, 2, 1.4, 0, 0, 0, 0, 0, .15, 0, 0, 0, .8, .03],
  crash:     [1.0, .2, 90, 0, .05, .3, 4, 2, -5, 0, 0, 0, 0, 4, 0, .3, 0, .6, .1],
  contract:  [0.5, 0, 880, .01, .1, .25, 0, 1, 0, 0, 440, .08, 0, 0, 0, 0, 0, .7, .05],
  airdrop:   [0.55, 0, 196, .08, .35, .6, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, .6, .1],
  mortar:    [0.6, 0, 300, 0, .05, .3, 3, 1, -6, 0, 0, 0, 0, 0, 0, 0, 0, .6, .1],
  whistle:   [0.45, 0, 1900, .1, .75, .2, 0, 1, -1.3, 0, 0, 0, 0, 0, 0, 0, 0, .6, .1],
  thunder:   [1.5, .2, 38, .1, .6, 1.5, 4, 3, -1, 0, 0, 0, 0, 6, 0, .6, 0, .7, .4],
  rain:      [0.13, .5, 200, .3, .5, .35, 4, .5, 0, 0, 0, 0, 0, .2, 0, .05, 0, .9, .1],
  pickup:    [0.45, 0, 880, 0, .02, .09, 0, 1, 0, 0, 440, .04, 0, 0, 0, 0, 0, .7, .03],
  armor:     [0.7, .1, 260, 0, .01, .08, 4, 2, 0, 0, 0, 0, 0, 2, 0, .2, 0, .6, .02],
  heal:      [0.4, 0, 330, .02, .25, .35, 0, 1, 0, 0, 220, .12, 0, 0, 0, 0, 0, .7, .08],
  ability:   [0.7, 0, 220, .02, .2, .45, 1, 2, 0, 0, 180, .1, 0, 0, 0, 0, 0, .6, .1],
  abilitydash: [0.8, 0, 150, 0, .05, .3, 4, 1.5, 8, 0, 0, 0, 0, 0, 0, 0, 0, .8, .06],
  emp:       [1, 0, 90, .02, .3, .6, 3, 3.5, -2, 0, 0, 0, .05, 3, 0, 0, 0, .7, .2],
  stunned:   [0.6, 0, 440, 0, .15, .3, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, .1, .8, .1],
  rushhit:   [1, 0, 120, 0, .03, .25, 4, 2, -5, 0, 0, 0, 0, 0, 0, .5, 0, .6, .04],
  healend:   [0.55, 0, 660, 0, .08, .35, 0, 1, 0, 0, 330, .06, 0, 0, 0, 0, 0, .7, .1],
  chute:     [0.7, .1, 110, .02, .12, .4, 4, 1.3, -5, 0, 0, 0, 0, 1, 0, .4, 0, .6, .1],
  wind:      [0.22, .3, 260, .12, .35, .5, 4, .6, 0, 0, 0, 0, 0, .5, 0, .1, 0, .85, .15],
  melee:     [0.7, .1, 300, 0, .05, .13, 4, 1.7, -22, 0, 0, 0, 0, 1.3, 0, .3, 0, .7, .06],      // a quick swish and thump
  smoke:     [0.5, .1, 190, .02, .25, .6, 4, 2.2, 0, 0, 0, 0, 0, 1.4, 0, .5, 0, .55, .12],      // a hiss as the canister pops
  thud:      [0.5, .1, 60, 0, .04, .2, 4, 1.6, -3, 0, 0, 0, 0, 1, 0, .3, 0, .6, .06],
  win:       [0.8, 0, 440, .02, .2, .6, 1, 1, 0, 0, 220, .12, 0, 0, 0, 0, 0, .7, .1],
  lose:      [0.8, 0, 200, .02, .3, .7, 2, 1, -2, 0, -80, .2, 0, 0, 0, 0, 0, .6, .1],
};

class Audio {
  constructor() { this.ok = false; this.z = null; this.cache = new Map(); this.lx = 0; this.lz = 0; this.lyaw = 0; this.active = 0; this.volume = 0.5; }

  /** master volume 0..1 (settings menu); takes effect on the very next sound */
  setVolume(v) { this.volume = Math.min(1, Math.max(0, Number(v) || 0)); if (this.z) this.z.ZZFX.volume = this.volume * 0.6; }

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
    // Gunshot reports arrive at the listener after sound travel time; simulation and damage remain instantaneous hitscan.
    const delay = Number(o.delay) || 0;
    if (delay > 0.01) {
      const arrived = { ...o, delay: 0 };
      setTimeout(() => this.play(name, arrived), Math.min(2, delay) * 1000);
      return;
    }
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
