// Visual-only presentation for the offline operations (createMissionView picks the right one for sim.mission.id). Never reads or writes simulation state.
import * as THREE from 'three';
import { TASK } from '../sim/missions.js';
import { UPLINK } from '../sim/relay-uplink.js';

const mat = (color, emissive = 0x000000) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, emissive, emissiveIntensity: 0.35 });
const put = (group, geometry, material, x, y, z) => {
  const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); group.add(mesh); return mesh;
};

export class DustLanternView {
  constructor(scene, sim) {
    this.scene = scene; this.mission = sim.mission;
    if (!this.mission) return;
    this.root = new THREE.Group(); scene.add(this.root);
    this.clues = (this.mission.clues ?? []).map((clue, i) => {
      const g = new THREE.Group(); g.position.set(clue.x, 0, clue.z); this.root.add(g);
      const color = 0xffc857;
      put(g, new THREE.CylinderGeometry(0.035, 0.035, 1.15, 6), mat(color, color), 0, 0.8, 0);
      const ring = put(g, new THREE.RingGeometry(0.65, 0.82, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }), 0, 0.035, 0);
      ring.rotation.x = -Math.PI / 2;
      const token = put(g, i === 0 ? new THREE.BoxGeometry(0.5, 0.16, 0.32) : i === 1 ? new THREE.BoxGeometry(0.75, 0.04, 0.18) : new THREE.BoxGeometry(0.22, 0.035, 0.32), mat(i === 0 ? 0x414a52 : i === 1 ? 0x8c7350 : 0x4d8ab7), 0, 0.16, 0);
      token.rotation.y = i * 0.7;
      return g;
    });
    this.hostage = new THREE.Group(); this.root.add(this.hostage);
    const shirt = mat(0xd68a38), trousers = mat(0x353b3e), skin = mat(0x895d42), dark = mat(0x22272b);
    put(this.hostage, new THREE.CapsuleGeometry(0.23, 0.42, 3, 6), shirt, 0, 1.05, 0);
    put(this.hostage, new THREE.SphereGeometry(0.16, 8, 6), skin, 0, 1.48, 0.02);
    put(this.hostage, new THREE.BoxGeometry(0.32, 0.08, 0.24), dark, 0, 1.64, 0);
    for (const x of [-0.12, 0.12]) {
      put(this.hostage, new THREE.CapsuleGeometry(0.07, 0.38, 2, 5), trousers, x, 0.42, 0);
      put(this.hostage, new THREE.CapsuleGeometry(0.055, 0.3, 2, 5), shirt, x * 2.4, 1.04, 0);
    }
    const labelCanvas = document.createElement('canvas'); labelCanvas.width = 256; labelCanvas.height = 64;
    const ctx = labelCanvas.getContext('2d'); ctx.font = 'bold 22px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#111'; ctx.lineWidth = 5; ctx.strokeText('TECHNICIAN', 128, 38); ctx.fillText('TECHNICIAN', 128, 38);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(labelCanvas), transparent: true, depthWrite: false }));
    label.scale.set(2.3, 0.58, 1); label.position.y = 2.15; this.hostage.add(label);

    this.target = null;
    if (this.mission.target) {
      this.target = new THREE.Group(); this.root.add(this.target);
      const terminalColor = 0x53d9ff;
      put(this.target, new THREE.BoxGeometry(0.72, 1.5, 0.52), mat(0x303a43), 0, 0.78, 0);
      put(this.target, new THREE.BoxGeometry(0.48, 0.52, 0.06), mat(0x194c59, terminalColor), 0, 1.03, -0.29);
      const targetRing = put(this.target, new THREE.RingGeometry(1.1, 1.3, 32), new THREE.MeshBasicMaterial({ color: terminalColor, transparent: true, opacity: 0.75, side: THREE.DoubleSide }), 0, 0.04, 0);
      targetRing.rotation.x = -Math.PI / 2;
      this.target.position.set(this.mission.target.x, 0, this.mission.target.z);
    }

    this.extract = new THREE.Group(); this.root.add(this.extract);
    const pad = put(this.extract, new THREE.RingGeometry(7.2, 7.6, 48), new THREE.MeshBasicMaterial({ color: 0x58d8ff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }), 0, 0.08, 0);
    pad.rotation.x = -Math.PI / 2;
    const centre = put(this.extract, new THREE.CircleGeometry(6.9, 48), new THREE.MeshBasicMaterial({ color: 0x58d8ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide }), 0, 0.025, 0);
    centre.rotation.x = -Math.PI / 2;
    this.extract.position.set(this.mission.extraction.x, 0, this.mission.extraction.z);
    this.extract.visible = false;
    this.hostage.visible = false;
    this.time = 0;
  }

  update(dt, player) {
    if (!this.mission || !this.root) return;
    this.time += dt;
    const m = this.mission;
    this.clues.forEach((g, i) => {
      const clue = m.clues[i], near = Math.hypot(clue.x - player.x, clue.z - player.z) < (m.discoveryRange ?? 22);
      g.visible = m.stage === 'recon' && !clue.found && near;
      g.children[0].position.y = 0.8 + Math.sin(this.time * 2.4 + i) * 0.12;
    });
    this.hostage.visible = !!m.captive?.visible;
    if (m.captive) {
      this.hostage.position.set(m.captive.x, 0, m.captive.z);
      this.hostage.rotation.y = Math.atan2(player.x - m.captive.x, player.z - m.captive.z);
    }
    if (this.target) {
      this.target.visible = m.stage === 'approach' || m.stage === 'hack' || m.stage === 'hold';
      this.target.position.y = Math.sin(this.time * 2.2) * 0.06;
      this.target.rotation.y = Math.sin(this.time * 0.4) * 0.08;
    }
    this.extract.visible = m.stage === 'extract';
    if (this.extract.visible) this.extract.children[0].rotation.z = this.time * 0.18;
  }
}

// SIGNAL BLACKOUT: three relay masts, each with a ground ring (the task range), a fill disc that grows while you splice, a pulsing beacon and a tall
// light beam so the node can be found from across the map. Yellow = to do, white = being jammed, green = dark.
export class SignalBlackoutView {
  constructor(scene, sim) {
    this.scene = scene; this.mission = sim.mission;
    this.root = new THREE.Group(); scene.add(this.root);
    const concrete = mat(0x59616a), steel = mat(0x8d98a3);
    this.nodes = this.mission.nodes.map((node) => {
      const g = new THREE.Group(); g.position.set(node.x, 0, node.z); this.root.add(g);
      put(g, new THREE.BoxGeometry(1.5, 0.35, 1.5), concrete, 0, 0.175, 0);
      put(g, new THREE.CylinderGeometry(0.07, 0.1, 3.4, 6), steel, 0, 2.05, 0);
      const dish = put(g, new THREE.ConeGeometry(0.55, 0.3, 12, 1, true), steel, 0.25, 3.0, 0); dish.rotation.z = -1.1; dish.material.side = THREE.DoubleSide;
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffc857 });
      const beacon = put(g, new THREE.SphereGeometry(0.18, 10, 8), beaconMat, 0, 3.9, 0);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc857, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
      const ring = put(g, new THREE.RingGeometry(TASK.RANGE - 0.18, TASK.RANGE, 40), ringMat, 0, 0.05, 0); ring.rotation.x = -Math.PI / 2;
      const fillMat = new THREE.MeshBasicMaterial({ color: 0x58d8ff, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
      const fill = put(g, new THREE.CircleGeometry(TASK.RANGE - 0.3, 32), fillMat, 0, 0.04, 0); fill.rotation.x = -Math.PI / 2; fill.visible = false;
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xffc857, transparent: true, opacity: 0.3, depthWrite: false });
      const beam = put(g, new THREE.CylinderGeometry(0.14, 0.14, 70, 6, 1, true), beamMat, 0, 35, 0);
      return { g, beaconMat, ringMat, fillMat, beamMat, fill, beam, ring, beacon };
    });
    this.extract = new THREE.Group(); this.root.add(this.extract);
    const pad = put(this.extract, new THREE.RingGeometry(7.2, 7.6, 48), new THREE.MeshBasicMaterial({ color: 0x58d8ff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }), 0, 0.08, 0); pad.rotation.x = -Math.PI / 2;
    const centre = put(this.extract, new THREE.CircleGeometry(6.9, 48), new THREE.MeshBasicMaterial({ color: 0x58d8ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide }), 0, 0.025, 0); centre.rotation.x = -Math.PI / 2;
    this.extract.position.set(this.mission.extraction.x, 0, this.mission.extraction.z); this.extract.visible = false;
    this.time = 0;
    this.col = { todo: new THREE.Color(0xffc857), busy: new THREE.Color(0xffffff), done: new THREE.Color(0x5be37a) };
  }

  update(dt, player) {
    this.time += dt;
    const m = this.mission;
    this.nodes.forEach((v, i) => {
      const node = m.nodes[i], busy = m.active === node;
      const c = node.done ? this.col.done : busy ? this.col.busy : this.col.todo;
      v.beaconMat.color.copy(c); v.ringMat.color.copy(c); v.beamMat.color.copy(c);
      const near = player ? Math.hypot(player.x - node.x, player.z - node.z) : 99;
      v.beamMat.opacity = (node.done ? 0.12 : busy ? 0.5 : 0.3) * Math.min(1, Math.max(0, (near - 4) / 10));      // the beam is a far-away signpost: it fades out as you walk up to the mast so it never fills the screen
      v.beacon.scale.setScalar(1 + 0.25 * Math.sin(this.time * (busy ? 9 : 3) + i));
      v.ring.rotation.z = this.time * 0.3;
      v.fill.visible = busy;
      if (busy) v.fill.scale.setScalar(Math.max(0.02, node.progress / TASK.T));
    });
    this.extract.visible = m.stage === 'extract';
    if (this.extract.visible) this.extract.children[0].rotation.z = this.time * 0.18;
  }
}

// RELAY UPLINK: the tower on Relay Ridge (mast, dish, beacon, a far-away signpost beam), the hold circle on the ground (white = in, red = stalled) with a cyan
// fill that grows with the uplink, and the extraction pad that appears once the uplink is sent. Reads the mission, never writes it.
export class RelayUplinkView {
  constructor(scene, sim) {
    this.scene = scene; this.mission = sim.mission;
    this.root = new THREE.Group(); scene.add(this.root);
    const concrete = mat(0x59616a), steel = mat(0x8d98a3), dark = mat(0x2a3037);
    const t = this.mission.tower;
    this.tower = new THREE.Group(); this.tower.position.set(t.x, 0, t.z); this.root.add(this.tower);
    put(this.tower, new THREE.BoxGeometry(3.2, 0.6, 3.2), concrete, 0, 0.3, 0);
    put(this.tower, new THREE.BoxGeometry(1.6, 1.6, 1.6), dark, 0, 1.4, 0);                          // the equipment hut at the foot of the mast
    put(this.tower, new THREE.CylinderGeometry(0.12, 0.22, 9, 6), steel, 0, 5.1, 0);
    const dish = put(this.tower, new THREE.ConeGeometry(1.0, 0.5, 14, 1, true), steel, 0.55, 8.0, 0); dish.rotation.z = -1.0; dish.material.side = THREE.DoubleSide;
    for (const y of [3.4, 5.6]) put(this.tower, new THREE.BoxGeometry(1.1, 0.08, 0.08), steel, 0, y, 0);
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xffc857 });
    this.beacon = put(this.tower, new THREE.SphereGeometry(0.28, 10, 8), this.beaconMat, 0, 9.8, 0);
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xffc857, transparent: true, opacity: 0.3, depthWrite: false });
    this.beam = put(this.tower, new THREE.CylinderGeometry(0.18, 0.18, 90, 6, 1, true), this.beamMat, 0, 45, 0);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffc857, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    this.ring = put(this.tower, new THREE.RingGeometry(UPLINK.CIRCLE - 0.25, UPLINK.CIRCLE, 64), this.ringMat, 0, 0.05, 0); this.ring.rotation.x = -Math.PI / 2;
    this.fillMat = new THREE.MeshBasicMaterial({ color: 0x58d8ff, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
    this.fill = put(this.tower, new THREE.CircleGeometry(UPLINK.CIRCLE - 0.4, 48), this.fillMat, 0, 0.04, 0); this.fill.rotation.x = -Math.PI / 2; this.fill.visible = false;
    this.hackMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    this.hackDisc = put(this.tower, new THREE.CircleGeometry(UPLINK.HACK_RANGE, 32), this.hackMat, 0, 0.06, 0); this.hackDisc.rotation.x = -Math.PI / 2; this.hackDisc.visible = false;
    this.extract = new THREE.Group(); this.root.add(this.extract);
    const pad = put(this.extract, new THREE.RingGeometry(UPLINK.EXTRACT_R - 1.3, UPLINK.EXTRACT_R - 0.9, 48), new THREE.MeshBasicMaterial({ color: 0x58d8ff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }), 0, 0.08, 0); pad.rotation.x = -Math.PI / 2;
    const centre = put(this.extract, new THREE.CircleGeometry(UPLINK.EXTRACT_R - 1.5, 48), new THREE.MeshBasicMaterial({ color: 0x58d8ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide }), 0, 0.025, 0); centre.rotation.x = -Math.PI / 2;
    this.extract.position.set(this.mission.extraction.x, 0, this.mission.extraction.z); this.extract.visible = false;
    this.time = 0;
    this.col = { todo: new THREE.Color(0xffc857), hold: new THREE.Color(0xffffff), broken: new THREE.Color(0xff4d4d), done: new THREE.Color(0x5be37a) };
  }

  update(dt, player) {
    this.time += dt;
    const m = this.mission;
    const c = m.stage === 'hold' ? (m.broken ? this.col.broken : this.col.hold) : m.stage === 'extract' || m.stage === 'complete' ? this.col.done : this.col.todo;
    this.beaconMat.color.copy(c); this.ringMat.color.copy(c); this.beamMat.color.copy(c);
    const near = player ? Math.hypot(player.x - m.tower.x, player.z - m.tower.z) : 99;
    this.beamMat.opacity = (m.stage === 'complete' ? 0.1 : 0.32) * Math.min(1, Math.max(0, (near - 6) / 12));            // a far-away signpost that fades out as you walk up to it
    this.beacon.scale.setScalar(1 + 0.25 * Math.sin(this.time * (m.stage === 'hold' ? 8 : 3)));
    this.ring.rotation.z = this.time * 0.3;
    this.ring.visible = m.stage === 'hold' || m.stage === 'hack' || m.stage === 'approach';
    this.fill.visible = m.stage === 'hold';
    if (this.fill.visible) this.fill.scale.setScalar(Math.max(0.02, m.uplink / UPLINK.HOLD_T));
    this.hackDisc.visible = m.stage === 'hack';
    if (this.hackDisc.visible) this.hackDisc.scale.setScalar(Math.max(0.05, m.hackP / UPLINK.HACK_T));
    this.extract.visible = m.stage === 'extract';
    if (this.extract.visible) this.extract.children[0].rotation.z = this.time * 0.18;
  }
}

/** the view for whichever operation the simulation is running */
export function createMissionView(scene, sim) {
  if (!sim.mission) return null;
  if (sim.mission.id === 'relay-uplink') return new RelayUplinkView(scene, sim);
  return sim.mission.id === 'signal-blackout' ? new SignalBlackoutView(scene, sim) : new DustLanternView(scene, sim);
}
export { DustLanternView as MissionView };           // (the old name)
