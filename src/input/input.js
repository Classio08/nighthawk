import { settings } from '../settings.js';

// One input layer for the whole game. Everything else reads from here, so the
// future touch/mobile controls only need to feed the same fields (forward, strafe, look, fire, ads...).
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // keys pressed this frame (edge triggered)
    this.dx = 0; this.dy = 0;   // accumulated mouse movement
    this.fire = false;          // left mouse held
    this.ads = false;           // right mouse held (aim down sights)
    this.wheel = 0;             // wheel ticks since last frame (weapon cycle)
    this.locked = false;
    this.lockFailed = false;    // browser refused pointer-lock -> arrow keys + click-to-fire still work
    this.capture = null;        // (KeyboardEvent) => void while the settings menu waits for a new key binding
    this.onLockChange = null;   // (locked:boolean) => void   (main.js uses it for the pause screen)

    addEventListener('keydown', (e) => {
      if (this.capture) { e.nhCaptured = true; this.capture(e); e.preventDefault(); return; }       // the key-binding menu is waiting for a key: it gets it, the game does not
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.fire = false; this.ads = false; });

    document.addEventListener('mousemove', (e) => {
      if (this.locked) { this.dx += e.movementX; this.dy += e.movementY; }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked && !this.lockFailed) { this.lock(); return; }
      if (e.button === 0) this.fire = true;
      if (e.button === 2) this.ads = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fire = false;
      if (e.button === 2) this.ads = false;
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.fire = false; this.ads = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.lockFailed = true; });
    } catch { this.lockFailed = true; }
  }

  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  /** held / pressed by ACTION (the key comes from the player's bindings); Shift counts on both sides */
  act(id) { const k = settings.key(id); return this.keys.has(k) || (k === 'ShiftLeft' && this.keys.has('ShiftRight')); }
  actPressed(id) { const k = settings.key(id); return this.pressed.has(k) || (k === 'ShiftLeft' && this.pressed.has('ShiftRight')); }

  // look deltas in radians for this frame (mouse + arrow-key backup). `sens` < 1 while aiming down sights.
  readLook(dt, sens = 1) {
    sens *= settings.sens;                                              // the player's own mouse sensitivity (settings menu)
    let yaw = -this.dx * 0.0022 * sens, pitch = -this.dy * 0.0022 * sens;
    this.dx = 0; this.dy = 0;
    if (this.down('ArrowLeft')) yaw += 1.9 * dt * sens;
    if (this.down('ArrowRight')) yaw -= 1.9 * dt * sens;
    if (this.down('ArrowUp')) pitch += 1.5 * dt * sens;
    if (this.down('ArrowDown')) pitch -= 1.5 * dt * sens;
    return { yaw, pitch };
  }

  readMove() {
    return {
      forward: (this.act('forward') ? 1 : 0) - (this.act('back') ? 1 : 0),
      strafe: (this.act('right') ? 1 : 0) - (this.act('left') ? 1 : 0),
      jump: this.act('jump'),
      sprint: this.act('sprint'),
      crouch: this.act('crouch'),
    };
  }

  /** weapon slot 1..6 pressed this frame (0 = none). Mouse wheel cycles through `cycle(dir)` instead. */
  readSlot() {
    for (let i = 1; i <= 6; i++) if (this.pressed.has('Digit' + i)) return i;
    return 0;
  }
  takeWheel() { const w = this.wheel; this.wheel = 0; return w; }

  endFrame() { this.pressed.clear(); }
}
