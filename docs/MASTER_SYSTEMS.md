# Master systems: what was built from the research, and where it lives

This is the map between the "Master Prompt" research (from the other AI) and the code. Everything listed as **built** has unit tests, and most of it also has a browser or server test.

All gameplay rules live in `src/sim/` (no graphics). That one engine runs in your browser for solo play, on the Colyseus server for online play, and inside every online client as a predictor. So a rule written once works in all three places.

## At a glance

| Stage | System | Status | Main files | Tests |
|---|---|---|---|---|
| M1 | Online multiplayer: server-authoritative, prediction, reconciliation, interpolation, lag compensation | built | `server/src/MatchRoom.js`, `src/net/*` | `tests/netsim.test.js`, `server/test/match.mjs`, `scripts/e2e-online.mjs` |
| 3 | Utility AI brains, 6 personalities, radio squads, guard garrison | built | `src/sim/bot.js`, `personality.js`, `squad.js` | `tests/ai.test.js` |
| 4 | Tactical vs empty reload, dropped magazines, GLSL weapon skins | built | `src/sim/weapons.js`, `src/fx/mags.js`, `src/render/skins.js` | `tests/reload.test.js`, `scripts/e2e-reload-skins.mjs` |
| 5 | Destructible cover, explosive barrels, chain reactions | built | `src/sim/world.js` (`damageProp`, `_stepBarrels`) | `tests/props.test.js`, `scripts/e2e-props.mjs` |
| 6 | Contracts (airdrop, hardpoint, bounty), mortar killstreak, weather and night, gore toggle | built | `contracts.js`, `weather.js`, `src/render/atmosphere.js` | `tests/contracts.test.js`, `scripts/e2e-stage6.mjs` |
| 7 | Vehicles: arcade buggy (2 seats) and bike (1 seat), roadkill, bots that steal and drive | built | `src/sim/vehicles.js`, `src/render/vehicles-view.js` | `tests/vehicles.test.js`, `scripts/e2e-vehicles.mjs`, section 2c of `server/test/match.mjs` |

Run everything: `npm test` (75 tests), `npm run smoke`, `npm run server:test`, then (with `npx vite build` and `npx vite preview --port 4173` running) the `scripts/e2e-*.mjs` browser checks.

## Controls (all of them)

`WASD` move, `Shift` sprint, `Space` jump, mouse aim, left click fire, right click aim, `R` reload, `1`-`6` or wheel weapons, `G` grenade, **`T` mortar strike**, **`E` enter or leave a vehicle**, `F` flashlight (night and storm only), `Esc` pause.

In a vehicle: `W/S` gas and reverse, `A/D` steer, `Space` handbrake, `Shift` boost. The driver cannot shoot. A passenger can (drive-by).

## URL switches (handy for testing)

`?seed=7` same map and match every time, `?bots=4` number of bots, `?weather=clear|rain|fog|night|storm`, `?gore=0|1`, `?vehicles=0` (no buggies or bikes), `?cstart=5` seconds until the first contract, `?lag=120` fake network lag, `?online=ws://host:2567` use another server.
On the server: `VEHICLES=0` turns vehicles off for every match.

## Stage 3: Utility AI

Each bot scores a list of desires (stay in the zone, take cover, engage, hunt, investigate a noise, flank, suppress, camp, regroup with its squad, take a contract, steal a vehicle ...) every few ticks and does the best one. Personality changes the weights, so a Rusher and a Sniper behave differently from the same inputs.

| Personality | Plays like |
|---|---|
| rusher | pushes close, steals vehicles, loves contracts |
| sniper | holds long lines, rarely drives |
| tactician | uses cover and radio calls, moderate driving |
| survivor | stays near the zone edge, heals early |
| brawler | close range, will run people over |
| guard | never leaves its post (the 4 garrison NPCs) |

Squads share enemy sightings by "radio" so one bot seeing you alerts its friends. Tune in `src/sim/personality.js` (the numbers per trait) and the scoring in `_decide` in `src/sim/bot.js`.

## Stage 4: reloads, magazines, skins

A reload with a round still chambered is **tactical** (faster, keeps +1 round). An empty gun does the long **empty** reload with a charging step. Each stage drops a real magazine prop that falls and clinks (cosmetic only, never affects the sim). Weapon skins are small GLSL shaders (gold, damascus, magma, carbon, reactive); pick one with `?skin=magma` or the start screen. Skins are cosmetic and are the base for the later cosmetics shop.

## Stage 5: destructible props

Wooden crates break after enough damage and drop their stacked neighbours. Red barrels explode (radius, damage and force in `world.js`, `_stepBarrels`) and set off the barrels next to them. Destroyed props are replicated, so a crate that breaks on the server is gone for both players. Vehicles can ram crates and barrels.

## Stage 6: contracts, mortar, weather, gore

| System | Rule | Tune in |
|---|---|---|
| Airdrop | falls for 9 s, then one fighter within 2.8 m for 2.5 s opens it | `contracts.js` consts `FALL_T`, `OPEN_T`, `OPEN_R` |
| Hardpoint | circle r=9, hold it alone for 14 s (cumulative) | `HOLD_T`, `HP_R` |
| Bounty | the current top killer is marked for 50 s; the killer gets +50 hp and a mortar charge | `_bounty` |
| Order | the first three contracts are airdrop, hardpoint, bounty, then random; at most 2 active; the first at about 24 s | `Contracts._spawn`, `opts.contractStart` |
| Mortar | every 3rd kill in a row, or any contract, gives a charge (max 2). `T` calls 7 shells (radius 7, 100 damage) at the spot you look at, at least 16 m away | `callMortar`, `_stepStrikes` in `world.js` |
| Weather | chosen from the match seed; changes view distance and how far shots are heard | `weather.js` (`hearing`, `sight`) |
| Gore | `settings.gore`; the portal build defaults to off for a PEGI-12 friendly game | `src/settings.js` |

## Stage 7: vehicles

Our own arcade driving model (not Rapier dynamics, so it is cheap and deterministic). Rapier only holds a kinematic box per vehicle so fighters bump into it and bullets hit it.

| | Buggy | Bike |
|---|---|---|
| Seats | 2 | 1 |
| Hull hp | 400 | 190 |
| Top speed | 26 m/s (94 km/h) | 31 m/s (112 km/h) |
| Roadkill damage | speed x 6.5 | speed x 5 |

- Walls: a hit above 6 m/s hurts the vehicle (`(impact-6) x 5`), above 13 m/s it also hurts the people inside (`(impact-13) x 3`). It never lets you inside a wall.
- Shot at, a vehicle loses hull hp. At 0 it explodes: occupants are thrown out, and the blast (radius 9, 125 damage) hurts everybody close. A wreck stays on the map.
- Bots with the `drive` trait (rusher .85, survivor .6, brawler .55, tactician .35, sniper .1) may steal one, drive to the next zone centre or run you over, and bail out when low on hp or stuck.
- **Netcode:** the server drives. While you sit in a vehicle your own client does not predict anything: your body follows the smoothed vehicle state from the snapshots and the drawn vehicle eases towards it. Walking, shooting and prediction come back the moment you step out. Vehicle poses ride in the snapshot as `vh`.
- Where to tune: the `VEHICLE_TYPES` table at the top of `src/sim/vehicles.js` (speed, acceleration, steering, hp, roadkill) and the crash lines in `_move`.

## What to look at next (open items)

1. **Put the server on a VPS** and play a real match with a friend on another network (`docs/DEPLOY.md`). Everything so far was tested on one machine with fake lag.
2. **Load test** with 16 real humans, and measure network bytes per player.
3. Roadmap milestone 2: one real handcrafted arena, real weapon models and sounds from CC0 packs (`ASSETS.md`), loot on the ground, health and armor.
4. Vehicle polish: engine sound mix, a respawn timer for wrecks, tyre tracks, a horn.
5. Portal pass: cut the main bundle (about 5 MB, 1.9 MB gzipped) so the first load stays under the Poki target of 8 MB.
