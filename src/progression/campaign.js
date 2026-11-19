// Campaign progression is presentation / account state, not simulation authority.
// Only pass verified server operation results to recordCampaignResult().
export const FACTIONS = Object.freeze({
  ndf: { name: 'NDF', label: 'Nighthawk Defense Force' },
  krg: { name: 'KRG', label: 'Kavari Recovery Group' },
  saltRoad: { name: 'Salt Road Crew', label: 'Salt Road Crew' },
  civilians: { name: 'Civilians', label: 'Kavari Civil Network' },
});

export const CAMPAIGN_OPERATIONS = Object.freeze([
  {
    id: 'dust-lantern', title: 'DUST LANTERN', act: 1, status: 'built',
    type: 'rescue', chapter: 'THE MISSING TECHNICIAN',
    briefing: 'Recover the missing communications technician and identify who sold the recovery schedule.',
    debriefHook: 'The technician’s field recorder points to a compromised relay network.',
    requires: [], awards: { ndf: 4, krg: -3, civilians: 8 },
  },
  {
    id: 'signal-blackout', title: 'SIGNAL BLACKOUT', act: 1, status: 'built',
    type: 'signals', chapter: 'CUT THE TRACE',
    briefing: 'Jam the three relays before the hostile trace locks onto the unit.',
    debriefHook: 'The trace stops, but a convoy has already moved the buyer’s equipment.',
    requires: ['dust-lantern'], awards: { ndf: 5, krg: -7, civilians: 1 },
  },
  {
    id: 'relay-uplink', title: 'RELAY UPLINK', act: 2, status: 'planned',
    type: 'defend', chapter: 'HOLD THE WINDOW',
    briefing: 'Secure the relay, keep the uplink alive and extract the recovered network keys.',
    debriefHook: 'The recovered keys reveal a private data vault near the dry river.',
    requires: ['signal-blackout'], awards: { ndf: 5, krg: -5 },
  },
  {
    id: 'convoy-ambush', title: 'CONVOY AMBUSH', act: 2, status: 'planned',
    type: 'intercept', chapter: 'THE SALT ROAD',
    briefing: 'Intercept the recovery convoy, recover three cargo manifests and leave before the response force closes the road.',
    debriefHook: 'One manifest identifies the shell company paying the guards.',
    requires: ['signal-blackout'], awards: { ndf: 3, krg: -6, saltRoad: 2 },
  },
  {
    id: 'black-glass', title: 'BLACK GLASS', act: 3, status: 'planned',
    type: 'infiltration', chapter: 'THE BUYER’S VAULT',
    briefing: 'Infiltrate the data vault. Stealth lowers the response, but a loud route remains possible.',
    debriefHook: 'The vault contains the buyer’s identity and a list of compromised contractors.',
    requires: ['relay-uplink', 'convoy-ambush'], awards: { ndf: 6, krg: -8, civilians: 2 },
  },
  {
    id: 'last-light', title: 'LAST LIGHT', act: 3, status: 'planned',
    type: 'defend', chapter: 'EXTRACTION PAD',
    briefing: 'Hold the extraction perimeter while the convoy arrives and the team secures the evidence.',
    debriefHook: 'The perimeter holds. The Broker makes a final offer over the radio.',
    requires: ['black-glass'], awards: { ndf: 6, krg: -5, civilians: 3 },
  },
  {
    id: 'the-broker', title: 'THE BROKER', act: 4, status: 'planned',
    type: 'target', chapter: 'THE LAST CONTRACT',
    briefing: 'Find the Broker and decide what happens to the recovered evidence.',
    debriefHook: 'The campaign outcome depends on the evidence and the people you protected.',
    requires: ['last-light'], awards: { ndf: 4, krg: -4 },
  },
]);

export const REPEATABLE_MODES = Object.freeze([
  { id: 'black-site', title: 'BLACK SITE', status: 'separate-mode', unlockAfter: ['signal-blackout'], description: 'Hidden-role tactical sabotage and evidence-based investigation. Not part of the linear story chain.' },
  { id: 'battle-royale', title: 'BATTLE ROYALE', status: 'built', unlockAfter: [], description: 'Quick-play competitive matches in Kavari Basin.' },
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const OP_BY_ID = new Map(CAMPAIGN_OPERATIONS.map((operation) => [operation.id, operation]));
const REP_IDS = Object.keys(FACTIONS);

export function emptyCampaignState() {
  return {
    version: 1,
    completed: [],
    reputation: Object.fromEntries(REP_IDS.map((id) => [id, 0])),
    records: {},
    history: [],
    processedRunIds: [],
  };
}

export function normalizeCampaignState(raw) {
  const state = emptyCampaignState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return state;
  if (Array.isArray(raw.completed)) state.completed = [...new Set(raw.completed.filter((id) => OP_BY_ID.has(id)))];
  if (raw.reputation && typeof raw.reputation === 'object' && !Array.isArray(raw.reputation)) {
    for (const id of REP_IDS) {
      const value = raw.reputation[id];
      state.reputation[id] = Number.isFinite(value) ? clamp(Math.trunc(value), -100, 100) : 0;
    }
  }
  if (raw.records && typeof raw.records === 'object' && !Array.isArray(raw.records)) {
    for (const id of Object.keys(raw.records)) {
      if (!OP_BY_ID.has(id)) continue;
      const record = raw.records[id];
      if (!record || typeof record !== 'object') continue;
      state.records[id] = {
        attempts: Number.isFinite(record.attempts) ? clamp(Math.trunc(record.attempts), 0, 100000) : 0,
        wins: Number.isFinite(record.wins) ? clamp(Math.trunc(record.wins), 0, 100000) : 0,
        bestScore: Number.isFinite(record.bestScore) ? clamp(Math.trunc(record.bestScore), 0, 10000000) : 0,
      };
    }
  }
  if (Array.isArray(raw.history)) state.history = raw.history.slice(-30).filter((entry) =>
    entry && typeof entry === 'object' && OP_BY_ID.has(entry.missionId)
  ).map((entry) => ({
    missionId: entry.missionId,
    won: entry.won === true,
    score: Number.isFinite(entry.score) ? clamp(Math.trunc(entry.score), 0, 10000000) : 0,
    runId: typeof entry.runId === 'string' ? entry.runId.slice(0, 80) : '',
  }));
  if (Array.isArray(raw.processedRunIds)) state.processedRunIds = [...new Set(raw.processedRunIds.filter((id) => typeof id === 'string').map((id) => id.slice(0, 80)))].slice(-500);
  return state;
}

export function isOperationUnlocked(missionId, stateInput) {
  const mission = OP_BY_ID.get(missionId);
  if (!mission) return false;
  const state = normalizeCampaignState(stateInput);
  return mission.requires.every((requiredId) => state.completed.includes(requiredId));
}

export function getCampaignOverview(stateInput) {
  const state = normalizeCampaignState(stateInput);
  return CAMPAIGN_OPERATIONS.map((mission) => ({
    ...mission,
    unlocked: isOperationUnlocked(mission.id, state),
    completed: state.completed.includes(mission.id),
    attempts: state.records[mission.id]?.attempts ?? 0,
    wins: state.records[mission.id]?.wins ?? 0,
    bestScore: state.records[mission.id]?.bestScore ?? 0,
  }));
}

export function factionStanding(stateInput) {
  const state = normalizeCampaignState(stateInput);
  return Object.fromEntries(REP_IDS.map((id) => {
    const score = state.reputation[id];
    const status = score >= 25 ? 'allied' : score >= 8 ? 'friendly' : score <= -25 ? 'hostile' : score <= -8 ? 'unfriendly' : 'neutral';
    return [id, { ...FACTIONS[id], score, status }];
  }));
}

/**
 * Apply one server-verified operation result to campaign state.
 * The caller must supply a unique server-generated runId. Replaying the same run is idempotent.
 * This function is not an HTTP endpoint and must never accept arbitrary client-submitted rewards.
 */
export function recordCampaignResult(stateInput, result = {}) {
  const state = normalizeCampaignState(stateInput);
  const mission = OP_BY_ID.get(result.missionId);
  if (!mission) return { state, applied: false, reason: 'unknown-operation' };
  if (!isOperationUnlocked(mission.id, state)) return { state, applied: false, reason: 'operation-locked' };
  if (typeof result.runId !== 'string' || result.runId.length < 8 || result.runId.length > 80) {
    return { state, applied: false, reason: 'missing-run-id' };
  }
  if (state.processedRunIds.includes(result.runId)) return { state, applied: false, reason: 'duplicate-run' };

  const won = result.won === true;
  const score = Number.isFinite(result.score) ? clamp(Math.trunc(result.score), 0, 10000000) : 0;
  const record = state.records[mission.id] ?? { attempts: 0, wins: 0, bestScore: 0 };
  record.attempts++;
  if (won) record.wins++;
  record.bestScore = Math.max(record.bestScore, score);
  state.records[mission.id] = record;

  if (won && !state.completed.includes(mission.id)) {
    state.completed.push(mission.id);
    for (const [factionId, points] of Object.entries(mission.awards)) {
      if (own(state.reputation, factionId)) state.reputation[factionId] = clamp(state.reputation[factionId] + points, -100, 100);
    }
  }
  state.history.push({ missionId: mission.id, won, score, runId: result.runId });
  state.history = state.history.slice(-30);
  state.processedRunIds.push(result.runId);
  state.processedRunIds = state.processedRunIds.slice(-500);
  return { state, applied: true, unlocked: getCampaignOverview(state).filter((entry) => entry.unlocked).map((entry) => entry.id) };
}

export function buildMissionBriefing(missionId, stateInput) {
  const mission = OP_BY_ID.get(missionId);
  if (!mission) return null;
  const state = normalizeCampaignState(stateInput);
  return {
    id: mission.id,
    title: mission.title,
    chapter: mission.chapter,
    briefing: mission.briefing,
    debriefHook: mission.debriefHook,
    unlocked: isOperationUnlocked(missionId, state),
    prerequisites: mission.requires.map((id) => OP_BY_ID.get(id)?.title ?? id),
    status: mission.status,
  };
}
