// Player settings that live in the browser (localStorage). Portal builds (Poki / CrazyGames, PEGI-12) start with gore OFF.
//   URL overrides for testing: ?gore=0/1  ?diff=easy|normal|hard|brutal  ?sens=1.4  ?fov=90  ?vol=0.3  ?quality=low|medium|high
// Everything is validated on the way in (a corrupted or hand-edited save can never produce NaN or a broken key map) and
// written back on every change. Pure data + a tiny change-listener list: the menu (ui/settings-menu.js), input, camera and audio read from here.
import { DIFFICULTY_IDS } from './sim/difficulty.js';

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const PORTAL = !!import.meta.env?.VITE_PORTAL;

/** every rebindable action: [id, label, default key code]. Weapon slots (1-6), mouse buttons and wheel are fixed. */
export const ACTIONS = [
  ['forward', 'Move forward', 'KeyW'], ['back', 'Move back', 'KeyS'], ['left', 'Strafe left', 'KeyA'], ['right', 'Strafe right', 'KeyD'],
  ['jump', 'Jump', 'Space'], ['sprint', 'Sprint (hold)', 'ShiftLeft'], ['crouch', 'Crouch (hold)', 'KeyC'],
  ['reload', 'Reload', 'KeyR'], ['grenade', 'Grenade', 'KeyG'], ['smoke', 'Smoke grenade', 'KeyX'], ['use', 'Use / enter vehicle', 'KeyE'], ['heal', 'Medkit', 'KeyH'],
  ['ability', 'Operator ability', 'KeyQ'], ['mortar', 'Mortar strike', 'KeyT'], ['flashlight', 'Flashlight', 'KeyF'], ['camera', 'First / third person', 'KeyV'],
];
export const DEFAULT_KEYS = Object.fromEntries(ACTIONS.map(([id, , k]) => [id, k]));
/** where a newly added action goes when an older save already uses its default key (first free one wins) */
const SPARE_KEYS = ['KeyZ', 'KeyB', 'KeyN', 'KeyM', 'KeyY', 'KeyJ', 'KeyK', 'KeyL', 'KeyU', 'KeyI', 'KeyO', 'KeyP'];
const ACTION_IDS = new Set(ACTIONS.map(([id]) => id));
/** keys that may not be bound (they are the browser's or the game's own: Escape pauses, digits pick weapons, Tab / F-keys belong to the browser) */
const RESERVED = (code) => code === 'Escape' || code === 'Tab' || /^Digit[1-6]$/.test(code) || /^F\d+$/.test(code) || /^(Meta|OS|Context)/.test(code);
const validCode = (c) => typeof c === 'string' && /^[A-Za-z0-9]{1,16}$/.test(c) && !RESERVED(c);

export const QUALITY = { low: { label: 'LOW', scale: 0.6 }, medium: { label: 'MEDIUM', scale: 0.85 }, high: { label: 'HIGH', scale: 1 } };
const LIMITS = { sens: [0.2, 3], fov: [60, 110], volume: [0, 1] };
const clampNum = (v, [lo, hi], d) => {
  if (typeof v !== 'number' && !(typeof v === 'string' && v.trim() !== '')) return d;       // null / true / {} / '' are not numbers (Number(null) would be 0)
  v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
};

const KEY = 'nh_settings_v1';
const state = { gore: !PORTAL, difficulty: 'normal', sens: 1, fov: 78, volume: 0.5, quality: 'high', keys: { ...DEFAULT_KEYS } };
const listeners = new Set();

/** merge untrusted data (a saved blob or URL values) into the state, keeping only valid fields */
export function sanitize(raw, base = state) {
  const out = { ...base, keys: { ...base.keys } };
  if (!raw || typeof raw !== 'object') return out;
  if (typeof raw.gore === 'boolean') out.gore = raw.gore;
  if (DIFFICULTY_IDS.includes(raw.difficulty)) out.difficulty = raw.difficulty;
  if (raw.sens !== undefined) out.sens = clampNum(raw.sens, LIMITS.sens, out.sens);
  if (raw.fov !== undefined) out.fov = clampNum(raw.fov, LIMITS.fov, out.fov);
  if (raw.volume !== undefined) out.volume = clampNum(raw.volume, LIMITS.volume, out.volume);
  if (QUALITY[raw.quality]) out.quality = raw.quality;
  if (raw.keys && typeof raw.keys === 'object') {
    const given = new Set();
    for (const id of ACTION_IDS) if (validCode(raw.keys[id])) { out.keys[id] = raw.keys[id]; given.add(id); }
    // an older save knows nothing about actions added later (e.g. the smoke grenade): if such an action's default key is already taken by something
    // the player bound, give it a free key instead of throwing the whole layout away below
    for (const [id, , def] of ACTIONS) {
      if (given.has(id) || !Object.entries(out.keys).some(([o, c]) => o !== id && c === def)) continue;
      const used = new Set(Object.values(out.keys));
      const free = SPARE_KEYS.find((c) => !used.has(c));
      if (free) out.keys[id] = free;
    }
  }
  // two actions on one key would make both fire at once (only a hand-edited save can do this: rebind() swaps): fall back to the default layout
  if (new Set(Object.values(out.keys)).size !== ACTIONS.length) out.keys = { ...DEFAULT_KEYS };
  return out;
}

function load() {
  let next = state;
  try { const s = localStorage.getItem(KEY); if (s) next = sanitize(JSON.parse(s)); } catch { /* private mode or corrupt save: defaults */ }
  try { const g = localStorage.getItem('nh_gore'); if (g !== null && !localStorage.getItem(KEY)) next = { ...next, gore: g === '1' }; } catch { /* old single-value save */ }
  Object.assign(state, next);
  const u = {};
  if (params.has('gore')) u.gore = params.get('gore') !== '0';
  if (params.has('diff')) u.difficulty = params.get('diff');
  if (params.has('sens')) u.sens = params.get('sens');
  if (params.has('fov')) u.fov = params.get('fov');
  if (params.has('vol')) u.volume = params.get('vol');
  if (params.has('quality')) u.quality = params.get('quality');
  Object.assign(state, sanitize(u, state));
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } for (const f of listeners) f(settings); }
load();

export const settings = {
  get gore() { return state.gore; }, setGore(v) { state.gore = !!v; save(); },
  get difficulty() { return state.difficulty; }, setDifficulty(v) { if (DIFFICULTY_IDS.includes(v)) { state.difficulty = v; save(); } },
  get sens() { return state.sens; }, setSens(v) { state.sens = clampNum(v, LIMITS.sens, state.sens); save(); },
  get fov() { return state.fov; }, setFov(v) { state.fov = clampNum(v, LIMITS.fov, state.fov); save(); },
  get volume() { return state.volume; }, setVolume(v) { state.volume = clampNum(v, LIMITS.volume, state.volume); save(); },
  get quality() { return state.quality; }, setQuality(v) { if (QUALITY[v]) { state.quality = v; save(); } },
  /** the key code bound to an action */
  key(action) { return state.keys[action] ?? DEFAULT_KEYS[action]; },
  /**
   * bind an action to a key. Returns { ok, swapped } - if another action already used that key the two swap, so nothing is ever left unbound.
   * Reserved keys (Escape, Tab, digits 1-6, F-keys) are refused.
   */
  rebind(action, code) {
    if (!ACTION_IDS.has(action) || !validCode(code)) return { ok: false };
    const old = state.keys[action], other = ACTIONS.find(([id]) => id !== action && state.keys[id] === code)?.[0];
    state.keys[action] = code;
    if (other) state.keys[other] = old;
    save();
    return { ok: true, swapped: other ?? null };
  },
  resetKeys() { state.keys = { ...DEFAULT_KEYS }; save(); },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  portal: PORTAL,
  /** snapshot for tests / debugging */
  toJSON() { return { ...state, keys: { ...state.keys } }; },
};

/** a readable name for a key code: KeyW -> W, ShiftLeft -> L SHIFT, Space -> SPACE */
export function keyLabel(code) {
  if (!code) return '-';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  const map = { Space: 'SPACE', ShiftLeft: 'L SHIFT', ShiftRight: 'R SHIFT', ControlLeft: 'L CTRL', ControlRight: 'R CTRL', AltLeft: 'L ALT', AltRight: 'R ALT', Enter: 'ENTER', Backspace: 'BKSP', CapsLock: 'CAPS' };
  return map[code] ?? code.replace(/^Arrow/, '').replace(/^Numpad/, 'NUM ').toUpperCase();
}
