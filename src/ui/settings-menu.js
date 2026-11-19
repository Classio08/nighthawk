// The settings screen: sliders (sensitivity, field of view, volume), graphics quality, bot difficulty, gore, and key rebinding.
// It only talks to `settings` (settings.js), which saves to the browser and tells the game (input, camera, audio, renderer) about changes.
import { settings, ACTIONS, QUALITY, keyLabel } from '../settings.js';
import { DIFFICULTY } from '../sim/difficulty.js';

const el = (tag, attrs = {}, kids = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'text') e.textContent = v; else if (k in e && k !== 'list') e[k] = v; else e.setAttribute(k, v); }
  for (const c of kids) e.appendChild(c);
  return e;
};

/** @param root the #settings overlay   @param input the Input (to capture the next key press while rebinding)  @param onClose called by BACK / Esc */
export function initSettingsMenu(root, input, onClose) {
  const body = root.querySelector('#settingsbody');
  const rows = [];
  const refresh = () => rows.forEach((f) => f());

  const slider = (label, get, set, min, max, step, fmt) => {
    const val = el('b'), inp = el('input', { type: 'range', min, max, step });
    inp.setAttribute('aria-label', label);
    inp.addEventListener('input', () => { set(+inp.value); val.textContent = fmt(get()); });
    rows.push(() => { inp.value = get(); val.textContent = fmt(get()); });
    body.appendChild(el('label', { className: 'srow' }, [el('span', { text: label }), inp, val]));
  };
  const choice = (label, get, set, options) => {
    const sel = el('select'); sel.setAttribute('aria-label', label);
    for (const [v, t] of options) sel.appendChild(el('option', { value: v, text: t }));
    sel.addEventListener('change', () => set(sel.value));
    rows.push(() => { sel.value = get(); });
    body.appendChild(el('label', { className: 'srow' }, [el('span', { text: label }), sel, el('b')]));
  };

  slider('MOUSE SENSITIVITY', () => settings.sens, (v) => settings.setSens(v), 0.2, 3, 0.05, (v) => v.toFixed(2) + 'x');
  slider('FIELD OF VIEW', () => settings.fov, (v) => settings.setFov(v), 60, 110, 1, (v) => Math.round(v) + '°');
  slider('VOLUME', () => settings.volume, (v) => settings.setVolume(v), 0, 1, 0.05, (v) => Math.round(v * 100) + '%');
  choice('GRAPHICS', () => settings.quality, (v) => settings.setQuality(v), Object.entries(QUALITY).map(([id, q]) => [id, q.label]));
  choice('BOT DIFFICULTY', () => settings.difficulty, (v) => settings.setDifficulty(v), Object.values(DIFFICULTY).map((d) => [d.id, d.label]));
  { const cb = el('input', { type: 'checkbox' }); cb.setAttribute('aria-label', 'Blood and gore');
    cb.addEventListener('change', () => settings.setGore(cb.checked));
    rows.push(() => { cb.checked = settings.gore; });
    body.appendChild(el('label', { className: 'srow' }, [el('span', { text: 'BLOOD & GORE' }), cb, el('b')])); }

  { const cb = el('input', { type: 'checkbox' }); cb.setAttribute('aria-label', 'Head bob and camera motion');
    cb.addEventListener('change', () => settings.setHeadbob(cb.checked));
    rows.push(() => { cb.checked = settings.headbob; });
    body.appendChild(el('label', { className: 'srow' }, [el('span', { text: 'HEAD BOB & CAMERA MOTION' }), cb, el('b')])); }

  body.appendChild(el('h3', { text: 'CONTROLS  (click a key, then press the new one)' }));
  const grid = el('div', { className: 'keys' }); body.appendChild(grid);
  let waiting = null;
  const stopWaiting = () => { waiting = null; input.capture = null; refresh(); };
  for (const [id, label] of ACTIONS) {
    const b = el('button', { className: 'keybtn', type: 'button' });
    b.setAttribute('aria-label', 'Rebind ' + label);
    b.addEventListener('click', () => {
      stopWaiting(); waiting = id; b.textContent = 'press a key...'; b.classList.add('wait');
      input.capture = (e) => {
        if (e.code === 'Escape') { stopWaiting(); return; }
        const r = settings.rebind(id, e.code);
        note.textContent = !r.ok ? `${keyLabel(e.code)} cannot be used (Esc, Tab, 1-6 and F-keys are reserved)` : r.swapped ? `${keyLabel(e.code)} was ${ACTIONS.find(([a]) => a === r.swapped)[1]} - the two swapped` : '';
        stopWaiting();
      };
    });
    rows.push(() => { b.textContent = keyLabel(settings.key(id)); b.classList.toggle('wait', waiting === id); });
    grid.appendChild(el('div', { className: 'krow' }, [el('span', { text: label }), b]));
  }
  const note = el('p', { className: 'knote' }); body.appendChild(note);
  body.appendChild(el('button', { className: 'btn small', type: 'button', text: 'RESET KEYS', onclick: () => { settings.resetKeys(); note.textContent = 'default keys restored'; refresh(); } }));

  root.querySelector('#settingsback').addEventListener('click', () => { stopWaiting(); onClose(); });
  const api = { open() { note.textContent = ''; refresh(); root.classList.add('show'); }, close() { stopWaiting(); root.classList.remove('show'); }, get isOpen() { return root.classList.contains('show'); } };
  settings.onChange(refresh);
  refresh();
  return api;
}
