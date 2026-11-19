# Operation RELAY UPLINK (prototype, offline)

Status: **prototype**. The rules are in the simulation and unit-tested (`tests/relay-uplink.test.js`), and the whole flow ran once end to end in headless Chrome with software GL (`scripts/e2e-relay-uplink.mjs`, operator made immortal for that run). **Nobody has played it as a human.** Balance, feel, the tower model and the raiders' look are unproven. Offline only: no versioned server snapshot protocol for mission state exists yet, so it is not in online rooms.

Story text is the owner's pack, unchanged (`src/campaign/story.js`). Files: `src/sim/relay-uplink.js` (the mission), `src/render/mission-view.js` (`RelayUplinkView`), `personality.js` (`raider`), `world.js` (`spawnMissionFighter`, `loadoutRaider`), campaign files for story / endings / debrief.

## The operation
1. **Approach**: walk to the tower on Relay Ridge (seeded spot near 58, -54). The garrison sits at Basin Yard, not on the tower.
2. **Hack** (E within 3.6 m): 6 s, interruptible. Taking a hit or drifting past 4.6 m cancels it (counted as `hackFails`). Starting it radios the garrison (`alertGarrison`, urgency 1).
3. **Hold**: the uplink needs **60 s inside the 9 m circle**. Outside it for more than 1.5 s counts as one break (`holdBreaks`), the upload stalls and bleeds back at half speed; coming back resumes it. A 15 minute window covers the whole operation.
4. **Three waves** on the hold clock (which keeps running while you are out of the circle): 3 raiders at 0 s, 5 at 18 s, 7 at 36 s, spread over three lines 120 degrees apart, 40 m from the tower. The message names the compass directions ("FROM N, SE, W"; north is -z).
5. **Extract**: uplink sent, run to the pad (4 s dwell). Surviving raiders now hunt the operator.

## Endings (cosmetic ribbons only)
CLEAR SIGNAL (no interrupted hack, no stalled hold), BROKEN SIGNAL (uplink sent but interrupted), SILENCED (operator lost or the window closed). **Deviation from the owner's pack:** its condition says "<2 deaths", which cannot exist offline (one operator, no respawn: a death ends the run), so the measured rule is interruptions only. Noise (garrison alert) is not scored here: the operation is loud by design. The `<2 deaths` clause belongs to the planned co-op variant (`relay_uplink_coop`).

## How the waves are added (and the owner's "no dynamic enemy spawning" rule)
The rule: *no dynamic enemy spawning until fighter roster replication and snapshot handling are deliberately designed.* Raiders (and VIPER before them) are added mid-operation, which is dynamic spawning, so it is confined instead of hidden:
- Every mid-operation spawn goes through ONE function, `Simulation.spawnMissionFighter`. It returns `null` unless the simulation is running a mission, so a battle royale or an online room can never grow its roster this way (tested).
- Fighters are appended with ids equal to their index (existing ids never move), flagged NPC (they do not count as players), capped at `MISSION_FIGHTER_CAP` (48).
- The raiders use the existing bot brain with a guard-type `raider` personality, so garrison and raiders do not shoot each other. Nothing here decides hits or movement; an LLM is not involved.
- This is **not** a replicated roster. Before any operation goes online it needs the design the rule asks for. Alternative considered and not built: a pre-allocated dormant reserve created at mission start. It would avoid the append, but needs a "dormant" state across targeting, rendering, the lag-compensation history and the kill feed.

## Things observed that you should know
- Crossfire is real: with an idle operator, headless runs show raiders (and garrison) killing each other with stray bullets and grenade splash (10 to 12 of 15 raiders down by 70 s with the operator doing nothing). That is existing engine behaviour for all NPCs; it makes the waves softer than their headcount. The debrief's RAIDERS DOWN counts every raider down, not only the operator's kills (KILLS is the operator's).
- Garrison uniforms: raiders cannot be disguised against (`disguiseFools`) and their bodies give no uniform. The disguise still works on the garrison.
- Tuning numbers (6 s hack, 60 s hold, wave times, 40 m ring, raider kit, 15 min window, 4 garrison guards) are first guesses.

## Not done
Human playtest and balance; a unique tower / raider model; wave and direction audio cues; online or co-op; difficulty scaling of the wave sizes; the owner's "intel" side objectives.
