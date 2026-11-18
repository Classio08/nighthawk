// NIGHTHAWK - game loop. This file only CONNECTS things:
//   Simulation (rules, physics, bots)  ->  events  ->  sound / particles / decals / ragdolls / HUD
//   Input (keys, mouse)                ->  cmd     ->  Simulation
// Rules live in src/sim (no graphics there, so the multiplayer server can run the same code).
import * as THREE from 'three';
import { Simulation, initPhysics } from './sim/world.js';
import { WEAPONS, SLOT_ORDER } from './sim/weapons.js';
import { Input } from './input/input.js';
import { WorldView } from './render/scene.js';
import { FighterView } from './render/fighter.js';
import { Viewmodel } from './render/viewmodel.js';
import { RagdollWorld } from './render/ragdoll.js';
import { RagdollView } from './render/ragdoll-view.js';
import { Particles } from './fx/particles.js';
import { Decals } from './fx/decals.js';
import { Tracers } from './fx/tracers.js';
import { CameraFx } from './fx/camerafx.js';
import { audio } from './fx/audio.js';
import { Hud } from './ui/hud.js';

const STEP = 1 / 60, BASE_FOV = 78;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const params = new URLSearchParams(location.search);
const AUTOSTART = params.has('autostart');          // used by the automatic browser test: skips the click-to-play screen

const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 600);
camera.rotation.order = 'YXZ';
const viewmodel = new Viewmodel(camera);
const camfx = new CameraFx();
const input = new Input(canvas);
const resize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
addEventListener('resize', resize); resize();

/** everything that belongs to ONE match (recreated by PLAY AGAIN) */
let G = null;
const cmd = { yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, fire: false, ads: false, reload: false, slot: 0, grenade: false };
let hud = null;
let paused = false, started = false;
const tmp = new THREE.Vector3();

function disposeScene(scene) {
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const m = o.material; if (m) { for (const x of Array.isArray(m) ? m : [m]) { if (x.map) x.map.dispose(); x.dispose(); } }
  });
}

async function newMatch() {
  if (G) { G.scene.remove(camera); G.sim.dispose(); G.rag.clear(); disposeScene(G.scene); }
  const seed = params.get('seed') ? +params.get('seed') : undefined;
  const sim = await Simulation.create({ seed, bots: +(params.get('bots') ?? 15), operator: params.get('op') ?? 'roms' });
  const scene = new THREE.Scene(); scene.add(camera);
  const world = new WorldView(scene, sim);
  const particles = new Particles(scene), decals = new Decals(scene), tracers = new Tracers(scene);
  particles.onBloodLand = (x, z) => decals.stain(x, 0.02, z, 0, 1, 0, 0.35 + Math.random() * 0.4);
  const rag = new RagdollWorld(sim.map, { max: 10, life: 9 });
  const views = new Map();
  for (const f of sim.fighters) if (!f.isPlayer) views.set(f.id, new FighterView(f, scene));
  const p = sim.player;
  cmd.yaw = p.yaw; cmd.pitch = 0; cmd.reload = false; cmd.grenade = false; cmd.slot = 0;
  G = { sim, scene, world, particles, decals, tracers, rag, ragViews: [], views, acc: 0, over: false, deadT: -1, killer: null,
    prev: { x: p.x, y: p.y, z: p.z }, cur: { x: p.x, y: p.y, z: p.z }, recoil: 0, stepT: 0, lastZone: '', zonePhase: 0, deathCamT: 0, lastTorso: null, adsK: 0, fov: BASE_FOV, roll: 0 };
  if (!hud) hud = new Hud(sim.map); else { hud.setMap(sim.map); hud.reset(); }
  hud.hideEnd();
  viewmodel.root.visible = true;
  window.__nh = { G, sim, cmd, input, hud, camera, audio };     // handles for the automatic browser test
  return G;
}

/* =========================  events from the simulation -> effects  ========================= */

function angleTo(p, x, z) { return Math.atan2(-(x - p.x), -(z - p.z)); }

function handleEvents() {
  const { sim, particles, decals, tracers, views } = G, p = sim.player;
  for (const e of sim.drainEvents()) {
    switch (e.t) {
      case 'fire': {
        const f = sim.fighters[e.by], w = WEAPONS[e.w];
        audio.play(e.w, e.by === p.id ? { vol: 1 } : { x: f.x, z: f.z, maxD: w.noise * 1.6 });
        if (e.by === p.id) {
          viewmodel.kick(w); camfx.add(0.05 + w.kick * 0.045);
          const k = (p.ads ? 0.55 : 1);
          cmd.pitch = clamp(cmd.pitch + w.recoilUp * k, -1.5, 1.5); cmd.yaw += (Math.random() - 0.5) * 2 * w.recoilSide * k; G.recoil += w.recoilUp * k;
          particles.casing(camera.position.x + Math.cos(cmd.yaw) * 0.25, camera.position.y - 0.15, camera.position.z - Math.sin(cmd.yaw) * 0.25, Math.cos(cmd.yaw), -Math.sin(cmd.yaw));
        } else {
          const v = views.get(e.by); if (v) v.shotFlash();
          if (Math.hypot(f.x - p.x, f.z - p.z) < 70) hud.ping(f.x, f.z);
        }
        break;
      }
      case 'shot': {
        const f = sim.fighters[e.by];
        if (e.by === p.id) { viewmodel.guns[p.cur].userData.muzzle.getWorldPosition(tmp); }
        else { const v = views.get(e.by); if (v) v.muzzleWorld(tmp); else tmp.set(e.ox, e.oy, e.oz); }
        tracers.add(tmp.x, tmp.y, tmp.z, e.ex, e.ey, e.ez, e.by === p.id ? 0xfff2b0 : 0xffc27a);
        if (e.hit === 'world') {
          decals.hole(e.ex, e.ey, e.ez, e.nx, e.ny, e.nz);
          particles.sparks(e.ex, e.ey, e.ez, e.nx, e.ny, e.nz, 5); particles.dust(e.ex, e.ey, e.ez, e.nx, e.ny, e.nz, 3);
        }
        void f; break;
      }
      case 'hit': {
        const t = sim.fighters[e.target];
        particles.blood(e.x, e.y, e.z, e.dx, e.dy, e.dz, e.killed ? 18 : e.head ? 12 : 8, e.cause === 'explosion' ? 1.6 : 1);
        const v = views.get(e.target); if (v) v.flash();
        if (e.target === p.id) {
          hud.hurtFlash(clamp(0.25 + e.dmg / 60, 0.25, 0.9)); camfx.add(clamp(0.2 + e.dmg / 90, 0.2, 0.7));
          audio.play('hurt', { vol: 0.9 });
          if (e.cause === 'bullet') hud.damageFrom(cmd.yaw - angleTo(p, e.sx, e.sz));
        } else {
          audio.play('hurt', { x: t.x, z: t.z, vol: 0.55, maxD: 40 });
          if (e.by === p.id) { hud.hitmarker(e.killed, e.head); audio.play(e.killed ? 'kill' : e.head ? 'headshot' : 'hit', { vol: 0.9 }); }
        }
        break;
      }
      case 'kill': {
        const t = sim.fighters[e.target], you = e.by === p.id, me = e.target === p.id;
        const wName = WEAPONS[e.w]?.name ?? (e.w === 'grenade' ? 'GRENADE' : e.cause === 'zone' ? 'THE ZONE' : 'FALL');
        hud.addFeed(e.byName === 'The zone' ? `<b>THE ZONE</b> ✕ ${e.name}` : `<b>${e.byName}</b> [${wName}${e.head ? ' ✦' : ''}] ${e.name}`, you || me);
        particles.blood(e.x, e.y + 0.3, e.z, e.dx, e.dy + 0.2, e.dz, 24, 1.3);
        G.decals.stain(e.x, 0.02, e.z, 0, 1, 0, 1.1);
        const pw = e.cause === 'explosion' ? 2.3 : e.w === 'shotgun' ? 1.8 : e.w === 'dmr' ? 1.5 : 1;
        const rg = G.rag.spawn({ x: e.x, y: e.y - 0.9, z: e.z, yaw: t.yaw, vx: e.vx, vz: e.vz, dx: e.dx, dy: e.dy, dz: e.dz, power: pw, head: e.head });
        G.ragViews.push(new RagdollView(G.scene, rg, t.color, t.id, G.rag.life));
        const v = views.get(e.target); if (v) { v.dispose(); views.delete(e.target); }
        if (you) { hud.hitmarker(true, e.head); audio.play('kill', { vol: 1 }); hud.message(`ELIMINATED ${e.name.toUpperCase()}`, '#ffcf4d', 1.6); }
        if (me) { G.deadT = performance.now(); G.killer = e.byName; viewmodel.root.visible = false; camfx.add(0.8); }
        break;
      }
      case 'explosion': {
        particles.explosion(e.x, e.y, e.z, e.r);
        decals.holes.add(e.x, 0.03, e.z, 0, 1, 0, 3.6);
        audio.play('explosion', { x: e.x, z: e.z, maxD: 160, vol: 1.2 });
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        camfx.add(clamp(1 - d / 32, 0, 1) * 0.9);
        if (d < 10 && p.alive) hud.whiteFlash(0.7 * (1 - d / 10));
        break;
      }
      case 'reload': {
        const f = sim.fighters[e.by];
        audio.play(e.phase === 'start' ? 'reload1' : 'reload2', e.by === p.id ? { vol: 1 } : { x: f.x, z: f.z, maxD: 35, vol: 0.8 });
        break;
      }
      case 'dry': if (e.by === p.id) audio.play('dry'); break;
      case 'switch': if (e.by === p.id) audio.play('switch'); break;
      case 'throw': { const f = sim.fighters[e.by]; audio.play('throw', e.by === p.id ? {} : { x: f.x, z: f.z, maxD: 45 }); break; }
      case 'end': {
        G.over = true;
        if (e.won) { audio.play('win'); setTimeout(() => hud.showEnd(e), 1200); }
        else { audio.play('lose'); setTimeout(() => hud.showEnd(e, G.killer), 1900); }
        if (document.pointerLockElement) document.exitPointerLock();
        break;
      }
      default: break;
    }
  }
}

/* =========================  per-frame update  ========================= */

function handleInput(dt) {
  const { sim } = G, p = sim.player;
  if (!p.alive) { input.dx = 0; input.dy = 0; input.endFrame(); return; }
  const w = WEAPONS[p.cur];
  const sens = 1 - 0.5 * G.adsK * (1 - w.adsFov / 100);                      // aim slower while zoomed
  const look = input.readLook(dt, sens);
  G.lookYaw = look.yaw; G.lookPitch = look.pitch;
  cmd.yaw += look.yaw; cmd.pitch = clamp(cmd.pitch + look.pitch, -1.5, 1.5);
  Object.assign(cmd, input.readMove());
  cmd.fire = input.fire; cmd.ads = input.ads;
  if (input.wasPressed('KeyR')) cmd.reload = true;
  if (input.wasPressed('KeyG')) cmd.grenade = true;
  const slot = input.readSlot(); if (slot) cmd.slot = slot;
  const wheel = input.takeWheel();
  if (wheel) { const i = SLOT_ORDER.indexOf(p.cur); cmd.slot = ((i + (wheel > 0 ? 1 : -1) + SLOT_ORDER.length) % SLOT_ORDER.length) + 1; }
  input.endFrame();
  // recoil recovery: the view settles back down a bit when you stop shooting
  if (!input.fire && p.fireT <= 0 && G.recoil > 0) { const r = Math.min(G.recoil, G.recoil * 4 * dt + 0.0006); cmd.pitch -= r * 0.6; G.recoil -= r; }
}

function updateCamera(dt, alpha) {
  const { sim } = G, p = sim.player, w = WEAPONS[p.cur];
  const shake = camfx.update(dt);
  if (p.alive) {
    const x = lerp(G.prev.x, G.cur.x, alpha), y = lerp(G.prev.y, G.cur.y, alpha), z = lerp(G.prev.z, G.cur.z, alpha);
    camera.position.set(x, y + 0.72, z);
    G.roll = lerp(G.roll, -cmd.strafe * 0.014 * (p.sprinting ? 1.6 : 1), 1 - Math.exp(-10 * dt));
    camera.rotation.set(cmd.pitch + shake.pitch, cmd.yaw + shake.yaw, G.roll + shake.roll);
    const targetFov = lerp(BASE_FOV + (p.sprinting ? 6 : 0), w.adsFov, G.adsK);
    G.fov = lerp(G.fov, targetFov, 1 - Math.exp(-14 * dt));
  } else {
    // death cam: slowly orbit the ragdoll
    const rv = G.ragViews[G.ragViews.length - 1];
    const tp = rv?.torso() ?? G.lastTorso ?? { x: p.x, y: 1, z: p.z }; G.lastTorso = tp;
    G.deathCamT += dt; const a = G.deathCamT * 0.35 + 0.8;
    camera.position.set(tp.x + Math.sin(a) * 4.2, tp.y + 2.6, tp.z + Math.cos(a) * 4.2);
    camera.lookAt(tp.x, tp.y + 0.3, tp.z);
    G.fov = lerp(G.fov, BASE_FOV, 1 - Math.exp(-6 * dt));
  }
  if (Math.abs(camera.fov - G.fov) > 0.01) { camera.fov = G.fov; camera.updateProjectionMatrix(); }
}

let fpsSmooth = 60, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  fpsSmooth = lerp(fpsSmooth, 1 / Math.max(dt, 1e-4), 0.05);
  if (!G || !started) { return; }
  const { sim } = G, p = sim.player;

  if (!paused) {
    handleInput(dt);
    G.acc += dt;
    while (G.acc >= STEP) {
      G.prev = G.cur; G.cur = { x: p.x, y: p.y, z: p.z };
      sim.step(STEP, cmd);
      G.cur = { x: p.x, y: p.y, z: p.z };
      G.acc -= STEP;
    }
    handleEvents();
  }
  const alpha = paused ? 1 : G.acc / STEP;

  // ---- derive animation/visual state ----
  const w = WEAPONS[p.cur], wasAds = G.adsK;
  G.adsK = clamp(G.adsK + (p.ads && p.alive ? 1 : -1) * dt / w.adsTime, 0, 1);
  void wasAds;
  updateCamera(dt, alpha);
  audio.setListener(camera.position.x, camera.position.z, cmd.yaw);
  const moving = p.speedH > 1.2;
  if (p.alive) {
    viewmodel.update(dt, {
      weapon: p.cur, adsTime: w.adsTime, ads: p.ads, sprint: p.sprinting && p.speedH > 3, grounded: p.grounded, speed: p.speedH,
      lookYaw: G.lookYaw || 0, lookPitch: G.lookPitch || 0,
      reloadK: p.reloadT > 0 ? 1 - p.reloadT / w.reload : -1, switchK: p.switchT > 0 ? p.switchT / 0.32 : 0,
    });
    G.lookYaw = 0; G.lookPitch = 0;
    // player footsteps
    if (p.grounded && p.speedH > 2) { G.stepT -= dt; if (G.stepT <= 0) { G.stepT = p.sprinting ? 0.27 : 0.4; audio.play('step', { vol: p.ads ? 0.4 : 1 }); } } else G.stepT = 0.1;
  }

  // fighters, ragdolls, effects
  for (const v of G.views.values()) {
    v.update(dt, Math.hypot(v.f.x - camera.position.x, v.f.z - camera.position.z));
    if (v.stepped) audio.play('step', { x: v.f.x, z: v.f.z, maxD: 38, vol: 0.9 });
  }
  if (!paused) {
    G.rag.update(dt);
    G.world.update(dt, camera.position.x, camera.position.z);
    G.particles.update(dt); G.tracers.update(dt);
  }
  for (let i = G.ragViews.length - 1; i >= 0; i--) { const rv = G.ragViews[i]; if (!G.rag.list.includes(rv.rag)) { rv.dispose(); G.ragViews.splice(i, 1); } else rv.update(); }

  // zone announcements
  const z = sim.zone, key = `${z.phase}${z.shrinking}`;
  if (key !== G.lastZone) {
    if (G.lastZone !== '' && p.alive) {
      if (z.shrinking) { hud.message('ZONE IS CLOSING', '#ff4d4d', 2); audio.play('zone'); }
      else { hud.message('NEW ZONE MARKED', '#ffffff', 2); audio.play('zone', { vol: 0.6, rate: 1.3 }); }
    }
    G.lastZone = key;
  }

  // crosshair spread in pixels (matches what the bullets really do)
  const spreadRad = (p.ads ? w.spreadAds : w.spreadHip * (moving ? 1.35 : 1)) + p.bloom;
  const spreadPx = Math.tan(spreadRad) * (innerHeight / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  hud.update(dt, sim, p, clamp(spreadPx, 0, 120), G.adsK, fpsSmooth);

  renderer.render(G.scene, camera);
}

/* =========================  start / pause / play again  ========================= */

function showOv(id, on) { $(id).classList.toggle('show', on); }

async function beginPlay() {
  audio.unlock();
  if (!started) { started = true; await newMatch(); }
  showOv('start', false); showOv('pause', false); paused = false;
  if (!AUTOSTART) input.lock();
}

input.onLockChange = (locked) => {
  if (!started || !G || G.over || AUTOSTART) return;
  if (!locked) { paused = true; showOv('pause', true); } else { paused = false; showOv('pause', false); }
};
$('playbtn').addEventListener('click', beginPlay);
$('resumebtn').addEventListener('click', () => { audio.unlock(); input.lock(); paused = false; showOv('pause', false); });
$('againbtn').addEventListener('click', async () => { audio.unlock(); showOv('end', false); await newMatch(); paused = false; if (!AUTOSTART) input.lock(); });

(async function boot() {
  await initPhysics();
  requestAnimationFrame(frame);
  if (AUTOSTART) { input.lockFailed = true; await beginPlay(); }
})();
