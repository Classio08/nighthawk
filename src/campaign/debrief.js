// Debrief: turns one finished operation into a plain object the UI can draw (no DOM here, so it is unit-tested). Every number comes from the sim or the tracker.
import { getMissionStory, actOf, MISSION_ORDER } from './story.js';
import { evaluateEnding, ALERT_LEVELS, ENDINGS } from './endings.js';

const PAR = { 'dust-lantern': 360, 'signal-blackout': 300 };                      // seconds; slower than this costs points (gently)
export const GRADES = [
  { min: 92, grade: 'S', label: 'LEGENDARY', color: '#ffd24d', desc: 'Clean, fast, nobody noticed. The kind of operation they retell.' },
  { min: 80, grade: 'A', label: 'EXCELLENT', color: '#5be37a', desc: 'Professional. NIGHTHAWK standard.' },
  { min: 65, grade: 'B', label: 'SOLID', color: '#58a6ff', desc: 'Messy in places, done anyway. That counts.' },
  { min: 45, grade: 'C', label: 'SURVIVED', color: '#ff9a4d', desc: 'You got out. That is the first job. The rest is polish.' },
  { min: -1e9, grade: 'D', label: 'SCRAPED THROUGH', color: '#ff6b5e', desc: 'It worked, barely. Plenty to learn from.' },
];
const FAILED = { grade: '-', label: 'FAILED', color: '#ff4d4d', desc: 'This one got away. Regroup and go again.' };

// stats come from the sim, but this layer never trusts them blindly: a missing or non-finite number must not turn a grade into NaN or crash the end screen
const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const lvl = (v) => Math.max(0, Math.min(4, Math.trunc(fin(v, 4))));                   // an unknown alert level counts as loud (same rule as endings.js)

/** the score a successful run earns, 0..100 (transparent: every deduction is in this one function) */
export function scoreRun(missionId, s) {
  let score = 100;
  score -= [0, 3, 8, 16, 26][lvl(s.alertMax)];                                       // how loud the garrison got
  score -= Math.min(25, Math.max(0, fin(s.elapsed) - (PAR[missionId] ?? 360)) / 12);   // time over par
  score -= Math.max(0, fin(s.taskFails)) * 4;                                        // interrupted jams
  score += Math.max(0, Math.min(8, fin(s.headshots)));                               // clean shooting
  return Math.round(Math.max(0, Math.min(100, score)));
}
export const gradeFor = (score) => GRADES.find((g) => score >= g.min);

const mmss = (t) => { const v = Math.max(0, fin(t)); return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}`; };

/**
 * @param {string} missionId
 * @param {{won:boolean, reason?:string, kills:number, headshots?:number, damage?:number, alertMax:number, elapsed:number, found:number, total:number, taskFails?:number, traceLeft?:number}} s
 * @param {object|null} progress the campaign progress BEFORE this run (for "new best" and carry-forward dialogue)
 */
export function buildDebrief(missionId, s, progress = null) {
  const story = getMissionStory(missionId); if (!story) return null;
  const ending = evaluateEnding(missionId, s), won = !!s.won;
  const score = won ? scoreRun(missionId, s) : 0, rating = won ? { ...gradeFor(score), score } : { ...FAILED, score: 0 };
  const narrative = !won ? story.outroFail : ending.key === 'A' ? story.outroGood : story.outroBad;
  const rows = [['TIME', mmss(s.elapsed)], ['KILLS', String(Math.trunc(fin(s.kills)))], ['HEADSHOTS', String(Math.trunc(fin(s.headshots)))], ['DAMAGE DEALT', String(Math.round(fin(s.damage)))],
    ['PEAK ALERT', ALERT_LEVELS[lvl(s.alertMax)].toUpperCase()], [missionId === 'signal-blackout' ? 'RELAYS JAMMED' : 'CLUES FOUND', `${Math.trunc(fin(s.found))}/${Math.trunc(fin(s.total))}`]];
  if (missionId === 'signal-blackout') { rows.push(['JAMS INTERRUPTED', String(Math.trunc(fin(s.taskFails)))]); if (won) rows.push(['TRACE LEFT', mmss(s.traceLeft)]); }
  if (missionId === 'signal-blackout') {                                       // the stealth layer's two stories (stealth.js), shown only when they happened
    if (s.viper === 'down' || s.viper === 'loose') rows.push(['VIPER', s.viper === 'down' ? 'DOWN' : 'STILL HUNTING']);
    if (fin(s.spotted) > 0) rows.push(['SEARCHLIGHT HITS', String(Math.trunc(fin(s.spotted)))]);
  }
  const prev = progress?.missions?.[missionId];
  const idx = MISSION_ORDER.indexOf(missionId), next = won && idx >= 0 && idx < MISSION_ORDER.length - 1 ? MISSION_ORDER[idx + 1] : null;
  return {
    missionId, title: story.title, act: actOf(missionId)?.name ?? '', won, rating, ending: { key: ending.key, id: ending.id, title: ending.title, subtitle: ending.subtitle, desc: ending.desc, ribbon: ending.ribbon, dialogueNext: ending.dialogueNext },
    narrative, rows, newBest: won && (!prev?.bestScore || score > prev.bestScore), newRibbon: !!(ending.ribbon && !(progress?.ribbons ?? []).includes(ending.ribbon)),
    next: next ? { id: next, title: getMissionStory(next).title } : null, retry: !won,
  };
}

/** the line CONTROL/Sable says at the start of an operation, carrying over how the previous one ended (or null) */
export function carryForwardLine(missionId, progress) {
  const idx = MISSION_ORDER.indexOf(missionId); if (idx <= 0) return null;
  const e = progress?.missions?.[MISSION_ORDER[idx - 1]]?.lastEndingId;
  const prev = e && Object.values(ENDINGS[MISSION_ORDER[idx - 1]] ?? {}).find((x) => x.id === e);
  return prev?.dialogueNext ?? null;
}
