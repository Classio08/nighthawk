# Campaign layer (NIGHTHAWK: KAVARI)

Status: **shipped (offline, this browser only)** for the two playable operations. The rest of the story is **planned data**, not playable.

## What exists

| Piece | Where | Status |
|---|---|---|
| Story text, act list, operation list | `src/campaign/story.js` | shipped (DUST LANTERN and RELAY UPLINK text from the owner's pack; SIGNAL BLACKOUT text written to continue it). Order: DUST LANTERN, RELAY UPLINK, SIGNAL BLACKOUT |
| Three outcomes per operation (A clean / B loud / fail) | `src/campaign/endings.js` | shipped, decided from real sim stats |
| Rating S/A/B/C/D + score 0..100 | `src/campaign/debrief.js` | shipped, one transparent function (`scoreRun`) |
| Debrief card on the end screen | `src/ui/hud.js` `showDebrief`, `index.html` `#debrief` | shipped; browser-checked in headless Chrome by `e2e-mission` / `e2e-signal-blackout` |
| Progress (best grade/time, endings seen, ribbons) | `src/campaign/progress.js`, key `nh_campaign_v1` | shipped, validated on load; stored in this browser only |
| Other five pack operations | `src/campaign/planned-data.js` | **planned**: pure text/data, nothing runs |

## Where the numbers come from

`MissionAlertDirector` remembers the highest alert level reached (`maxIndex`, index into `routine..crisis`). Each mission has `stats(won)`:
Dust Lantern gives elapsed, peak alert, clues found, kills; Signal Blackout adds jams interrupted (`taskFails`) and trace time left; Relay Uplink gives waves, raiders down, hack interruptions, hold stalls and the uplink percentage (its score ignores garrison noise).
`src/main.js` adds headshots and damage from the existing `MatchTracker`. Nothing is invented: a missing or non-finite number is treated as "loud / zero", never as a clean run.

## Endings

* DUST LANTERN: **SILENT LANTERN** (garrison never reached ALERT), **BURNING LANTERN** (it did), **LANTERN OUT** (operator lost).
* RELAY UPLINK: **CLEAR SIGNAL** (no interrupted hack, no stalled hold), **BROKEN SIGNAL** (uplink sent, but interrupted), **SILENCED** (operator lost or window closed). The pack's "<2 deaths" clause cannot apply offline, see `docs/MISSION_RELAY_UPLINK.md`.
* SIGNAL BLACKOUT: **DEAD AIR** (at most one interrupted jam, never ALERT), **STATIC AND SMOKE** (extracted, but loud), **TRACE LOCKED** (trace or operator lost).

## Rewards are cosmetic only

The pack's endings granted stat boosts (cloak, damage...). Those were **dropped on purpose**: progress here is cosmetic (same rule as `src/profile.js`). Winning an ending earns a *ribbon* (a label on the debrief), nothing that changes how you play. The pack's other mission ids (`ghost_frequency`, `relay_uplink`...) are kept in `planned-data.js` so the plan stays traceable; when one is built it gets a real id in `src/sim/missions.js` and moves into `story.js` / `endings.js` with conditions that use real sim stats.

## Not done / not claimed

* Not online: mission state still has no versioned server snapshot protocol (see `docs/PROJECT_DIRECTION_AND_CHAT_NOTES.md`).
* Progress is local to one browser; clearing site data resets it. No server-side campaign save.
* No cutscenes or voiced briefing playback per operation yet; the briefing text is data waiting for the dashboard UI.

## Stealth rows in the SIGNAL BLACKOUT debrief
When the stealth layer (`docs/STEALTH.md`) did something, the debrief card adds `VIPER: DOWN / STILL HUNTING` and `SEARCHLIGHT HITS: n`. They are information only: the score, grade and ending still come from the alert ladder, time, headshots and interrupted jams.
