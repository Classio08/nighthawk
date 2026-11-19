// Visual-only presentation for the offline DUST LANTERN mission.
import * as THREE from 'three';

const mat = (color, emissive = 0x000000) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, emissive, emissiveIntensity: 0.35 });
const put = (group, geometry, material, x, y, z) => {
  const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); group.add(mesh); return mesh;
};

export class MissionView {
  constructor(scene, sim) {
    this.scene = scene; this.mission = sim.mission;
    if (!this.mission) return;
    this.root = new THREE.Group(); scene.add(this.root);
    this.clues = this.mission.clues.map((clue, i) => {
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
      const clue = m.clues[i], near = Math.hypot(clue.x - player.x, clue.z - player.z) < 22;
      g.visible = m.stage === 'recon' && !clue.found && near;
      g.children[0].position.y = 0.8 + Math.sin(this.time * 2.4 + i) * 0.12;
    });
    this.hostage.visible = m.captive.visible;
    this.hostage.position.set(m.captive.x, 0, m.captive.z);
    this.hostage.rotation.y = Math.atan2(player.x - m.captive.x, player.z - m.captive.z);
    this.extract.visible = m.stage === 'extract';
    if (this.extract.visible) this.extract.children[0].rotation.z = this.time * 0.18;
  }
}
