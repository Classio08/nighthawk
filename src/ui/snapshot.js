// The end-of-match snapshot card: the last rendered frame (the moment you were eliminated, or the extraction) with a caption bar, savable as a PNG to
// share. Client-only and cosmetic: it reads the finished result and a canvas, it never touches the simulation. The caption logic is pure (and tested);
// composeCard needs a browser canvas.
const fmtTime = (t) => `${Math.floor((t ?? 0) / 60)}:${String(Math.floor((t ?? 0) % 60)).padStart(2, '0')}`;

/** the caption for a finished match. `r` = the end event / result, `killerName` = who got you (battle royale), `opName` = the mission title if any */
export function snapshotLines(r, { name = 'Operator', killerName = '', opName = '' } = {}) {
  const won = !!r.won;
  const title = r.mission ? (won ? 'OPERATION COMPLETE' : 'OPERATION FAILED') : won ? 'WINNER WINNER' : 'ELIMINATED';
  const where = r.mission ? opName.replace(/^OPERATION\s+/i, '') : '';
  const sub = r.mission ? (r.reason === 'trace' ? 'the trace locked on' : won ? 'extracted' : 'operator lost') : won ? 'last one standing' : (killerName ? `taken out by ${killerName}` : 'the zone got you');
  const stats = `${r.kills ?? 0} ${(r.kills ?? 0) === 1 ? 'KILL' : 'KILLS'} · ${fmtTime(r.time)}${!r.mission && r.placement ? ` · #${r.placement}` : ''}`;
  return { title, where, sub, stats, who: String(name).slice(0, 16).toUpperCase(), file: `nighthawk-${won ? 'win' : 'down'}-${Math.round(r.time ?? 0)}s.png` };
}

/** draw `shot` (a canvas / image) into a new 16:9 canvas with the caption; returns the canvas */
export function composeCard(shot, lines, w = 960, h = 540) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const sw = shot.width, sh = shot.height, s = Math.max(w / sw, h / sh);          // cover-fit
  g.drawImage(shot, (w - sw * s) / 2, (h - sh * s) / 2, sw * s, sh * s);
  const grad = g.createLinearGradient(0, h - 170, 0, h); grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,.85)');
  g.fillStyle = grad; g.fillRect(0, h - 170, w, 170);
  g.textBaseline = 'alphabetic';
  g.font = '700 46px system-ui, sans-serif'; g.fillStyle = lines.title === 'ELIMINATED' || lines.title === 'OPERATION FAILED' ? '#ff4d4d' : '#5be37a'; g.fillText(lines.title, 28, h - 74);
  g.font = '600 20px system-ui, sans-serif'; g.fillStyle = '#e8eef2'; g.fillText([lines.where, lines.sub].filter(Boolean).join(' · ').toUpperCase(), 30, h - 44);
  g.font = '600 16px system-ui, sans-serif'; g.fillStyle = '#9fb3c0'; g.fillText(`${lines.who} · ${lines.stats}`, 30, h - 20);
  g.textAlign = 'right'; g.font = '800 18px system-ui, sans-serif'; g.fillStyle = '#ffcf4d'; g.fillText('NIGHTHAWK', w - 26, h - 22);
  return c;
}
