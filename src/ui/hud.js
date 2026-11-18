// All the on-screen numbers and flashes. It only READS the simulation and writes to HTML elements.
import { WEAPONS, SLOT_ORDER } from '../sim/weapons.js';
import { MAP_HALF } from '../sim/map.js';

const $ = (id) => document.getElementById(id);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class Hud {
  constructor(map) {
    this.el = {
      alive: $('alive'), kills: $('kills'), zone: $('zone'), fps: $('fpsn'), feed: $('feed'), slots: $('slots'), msg: $('msg'),
      hpbar: $('hpbar'), hpn: $('hpn'), opname: $('opname'), wname: $('wname'), mag: $('mag'), nades: $('nades'), rl: $('rl'),
      vig: $('vig'), zonevig: $('zonevig'), flash: $('flash'), hitm: $('hitm'), dmg: $('dmg'), mini: $('mini'),
      cu: $('cu'), cd: $('cd'), cl: $('cl'), cr: $('cr'),
    };
    this.mctx = this.el.mini.getContext('2d');
    this.hurt = 0; this.hitT = 0; this.msgT = 0; this.flashV = 0; this.pings = [];
    this.arrows = [];
    for (let i = 0; i < 6; i++) { const a = document.createElement('i'); this.el.dmg.appendChild(a); this.arrows.push({ el: a, t: 0, ang: 0 }); }
    this.slotEls = SLOT_ORDER.map((id, i) => { const d = document.createElement('div'); d.className = 'box'; d.textContent = `${i + 1} ${WEAPONS[id].name.split(' ')[0]}`; this.el.slots.appendChild(d); return d; });
    this.fpsAcc = 0; this.fpsN = 0; this.lastKey = '';
    this.setMap(map);
  }

  setMap(map) {   // pre-draw the buildings once
    const S = 150, k = S / (2 * (MAP_HALF + 4));
    this.k = k;
    const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    g.fillStyle = 'rgba(30,36,28,.85)'; g.fillRect(0, 0, S, S);
    for (const b of map.boxes) {
      if (b.kind === 'edge' || b.kind === 'crates') continue;
      g.fillStyle = b.kind === 'block' ? '#8a8d92' : b.kind === 'container' ? '#a9794a' : '#5d6168';
      g.fillRect(S / 2 + (b.x - b.w / 2) * k, S / 2 + (b.z - b.d / 2) * k, Math.max(1.5, b.w * k), Math.max(1.5, b.d * k));
    }
    this.mapBg = c;
  }

  message(text, color = '#ff4d4d', secs = 1.4) { this.el.msg.textContent = text; this.el.msg.style.color = color; this.msgT = secs; }
  hitmarker(kill, head) {
    this.el.hitm.className = kill ? 'kill' : ''; this.hitT = kill ? 0.45 : 0.18;
    this.el.hitm.style.transform = head && !kill ? 'scale(1.35)' : 'scale(1)';
  }
  damageFrom(angle) { // angle: where the attacker is, relative to where we look (0 = ahead)
    const a = this.arrows.reduce((m, x) => (x.t < m.t ? x : m)); a.t = 1.2; a.ang = angle;
  }
  addFeed(html, you) {
    const d = document.createElement('div'); d.innerHTML = html; if (you) d.className = 'you';
    this.el.feed.prepend(d); setTimeout(() => d.remove(), 6000);
    while (this.el.feed.children.length > 6) this.el.feed.lastChild.remove();
  }
  hurtFlash(a = 0.6) { this.hurt = Math.min(1, this.hurt + a); }
  whiteFlash(a) { this.flashV = Math.max(this.flashV, a); }
  ping(x, z) { this.pings.push({ x, z, t: 1.5 }); }

  /** @param spread crosshair gap in pixels, @param adsK 0..1 */
  update(dt, sim, p, spread, adsK, fps) {
    const e = this.el, w = WEAPONS[p.cur], st = p.weapons[p.cur];
    e.alive.textContent = sim.aliveCount(); e.kills.textContent = p.kills;
    const z = sim.zone;
    const outside = z.outside(p.x, p.z) > 0;
    const t = Math.max(0, Math.ceil(z.timeLeft));
    e.zone.textContent = z.done ? 'FINAL ZONE' : z.shrinking ? `ZONE CLOSING  ${fmt(t)}` : `NEXT ZONE  ${fmt(t)}`;
    e.zone.classList.toggle('warn', z.shrinking || outside);
    e.hpbar.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
    e.hpbar.style.background = p.hp / p.maxHp > 0.5 ? '#5be37a' : p.hp / p.maxHp > 0.25 ? '#ffcf4d' : '#ff4d4d';
    e.hpn.textContent = Math.ceil(Math.max(0, p.hp)); e.opname.textContent = p.name.toUpperCase();
    const key = `${p.cur}${st.ammo}${st.reserve}${p.nades}`;
    if (key !== this.lastKey) {
      this.lastKey = key; e.wname.textContent = w.name; e.mag.innerHTML = `${st.ammo} <small>/ ${st.reserve}</small>`; e.nades.textContent = `GRENADES ${p.nades}`;
      this.slotEls.forEach((d, i) => d.classList.toggle('on', SLOT_ORDER[i] === p.cur));
    }
    e.mag.style.color = st.ammo <= w.mag * 0.25 ? '#ff6b6b' : '#fff';
    if (p.reloadT > 0) { e.rl.style.opacity = 1; e.rl.firstChild.style.width = `${(1 - p.reloadT / w.reload) * 100}%`; } else e.rl.style.opacity = 0;
    // crosshair
    const gap = (spread + 3) * (1 - adsK * 0.9);
    e.cu.style.transform = `translateY(${-gap}px)`; e.cd.style.transform = `translateY(${gap}px)`;
    e.cl.style.transform = `translateX(${-gap}px)`; e.cr.style.transform = `translateX(${gap}px)`;
    $('cross').style.opacity = adsK > 0.85 && p.cur === 'dmr' ? 0 : 1;
    // flashes
    this.hurt = Math.max(0, this.hurt - dt * 1.3);
    const low = p.hp / p.maxHp < 0.3 ? 0.35 + 0.15 * Math.sin(performance.now() / 160) : 0;
    e.vig.style.opacity = Math.min(1, this.hurt + low);
    e.zonevig.style.opacity = outside ? 0.5 + 0.3 * Math.sin(performance.now() / 150) : 0;
    this.flashV = Math.max(0, this.flashV - dt * 1.8); e.flash.style.opacity = this.flashV;
    this.hitT = Math.max(0, this.hitT - dt); e.hitm.style.opacity = this.hitT > 0 ? Math.min(1, this.hitT / 0.12) : 0;
    this.msgT = Math.max(0, this.msgT - dt); e.msg.style.opacity = Math.min(1, this.msgT * 2);
    if (outside && this.msgT <= 0) this.message('OUTSIDE THE ZONE - RUN TO THE CIRCLE', '#ff4d4d', 0.4);
    for (const a of this.arrows) { a.t = Math.max(0, a.t - dt); a.el.style.opacity = Math.min(1, a.t * 1.5); a.el.style.transform = `rotate(${a.ang}rad)`; }
    // fps (smoothed)
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { e.fps.textContent = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    this.drawMini(dt, sim, p);
  }

  drawMini(dt, sim, p) {
    const g = this.mctx, S = 150, k = this.k, z = sim.zone;
    g.clearRect(0, 0, S, S); g.drawImage(this.mapBg, 0, 0);
    // tint everything outside the safe circle red
    g.save(); g.beginPath(); g.rect(0, 0, S, S); g.arc(S / 2 + z.cx * k, S / 2 + z.cz * k, Math.max(0.5, z.radius * k), 0, 6.283, true);
    g.fillStyle = 'rgba(255,40,40,.32)'; g.fill('evenodd'); g.restore();
    g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.beginPath(); g.arc(S / 2 + z.cx * k, S / 2 + z.cz * k, Math.max(0.5, z.radius * k), 0, 6.283); g.stroke();
    if (!z.done && z.nextR < z.radius - 0.5) { g.strokeStyle = '#4aa3ff'; g.setLineDash([3, 3]); g.beginPath(); g.arc(S / 2 + z.nextX * k, S / 2 + z.nextZ * k, z.nextR * k, 0, 6.283); g.stroke(); g.setLineDash([]); }
    for (let i = this.pings.length - 1; i >= 0; i--) {   // enemies show up for a moment when they shoot close to you
      const q = this.pings[i]; q.t -= dt; if (q.t <= 0) { this.pings.splice(i, 1); continue; }
      g.fillStyle = `rgba(255,70,70,${Math.min(1, q.t)})`; g.beginPath(); g.arc(S / 2 + q.x * k, S / 2 + q.z * k, 2.6, 0, 6.283); g.fill();
    }
    g.save(); g.translate(S / 2 + p.x * k, S / 2 + p.z * k); g.rotate(-p.yaw);
    g.fillStyle = '#ffcf4d'; g.beginPath(); g.moveTo(0, -5); g.lineTo(3.5, 4); g.lineTo(0, 2); g.lineTo(-3.5, 4); g.closePath(); g.fill(); g.restore();
  }

  showEnd(r, killerName) {
    $('endtitle').textContent = r.won ? 'WINNER WINNER' : 'ELIMINATED';
    $('endtitle').style.color = r.won ? '#5be37a' : '#ff4d4d';
    $('endsub').textContent = r.won ? 'Last one standing. The desert is yours.' : (killerName ? `Taken out by ${killerName}` : 'The zone got you');
    $('e-place').textContent = `#${r.placement}`; $('e-kills').textContent = r.kills; $('e-time').textContent = fmt(r.time);
    $('end').classList.add('show');
  }
  hideEnd() { $('end').classList.remove('show'); }
  reset() { this.el.feed.innerHTML = ''; this.pings.length = 0; this.hurt = 0; this.lastKey = ''; }
}
