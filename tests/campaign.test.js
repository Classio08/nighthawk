import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyCampaignState, normalizeCampaignState, getCampaignOverview, isOperationUnlocked,
  recordCampaignResult, factionStanding, buildMissionBriefing,
} from '../src/progression/campaign.js';

test('campaign unlock chain starts with DUST LANTERN and unlocks SIGNAL BLACKOUT on completion', () => {
  const empty = emptyCampaignState();
  assert.equal(isOperationUnlocked('dust-lantern', empty), true);
  assert.equal(isOperationUnlocked('signal-blackout', empty), false);
  const result = recordCampaignResult(empty, { missionId: 'dust-lantern', won: true, score: 900, runId: 'server-run-0001' });
  assert.equal(result.applied, true);
  assert.equal(isOperationUnlocked('signal-blackout', result.state), true);
  assert.equal(isOperationUnlocked('black-glass', result.state), false);
});

test('side operations unlock in parallel and Black Glass requires both branch missions', () => {
  let state = recordCampaignResult(emptyCampaignState(), { missionId: 'dust-lantern', won: true, runId: 'server-run-0002' }).state;
  state = recordCampaignResult(state, { missionId: 'signal-blackout', won: true, runId: 'server-run-0003' }).state;
  assert.equal(isOperationUnlocked('relay-uplink', state), true);
  assert.equal(isOperationUnlocked('convoy-ambush', state), true);
  assert.equal(isOperationUnlocked('black-glass', state), false);
  state = recordCampaignResult(state, { missionId: 'relay-uplink', won: true, runId: 'server-run-0004' }).state;
  assert.equal(isOperationUnlocked('black-glass', state), false);
  state = recordCampaignResult(state, { missionId: 'convoy-ambush', won: true, runId: 'server-run-0005' }).state;
  assert.equal(isOperationUnlocked('black-glass', state), true);
});

test('run ids make rewards idempotent and failed missions do not grant reputation', () => {
  const failed = recordCampaignResult(emptyCampaignState(), { missionId: 'dust-lantern', won: false, runId: 'server-run-0006' });
  assert.equal(failed.state.completed.length, 0);
  assert.equal(factionStanding(failed.state).civilians.score, 0);
  const success = recordCampaignResult(failed.state, { missionId: 'dust-lantern', won: true, runId: 'server-run-0007' });
  const duplicate = recordCampaignResult(success.state, { missionId: 'dust-lantern', won: true, runId: 'server-run-0007' });
  assert.equal(duplicate.applied, false);
  assert.equal(duplicate.reason, 'duplicate-run');
});

test('bad imported state is bounded and unrecognized mission ids are ignored', () => {
  const state = normalizeCampaignState({
    completed: ['dust-lantern', 'fake-operation'],
    reputation: { civilians: 999, krg: -999, unknown: 88 },
    processedRunIds: ['x', 'x'],
  });
  assert.deepEqual(state.completed, ['dust-lantern']);
  assert.equal(state.reputation.civilians, 100);
  assert.equal(state.reputation.krg, -100);
  assert.deepEqual(state.processedRunIds, ['x']);
  const bad = recordCampaignResult(state, { missionId: 'nope', won: true, runId: 'server-run-0008' });
  assert.equal(bad.applied, false);
  assert.equal(bad.reason, 'unknown-operation');
});

test('mission briefing exposes narrative and locks without trusting imported unlock flags', () => {
  const briefing = buildMissionBriefing('signal-blackout', emptyCampaignState());
  assert.equal(briefing.title, 'SIGNAL BLACKOUT');
  assert.equal(briefing.unlocked, false);
  assert.deepEqual(briefing.prerequisites, ['DUST LANTERN']);
});

test('overview separates missions under construction from playable operations', () => {
  const overview = getCampaignOverview(emptyCampaignState());
  assert.equal(overview.find((m) => m.id === 'dust-lantern').status, 'built');
  assert.equal(overview.find((m) => m.id === 'black-glass').status, 'planned');
});
