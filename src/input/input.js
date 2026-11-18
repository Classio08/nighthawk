// One input layer for the whole game. Everything else reads from here, so the
// future touch/mobile controls only need to feed the same fields (forward, strafe, look, fire...).
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // keys pressed this frame (edge triggered)
    this.dx = 0; this.dy = 0;   // accumulated mouse movement
    this.fire = false;
    this.locked = false;
    this.lockFailed = false;    // browser refused pointer-lock -> arrow keys + click-to-fire still work

    addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.fire = false; });

    document.addEventListener('mousemove', (e) => {
      if (this.locked) { this.dx += e.movementX; this.dy += e.movementY; }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked && !this.lockFailed) { this.lock(); return; }
      if (e.button === 0) this.fire = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.fire = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.fire = false;
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

  // look deltas in radians for this frame (mouse + arrow-key backup)
  readLook(dt) {
    let yaw = -this.dx * 0.0022, pitch = -this.dy * 0.0022;
    this.dx = 0; this.dy = 0;
    if (this.down('ArrowLeft')) yaw += 1.9 * dt;
    if (this.down('ArrowRight')) yaw -= 1.9 * dt;
    if (this.down('ArrowUp')) pitch += 1.5 * dt;
    if (this.down('ArrowDown')) pitch -= 1.5 * dt;
    return { yaw, pitch };
  }

  readMove() {
    return {
      forward: (this.down('KeyW') ? 1 : 0) - (this.down('KeyS') ? 1 : 0),
      strafe: (this.down('KeyD') ? 1 : 0) - (this.down('KeyA') ? 1 : 0),
      jump: this.down('Space'),
      sprint: this.down('ShiftLeft') || this.down('ShiftRight'),
    };
  }

  endFrame() { this.pressed.clear(); }
}
