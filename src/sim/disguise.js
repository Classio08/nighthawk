// UNIFORM DISGUISE (offline operations only). Pure rules, no imports: bot.js reads them while a garrison guard scans for targets.
// An operator who strips a downed guard's jacket and cap is ignored by the garrison at range. The cover is thin on purpose:
//   - a guard that gets close enough to look at your face sees through it (DISGUISE.SEE_THROUGH),
//   - the named hunter (VIPER) is not fooled from much farther away (DISGUISE.HUNTER_RANGE),
//   - once the garrison is at full alert everybody is checking faces, so the uniform is worthless,
//   - firing, throwing, striking, running past a guard or taking a hit tears it off (see MissionStealth).
export const DISGUISE = {
  DURATION: 45,            // seconds of cover from one uniform
  TAKE_RANGE: 2.4,         // how close to the body you must stand to take it
  SEE_THROUGH: 7,          // metres: a garrison guard this close notices the impostor
  HUNTER_RANGE: 22,        // metres: the hunter is hard to fool
  SPRINT_BREAK_RANGE: 14,  // running within this distance of a living guard blows the cover
};

/** a stealth state name: the alert levels at which a uniform no longer helps (the garrison checks every face) */
export const UNIFORM_USELESS = new Set(['alert', 'crisis']);

export const isDisguised = (f) => !!f && f.alive !== false && (f.disguiseT ?? 0) > 0;

/**
 * Does `observer` (a garrison guard's brain owner) take `target` for one of its own?
 * Returns true when the observer should IGNORE the target.
 * @param observer fighter whose brain is scanning   @param target the fighter being looked at   @param dist metres between them
 * @param alertLevel the mission's alert level name (or undefined outside an operation)
 */
export function disguiseFools(observer, target, dist, alertLevel) {
  if (!isDisguised(target)) return false;
  if (alertLevel && UNIFORM_USELESS.has(alertLevel)) return false;
  if (observer?.brain?.p?.raider) return false;                   // the Jackal's raiders (relay-uplink.js) are sent for the operator: a garrison jacket means nothing to them
  const reach = observer?.brain?.p?.hunter ? DISGUISE.HUNTER_RANGE : DISGUISE.SEE_THROUGH;
  return dist > reach;
}
