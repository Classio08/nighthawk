import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMap } from '../src/sim/map.js';
import { makeRng } from '../src/sim/rng.js';
import { BlackSiteRound } from '../src/sim/black-site.js';

function makeSim(seed = 90125) {
  const fighters = Array.from({ length: 16 }, (_, id) => ({
    id, name: id === 0 ? 'PLAYER' : `BOT-${id}`,
    x: id * 0.2, y: 0.9, z: 0, hp: 100, kills: 0,
    alive: true, npc: id !== 0, human: id === 0,
  }));
  const sim = {
    seed, map: buildMap(seed), rng: makeRng(seed), fighters,
    player: fighters[0], humans: [fighters[0]], events: [], state: 'playing', result: null,
    emit(event) { this.events.push(event); },
    damage(target, amount, source, info = {}) {
      target.hp -= amount;
      if (target.hp <= 0) { target.hp = 0; target.alive = false; this.events.push({ t: 'hit', target: target.id, cause: info.cause }); }
    },
  };
  return sim;
}

test('BLACK SITE assigns two hidden infiltrators while the default player role is operative', () => {
  const sim = makeSim();
  const round = new BlackSiteRound(sim, 'operative');
  const infiltrators = sim.fighters.filter((f) => round.roleFor(f.id) === 'infiltrator');
  assert.equal(round.roleFor(sim.player.id), 'operative');
  assert.equal(infiltrators.length, 2);
  assert.equal(round.isHostile(0, infiltrators[0].id), true);
  assert.equal(round.isHostile(0, 1), false);
});

test('public round state never includes secret role assignments', () => {
  const sim = makeSim();
  const round = new BlackSiteRound(sim, 'random');
  const publicData = JSON.stringify(round.publicSnapshot());
  assert.equal(publicData.includes('infiltrator'), false);
  assert.equal(publicData.includes('roles'), false);
  assert.ok(['operative', 'infiltrator'].includes(round.privateSnapshot(sim.player.id).role));
});

test('an operative can complete all three tasks and extract the Black File', () => {
  const sim = makeSim();
  const round = new BlackSiteRound(sim, 'operative');
  for (const task of round.tasks) {
    sim.player.x = task.x; sim.player.z = task.z;
    assert.equal(round.interact(sim.player), true);
    round.update(12.1);
    assert.equal(task.completed, true);
  }
  assert.equal(round.stage, 'extract');
  sim.player.x = round.extraction.x; sim.player.z = round.extraction.z;
  round.update(4.1);
  assert.equal(round.finished, true);
  assert.equal(sim.result.missionId, 'black-site');
  assert.equal(sim.result.outcome, 'operatives');
  assert.equal(sim.result.won, true);
});

test('an infiltrator can sabotage three task stations and win without revealing their identity publicly', () => {
  const sim = makeSim();
  const round = new BlackSiteRound(sim, 'infiltrator');
  assert.equal(round.roleFor(sim.player.id), 'infiltrator');
  for (const task of round.tasks) {
    sim.player.x = task.x; sim.player.z = task.z;
    assert.equal(round.interact(sim.player), true);
    round.update(12.1);
  }
  assert.equal(round.finished, true);
  assert.equal(sim.result.outcome, 'infiltrators');
  assert.equal(sim.result.won, true);
  assert.equal(JSON.stringify(round.publicSnapshot()).includes('infiltrator'), false);
});

test('a body report opens a meeting and votes can eject a suspect', () => {
  const sim = makeSim();
  const round = new BlackSiteRound(sim, 'operative');
  const suspect = sim.fighters[1];
  round.roles.set(suspect.id, 'infiltrator');
  const body = sim.fighters[15];
  body.alive = false;
  round.suspicion.set(suspect.id, 10);
  sim.player.x = body.x; sim.player.z = body.z;
  assert.equal(round.interact(sim.player), true);
  assert.equal(round.stage, 'meeting');
  assert.equal(sim.events.some((e) => e.phase === 'meeting'), true);
  assert.equal(round.vote(sim.player.id, suspect.id), true);
  assert.equal(suspect.alive, false);
  assert.equal(round.lastEjected.wasSaboteur, true);
});

test('a player cannot vote twice or vote for themselves', () => {
  const sim = makeSim();
  const round = new BlackSiteRound(sim, 'operative');
  const body = sim.fighters[15]; body.alive = false;
  sim.player.x = body.x; sim.player.z = body.z;
  round.interact(sim.player);
  assert.equal(round.vote(sim.player.id, sim.player.id), false);
  assert.equal(round.vote(sim.player.id, 1), true);
  assert.equal(round.vote(sim.player.id, 2), false);
});
