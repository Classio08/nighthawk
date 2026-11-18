// NIGHTHAWK - game loop. This file only CONNECTS things:
//   Simulation (rules, physics, bots)  ->  events  ->  sound / particles / decals / ragdolls / HUD
//   Input (keys, mouse)                ->  cmd     ->  Simulation
// Rules live in src/sim (no graphics there, so the multiplayer server can run the same code).
import * as THREE from 'three';
import { Simulation, initPhysics } from './sim/world.js';
import { WEAPONS, SLOT_ORDER, RELOAD_STAGES, SKINS, skinOk } from './sim/weapons.js';
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
import { MagDrops } from './fx/mags.js';
import { tickSkins, skinReact, SKIN_INFO } from './render/skins.js';
import { audio } from './fx/audio.js';
import { Hud } from './ui/hud.js';
import { Atmosphere } from './render/atmosphere.js';
import { VehiclesView } from './render/vehicles-view.js';
import { LootView } from './render/loot-view.js';
import { ContractsView } from './render/contracts-view.js';
import { settings } from './settings.js';

const STEP = 1 / 60, BASE_FOV = 78;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const params = new URLSearchParams(location.search);
const AUTOSTART = params.has('autostart');
const DEFAULT_SERVER = import.meta.env?.VITE_SERVER_URL ?? (['localhost', '127.0.0.1'].includes(location.hostname) ? `ws://${location.hostname}:2567` : '');
const ONLINE_URL = params.get('online') || DEFAULT_SERVER;        // ?online=ws://host:2567 overrides
const FAKE_LAG = +(params.get('lag') ?? 0);                         // ?lag=120 simulates 120 ms of round-trip lag (for testing)          // used by the automatic browser test: skips the click-to-play screen

/* weapon skin: picked on the start screen, remembered in the browser, ?skin=magma overrides (for testing) */
let SKIN = null;
try { SKIN = skinOk(params.get('skin') ?? localStorage.getItem('nh_skin')); } catch { /* private mode */ }

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
const cmd = { yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, fire: false, ads: false, reload: false, slot: 0, grenade: false, mortar: false, use: false };
let hud = null;
let paused = false, started = false;
const tmp = new THREE.Vector3();

function disposeScene(scene) {
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const m = o.material; if (m) { for (const x of Array.isArray(m) ? m : [m]) { if (x.map) x.map.dispose(); x.dispose(); } }
  });
}

async function newMatch(online = null) {
  if (G) { G.atmo?.dispose(); G.cview?.dispose(); G.vview?.dispose(); G.lview?.dispose(); G.scene.remove(camera); G.sim.dispose(); G.rag.clear(); disposeScene(G.scene); }
  const seed = params.get('seed') ? +params.get('seed') : undefined;
  const sim = online ?? await Simulation.create({ seed, bots: +(params.get('bots') ?? 15), operator: params.get('op') ?? 'roms', skin: SKIN, weather: params.get('weather') ?? undefined, contractStart: params.has('cstart') ? +params.get('cstart') : undefined, ...(params.get('vehicles') === '0' ? { vehicles: false } : {}), ...(params.get('loot') === '0' ? {} : { loot: true }) });      // ?vehicles=0 turns buggies/bikes off, ?loot=0 gives everybody every gun from the start
  const scene = new THREE.Scene(); scene.add(camera);
  const world = new WorldView(scene, sim);
  const particles = new Particles(scene), decals = new Decals(scene), tracers = new Tracers(scene);
  particles.onBloodLand = (x, z) => { if (settings.gore) decals.stain(x, 0.02, z, 0, 1, 0, 0.35 + Math.random() * 0.4); };
  const atmo = new Atmosphere(scene, world, camera, sim.weather, audio), cview = new ContractsView(scene, sim), vview = new VehiclesView(scene, sim), lview = sim.loot ? new LootView(scene, sim) : null;
  const rag = new RagdollWorld(sim.map, { max: 10, life: 9 });
  const mags = new MagDrops(scene, (x, z) => audio.play('magdrop', { x, z, maxD: 30, vol: 0.9 }));
  const views = new Map();
  for (const f of sim.fighters) if (!f.isPlayer) views.set(f.id, new FighterView(f, scene));
  const p = sim.player;
  viewmodel.setSkin(p.skin);
  cmd.yaw = p.yaw; cmd.pitch = 0; cmd.reload = false; cmd.grenade = false; cmd.mortar = false; cmd.use = false; cmd.heal = false; cmd.slot = 0;
  G = { sim, net: online, scene, world, atmo, cview, vview, lview, engT: 0, freeLookT: 0, particles, decals, tracers, rag, mags, later: [], ragViews: [], views, acc: 0, over: false, deadT: -1, killer: null,
    prev: { x: p.x, y: p.y, z: p.z }, cur: { x: p.x, y: p.y, z: p.z }, recoil: 0, stepT: 0, lastZone: '', zonePhase: 0, deathCamT: 0, lastTorso: null, adsK: 0, fov: BASE_FOV, roll: 0 };
  if (!hud) hud = new Hud(sim.map); else { hud.setMap(sim.map); hud.reset(); }
  hud.hideEnd();
  if (sim.weather?.id !== 'clear') hud.message(sim.weather.label, '#cfe3ff', 2.6);
  viewmodel.root.visible = true;
  window.__nh = { G, sim, cmd, input, hud, camera, audio, net: online };     // handles for the automatic browser test
  return G;
}

/* =========================  events from the simulation -> effects  ========================= */

/** the old magazine falls out of the gun (cosmetic physics, see fx/mags.js) */
const magV = new THREE.Vector3(), magVel = new THREE.Vector3();
function dropMag(f, mine, empty) {
  if (!G || G.over) return;
  const sim = G.sim;
  if (mine) viewmodel.magWorld(magV);
  else { const v = G.views.get(f.id); if (!v) return; v.gunWorld(magV); magV.y -= 0.12; }
  const yaw = mine ? cmd.yaw : f.yaw, c = Math.cos(yaw), s = Math.sin(yaw);
  magVel.set(c * 0.9 + (Math.random() - 0.5) * 0.6, -0.8, -s * 0.9 + (Math.random() - 0.5) * 0.6);          // out to the right and down
  G.mags.drop(magV, magVel, empty);
  void sim;
}

/** blood and gore, or - when the player turned gore off (portal builds default to off) - a plain dust puff */
function blood(x, y, z, dx, dy, dz, n, power) {
  if (settings.gore) G.particles.blood(x, y, z, dx, dy, dz, n, power);
  else G.particles.dust(x, y, z, -dx * 0.3, 0.6, -dz * 0.3, Math.ceil(n / 3));
}
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
        blood(e.x, e.y, e.z, e.dx, e.dy, e.dz, e.killed ? 18 : e.head ? 12 : 8, e.cause === 'explosion' ? 1.6 : 1);
        const v = views.get(e.target); if (v) v.flash();
        if (e.arm > 0 && (e.target === p.id || e.by === p.id)) audio.play('armor', { vol: e.target === p.id ? 0.7 : 0.45 });
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
        if (you) skinReact(0.7);
        const wName = e.cause === 'vehicle' ? 'ROADKILL' : e.cause === 'crash' ? 'CRASH' : (WEAPONS[e.w]?.name ?? (e.w === 'grenade' ? 'GRENADE' : e.w === 'barrel' ? 'BARREL' : e.w === 'mortar' ? 'MORTAR' : e.w === 'vehicle' ? 'WRECK' : e.cause === 'zone' ? 'THE ZONE' : 'FALL'));
        hud.addFeed(e.byName === 'The zone' ? `<b>THE ZONE</b> ✕ ${e.name}` : `<b>${e.byName}</b> [${wName}${e.head ? ' ✦' : ''}] ${e.name}`, you || me);
        blood(e.x, e.y + 0.3, e.z, e.dx, e.dy + 0.2, e.dz, 24, 1.3);
        if (settings.gore) G.decals.stain(e.x, 0.02, e.z, 0, 1, 0, 1.1);
        const pw = e.cause === 'explosion' ? 2.3 : e.w === 'shotgun' ? 1.8 : e.w === 'dmr' ? 1.5 : 1;
        const rg = G.rag.spawn({ x: e.x, y: e.y - 0.9, z: e.z, yaw: t.yaw, vx: e.vx, vz: e.vz, dx: e.dx, dy: e.dy, dz: e.dz, power: pw, head: e.head });
        G.ragViews.push(new RagdollView(G.scene, rg, t.color, t.id, G.rag.life));
        const v = views.get(e.target); if (v) { v.dispose(); views.delete(e.target); }
        if (you) { hud.hitmarker(true, e.head); audio.play('kill', { vol: 1 }); hud.message(`ELIMINATED ${e.name.toUpperCase()}`, '#ffcf4d', 1.6); }
        if (me) { G.deadT = performance.now(); G.killer = e.byName; viewmodel.root.visible = false; camfx.add(0.8); }
        break;
      }
      case 'prop': {                                           // a crate splintered / a barrel is gone
        if (e.kind === 'crate') { particles.dust(e.x, e.y, e.z, 0, 1, 0, 14); particles.sparks(e.x, e.y, e.z, 0, 1, 0, 8); audio.play('crate', { x: e.x, z: e.z, maxD: 60 }); }
        break;
      }
      case 'propHit': break;
      case 'contract': {                                       // airdrop / hardpoint / bounty came, landed, was cashed in or ran out
        const who = e.by >= 0 ? (e.by === p.id ? 'YOU' : e.byName) : '';
        const nice = { airdrop: 'AIRDROP', hardpoint: 'HARDPOINT', bounty: 'BOUNTY', uplink: 'RELAY UPLINK' }[e.type];
        if (e.phase === 'new') {
          if (e.type === 'bounty') {
            const t = sim.fighters[e.who]; const mine = e.who === p.id;
            hud.message(mine ? 'THERE IS A BOUNTY ON YOU!' : `BOUNTY ON ${String(t?.name ?? '?').toUpperCase()}`, mine ? '#ff4d4d' : '#ff9a4d', 2.6);
          } else {
            const label = e.type === 'airdrop' ? 'AIRDROP INBOUND' : e.type === 'uplink' ? 'RELAY UPLINK DETECTED' : 'HARDPOINT MARKED';
            const color = e.type === 'airdrop' ? '#ffcf4d' : e.type === 'uplink' ? '#53d9ff' : '#5be37a';
            hud.message(label, color, 2.4);
          }
          audio.play(e.type === 'airdrop' ? 'airdrop' : 'contract', { vol: 0.9 });
        } else if (e.phase === 'landed') { hud.message('AIRDROP LANDED', '#ffcf4d', 1.6); audio.play('contract', { x: e.x, z: e.z, maxD: 140, vol: 0.9 }); }
        else if (e.phase === 'armed') {
          hud.message(e.by === p.id ? 'RELAY SECURED — DATA UPLOAD STARTED' : 'RELAY SECURED — DATA UPLOAD IN PROGRESS', '#53d9ff', 2.4);
          audio.play('contract', { x: e.x, z: e.z, maxD: 140, vol: 0.9 });
        } else if (e.phase === 'done') {
          if (e.by === p.id) { hud.message(e.type === 'bounty' ? 'BOUNTY COLLECTED  +50 HP  +MORTAR' : e.type === 'uplink' ? 'INTEL EXTRACTED  +35 HP  +MORTAR' : `${nice} CLAIMED  +MORTAR [T]`, '#5be37a', 2.4); audio.play('kill', { vol: 0.8, rate: 1.4 }); }
          else hud.addFeed(`<b>${who}</b> completed the ${nice.toLowerCase()}`, false);
        }
        break;
      }
      case 'streak': if (e.by === p.id) { hud.message(`${e.n} KILL STREAK - MORTAR READY [T]`, '#ff9a4d', 2.4); audio.play('contract', { vol: 0.8, rate: 0.8 }); } break;
      case 'mortar': {
        G.cview.mark(e.x, e.z); audio.play('mortar', e.by === p.id ? { vol: 1 } : { x: e.x, z: e.z, maxD: 200 });
        if (e.by === p.id) hud.message('MORTAR INBOUND', '#ff9a4d', 2);
        else if (Math.hypot(e.x - p.x, e.z - p.z) < 26) hud.message('MORTAR STRIKE! RUN!', '#ff4d4d', 2.4);
        else hud.addFeed(`<b>${e.by >= 0 ? sim.fighters[e.by]?.name ?? '?' : '?'}</b> called a mortar strike`, false);
        break;
      }
      case 'mortarFail': if (e.by === p.id) hud.message('TOO CLOSE TO YOURSELF', '#ff4d4d', 1.2); break;
      case 'vehicle': {
        if (e.phase === 'enter' && e.by === p.id) { hud.message(`${e.kind === 'bike' ? 'BIKE' : 'BUGGY'} - ${e.seat === 0 ? 'DRIVER' : 'PASSENGER'}`, '#5fd6ff', 1.6); audio.play('switch', { vol: 1 }); }
        else if (e.phase === 'enter') audio.play('switch', { x: sim.fighters[e.by]?.x ?? p.x, z: sim.fighters[e.by]?.z ?? p.z, maxD: 40, vol: 0.7 });
        else if (e.phase === 'crash') { particles.sparks(e.x, 0.7, e.z, 0, 1, 0, 10); particles.dust(e.x, 0.5, e.z, 0, 1, 0, 6); audio.play('crash', { x: e.x, z: e.z, maxD: 100, vol: 0.9 }); if (Math.hypot(e.x - p.x, e.z - p.z) < 14) camfx.add(clamp(e.imp / 30, 0.15, 0.7)); }
        break;
      }
      case 'pickup': {
        const nm = e.kind === 'weapon' || e.kind === 'ammo' ? WEAPONS[e.sub].name : '';
        const text = e.kind === 'weapon' ? `PICKED UP ${nm}` : e.kind === 'ammo' ? `+${e.qty} ${nm} AMMO` : e.kind === 'med' ? `+${e.qty} MEDKIT${e.qty > 1 ? 'S' : ''}` : e.kind === 'armor' ? `ARMOR LV${e.sub} (${e.qty})` : `+${e.qty} GRENADE${e.qty > 1 ? 'S' : ''}`;
        if (e.by === p.id) { hud.pickup(text, e.kind === 'weapon' ? '#ffcf4d' : e.kind === 'med' ? '#5be37a' : e.kind === 'armor' ? '#58a6ff' : '#ffffff'); audio.play('pickup', { vol: 0.9, rate: e.kind === 'weapon' ? 0.8 : 1 }); }
        else audio.play('pickup', { x: e.x, z: e.z, maxD: 16, vol: 0.5 });
        break;
      }
      case 'heal': {
        if (e.by !== p.id) break;
        if (e.phase === 'start') { hud.message('HEALING... STAND STILL', '#5be37a', 1.4); audio.play('heal', { vol: 0.8 }); }
        else if (e.phase === 'end') { hud.message(`HEALED - NOW ${e.hp} HP`, '#5be37a', 1.4); audio.play('healend', { vol: 0.9 }); }
        else if (e.phase === 'cancel') hud.message('HEAL INTERRUPTED', '#ff4d4d', 1.2);
        break;
      }
      case 'shell': G.cview.shell(e.x, e.z, e.eta ?? 1); audio.play('whistle', { x: e.x, z: e.z, maxD: 120, vol: 0.9 }); break;
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
        const f = sim.fighters[e.by], mine = e.by === p.id;
        const snd = (name, vol = 1, rate = 1) => audio.play(name, mine ? { vol, rate } : { x: f.x, z: f.z, maxD: 35, vol: 0.8 * vol, rate });
        if (e.phase === 'start') {
          // reload in stages: release the magazine -> (it drops) -> new magazine goes in -> (empty gun only) charge the weapon
          const st = RELOAD_STAGES[e.empty ? 'empty' : 'tactical'], T = e.time * 1000, now = performance.now();
          snd('reload1');
          G.later.push({ at: now + T * st.drop, fn: () => dropMag(f, mine, e.empty) });
          G.later.push({ at: now + T * st.insert, fn: () => snd('magin', 1, 0.95 + Math.random() * 0.1) });
          if (e.empty) G.later.push({ at: now + T * st.charge, fn: () => snd('charge') });
        } else if (!e.empty) snd('reload2', 0.6);
        break;
      }
      case 'dry': if (e.by === p.id) audio.play('dry'); break;
      case 'switch': if (e.by === p.id) audio.play('switch'); break;
      case 'throw': { const f = sim.fighters[e.by]; audio.play('throw', e.by === p.id ? {} : { x: f.x, z: f.z, maxD: 45 }); break; }
      case 'end': {
        if (e.to !== undefined && e.to !== p.id) break;        // somebody else's result
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
  if (p.veh && p.seat === 0) {                         // driving: the camera swings back behind the vehicle unless you are looking around with the mouse
    if (Math.abs(look.yaw) + Math.abs(look.pitch) > 0.0004) G.freeLookT = 1.1; else G.freeLookT = Math.max(0, G.freeLookT - dt);
    if (G.freeLookT <= 0) { const dy = Math.atan2(Math.sin(p.veh.yaw - cmd.yaw), Math.cos(p.veh.yaw - cmd.yaw)); cmd.yaw += dy * (1 - Math.exp(-3.2 * dt)); cmd.pitch *= Math.exp(-3 * dt); }
  }
  Object.assign(cmd, input.readMove());
  cmd.fire = input.fire; cmd.ads = input.ads;
  if (input.wasPressed('KeyR')) cmd.reload = true;
  if (input.wasPressed('KeyG')) cmd.grenade = true;
  if (input.wasPressed('KeyE')) cmd.use = true;
  if (input.wasPressed('KeyH') && sim.loot?.items.length) {
    if (p.healT > 0) { /* already healing */ } else if (p.meds <= 0) hud.message('NO MEDKITS - LOOT SOME', '#ff4d4d', 1.2);
    else if (p.hp >= p.maxHp) hud.message('ALREADY AT FULL HEALTH', '#ffffff', 1);
    else if (p.veh) hud.message('GET OUT OF THE VEHICLE FIRST', '#ffffff', 1.2);
    else cmd.heal = true;
  }
  if (input.wasPressed('KeyT')) { if (p.mortar > 0) cmd.mortar = true; else hud.message(p.streak % 3 ? `MORTAR NEEDS 3 KILLS IN A ROW (${p.streak % 3}/3)` : 'NO MORTAR STRIKE - 3 KILLS IN A ROW OR A CONTRACT', '#ffffff', 1.4); }
  if (input.wasPressed('KeyF') && G.atmo.light) hud.message(G.atmo.toggleFlashlight() ? 'FLASHLIGHT ON' : 'FLASHLIGHT OFF', '#ffffff', 0.8);
  const slot = input.readSlot();
  if (slot) { if (p.weapons[SLOT_ORDER[slot - 1]]?.have === false) hud.message('YOU HAVEN\'T FOUND THAT GUN YET', '#ffffff', 1); else cmd.slot = slot; }
  const wheel = input.takeWheel();
  if (wheel) {                                                                  // scroll only through the guns you actually carry
    const L = SLOT_ORDER.length; let i = SLOT_ORDER.indexOf(p.cur);
    for (let n = 0; n < L; n++) { i = (i + (wheel > 0 ? 1 : -1) + L) % L; if (p.weapons[SLOT_ORDER[i]].have !== false) break; }
    cmd.slot = i + 1;
  }
  input.endFrame();
  // recoil recovery: the view settles back down a bit when you stop shooting
  if (!input.fire && p.fireT <= 0 && G.recoil > 0) { const r = Math.min(G.recoil, G.recoil * 4 * dt + 0.0006); cmd.pitch -= r * 0.6; G.recoil -= r; }
}

function updateCamera(dt, alpha) {
  const { sim } = G, p = sim.player, w = WEAPONS[p.cur];
  const shake = camfx.update(dt);
  if (p.alive) {
    const x = lerp(G.prev.x, G.cur.x, alpha), y = lerp(G.prev.y, G.cur.y, alpha), z = lerp(G.prev.z, G.cur.z, alpha);
    const driving = !!p.veh && p.seat === 0;
    if (driving) {                                                  // chase camera behind the vehicle; mouse up/down lifts it
      const d = p.veh.kind === 'bike' ? 4.4 : 6.2, pe = clamp(cmd.pitch - 0.22, -1.3, 1.2), cp = Math.cos(pe);
      camera.position.set(x + Math.sin(cmd.yaw) * cp * d, Math.max(0.5, y + 1.25 - Math.sin(pe) * d), z + Math.cos(cmd.yaw) * cp * d);
      G.roll = lerp(G.roll, 0, 1 - Math.exp(-8 * dt));
      camera.rotation.set(pe + shake.pitch, cmd.yaw + shake.yaw, G.roll + shake.roll);
    } else {
      camera.position.set(x, y + 0.72, z);
      G.roll = lerp(G.roll, -cmd.strafe * 0.014 * (p.sprinting ? 1.6 : 1), 1 - Math.exp(-10 * dt));
      camera.rotation.set(cmd.pitch + shake.pitch, cmd.yaw + shake.yaw, G.roll + shake.roll);
    }
    const targetFov = driving ? BASE_FOV + Math.min(14, Math.abs(p.veh.speed) * 0.5) : lerp(BASE_FOV + (p.sprinting ? 6 : 0), w.adsFov, G.adsK);
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

  if (!paused || G.net) {                       // online, the world keeps running when you open the pause menu (you just stand still)
    if (!paused) handleInput(dt); else { input.dx = 0; input.dy = 0; input.endFrame(); }
    G.acc += dt;
    const keys = paused ? { ...cmd, forward: 0, strafe: 0, fire: false, ads: false, jump: false, sprint: false, reload: false, grenade: false, mortar: false, use: false, heal: false, slot: 0 } : cmd;
    while (G.acc >= STEP) {
      G.prev = G.cur; G.cur = { x: p.x, y: p.y, z: p.z };
      sim.step(STEP, keys);
      cmd.reload = false; cmd.grenade = false; cmd.mortar = false; cmd.use = false; cmd.heal = false; cmd.slot = 0;     // one-shot keys are used up after ONE tick (the sim no longer edits our cmd)
      G.cur = { x: p.x, y: p.y, z: p.z };
      G.acc -= STEP;
    }
    if (G.net) G.net.update(dt);
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
    viewmodel.root.visible = !(p.veh && p.seat === 0);          // no gun in your hands while driving
    viewmodel.update(dt, {
      weapon: p.cur, adsTime: w.adsTime, ads: p.ads, sprint: p.sprinting && p.speedH > 3, grounded: p.grounded, speed: p.speedH,
      lookYaw: G.lookYaw || 0, lookPitch: G.lookPitch || 0,
      reloadK: p.reloadT > 0 ? 1 - p.reloadT / (p.reloadTot || w.reload) : -1, reloadEmpty: p.reloadEmpty, switchK: p.switchT > 0 ? p.switchT / 0.32 : 0,
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
    G.atmo.update(dt, camera.position); G.cview.update(dt, camera.position.x, camera.position.z, p.id);
    G.vview.update(dt, p.id, G.particles);
    G.lview?.update(dt, camera.position);
    {                                                   // engine hum: pitch follows speed, only while somebody is in the nearest vehicle
      let nearest = null, nd = 40;
      for (const v of sim.vehicles.list) if (!v.dead && v.driver >= 0) { const d = Math.hypot(v.x - camera.position.x, v.z - camera.position.z); if (d < nd) { nd = d; nearest = v; } }
      G.engT -= dt;
      if (nearest && G.engT <= 0) { G.engT = nearest.kind === 'bike' ? 0.16 : 0.2; audio.play('engine', { x: nearest.x, z: nearest.z, maxD: 45, vol: 0.5 + Math.min(0.5, Math.abs(nearest.speed) / 30), rate: 0.7 + Math.abs(nearest.speed) / 25 }); }
    }
    G.particles.update(dt); G.tracers.update(dt); G.mags.update(dt);
    for (let i = G.later.length - 1; i >= 0; i--) if (now >= G.later[i].at) { const j = G.later.splice(i, 1)[0]; j.fn(); }
  }
  tickSkins(now / 1000, dt);
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

/* ---- online: lobby -> match ---- */
let joining = null;
async function beginOnline() {
  audio.unlock();
  if (!ONLINE_URL) { $('onlinemsg').textContent = 'No game server set (use ?online=ws://host:2567)'; return; }
  const name = ($('namebox').value || 'Operator').trim().slice(0, 16); try { localStorage.setItem('nh_name', name); } catch { /* private mode */ }
  $('onlinemsg').textContent = ''; showOv('start', false); showOv('end', false); showOv('lobby', true); $('lobbytxt').textContent = 'connecting...';
  const ticket = joining = {};                         // so CANCEL can abandon this attempt
  try {
    const { NetSim } = await import('./net/netsim.js');          // the multiplayer code is only downloaded when you go online
    const net = await NetSim.join(ONLINE_URL, { name, operator: params.get('op') ?? 'roms', skin: SKIN, lag: FAKE_LAG,
      onLobby: (m) => { $('lobbytxt').textContent = `${m.n} player${m.n === 1 ? '' : 's'} in the lobby · starting in ${m.left} s`; } });
    if (joining !== ticket) { net.dispose(); return; }
    started = true; await newMatch(net);
    net.onClose = () => { if (G?.net === net && !G.over) { G.over = true; hud.message('DISCONNECTED FROM SERVER', '#ff4d4d', 4); setTimeout(() => { if (document.pointerLockElement) document.exitPointerLock(); showOv('start', true); }, 2500); } };
    showOv('lobby', false); showOv('pause', false); paused = false;
    if (!AUTOSTART) input.lock();
  } catch (err) {
    if (joining !== ticket) return;
    showOv('lobby', false); showOv('start', true);
    $('onlinemsg').textContent = `Could not join a match: ${err?.message ?? err}`;
  }
}
$('onlinebtn').addEventListener('click', beginOnline);
$('lobbycancel').addEventListener('click', () => { joining = null; showOv('lobby', false); showOv('start', true); });
try { $('namebox').value = localStorage.getItem('nh_name') ?? ''; } catch { /* ignore */ }
/* weapon skin chips on the start screen */
{
  const box = $('skins');
  const chips = [[null, 'STOCK', '#20242b'], ...SKINS.map((id) => [id, SKIN_INFO[id].label, SKIN_INFO[id].css])];
  for (const [id, label, css] of chips) {
    const b = document.createElement('button'); b.className = 'skin'; b.textContent = label; b.style.background = css; b.dataset.skin = id ?? '';
    b.onclick = () => { SKIN = id; try { if (id) localStorage.setItem('nh_skin', id); else localStorage.removeItem('nh_skin'); } catch { /* ignore */ } mark(); };
    box.appendChild(b);
  }
  const mark = () => box.querySelectorAll('.skin').forEach((b) => b.classList.toggle('on', (b.dataset.skin || null) === SKIN));
  mark();
}
{ const gt = $('goretoggle'); gt.checked = settings.gore; gt.addEventListener('change', () => settings.setGore(gt.checked)); }
$('resumebtn').addEventListener('click', () => { audio.unlock(); input.lock(); paused = false; showOv('pause', false); });
$('againbtn').addEventListener('click', async () => {
  audio.unlock(); showOv('end', false);
  if (G?.net) { const url = ONLINE_URL; G.net.dispose(); G.net = null; if (url) { await beginOnline(); return; } }
  await newMatch(); paused = false; if (!AUTOSTART) input.lock();
});

(async function boot() {
  await initPhysics();
  requestAnimationFrame(frame);
  if (AUTOSTART) { input.lockFailed = true; await (params.has('online') ? beginOnline() : beginPlay()); }
})();
