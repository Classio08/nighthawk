import { settings } from '../settings.js';

// One input layer for the whole game. Everything else reads from here, so the
// future touch/mobile controls only need to feed the same fields (forward, strafe, look, fire, ads...).
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // keys pressed this frame (edge triggered)
    this.dx = 0; this.dy = 0;   // accumulated mouse + touch-look movement
    this.mouseFire = false;    // left mouse held
    this.mouseAds = false;     // right mouse held (aim down sights)
    this.touchMove = { forward: 0, strafe: 0, sprint: false };
    this.touchActions = new Set();
    this.touchPressed = new Set();
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
    addEventListener('blur', () => { this.keys.clear(); this.fire = false; this.ads = false; this.releaseTouch(); });

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

  get fire() { return this.mouseFire || this.touchActions.has('fire'); }
  set fire(value) { this.mouseFire = !!value; }
  get ads() { return this.mouseAds || this.touchActions.has('ads'); }
  set ads(value) { this.mouseAds = !!value; }

  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  /** held / pressed by ACTION (keyboard binding or virtual control); Shift counts on both sides */
  act(id) { const k = settings.key(id); return this.touchActions.has(id) || this.keys.has(k) || (k === 'ShiftLeft' && this.keys.has('ShiftRight')); }
  actPressed(id) { const k = settings.key(id); return this.touchPressed.has(id) || this.pressed.has(k) || (k === 'ShiftLeft' && this.pressed.has('ShiftRight')); }

  /** Feed normalized virtual-stick axes into the same command path used by keyboard input. */
  setTouchMove(forward = 0, strafe = 0, sprint = false) {
    let f = Number.isFinite(forward) ? Math.max(-1, Math.min(1, forward)) : 0;
    let s = Number.isFinite(strafe) ? Math.max(-1, Math.min(1, strafe)) : 0;
    const length = Math.hypot(f, s);
    if (length > 1) { f /= length; s /= length; }
    this.touchMove.forward = f; this.touchMove.strafe = s; this.touchMove.sprint = !!sprint;
  }

  /** Touch look is converted to the same accumulated pixel deltas used by the mouse. */
  addTouchLook(dx, dy, scale = 0.62) {
    if (Number.isFinite(dx)) this.dx += dx * scale;
    if (Number.isFinite(dy)) this.dy += dy * scale;
  }

  /** Hold an existing game action through the virtual controls; edge presses are consumed by endFrame(). */
  setTouchAction(id, down) {
    if (!id) return;
    if (down) {
      if (!this.touchActions.has(id)) this.touchPressed.add(id);
      this.touchActions.add(id);
    } else this.touchActions.delete(id);
  }

  releaseTouch() {
    this.touchMove.forward = 0; this.touchMove.strafe = 0; this.touchMove.sprint = false;
    this.touchActions.clear(); this.touchPressed.clear();
  }

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
    let forward = (this.act('forward') ? 1 : 0) - (this.act('back') ? 1 : 0) + this.touchMove.forward;
    let strafe = (this.act('right') ? 1 : 0) - (this.act('left') ? 1 : 0) + this.touchMove.strafe;
    forward = Math.max(-1, Math.min(1, forward));
    strafe = Math.max(-1, Math.min(1, strafe));
    const length = Math.hypot(forward, strafe);
    if (length > 1) { forward /= length; strafe /= length; }
    return {
      forward, strafe,
      jump: this.act('jump'),
      sprint: this.act('sprint') || this.touchMove.sprint,
      crouch: this.act('crouch'),
    };
  }

  /** weapon slot 1..6 pressed this frame (0 = none). Mouse wheel cycles through `cycle(dir)` instead. */
  readSlot() {
    for (let i = 1; i <= 6; i++) if (this.pressed.has('Digit' + i)) return i;
    return 0;
  }
  takeWheel() { const w = this.wheel; this.wheel = 0; return w; }

  endFrame() { this.pressed.clear(); this.touchPressed.clear(); }
}
