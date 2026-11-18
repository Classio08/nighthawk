// Player settings that live in the browser (localStorage). Portal builds (Poki / CrazyGames, PEGI-12) start with gore OFF.
//   ?gore=0 / ?gore=1 overrides for testing; the start screen has a checkbox.
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const PORTAL = !!import.meta.env?.VITE_PORTAL;
let gore = !PORTAL;
try {
  const saved = localStorage.getItem('nh_gore');
  if (saved !== null) gore = saved === '1';
} catch { /* private mode */ }
if (params.has('gore')) gore = params.get('gore') !== '0';

export const settings = {
  get gore() { return gore; },
  setGore(v) { gore = !!v; try { localStorage.setItem('nh_gore', gore ? '1' : '0'); } catch { /* ignore */ } },
  portal: PORTAL,
};
