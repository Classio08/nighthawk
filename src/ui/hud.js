// All the on-screen numbers and flashes. It only READS the simulation and writes to HTML elements.
import { WEAPONS, SLOT_ORDER } from '../sim/weapons.js';
import { MAP_HALF } from '../sim/map.js';
import { ARMOR, HEAL_T, MAX_MEDS } from '../sim/loot.js';
import { ABILITIES } from '../sim/abilities.js';

const $ = (id) => document.getElementById(id);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class Hud {
  constructor(map) {
    this.el = {
      alive: $('alive'), kills: $('kills'), zone: $('zone'), fps: $('fpsn'), ping: $('pingn'), feed: $('feed'), slots: $('slots'), msg: $('msg'),
      hpbar: $('hpbar'), hpn: $('hpn'), opname: $('opname'), wname: $('wname'), mag: $('mag'), nades: $('nades'), rl: $('rl'),
      vig: $('vig'), zonevig: $('zonevig'), flash: $('flash'), hitm: $('hitm'), dmg: $('dmg'), mini: $('mini'),
      cu: $('cu'), cd: $('cd'), cl: $('cl'), cr: $('cr'), ct: $('ct'), veh: $('veh'),
      abil: $('abil'), abname: $('abname'), abbar: $('abbar'), abtxt: $('abtxt'), arm: $('arm'), armbar: $('armbar'), armn: $('armn'), medn: $('medn'), kit: $('kit'), heal: $('heal'), pk: $('pk'), mission: $('mission'),
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
      g.fillStyle = b.kind === 'block' || b.kind === 'poi-building' ? '#8a8d92' : b.kind === 'container' || b.kind === 'poi-container' ? '#a9794a' : b.kind === 'poi-fence' || b.kind === 'poi-wall' ? '#b4a17f' : b.kind === 'poi-rock' ? '#756d60' : '#5d6168';
      g.fillRect(S / 2 + (b.x - b.w / 2) * k, S / 2 + (b.z - b.d / 2) * k, Math.max(1.5, b.w * k), Math.max(1.5, b.d * k));
    }
    // Persistent landmark markers make the five Kavari Basin POIs readable on the minimap.
    const tags = {
      'basin-yard': ['BY', '#e8c77a'],
      'dry-river': ['DR', '#b7a78a'],
      'relay-ridge': ['RR', '#9bc8e8'],
      'forward-outpost': ['FO', '#9ed39a'],
      'extraction-pad': ['EX', '#f0eee4'],
    };
    for (const poi of map.landmarks ?? []) {
      const [tag, color] = tags[poi.id] ?? [poi.name.slice(0, 2), '#ffffff'];
      const x = S / 2 + poi.x * k, y = S / 2 + poi.z * k;
      g.beginPath(); g.fillStyle = 'rgba(8,11,16,.9)'; g.arc(x, y, 5.2, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.fillStyle = color; g.arc(x, y, 3.1, 0, Math.PI * 2); g.fill();
      g.font = 'bold 7px ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'top';
      g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,.9)'; g.strokeText(tag, x, y + 5);
      g.fillStyle = color; g.fillText(tag, x, y + 5);
    }
    this.mapBg = c;
  }

  /** a small line above the ammo box: what you just picked up */
  pickup(text, color = '#ffffff') {
    const d = document.createElement('div'); d.textContent = text; d.style.color = color; this.el.pk.appendChild(d); setTimeout(() => d.remove(), 2600);
    while (this.el.pk.children.length > 4) this.el.pk.firstChild.remove();
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
    const outside = !sim.mission && z.outside(p.x, p.z) > 0;
    const t = Math.max(0, Math.ceil(z.timeLeft));
    e.zone.textContent = sim.mission ? 'OPERATION' : z.done ? 'FINAL ZONE' : z.shrinking ? `ZONE CLOSING  ${fmt(t)}` : `NEXT ZONE  ${fmt(t)}`;
    e.zone.classList.toggle('warn', !sim.mission && (z.shrinking || outside));
    e.hpbar.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
    e.hpbar.style.background = p.hp / p.maxHp > 0.5 ? '#5be37a' : p.hp / p.maxHp > 0.25 ? '#ffcf4d' : '#ff4d4d';
    e.hpn.textContent = Math.ceil(Math.max(0, p.hp)); e.opname.textContent = p.name.toUpperCase();
    const own = sim.loot && sim.loot.items.length > 0, haveKey = own ? SLOT_ORDER.map((k) => (p.weapons[k].have ? 1 : 0)).join('') : '';
    const key = `${p.cur}${st.ammo}${st.reserve}${p.nades}|${p.mortar}|${p.streak % 3}|${haveKey}`;
    if (key !== this.lastKey) {
      this.lastKey = key; e.wname.textContent = w.name; e.mag.innerHTML = `${st.ammo} <small>/ ${st.reserve}</small>`; e.nades.innerHTML = `GRENADES ${p.nades}` + (p.mortar > 0 ? ` &nbsp;·&nbsp; <b style="color:#ff7a4d">MORTAR ${p.mortar} [T]</b>` : p.streak % 3 > 0 ? ` &nbsp;·&nbsp; <span style="opacity:.65">STREAK ${p.streak % 3}/3</span>` : '');
      this.slotEls.forEach((d, i) => { d.classList.toggle('on', SLOT_ORDER[i] === p.cur); d.classList.toggle('no', own && !p.weapons[SLOT_ORDER[i]].have); });
    }
    e.mag.style.color = st.ammo <= w.mag * 0.25 ? '#ff6b6b' : '#fff';
    if (p.reloadT > 0) { e.rl.style.opacity = 1; e.rl.firstChild.style.width = `${(1 - p.reloadT / (p.reloadTot || w.reload)) * 100}%`; } else e.rl.style.opacity = 0;
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
    if (this.fpsAcc > 0.5) { e.fps.textContent = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; e.ping.textContent = sim.rtt !== undefined ? ` · ${Math.round(sim.rtt)} ms` : ''; }
    this.drawLoot(sim, p);
    this.drawAbility(p);
    this.drawContracts(sim, p);
    this.drawMission(sim.mission, p);
    this.drawVehicle(sim, p);
    this.drawMini(dt, sim, p);
  }

  drawMission(mission, p) {
    const el = this.el.mission;
    if (!el) return;
    if (!mission) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const stage = mission.stage;
    const progress = stage === 'recon' ? `${mission.foundCount}/2 CLUES` : stage === 'extract' ? `${Math.min(100, Math.round(mission.extractT / 4 * 100))}% EXTRACTION` : stage === 'recover' ? 'TARGET IDENTIFIED' : stage === 'complete' ? 'SUCCESS' : 'IN PROGRESS';
    const detail = stage === 'recon' ? 'Search the marked evidence sites and press E' : stage === 'recover' ? `Locate the technician · ${mission.targetSite.name}` : stage === 'extract' ? (mission.captive.separated ? 'TECHNICIAN SEPARATED — MOVE CLOSER' : 'Keep the technician with you and reach the extraction pad') : stage === 'complete' ? 'Technician safely extracted' : 'Operation ended';
    const html = `<small>OPERATION DUST LANTERN</small><b>${mission.objective}</b><span>${detail}</span><i><em style="width:${stage === 'recon' ? mission.foundCount / 2 * 100 : stage === 'extract' ? mission.extractT / 4 * 100 : stage === 'complete' ? 100 : 0}%"></em></i><small>${progress}</small>`;
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  /** the operator ability box: name, cooldown bar, READY / ACTIVE / STUNNED */
  drawAbility(p) {
    const e = this.el, A = ABILITIES[p.op?.id];
    if (!A) { e.abil.style.display = 'none'; return; }
    e.abil.style.display = '';
    if (e.abname.textContent !== A.name.toUpperCase()) e.abname.textContent = A.name.toUpperCase();
    const stunned = p.stunT > 0, active = p.abT > 0 && !stunned, ready = p.abCd <= 0 && !stunned;
    e.abil.classList.toggle('ready', ready); e.abil.classList.toggle('on', active || stunned);
    const frac = stunned ? 0 : p.abCd > 0 ? 1 - p.abCd / A.cd : 1;
    e.abbar.style.width = `${Math.max(0, Math.min(100, frac * 100))}%`;
    e.abbar.style.background = stunned ? '#7df9ff' : active ? A.color : ready ? '#ffd24d' : '#8a8f98';
    const txt = stunned ? 'STUNNED' : active ? (A.id === 'deadeye' ? 'NEXT SHOT READY' : `ACTIVE ${p.abT.toFixed(1)}s`) : ready ? 'READY' : `${Math.ceil(p.abCd)}s`;
    if (e.abtxt.textContent !== txt) e.abtxt.textContent = txt;
  }

  /** armor bar, medkit count and the "healing..." progress (only in a loot match) */
  drawLoot(sim, p) {
    const e = this.el, on = !!sim.loot && sim.loot.items.length > 0;
    e.arm.style.display = e.kit.style.display = on ? '' : 'none';
    if (on) {
      const cap = ARMOR[p.armorLv]?.pts ?? ARMOR[1].pts;
      e.armbar.style.width = `${Math.max(0, Math.min(100, (p.armor / cap) * 100))}%`;
      e.armn.textContent = p.armor > 0 ? `ARMOR LV${p.armorLv} · ${Math.ceil(p.armor)}` : 'NO ARMOR';
      e.medn.innerHTML = `MEDKITS ${p.meds}/${MAX_MEDS} <b style="color:#5be37a">[H]</b>`;
    }
    const healing = on && p.alive && p.healT > 0;
    e.heal.style.display = healing ? 'block' : 'none';
    if (healing) e.heal.querySelector('i').style.width = `${(1 - p.healT / HEAL_T) * 100}%`;
  }

  /** speed + health while driving, or the "press E" prompt when a free vehicle is close */
  drawVehicle(sim, p) {
    const vs = sim.vehicles; let html = '';
    if (p.alive && vs?.list.length) {
      if (p.veh) {
        const v = p.veh, kmh = Math.round(Math.abs(v.speed) * 3.6), hp = Math.max(0, Math.round((v.hp / v.maxHp) * 100));
        html = `<b>${v.T.label}</b> &nbsp; ${kmh} km/h &nbsp; <span style="color:${hp > 50 ? '#5be37a' : hp > 25 ? '#ffcf4d' : '#ff4d4d'}">HULL ${hp}%</span><br><small>${p.seat === 0 ? 'W/S gas &middot; A/D steer &middot; Space brake &middot; Shift boost' : 'PASSENGER: shoot from the seat'} &middot; E exit</small>`;
      } else {
        let best = null, bd = 4.2;
        for (const v of vs.list) { if (v.dead || (v.driver >= 0 && (v.T.seats < 2 || v.pass >= 0))) continue; const d = Math.hypot(v.x - p.x, v.z - p.z) - v.T.r; if (d < bd) { bd = d; best = v; } }
        if (best) html = `E &nbsp;ENTER ${best.T.label}${best.driver >= 0 ? ' (PASSENGER)' : ''}`;
      }
    }
    if (html !== this.vehHtml) { this.vehHtml = html; this.el.veh.innerHTML = html; this.el.veh.style.display = html ? 'block' : 'none'; }
  }

  /** the little list under the zone timer: what is on the map, how far, how far along */
  drawContracts(sim, p) {
    const list = sim.contracts?.list ?? [], parts = [];
    for (const c of list) {
      const d = Math.round(Math.hypot(c.x - p.x, c.z - p.z));
      const name = c.type === 'airdrop' ? (c.state === 'falling' ? 'AIRDROP INBOUND' : 'AIRDROP')
        : c.type === 'hardpoint' ? 'HARDPOINT'
          : c.type === 'uplink' ? (c.stage === 1 ? 'RELAY: DATA UPLOAD' : 'RELAY: SECURE')
            : (c.who === p.id ? 'BOUNTY ON YOU' : `BOUNTY ${String(sim.fighters[c.who]?.name ?? '').toUpperCase()}`);
      const col = c.type === 'airdrop' ? '#ffcf4d' : c.type === 'hardpoint' ? '#5be37a' : c.type === 'uplink' ? '#53d9ff' : '#ff5a5a';
      const st = c.type === 'bounty' ? '' : c.who === -2 ? ' · CONTESTED' : c.prog > 0.02 ? ` · ${Math.round(c.prog * 100)}%` : '';
      const symbol = c.type === 'airdrop' ? '▣' : c.type === 'hardpoint' ? '◎' : c.type === 'uplink' ? '⌁' : '◆';
      parts.push(`<div style="color:${col}">${symbol} ${name} <span style="opacity:.8">${d} m${st}</span></div>`);
    }
    const html = parts.join('');
    if (html !== this.ctHtml) { this.ctHtml = html; this.el.ct.innerHTML = html; this.el.ct.style.display = html ? 'block' : 'none'; }
  }


  drawMini(dt, sim, p) {
    const g = this.mctx, S = 150, k = this.k, z = sim.zone;
    g.clearRect(0, 0, S, S); g.drawImage(this.mapBg, 0, 0);
    // tint everything outside the safe circle red
    g.save(); g.beginPath(); g.rect(0, 0, S, S); g.arc(S / 2 + z.cx * k, S / 2 + z.cz * k, Math.max(0.5, z.radius * k), 0, 6.283, true);
    g.fillStyle = 'rgba(255,40,40,.32)'; g.fill('evenodd'); g.restore();
    g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.beginPath(); g.arc(S / 2 + z.cx * k, S / 2 + z.cz * k, Math.max(0.5, z.radius * k), 0, 6.283); g.stroke();
    if (!z.done && z.nextR < z.radius - 0.5) { g.strokeStyle = '#4aa3ff'; g.setLineDash([3, 3]); g.beginPath(); g.arc(S / 2 + z.nextX * k, S / 2 + z.nextZ * k, z.nextR * k, 0, 6.283); g.stroke(); g.setLineDash([]); }
    for (const v of sim.vehicles?.list ?? []) {              // vehicles on the map
      if (v.dead) continue; const x = S / 2 + v.x * k, y = S / 2 + v.z * k;
      g.fillStyle = v.driver >= 0 ? '#ff8a4d' : '#5fd6ff'; g.fillRect(x - 2, y - 2, 4, 4);
    }
    if (sim.mission) {
      for (const clue of sim.mission.clues) if (!clue.found && Math.hypot(clue.x - p.x, clue.z - p.z) < 22) { g.fillStyle = '#ffcf4d'; g.beginPath(); g.arc(S / 2 + clue.x * k, S / 2 + clue.z * k, 3, 0, 6.283); g.fill(); }
      if (sim.mission.stage === 'recover') { g.fillStyle = '#ff9d45'; g.fillRect(S / 2 + sim.mission.captive.x * k - 2, S / 2 + sim.mission.captive.z * k - 2, 5, 5); }
      if (sim.mission.stage === 'extract') { g.strokeStyle = '#58d8ff'; g.lineWidth = 1.5; g.beginPath(); g.arc(S / 2 + sim.mission.extraction.x * k, S / 2 + sim.mission.extraction.z * k, 5, 0, 6.283); g.stroke(); }
    }
    for (const c of sim.contracts?.list ?? []) {            // contracts on the map
      const x = S / 2 + c.x * k, y = S / 2 + c.z * k;
      if (c.type === 'hardpoint') { g.strokeStyle = '#5be37a'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, c.r * k + 1, 0, 6.283); g.stroke(); }
      else if (c.type === 'uplink') { g.strokeStyle = '#53d9ff'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, c.r * k + 1, 0, 6.283); g.stroke(); g.fillStyle = '#53d9ff'; g.fillRect(x - 2, y - 2, 4, 4); }
      else if (c.type === 'airdrop') { g.fillStyle = '#ffcf4d'; g.fillRect(x - 3, y - 3, 6, 6); g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect(x - 3, y - 3, 6, 6); }
      else { g.fillStyle = '#ff3b3b'; g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 4, y); g.lineTo(x, y + 5); g.lineTo(x - 4, y); g.closePath(); g.fill(); }
    }
    for (let i = this.pings.length - 1; i >= 0; i--) {   // enemies show up for a moment when they shoot close to you
      const q = this.pings[i]; q.t -= dt; if (q.t <= 0) { this.pings.splice(i, 1); continue; }
      g.fillStyle = `rgba(255,70,70,${Math.min(1, q.t)})`; g.beginPath(); g.arc(S / 2 + q.x * k, S / 2 + q.z * k, 2.6, 0, 6.283); g.fill();
    }
    g.save(); g.translate(S / 2 + p.x * k, S / 2 + p.z * k); g.rotate(-p.yaw);
    g.fillStyle = '#ffcf4d'; g.beginPath(); g.moveTo(0, -5); g.lineTo(3.5, 4); g.lineTo(0, 2); g.lineTo(-3.5, 4); g.closePath(); g.fill(); g.restore();
  }

  showEnd(r, killerName) {
    $('endtitle').textContent = r.mission ? (r.won ? 'OPERATION COMPLETE' : 'OPERATION FAILED') : r.won ? 'WINNER WINNER' : 'ELIMINATED';
    $('endtitle').style.color = r.won ? '#5be37a' : '#ff4d4d';
    $('endsub').textContent = r.mission
      ? (r.won ? `Technician extracted safely · ${r.clues ?? 0}/3 clues recovered · No persistent rewards yet` : 'The operator was lost before the technician could be extracted')
      : r.won ? 'Last one standing. The desert is yours.' : (killerName ? `Taken out by ${killerName}` : 'The zone got you');
    $('e-place').textContent = r.mission ? (r.won ? 'SAFE' : 'FAIL') : `#${r.placement}`;
    $('e-kills').textContent = r.kills ?? 0; $('e-time').textContent = fmt(r.time);
    $('end').classList.add('show');
  }
  hideEnd() { $('end').classList.remove('show'); }
  reset() { this.el.feed.innerHTML = ''; if (this.el.mission) this.el.mission.style.display = 'none'; this.pings.length = 0; this.hurt = 0; this.lastKey = ''; this.ctHtml = null; this.vehHtml = null; }
}
