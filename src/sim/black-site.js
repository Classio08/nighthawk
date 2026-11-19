// BLACK SITE: hidden-role tactical round layered on the shared Simulation.
// Public snapshots intentionally never contain the role map or per-player secret roles.
import { makeRng } from './rng.js';
import { findFreeSpot } from './map.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class BlackSiteRound {
  constructor(sim, requestedPlayerRole = 'operative') {
    this.sim = sim;
    this.id = 'black-site';
    this.name = 'BLACK SITE';
    this.rng = makeRng(((sim.seed | 0) ^ 0xB1AC51E7) >>> 0 || 29);
    this.roles = new Map();
    this.playerRole = requestedPlayerRole === 'infiltrator' || requestedPlayerRole === 'random' ? requestedPlayerRole : 'operative';
    this.stage = 'tasks';
    this.elapsed = 0;
    this.finished = false;
    this.activeTaskId = null;
    this.activeWorkerId = null;
    this.sabotageCount = 0;
    this.sabotageCooldown = 0;
    this.blackoutT = 0;
    this.extractT = 0;
    this.reportedBodies = new Set();
    this.suspicion = new Map();
    this.votes = new Map();
    this.meetingT = 0;
    this.meetingReporter = null;
    this.lastEjected = null;

    const landmarks = sim.map.landmarks ?? [];
    const anchors = [
      { id: 'relay', label: 'RESTORE THE RELAY', x: landmarks.find((p) => p.id === 'relay-ridge')?.x ?? 58, z: landmarks.find((p) => p.id === 'relay-ridge')?.z ?? -54 },
      { id: 'archive', label: 'RECOVER THE BLACK FILE', x: landmarks.find((p) => p.id === 'basin-yard')?.x ?? -31, z: landmarks.find((p) => p.id === 'basin-yard')?.z ?? -42 },
      { id: 'power', label: 'RESTORE AUXILIARY POWER', x: landmarks.find((p) => p.id === 'forward-outpost')?.x ?? -82, z: landmarks.find((p) => p.id === 'forward-outpost')?.z ?? 63 },
    ];
    this.tasks = anchors.map((a) => ({
      id: a.id, label: a.label, ...findFreeSpot(sim.map, this.rng, a.x, a.z, 4.5, 1.8),
      progress: 0, completed: false, sabotaged: false,
    }));
    const exit = landmarks.find((p) => p.id === 'extraction-pad') ?? { x: 56, z: 56 };
    this.extraction = { x: exit.x, z: exit.z, name: 'EXTRACTION PAD' };

    this._assignRoles();
  }

  _assignRoles() {
    const fighters = this.sim.fighters.slice();
    if (fighters.length < 2) {
      if (fighters[0]) this.roles.set(fighters[0].id, 'operative');
      return;
    }
    const player = this.sim.player;
    const candidates = fighters.filter((f) => f !== player);
    const saboteurCount = Math.max(1, Math.min(2, Math.floor(fighters.length / 8)));
    if (this.playerRole === 'operative' && player) this.roles.set(player.id, 'operative');
    else if (this.playerRole === 'infiltrator' && player) this.roles.set(player.id, 'infiltrator');

    const shuffled = candidates.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const alreadySaboteur = player && this.roles.get(player.id) === 'infiltrator' ? 1 : 0;
    const count = Math.max(0, saboteurCount - alreadySaboteur);
    for (let i = 0; i < count && i < shuffled.length; i++) this.roles.set(shuffled[i].id, 'infiltrator');
    for (const fighter of fighters) if (!this.roles.has(fighter.id)) this.roles.set(fighter.id, 'operative');
  }

  roleFor(playerId) { return this.roles.get(playerId) ?? 'operative'; }
  teamFor(playerId) { return this.roleFor(playerId) === 'infiltrator' ? 'infiltrators' : 'operatives'; }
  isHostile(aId, bId) { return this.teamFor(aId) !== this.teamFor(bId); }
  get objectiveCount() { return this.tasks.filter((t) => t.completed).length; }
  get objective() {
    if (this.stage === 'tasks') return `COMPLETE CLASSIFIED TASKS ${this.objectiveCount}/3`;
    if (this.stage === 'meeting') return 'EMERGENCY MEETING';
    if (this.stage === 'extract') return 'EXTRACT THE BLACK FILE';
    if (this.stage === 'complete') return 'BLACK SITE SECURED';
    return 'BLACK SITE LOST';
  }

  privateSnapshot(playerId) {
    return {
      role: this.roleFor(playerId),
      team: this.teamFor(playerId),
      canSabotage: this.roleFor(playerId) === 'infiltrator',
      public: this.publicSnapshot(),
    };
  }

  publicSnapshot() {
    return {
      id: this.id, name: this.name, stage: this.stage, objective: this.objective,
      tasks: this.tasks.map(({ id, label, x, z, progress, completed, sabotaged }) => ({
        id, label, x, z, progress: +progress.toFixed(3), completed, sabotaged,
      })),
      objectiveCount: this.objectiveCount, sabotageCount: this.sabotageCount,
      blackoutT: +this.blackoutT.toFixed(2), extractT: +this.extractT.toFixed(2),
      extraction: { ...this.extraction }, meetingT: +this.meetingT.toFixed(2),
      lastEjected: this.lastEjected,
    };
  }

  interact(operator) {
    if (!operator?.alive || this.finished || this.stage === 'meeting') return false;
    const role = this.roleFor(operator.id);
    if (role === 'operative') {
      const corpse = this.sim.fighters.find((f) =>
        !f.alive && !this.reportedBodies.has(f.id) && distance(operator, f) < 3.6);
      if (corpse && this.stage === 'tasks') {
        this._callMeeting(operator, corpse);
        return true;
      }
      if (this.stage === 'extract') return false;
      let best = null, bestD = 4.2;
      for (const task of this.tasks) {
        if (task.completed) continue;
        const d = distance(operator, task);
        if (d < bestD) { best = task; bestD = d; }
      }
      if (!best) return false;
      this.activeTaskId = best.id; this.activeWorkerId = operator.id;
      this.sim.emit({ t: 'black-site', phase: 'task-started', task: best.id, by: operator.id });
      return true;
    }

    // A saboteur can quietly corrupt a nearby task; the interruption is visible, the actor is not.
    let target = null, targetD = 5.8;
    for (const task of this.tasks) {
      const d = distance(operator, task);
      if (d < targetD) { target = task; targetD = d; }
    }
    if (!target || this.sabotageCooldown > 0 || this.stage !== 'tasks') return false;
    target.progress = Math.max(0, target.progress - 0.48);
    target.sabotaged = true;
    this.sabotageCount++;
    this.sabotageCooldown = 12;
    this.blackoutT = Math.max(this.blackoutT, 8);
    this.suspicion.set(operator.id, (this.suspicion.get(operator.id) ?? 0) + 1);
    this.sim.emit({ t: 'black-site', phase: 'sabotage', task: target.id, count: this.sabotageCount });
    if (this.sabotageCount >= 3) this._finish('infiltrators');
    return true;
  }

  _callMeeting(reporter, corpse) {
    this.reportedBodies.add(corpse.id);
    this.stage = 'meeting'; this.meetingT = 18; this.meetingReporter = reporter.id;
    this.votes.clear();
    this.sim.emit({
      t: 'black-site', phase: 'meeting', reporter: reporter.id, body: corpse.id,
      candidates: this.sim.fighters.filter((f) => f.alive).map((f) => ({ id: f.id, name: f.name })),
    });
  }

  vote(voterId, targetId = null) {
    if (this.stage !== 'meeting' || !this.sim.fighters[voterId]?.alive) return false;
    if (targetId !== null && (!this.sim.fighters[targetId]?.alive || targetId === voterId)) return false;
    this.votes.set(voterId, targetId);
    this.sim.emit({ t: 'black-site', phase: 'vote-cast', by: voterId });
    if (this.votes.size >= this.sim.fighters.filter((f) => f.alive).length) this._resolveMeeting();
    return true;
  }

  _resolveMeeting() {
    if (this.stage !== 'meeting') return;
    const counts = new Map();
    for (const [voter, target] of this.votes) {
      if (target === null || target === undefined) continue;
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const tied = ranked.length > 1 && ranked[0][1] === ranked[1][1];
    const alive = this.sim.fighters.filter((f) => f.alive).length;
    const picked = ranked[0] && !tied && ranked[0][1] > alive / 2 ? this.sim.fighters[ranked[0][0]] : null;
    if (picked) {
      const wasSaboteur = this.roleFor(picked.id) === 'infiltrator';
      this.sim.damage(picked, picked.hp + 10, null, { cause: 'exile', x: picked.x, y: picked.y, z: picked.z });
      this.lastEjected = { id: picked.id, name: picked.name, wasSaboteur };
      this.sim.emit({ t: 'black-site', phase: 'ejected', target: picked.id, wasSaboteur });
    } else {
      this.sim.emit({ t: 'black-site', phase: 'no-majority' });
    }
    this.stage = 'tasks'; this.meetingT = 0; this.meetingReporter = null; this.votes.clear();
    this._checkTeams();
  }

  _checkTeams() {
    const alive = this.sim.fighters.filter((f) => f.alive);
    const operatives = alive.filter((f) => this.teamFor(f.id) === 'operatives').length;
    const infiltrators = alive.length - operatives;
    if (infiltrators <= 0) this._finish('operatives');
    else if (operatives <= 0) this._finish('infiltrators');
  }

  _finish(winnerTeam) {
    if (this.finished) return;
    this.finished = true; this.stage = 'complete';
    const player = this.sim.player;
    const won = this.teamFor(player?.id ?? -1) === winnerTeam;
    this.sim.state = won ? 'won' : 'lost';
    this.sim.result = {
      to: player?.id ?? 0, won, placement: won ? 1 : 0,
      kills: player?.kills ?? 0, time: this.elapsed, mission: true,
      missionId: this.id, missionName: this.name, objectives: this.objectiveCount,
      outcome: winnerTeam,
    };
    this.sim.emit({ t: 'end', ...this.sim.result, mission: true });
  }

  update(dt) {
    if (this.finished) return;
    this.elapsed += dt;
    this.sabotageCooldown = Math.max(0, this.sabotageCooldown - dt);
    this.blackoutT = Math.max(0, this.blackoutT - dt);
    this._checkTeams();
    if (this.finished) return;

    if (this.stage === 'meeting') {
      this.meetingT -= dt;
      if (this.meetingT <= 0) this._resolveMeeting();
      return;
    }

    if (this.stage === 'tasks' && this.activeTaskId !== null) {
      const task = this.tasks.find((t) => t.id === this.activeTaskId);
      const worker = this.sim.fighters[this.activeWorkerId];
      if (!task || task.completed || !worker?.alive || this.roleFor(worker.id) !== 'operative') {
        this.activeTaskId = null; this.activeWorkerId = null;
      } else if (distance(worker, task) <= 9) {
        task.progress = Math.min(1, task.progress + dt / 12);
        if (task.progress >= 1) {
          task.completed = true; task.sabotaged = false; this.activeTaskId = null; this.activeWorkerId = null;
          this.sim.emit({ t: 'black-site', phase: 'task-complete', task: task.id, count: this.objectiveCount });
          if (this.objectiveCount === this.tasks.length) {
            this.stage = 'extract';
            this.sim.emit({ t: 'black-site', phase: 'extract-unlocked' });
          }
        }
      } else task.progress = Math.max(0, task.progress - dt * 0.015);
    }

    if (this.stage === 'extract') {
      const player = this.sim.player;
      if (this.teamFor(player.id) === 'operatives' && distance(player, this.extraction) <= 9) {
        this.extractT += dt;
        if (this.extractT >= 4) this._finish('operatives');
      } else this.extractT = Math.max(0, this.extractT - dt * 0.65);
    }
  }
}
