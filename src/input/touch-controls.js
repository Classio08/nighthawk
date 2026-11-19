// Browser-native virtual controls. This feeds the existing Input object; it never creates a second player or simulation.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function normalizeStick(dx, dy, radius = 1) {
  if (![dx, dy, radius].every(Number.isFinite) || radius <= 0) return { forward: 0, strafe: 0 };
  const x = clamp(dx / radius, -1, 1);
  const y = clamp(dy / radius, -1, 1);
  const length = Math.hypot(x, y);
  const scale = length > 1 ? 1 / length : 1;
  return { forward: y === 0 ? 0 : -y * scale, strafe: x === 0 ? 0 : x * scale };
}

export function detectTouchMode(search = globalThis.location?.search ?? '', capabilities = {}) {
  const params = new URLSearchParams(search);
  if (params.get('touch') === '1') return true;
  if (params.get('touch') === '0') return false;
  const points = capabilities.maxTouchPoints ?? globalThis.navigator?.maxTouchPoints ?? 0;
  const coarse = capabilities.coarse ?? globalThis.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  return points > 0 || !!coarse;
}

const CORE_ACTIONS = [
  ['fire', 'FIRE', 'nh-fire', 'Hold to fire'],
  ['ads', 'ADS', 'nh-ads', 'Hold to aim down sights'],
  ['jump', 'JUMP', 'nh-jump', 'Hold to jump'],
  ['crouch', 'CROUCH', 'nh-crouch', 'Hold to crouch'],
  ['reload', 'RELOAD', 'nh-reload', 'Reload weapon'],
  ['ability', 'ABILITY', 'nh-ability', 'Use operator ability'],
  ['sprint', 'SPRINT', 'nh-sprint', 'Hold to sprint'],
  ['use', 'USE', 'nh-use', 'Interact or enter / exit vehicle'],
];

const EXTRA_ACTIONS = [
  ['grenade', 'FRAG'], ['smoke', 'SMOKE'], ['melee', 'MELEE'],
  ['heal', 'MEDKIT'], ['mortar', 'MORTAR'], ['flashlight', 'LIGHT'], ['camera', 'FPP / TPP'],
];

const button = (id, label, className = '') =>
  `<button type="button" class="nh-touch-btn ${className}" data-action="${id}" aria-label="${label}" title="${label}">${label}</button>`;

export class TouchControls {
  constructor(input, { onPause = () => {}, enabled = detectTouchMode(), storageKey = 'nh_touch_layout_v1' } = {}) {
    this.input = input;
    this.onPause = onPause;
    this.enabled = !!enabled && typeof document !== 'undefined';
    this.storageKey = storageKey;
    this.active = false;
    this.layout = this._loadLayout();
    this.movePointerId = null;
    this.lookPointerId = null;
    this.actionPointers = new Map();
    this.lookLast = { x: 0, y: 0 };
    this.root = null;
    if (this.enabled) this._build();
  }

  _loadLayout() {
    const fallback = { preset: '2-thumb', opacity: 0.78 };
    try {
      const raw = globalThis.localStorage?.getItem(this.storageKey);
      if (!raw) return fallback;
      const value = JSON.parse(raw);
      return {
        preset: value?.preset === '4-finger' ? '4-finger' : '2-thumb',
        opacity: Number.isFinite(value?.opacity) ? clamp(value.opacity, 0.42, 1) : fallback.opacity,
      };
    } catch { return fallback; }
  }

  _saveLayout() {
    try { globalThis.localStorage?.setItem(this.storageKey, JSON.stringify(this.layout)); } catch { /* private browsing / storage disabled */ }
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'nh-touch-controls';
    root.hidden = true;
    root.setAttribute('aria-label', 'NIGHTHAWK touch controls');
    root.innerHTML = `
      <div class="nh-touch-look" aria-hidden="true"></div>
      <div class="nh-touch-move-zone" aria-label="Movement joystick">
        <div class="nh-touch-stick-base"><div class="nh-touch-stick-thumb"></div></div>
      </div>
      <div class="nh-touch-actions">
        ${CORE_ACTIONS.map(([id, label, cls, title]) => button(id, label, cls).replace(`title="${label}"`, `title="${title}"`)).join('')}
      </div>
      <button type="button" class="nh-touch-btn nh-touch-more" data-more aria-label="More controls">MORE</button>
      <button type="button" class="nh-touch-btn nh-touch-pause" data-pause aria-label="Pause game">Ⅱ</button>
      <div class="nh-touch-drawer" hidden>
        <div class="nh-touch-drawer-title">TACTICAL ACTIONS</div>
        <div class="nh-touch-extra-grid">${EXTRA_ACTIONS.map(([id, label]) => button(id, label)).join('')}<button type="button" class="nh-touch-btn" data-cycle="prev">PREV GUN</button><button type="button" class="nh-touch-btn" data-cycle="next">NEXT GUN</button></div>
        <div class="nh-touch-config">
          <button type="button" class="nh-touch-config-btn" data-preset>LAYOUT: 2-THUMB</button>
          <label>CONTROL OPACITY <input data-opacity type="range" min="42" max="100" value="78" /></label>
        </div>
      </div>`;
    document.body.appendChild(root);
    this.root = root;
    this.moveZone = root.querySelector('.nh-touch-move-zone');
    this.stickThumb = root.querySelector('.nh-touch-stick-thumb');
    this.drawer = root.querySelector('.nh-touch-drawer');

    this._onPointerDown = (event) => this._pointerDown(event);
    this._onPointerMove = (event) => this._pointerMove(event);
    this._onPointerUp = (event) => this._endPointer(event.pointerId);
    this._onInput = (event) => {
      if (event.target.matches('[data-opacity]')) {
        this.layout.opacity = clamp(Number(event.target.value) / 100, 0.42, 1);
        this._applyLayout(); this._saveLayout();
      }
    };
    this._onBlur = () => this._releaseAll();
    this._onVisibility = () => { if (document.hidden) this._releaseAll(); };
    this._onResize = () => this._releaseAll();

    root.addEventListener('pointerdown', this._onPointerDown, { passive: false });
    root.addEventListener('pointermove', this._onPointerMove, { passive: false });
    root.addEventListener('pointerup', this._onPointerUp);
    root.addEventListener('pointercancel', this._onPointerUp);
    root.addEventListener('lostpointercapture', this._onPointerUp);
    root.addEventListener('input', this._onInput);
    globalThis.addEventListener?.('blur', this._onBlur);
    document.addEventListener('visibilitychange', this._onVisibility);
    globalThis.addEventListener?.('resize', this._onResize);
    this._applyLayout();
  }

  _capture(event) {
    try { this.root.setPointerCapture(event.pointerId); } catch { /* capture can fail after a device interruption */ }
  }

  _pointerDown(event) {
    const target = event.target?.closest?.('[data-action], [data-cycle], [data-more], [data-pause], [data-preset], .nh-touch-move-zone, .nh-touch-look');
    if (!target) return;
    event.preventDefault();

    const actionButton = target.closest?.('[data-action]');
    if (actionButton) {
      const action = actionButton.dataset.action;
      if (this.actionPointers.has(event.pointerId)) return;
      this.actionPointers.set(event.pointerId, { action, element: actionButton });
      this.input.setTouchAction(action, true);
      actionButton.classList.add('active');
      this._capture(event);
      return;
    }
    const cycle = target.closest?.('[data-cycle]');
    if (cycle) { this.input.wheel += cycle.dataset.cycle === 'prev' ? -1 : 1; return; }
    if (target.closest?.('[data-more]')) {
      this.drawer.hidden = !this.drawer.hidden;
      target.closest('[data-more]').classList.toggle('active', !this.drawer.hidden);
      return;
    }
    if (target.closest?.('[data-pause]')) {
      this.onPause();
      return;
    }
    if (target.closest?.('[data-preset]')) {
      this.layout.preset = this.layout.preset === '2-thumb' ? '4-finger' : '2-thumb';
      this._applyLayout(); this._saveLayout();
      return;
    }
    if (target.closest?.('.nh-touch-move-zone') && this.movePointerId === null) {
      this.movePointerId = event.pointerId;
      this._capture(event);
      this._updateStick(event.clientX, event.clientY);
      return;
    }
    if (target.closest?.('.nh-touch-look') && this.lookPointerId === null) {
      this.lookPointerId = event.pointerId;
      this.lookLast = { x: event.clientX, y: event.clientY };
      this._capture(event);
    }
  }

  _pointerMove(event) {
    if (event.pointerId !== this.movePointerId && event.pointerId !== this.lookPointerId) return;
    event.preventDefault();
    if (event.pointerId === this.movePointerId) this._updateStick(event.clientX, event.clientY);
    if (event.pointerId === this.lookPointerId) {
      const dx = event.clientX - this.lookLast.x;
      const dy = event.clientY - this.lookLast.y;
      this.lookLast = { x: event.clientX, y: event.clientY };
      this.input.addTouchLook(dx, dy);
    }
  }

  _updateStick(clientX, clientY) {
    const rect = this.moveZone.getBoundingClientRect();
    const radius = Math.max(24, Math.min(rect.width, rect.height) * 0.35);
    const value = normalizeStick(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2), radius);
    this.input.setTouchMove(value.forward, value.strafe);
    this.stickThumb.style.transform = `translate(${value.strafe * radius}px, ${-value.forward * radius}px)`;
  }

  _endPointer(pointerId) {
    if (pointerId === this.movePointerId) {
      this.movePointerId = null;
      this.input.setTouchMove(0, 0);
      if (this.stickThumb) this.stickThumb.style.transform = 'translate(0, 0)';
    }
    if (pointerId === this.lookPointerId) this.lookPointerId = null;
    const held = this.actionPointers.get(pointerId);
    if (held) {
      this.actionPointers.delete(pointerId);
      const stillHeld = [...this.actionPointers.values()].some((entry) => entry.action === held.action);
      if (!stillHeld) {
        this.input.setTouchAction(held.action, false);
        this.root?.querySelectorAll('[data-action]').forEach((element) => { if (element.dataset.action === held.action) element.classList.remove('active'); });
      }
    }
  }

  _releaseAll() {
    if (!this.input) return;
    this.movePointerId = null; this.lookPointerId = null;
    this.actionPointers.clear();
    this.input.releaseTouch();
    if (this.stickThumb) this.stickThumb.style.transform = 'translate(0, 0)';
    this.root?.querySelectorAll('.nh-touch-btn.active').forEach((element) => element.classList.remove('active'));
  }

  _applyLayout() {
    if (!this.root) return;
    this.root.classList.toggle('nh-four-finger', this.layout.preset === '4-finger');
    this.root.style.setProperty('--nh-touch-opacity', String(this.layout.opacity));
    const preset = this.root.querySelector('[data-preset]');
    if (preset) preset.textContent = `LAYOUT: ${this.layout.preset.toUpperCase()}`;
    const opacity = this.root.querySelector('[data-opacity]');
    if (opacity) opacity.value = String(Math.round(this.layout.opacity * 100));
  }

  setActive(active) {
    this.active = this.enabled && !!active;
    if (!this.active) this._releaseAll();
    if (this.root) this.root.hidden = !this.active;
    document.body.classList.toggle('nh-touch-active', this.active);
  }

  destroy() {
    this._releaseAll();
    document.body.classList.remove('nh-touch-active');
    if (!this.root) return;
    this.root.removeEventListener('pointerdown', this._onPointerDown);
    this.root.removeEventListener('pointermove', this._onPointerMove);
    this.root.removeEventListener('pointerup', this._onPointerUp);
    this.root.removeEventListener('pointercancel', this._onPointerUp);
    this.root.removeEventListener('lostpointercapture', this._onPointerUp);
    this.root.removeEventListener('input', this._onInput);
    globalThis.removeEventListener?.('blur', this._onBlur);
    globalThis.removeEventListener?.('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.root.remove();
    this.root = null;
  }
}
