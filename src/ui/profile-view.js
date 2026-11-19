// Profile card (start screen) and XP breakdown (end screen). Everything is built with textContent, never innerHTML.
import { levelInfo, rankName, kdRatio, favouriteWeapon, badgeProgress, SKIN_UNLOCK } from '../profile.js';
import { WEAPONS } from '../sim/weapons.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const hours = (s) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.floor(s / 60)} min`);
const weaponName = (id) => WEAPONS[id]?.name ?? (id === 'grenade' ? 'GRENADE' : id === 'vehicle' ? 'ROADKILL' : id.toUpperCase());

function bar(pct) { const b = el('div', 'xpbar'); const i = el('i'); i.style.width = `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%`; b.appendChild(i); return b; }

/** @param root the <details id="profile"> element   @param onReset called after the player confirms RESET PROFILE */
export function renderProfile(root, p, onReset) {
  const open = root.open;
  const L = levelInfo(p.xp);
  root.replaceChildren();
  const sum = el('summary');
  sum.append(el('b', '', `LV ${L.level}`), el('span', '', ` ${rankName(L.level)}`), el('small', '', L.maxed ? ' · MAX' : ` · ${L.into}/${L.need} XP`));
  root.append(sum, bar(L.pct));

  const grid = el('div', 'pstats');
  const fav = favouriteWeapon(p);
  const tiles = [['MATCHES', p.matches], ['WINS', p.wins], ['KILLS', p.kills], ['K/D', kdRatio(p)], ['HEADSHOTS', p.headshots],
    ['BEST PLACE', p.bestPlacement ? `#${p.bestPlacement}` : '-'], ['BEST KILLS', p.bestKills], ['TIME PLAYED', hours(p.timePlayed)]];
  for (const [k, v] of tiles) { const d = el('div'); d.append(el('b', '', String(v)), el('small', '', k)); grid.appendChild(d); }
  root.appendChild(grid);
  if (fav) root.appendChild(el('p', 'pfav', `FAVOURITE: ${weaponName(fav[0])} · ${fav[1]} kills`));

  const badges = el('div', 'pbadges');
  for (const b of badgeProgress(p)) {
    const c = el('span', b.done ? 'badge on' : 'badge', b.name);
    c.title = b.done ? `${b.desc} (earned)` : `${b.desc} (${b.val}/${b.goal})`;
    badges.appendChild(c);
  }
  root.appendChild(badges);

  const skins = Object.entries(SKIN_UNLOCK).filter(([, l]) => l > L.level).sort((a, b) => a[1] - b[1])[0];
  if (skins) root.appendChild(el('p', 'pfav', `NEXT UNLOCK: ${skins[0].toUpperCase()} skin at level ${skins[1]}`));

  const reset = el('button', 'btn small', 'RESET PROFILE'); reset.type = 'button';
  let armed = 0;
  reset.addEventListener('click', () => {
    if (!armed) { armed = setTimeout(() => { armed = 0; reset.textContent = 'RESET PROFILE'; }, 4000); reset.textContent = 'CLICK AGAIN TO ERASE STATS'; return; }
    clearTimeout(armed); armed = 0; onReset?.();
  });
  root.appendChild(reset);
  root.open = open;
}

/** the XP summary under the end-of-match stats */
export function renderGain(root, gain, profile) {
  root.replaceChildren();
  if (!gain) { root.style.display = 'none'; return; }
  root.style.display = '';
  root.appendChild(el('div', 'xptotal', `+${gain.xp} XP`));
  const list = el('div', 'xpparts');
  for (const [label, v] of gain.parts) { const r = el('div'); r.append(el('span', '', label), el('b', '', `${v > 0 ? '+' : ''}${v}`)); list.appendChild(r); }
  root.appendChild(list);
  const L = levelInfo(profile.xp);
  root.appendChild(el('div', 'xplevel', `LEVEL ${L.level} · ${rankName(L.level)}${L.maxed ? ' · MAX' : ''}`));
  root.appendChild(bar(L.pct));
  if (gain.leveledUp) root.appendChild(el('div', 'xpnote up', `LEVEL UP!  ${gain.level0} → ${gain.level1}${gain.rank1 !== gain.rank0 ? `  ·  NEW RANK: ${gain.rank1}` : ''}`));
  for (const s of gain.skins) root.appendChild(el('div', 'xpnote', `UNLOCKED WEAPON SKIN: ${s.toUpperCase()}`));
  for (const b of gain.badges) root.appendChild(el('div', 'xpnote', `BADGE EARNED: ${b}`));
}

