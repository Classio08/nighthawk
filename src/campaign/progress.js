// Campaign progress: which operations you finished, your best grade and time, which endings and ribbons you earned. Saved in this browser only
// ("nh_campaign_v1"), validated on load like the profile (a hand-edited save cannot produce NaN, odd keys or unknown ribbons). Cosmetic and bragging rights only.
import { MISSION_ORDER } from './story.js';
import { ENDINGS } from './endings.js';

export const CAMPAIGN_KEY = 'nh_campaign_v1';
const BIG = 1e7;
const RIBBONS = new Set(Object.values(ENDINGS).flatMap((m) => Object.values(m).map((e) => e.ribbon).filter(Boolean)));
const ENDING_IDS = new Set(Object.values(ENDINGS).flatMap((m) => Object.values(m).map((e) => e.id)));
const GRADE_RANK = { S: 5, A: 4, B: 3, C: 2, D: 1, '-': 0 };
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(BIG, v)) : d);

export const defaultProgress = () => ({ v: 1, missions: {}, ribbons: [], last: null });

export function sanitizeProgress(raw) {
  const out = defaultProgress(); if (!raw || typeof raw !== 'object') return out;
  for (const id of MISSION_ORDER) {
    const m = raw.missions?.[id]; if (!m || typeof m !== 'object') continue;
    out.missions[id] = {
      plays: Math.trunc(num(m.plays)), wins: Math.trunc(num(m.wins)), bestScore: Math.trunc(Math.min(100, num(m.bestScore))), bestGrade: GRADE_RANK[m.bestGrade] !== undefined ? m.bestGrade : '-',
      bestTime: typeof m.bestTime === 'number' && Number.isFinite(m.bestTime) && m.bestTime > 0 ? Math.min(BIG, m.bestTime) : null, endingsSeen: Array.isArray(m.endingsSeen) ? m.endingsSeen.filter((e) => ENDING_IDS.has(e)) : [],
      lastEndingId: ENDING_IDS.has(m.lastEndingId) ? m.lastEndingId : null,
    };
  }
  out.ribbons = Array.isArray(raw.ribbons) ? [...new Set(raw.ribbons.filter((r) => RIBBONS.has(r)))] : [];
  out.last = MISSION_ORDER.includes(raw.last) ? raw.last : null;
  return out;
}

/** returns a NEW progress with this debrief recorded */
export function recordRun(progress, debrief, elapsed) {
  const p = sanitizeProgress(JSON.parse(JSON.stringify(progress ?? defaultProgress())));
  const id = debrief.missionId, m = p.missions[id] ?? { plays: 0, wins: 0, bestScore: 0, bestGrade: '-', bestTime: null, endingsSeen: [], lastEndingId: null };
  m.plays++; m.lastEndingId = debrief.ending.id;
  if (!m.endingsSeen.includes(debrief.ending.id)) m.endingsSeen.push(debrief.ending.id);
  if (debrief.won) {
    m.wins++; if (debrief.rating.score > m.bestScore) { m.bestScore = debrief.rating.score; }
    if (GRADE_RANK[debrief.rating.grade] > GRADE_RANK[m.bestGrade]) m.bestGrade = debrief.rating.grade;
    if (Number.isFinite(elapsed) && elapsed > 0 && (m.bestTime === null || elapsed < m.bestTime)) m.bestTime = Math.round(elapsed * 10) / 10;
    if (debrief.ending.ribbon && !p.ribbons.includes(debrief.ending.ribbon)) p.ribbons.push(debrief.ending.ribbon);
  }
  p.missions[id] = m; p.last = id; return p;
}

/** the next operation worth suggesting: the first unfinished, else the first one (replay) */
export const nextOperation = (p) => MISSION_ORDER.find((id) => !p.missions[id]?.wins) ?? MISSION_ORDER[0];
export const operationsDone = (p) => MISSION_ORDER.filter((id) => p.missions[id]?.wins).length;

const store = (s) => { try { return s ?? globalThis.localStorage ?? null; } catch { return null; } };
export function loadProgress(storage) { try { const raw = store(storage)?.getItem(CAMPAIGN_KEY); return raw ? sanitizeProgress(JSON.parse(raw)) : defaultProgress(); } catch { return defaultProgress(); } }
export function saveProgress(p, storage) { const st = store(storage); if (!st) return false; try { st.setItem(CAMPAIGN_KEY, JSON.stringify(p)); return true; } catch { return false; } }
export function resetProgress(storage) { try { store(storage)?.removeItem(CAMPAIGN_KEY); } catch { /* ignore */ } return defaultProgress(); }
