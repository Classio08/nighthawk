// Endings, decided from REAL numbers the simulation records (never from invented stats). Each playable operation has three outcomes:
//   A = the clean way, B = the loud way (both canon, both a success), fail.
// Rewards are cosmetic RIBBONS only: no stat boosts, nothing that changes how you play (same rule as src/profile.js).
export const ALERT_LEVELS = ['routine', 'uneasy', 'searching', 'alert', 'crisis'];       // index = alertMax

export const ENDINGS = {
  'dust-lantern': {
    A: { id: 'silent_lantern', title: 'SILENT LANTERN', subtitle: 'Ghost rescue', condition: 'The garrison never reached ALERT', desc: 'You got in, got her, got out. Nobody knew you were there until you were gone. Amara: "You are ghosts. Good ghosts."', ribbon: 'SILENT LANTERN', dialogueNext: 'Sable: "Silent Lantern. The Jackal still thinks his guards fell asleep."' },
    B: { id: 'burning_lantern', title: 'BURNING LANTERN', subtitle: 'Loud rescue', condition: 'The garrison reached ALERT', desc: 'Loud. Messy. Alive. You fought through the yard and carried her out through the smoke. Amara: "You came loud. I like loud."', ribbon: 'BURNING LANTERN', dialogueNext: 'Dust: "Burning Lantern. The Jackal knows our name now. Good. Let him."' },
    fail: { id: 'lantern_out', title: 'LANTERN OUT', subtitle: 'Operator lost', condition: 'The operator went down', desc: 'The basin goes dark. CONTROL: "We owe her another try. Go again."', ribbon: null, dialogueNext: 'CONTROL: "We do not leave her story there. Go again."' },
  },
  'signal-blackout': {
    A: { id: 'dead_air', title: 'DEAD AIR', subtitle: 'Clean jam', condition: 'At most one interrupted jam and the garrison never reached ALERT', desc: 'Three relays, no panic, no noise. The trace dies without ever learning your name.', ribbon: 'DEAD AIR', dialogueNext: 'Sable: "Dead Air. That is the best sound I know."' },
    B: { id: 'static_and_smoke', title: 'STATIC AND SMOKE', subtitle: 'Loud jam', condition: 'Extracted, but jams were interrupted or the garrison reached ALERT', desc: 'You got the signal out and the garrison got a good look at you. It is never clean in war. It still counts.', ribbon: 'STATIC AND SMOKE', dialogueNext: 'Dust: "Static and Smoke. Loud. I loved it."' },
    fail: { id: 'trace_locked', title: 'TRACE LOCKED', subtitle: 'Operation lost', condition: 'The trace locked on, or the operator went down', desc: 'The relays keep humming. The Jackal keeps listening. The basin keeps whispering.', ribbon: null, dialogueNext: 'CONTROL: "Go again. Jam them faster and keep your head down."' },
  },
};

/**
 * @param {string} missionId
 * @param {{won:boolean, alertMax:number, taskFails?:number}} s  stats from the sim (alertMax = index into ALERT_LEVELS)
 * @returns the ending plus `key` ('A' | 'B' | 'fail') or null for an operation without endings
 */
export function evaluateEnding(missionId, s) {
  const e = ENDINGS[missionId]; if (!e) return null;
  if (!s?.won) return { ...e.fail, key: 'fail', mission: missionId };
  const quiet = (s.alertMax ?? 4) < 3;
  const clean = missionId === 'signal-blackout' ? quiet && (s.taskFails ?? 99) <= 1 : quiet;
  return { ...(clean ? e.A : e.B), key: clean ? 'A' : 'B', mission: missionId };
}
