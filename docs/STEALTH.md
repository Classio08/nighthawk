# Mission stealth layer (prototype)

Status: **prototype**. The rules are in the simulation and unit-tested; they were also exercised in headless Chrome with software GL (`scripts/e2e-stealth.mjs`). Nobody has playtested the feel or balance, the beam visuals are untuned, and none of it exists in online rooms.

Files: `src/sim/disguise.js` (pure rules), `src/sim/stealth.js` (`MissionStealth`, VIPER, searchlights, messages), `src/render/stealth-view.js` (towers and beams), hooks in `world.js` (E key, step), `bot.js` (guard scan), `personality.js` (`hunter`), `missions.js` (HUD tag, stats), `bark-director.js`, `campaign/debrief.js`. Tests: `tests/stealth.test.js`.

It only exists inside an offline operation (`sim.stealth` is `null` in battle royale and online). Sim purity rules hold: no clock, no `Math.random`, no browser globals.

## 1. Uniform disguise (every operation; garrison bodies only)
- **E** within 2.4 m of a downed garrison guard (not VIPER) puts on the uniform: 45 s of cover, once per body. A body in reach takes priority over a relay in reach.
- A garrison guard ignores a disguised operator unless it is within 7 m (it sees the face). VIPER is only fooled beyond 22 m.
- At **ALERT or CRISIS** the uniform is useless: taking it is refused (the E press is still used up, a message says why) and an existing one stops working.
- Cover is torn off by: expiry, firing, a melee swing or grenade throw, taking damage, or sprinting within 14 m of a living guard.
- The mission panel shows `DISGUISED 41s`. Voice: the `onStealth` lines when it goes on.

## 2. VIPER (SIGNAL BLACKOUT only)
- Deployed once, the first tick the garrison alert director has ever reached ALERT (`maxIndex >= 3`). Spawns ~42 m from the operator on a free spot (own seeded RNG stream; `_addFighter` still draws one yaw from the match stream, deterministic; added through `spawnMissionFighter`).
- A guard-type brain with the new `hunter` personality: 240 HP, 90 armour, assault rifle, skill 0.9. Guards and VIPER do not shoot each other.
- He is **not omniscient**: every 1.2 s his post moves to the freshest garrison sighting younger than 6 s (a living guard's `lastSeen`) or his own last sighting. No evidence, no trail. The alert director's rule ("it observes only what living guards already hold") is kept.
- Arrival: message + his recorded taunt from the owner's voice pack (`onEnemyTaunt_viper`); killing him: `VIPER DOWN`. The debrief shows `VIPER: DOWN / STILL HUNTING` and does not change the score or ending (those still read only the alert ladder and the task stats).

## 3. Searchlights (SIGNAL BLACKOUT, extract stage only)
- Two light pools (radius 4.2 m, 3.2 m while crouching) sweep a 13 m circle around the pad, opposite directions. Pure function of mission time (`searchlightSpots`).
- ~0.9 s lit: the garrison is told your position (`alertGarrison(point, 2)`), a message shows, then a 7 s cooldown. That raises the evidence the alert director sees, it does not teleport anyone to you.
- Not lit when: disguised, cloaked (Shadow), in a vehicle, or when smoke blocks the line from the lamp head (14 m up).
- Client: two towers, two translucent beams and ground pools (red while you are in one). Draw-call cost not measured.

## Not done / limits
- No silent takedown, distraction throw or hiding spot (still planned, `docs/STORY_AND_ROLES.md`).
- No online/co-op version: needs a versioned mission snapshot and server validation first (same gate as every operation).
- No playtest. Numbers (45 s, 7 m, 22 m, 14 m, 0.9 s, 7 s, VIPER 240 HP) are first guesses.
- Searchlights and VIPER are SIGNAL BLACKOUT only. DUST LANTERN and RELAY UPLINK get the disguise only. RELAY UPLINK's raiders are never fooled by it and drop no uniform (`docs/MISSION_RELAY_UPLINK.md`).
- VIPER is added mid-operation through `Simulation.spawnMissionFighter`, the one audited spawn path (refuses outside an operation, capped). That is still dynamic spawning in the sense of the owner's rule, kept offline-only; see `docs/MISSION_RELAY_UPLINK.md` for the reasoning and the open design.
- Beam look, VIPER's silhouette (he reuses the standard soldier model with a purple label) and a spotlight sound are not done.
