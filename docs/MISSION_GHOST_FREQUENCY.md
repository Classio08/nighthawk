# Operation GHOST FREQUENCY

Status: **built, offline only** (solo; not enabled in online rooms until mission state has a versioned server snapshot). Browser-tested headless; not playtested by a person.

## The idea
A hostile signal-trace is closing on your unit. Jam three relay nodes before it locks on, then reach the extraction pad. It borrows the shape of a task list: the nodes can be done **in any order**, each task is **visible**, and each one is **interruptible**.

## Rules (all in `GhostFrequencyMission`, `src/sim/missions.js`)
- Start: you land at a seeded spot in the north-east corner; the extraction pad is the same one DUST LANTERN uses.
- **Three relays**, chosen by seed from four sites (Relay Ridge, Basin Yard, Forward Outpost, Dry River). Always on open ground; never inside a building.
- **A task** starts with **E** within 3.4 m of an unfinished relay and then needs **5 seconds** in range (`TASK.T`, `TASK.RANGE`). Moving more than 4.4 m away **or taking any damage** cancels it and the progress is lost. Healing does not cancel it. Starting a second task cancels the first.
- **Noise**: starting a task sends the garrison to that relay (`alertGarrison`). Finishing one sends the guards sweeping to the next unfinished relay. The garrison sits at the relay farthest from where you land.
- **Trace**: an 8:00 countdown (`TRACE_T`). Warnings at 60, 30 and 10 seconds. At 0 the operation fails even if you are alive (`reason: 'trace'`). The trace is plain arithmetic; there is no AI behind it.
- **Extraction**: after the third relay, stand in the pad's ring for 4 seconds (decays at 0.75x when you step out).
- **Failure**: the operator dies, or the trace locks.
- No zone, no drop, no bots. Eight garrison guards.

## How it plugs in
- `MISSIONS` registry and `createMission(id, sim)` in `src/sim/missions.js`. `Simulation` builds `opts.mission` through it.
- Every operation offers: `hudInfo(p)`, `mapMarkers(p)`, `eventMessage(e)`, `debrief(won)`, `objectivesDone`, `snapshot()`, plus `interact`, `update`, `complete`, `fail`. The HUD, minimap, event feed and debrief only call those. A mission that does not implement `hudInfo` still gets the generic stage / clues / hack / hold reading in `hud.js` (kept for ChatGPT's operation work).
- View: `GhostFrequencyView` in `src/render/mission-view.js` (mast, ground ring, growing fill disc while you splice, pulsing beacon, tall beam that fades as you walk up to it). `createMissionView` picks the view.
- Start it: menu button "OPERATION: GHOST FREQUENCY", or `?autostart&mission=ghost-frequency`.

## To add the next operation
1. A class in `src/sim/missions.js` with the surface above, using only `sim.rng`-style seeded randomness (`makeRng`), no clock, no `Math.random` (the purity guard test fails otherwise).
2. One entry in `MISSIONS`.
3. A view in `mission-view.js` and one line in `createMissionView`.
4. A button in `index.html` and one `beginOperation('<id>')` line in `main.js`.
5. A unit test file like `tests/ghost-frequency.test.js` and a browser script like `scripts/e2e-ghost.mjs`.

## Tests
`tests/ghost-frequency.test.js` (9 tests: registry, seed determinism and placement, task range, cancel on move and on hit, task swap, full run to extraction, trace timeout and warnings, garrison response, defender kill vs operator death); `scripts/e2e-ghost.mjs` (menu button, HUD, task start and cancel, three relays, extraction, debrief, snapshot card, play again).

## Not done
Online/co-op (needs the versioned snapshot protocol), more than one difficulty, a decoy relay, a second garrison, per-relay tasks that differ (hold, hack, carry), persistent rewards.
