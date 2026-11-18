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
| 8 | Loot: guns, ammo, armor, medkits and grenades on the ground, death drops, airdrop crates, bots that loot and heal | built | `src/sim/loot.js`, `src/render/loot-view.js` | `tests/loot.test.js`, `scripts/e2e-loot.mjs`, `scripts/e2e-online-loot.mjs`, section 4 of `server/test/match.mjs` |

Run everything: `npm test` (91 tests), `npm run smoke`, `npm run server:test`, then (with `npx vite build` and `npx vite preview --port 4173` running) the `scripts/e2e-*.mjs` browser checks.

## Controls (all of them)

`WASD` move, `Shift` sprint, `Space` jump, mouse aim, left click fire, right click aim, `R` reload, `1`-`6` or wheel weapons, `G` grenade, **`T` mortar strike**, **`E` enter or leave a vehicle**, **`H` use a medkit**, `F` flashlight (night and storm only), `Esc` pause.

In a vehicle: `W/S` gas and reverse, `A/D` steer, `Space` handbrake, `Shift` boost. The driver cannot shoot. A passenger can (drive-by).

## URL switches (handy for testing)

`?seed=7` same map and match every time, `?bots=4` number of bots, `?weather=clear|rain|fog|night|storm`, `?gore=0|1`, `?vehicles=0` (no buggies or bikes), `?loot=0` (everybody has every gun from the start, nothing on the ground), `?cstart=5` seconds until the first contract, `?lag=120` fake network lag, `?online=ws://host:2567` use another server.
On the server: `VEHICLES=0` turns vehicles off for every match, `LOOT=0` turns loot off (classic loadout).

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
| Relay uplink | secure the relay alone for 7 s, then remain alone for a 10 s intel upload; contested pauses progress and abandonment slowly decays it. Existing garrison guards redeploy to defend the site, tighten their patrol when upload begins, and return to their outpost when it ends | `_uplink`, `alertGarrison`, `restoreGarrison`, `ARM_T`, `UPLOAD_T` |
| Order | the first three contracts are airdrop, hardpoint, bounty, then random (including relay uplink); at most 2 active; the first at about 24 s | `Contracts._spawn`, `opts.contractStart` |
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

## Stage 8: loot, armor and medkits

A loot match (the default in solo and on the server) starts every fighter with a **pistol and nothing else**. Guns, ammo, vests, medkits and grenades lie on the ground; walk over one to take it.

| Thing | Rule |
|---|---|
| Starting items | 120, placed from the match seed next to buildings, containers and crates (60 %) or in the open. The middle of the map has better stuff (quality tier 1-3) |
| Weapons | a gun you do not have is picked up (and equipped if you hold the pistol or are out of ammo). A gun you already have only gives ammo. Full of ammo: the item stays |
| Ammo | only for guns you own, up to 1.5 x the normal reserve |
| Armor | LV1 40 / LV2 80 / LV3 120 points. It soaks 55 % of every body bullet and blast until used up (head shots, crashes, roadkill and the zone ignore it). A worse vest than yours is left on the ground |
| Medkit | `H`, 3 seconds, +60 hp, max 4 carried. You move at 55 % speed while using it. Shooting, reloading, switching, throwing, sprinting, getting in a vehicle or taking a hit cancels it and keeps the medkit |
| Natural regen | in a loot match you only walk off damage up to 30 % health (classic mode: 65 %). Medkits are how you heal |
| Death drops | everything a fighter carried (not the pistol) falls around the body: guns with their ammo, the pistol ammo if 15+, the vest with the points it has left, medkits, grenades |
| Airdrop crates | opening one spills a DMR / LMG / AR with ammo, an LV3 vest, 2 medkits and 2 grenades on the ground (instead of silently topping up your ammo) |
| Guards | the garrison carries an SMG and an LV1 vest |
| Bots | `S.loot`: walk to the best item they actually need within 55 m (guns first, then armor and medkits; ignored while fighting). `S.heal`: use a medkit when below ~60 % hp, nobody in sight and not hit for 1.5 s. They equip the best gun they own (their personality preference first) when out of a fight |

- **Netcode:** every browser builds the same 120 starting items from the seed (nothing is sent). The server only tells them which starting items are gone (`lt.g`) and the dropped items in full (`lt.d`, rows of `[id, type, sub, x, z, qty, qty2]`). `lt` is included in a snapshot only when a pickup or drop happened, plus a refresh every 2 seconds. Picking things up is decided by the server alone (a browser never picks anything up itself); the `pickup` and `heal` events come from the server. Your own guns, armor, medkits and heal progress are part of your private self-state (`hv/ar/al/md/hl`), so prediction and reconciliation agree. `H` is the `heal` command flag (bit 256).
- **Cost:** items are bucketed in 4 m cells and bots look for loot about 3 times a second, so loot adds about 0.03 ms per server tick (16 fighters).
- **Where to tune:** `ARMOR`, `ARMOR_ABSORB`, `MED_HEAL`, `HEAL_T`, `PICK_R` at the top of `src/sim/loot.js`; the item mix and the quality tiers in `_roll` / `_layout`; the regen cap in `step()` of `world.js`.
- **Look:** `src/render/loot-view.js` (little low-poly shapes that spin and bob, a light ring on the floor, a beam on green / blue / gold items). Items further than 75 m are not drawn.

## What to look at next (open items)

1. **Put the server on a VPS** and play a real match with a friend on another network (`docs/DEPLOY.md`). Everything so far was tested on one machine with fake lag.
2. **Load test** with 16 real humans, and measure network bytes per player.
3. Roadmap milestone 2: one real handcrafted arena, real weapon models and sounds from CC0 packs (`ASSETS.md`). (Loot, health and armor are done: Stage 8.)
4. Vehicle polish: engine sound mix, a respawn timer for wrecks, tyre tracks, a horn.
5. Portal pass: cut the main bundle (about 5 MB, 1.9 MB gzipped) so the first load stays under the Poki target of 8 MB.

## Integration of the parallel ChatGPT branches (19 Nov 2026)

ChatGPT worked on feature branches while Stage 8 was built; all of them were reviewed, merged into `main` as separate merge commits (so each can be reverted on its own) and re-tested together.

| Branch | What it adds | Notes on the merge |
|---|---|---|
| `feature/threat-aware-bot-ai` | `scoreTargetCandidate`: bots weigh distance, who hurt them, who is shooting, wounded/isolated enemies, squad focus | clean |
| `feature/reactive-ai-cover` | `shouldSeekCover`: cover when badly hurt, under fire, or mid risky reload | adjacent-hunk conflict with the above, both kept |
| `feature/squad-command-ai` | `chooseSquadOrder` + `Squad.orderFor`: squad fallback/push orders from contact, health and pinner role | clean |
| `feature/garrison-patrol-search` | `searchWaypoint`, guard patrol/search states, radio-driven investigation | clean |
| `feature/operator-select` | operator picker on the start screen, `?op=` / saved choice, operator stats card | `main.js` conflict: kept `OPERATOR` plus the loot option |
| `feature/third-person-camera` | V toggles first/third person, collision-safe boom camera, full-body player model | conflict with the vehicle chase camera: chase camera wins while driving, driver body hidden, gun hidden in third person |
| `feature/kavari-basin-greybox` | five named places (Basin Yard, Dry River, Relay Ridge, Forward Outpost, Extraction Pad), POI structures, minimap labels | the new boxes moved the seeded filler layout, so two tests/e2e scripts that hard-coded a firing lane/spot now search for open ground; vehicles are off in the contracts test arena; named places get 5 guaranteed good loot items each (hot zones) |
| docs branches | world bible, dual-camera design, asset specs, production readiness, performance budget, roadmap | their master plan is kept as `docs/MASTER_PRODUCT_PLAN.md`; this file stays the engineering log; README/ROADMAP/ASSETS were combined by hand |

Checks after merging everything: 110 unit tests, engine smoke, server netcode test, and 9 browser scripts (`e2e*.mjs`, including the new `e2e-camera.mjs` for operator picker + third person + vehicle chase camera).
