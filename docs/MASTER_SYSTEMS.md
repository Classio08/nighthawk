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
| 9 | Operator abilities (Q) for all 8 operators, crouch (C), fall damage | built | `src/sim/abilities.js`, `src/sim/world.js` | `tests/abilities.test.js`, `tests/movement.test.js`, `scripts/e2e-abilities.mjs`, section 5 of `server/test/match.mjs` |
| 10 | Bot navigation (grid + A*), difficulty levels | built | `src/sim/nav.js`, `src/sim/difficulty.js`, `src/sim/bot.js` | `tests/nav.test.js`, `tests/bot-difficulty.test.js` |
| 11 | Settings menu (sensitivity, FOV, volume, graphics, difficulty, gore, key rebinding), saved in the browser | built | `src/settings.js`, `src/ui/settings-menu.js`, `src/input/input.js` | `tests/settings.test.js`, `scripts/e2e-settings.mjs` |
| 12 | Server hardening: rate limits, kicks, payload cap, room cap, reconnect window, /health + /metrics | built | `server/src/limits.js`, `server/src/MatchRoom.js`, `server/src/index.js`, `src/net/netsim.js` | `tests/limits.test.js`, section 6 of `server/test/match.mjs` |
| 13 | Guest profile: XP, levels and ranks, career stats, 14 badges, weapon skins unlocked by level (cosmetic only), saved in the browser | built | `src/profile.js`, `src/ui/profile-view.js`, `src/main.js` | `tests/profile.test.js`, `scripts/e2e-profile.mjs` |
| 14 | Parachute drop-in: everyone starts in a transport plane, jumps (Space), free-falls (W dives), parachute opens at 60 m, bots choose landing spots, zone waits for the landing; solo + online + prediction | built | `src/sim/drop.js`, `src/sim/world.js`, `src/sim/bot.js`, `src/render/plane-view.js`, `src/render/fighter.js`, `src/ui/hud.js`, `src/net/protocol.js`, `src/net/netsim.js`, `server/src/MatchRoom.js` | `tests/drop.test.js`, `scripts/e2e-drop.mjs`, `scripts/e2e-online-drop.mjs`, `server/test/match.mjs` section 6 |

Run everything: `npm test` (184 tests), `npm run smoke`, `npm run server:test`, then (with `npx vite build` and `npx vite preview --port 4173` running) the `scripts/e2e-*.mjs` browser checks.

## Controls (all of them)

`WASD` move, `Shift` sprint, **`C` crouch (hold)**, `Space` jump, **`Q` operator ability**, **`V` first/third person**, mouse aim, left click fire, right click aim, `R` reload, `1`-`6` or wheel weapons, `G` grenade, **`T` mortar strike**, **`E` enter or leave a vehicle**, **`H` use a medkit**, `F` flashlight (night and storm only), `Esc` pause.

In a vehicle: `W/S` gas and reverse, `A/D` steer, `Space` handbrake, `Shift` boost. The driver cannot shoot. A passenger can (drive-by).

## URL switches (handy for testing)

`?seed=7` same map and match every time, `?bots=4` number of bots, `?weather=clear|rain|fog|night|storm`, `?gore=0|1`, `?vehicles=0` (no buggies or bikes), `?loot=0` (everybody has every gun from the start, nothing on the ground), `?cstart=5` seconds until the first contract, `?diff=easy|normal|hard|brutal` bot difficulty, `?sens=1.4` `?fov=95` `?vol=0.3` `?quality=low|medium|high` (all of these are also in the SETTINGS screen and saved in the browser), `?lag=120` fake network lag, `?online=ws://host:2567` use another server.
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

## Stage 9: operator abilities, crouch, fall damage

**Operator abilities (key `Q`).** Every operator in `data/operators.json` now has a working active ability, defined in `src/sim/abilities.js`. They are plain simulation rules, so the browser (solo), the server and the client predictor agree, and a cheating client can only ask: the server checks cooldown, stun, vehicle and health.

| Operator | Ability | Cooldown | What it does | Counterplay |
|---|---|---|---|---|
| Roms | Overclock | 16 s | 5 s: fires 30% faster, takes 40% less bullet/blast damage | glows orange; the zone and falls are not reduced |
| Shadow | Cloak | 15 s | 4 s: 30% faster; bots lose him beyond 9 m, other players see a faint ghost and no gun beyond 7 m | fully visible up close; firing still shows tracers |
| Douglas | Trauma Kit | 13 s | +25 HP at once, then +14 HP/s for 5 s (refused at full health, no cooldown spent) | glows green; damage still lands |
| Cliffhanger | Blast Dash | 9 s | dash 11 m forward (0.2 s), charge goes off where he lands (85 dmg, 5.5 m, owner immune) | dash is short and in a straight line; the blast has line-of-sight falloff |
| Navy Blue | Deadeye | 11 s | next shot within 8 s: 3x damage, ignores armor, goes through bodies (60% on the second) | one shot only; he still needs to hit |
| Rampol | Bulwark | 12 s | 5 s: takes 65% less bullet/blast damage | glows amber; no speed bonus |
| Maetja | EMP Breach | 14 s | stuns every enemy within 24 m for 3 s: 30% speed, cannot shoot, jump, reload or heal | cyan flicker on the victims; squad-mates are immune |
| Cleiseis | Crimson Rush | 10 s | dash 9 m; anyone touched takes 70, and anyone under 40% HP is finished | has to connect; dash is straight |

- State on a fighter: `abCd` (cooldown left), `abT` (effect time left), `dashT/dashVx/dashVz` (dash), `stunT`. `moveFighter()` is the one choke point, so dashes and stuns work for humans and bots alike.
- Bots press Q through `botUseAbility()` (4 times a second, never touching the sim RNG, so old deterministic tests are unchanged).
- Network: `ability` is command flag 512; own state travels as `ab: [abCd, abT, dashT, dashVx, dashVz, stunT]` in the private self-state; everybody else sees the tells as snapshot flags `FF.ab/cloak/stun/dash`. The `ability` and `stun` events are server events. A predicting browser only runs the own-state part (cooldown, dash, stun) and never touches other fighters.
- HUD: ability box (name, cooldown bar, READY / ACTIVE / STUNNED); the camera FOV kicks during a dash; fighters glow, fade or flicker (`src/render/fighter.js`).

**Crouch (`C`, hold).** Half speed, no sprint, no jump, eyes about 1.1 m above the ground (camera glides), spread x0.78, and a smaller hitbox: the capsule top drops and the head height drops (lag compensation remembers the crouch flag per tick, so shots are judged on how the target looked to the shooter). Bots crouch while holding a cover position. Wire: command flag 1024, snapshot flag `FF.crouch`, self-state `cr`. Third-person bodies squat.

**Fall damage.** Landing faster than 12 m/s (a drop of about 3.3 m) costs 7 HP per extra m/s (10 m about 60 HP, 25 m about 150 HP). A normal jump (8.2 m/s) is always free; armor does not help; only the server / solo sim applies it.

## Stage 10: bot navigation and difficulty

**Navigation (`src/sim/nav.js`).** A 1 m grid over the map: every box taller than the auto-step height (0.5 m) blocks its cells plus a 0.55 m margin, low things (curbs, kerbs) do not. `findPath()` is A* with 8 directions and no corner cutting, then "string pulling" removes waypoints that a straight line can skip. Rules that keep it cheap and stable:
- A bot only asks for a route when the straight line to where it wants to go is blocked (`segmentClear`, which forgives the first and last 1.5 m so a soldier hugging a wall can still leave or arrive).
- The route is kept until the goal moved more than 5 m, the bot was pushed off it, or 8 s passed. Re-planning every second made equal-length routes flip-flop and the bot dithered.
- At most 4 searches per tick across all bots (`sim.navBudget`); a search stops after 30 000 cells. If no route is found the bot steers straight as before, and Yuka avoidance and the stuck-detector still back it up.
- While a route is being followed Yuka's circle avoidance is switched off (it fought the route around big buildings).
- Deterministic: no RNG, no clock, so the server and the solo game plan identical routes. A predicting browser has no bots and builds no grid (`opts.predictor`); `opts.nav = false` turns it off for tests.
Effect: a sniper that needed 30 s to reach a nest now needs about 20 s; bots no longer grind against long walls.

**Difficulty (`src/sim/difficulty.js`).** `easy | normal | hard | brutal`: adds to skill and scales reaction time, aim error and how often bots use abilities, grenades and mortar strikes. Bots never cheat (no wall-hacks, no extra health or damage). `normal` equals the numbers the bots were tuned with. `BotBrain.setDifficulty(id)` re-derives everything from the bot's own base skill, so levels can be switched without drift (adaptive difficulty later). Solo: SETTINGS or `?diff=hard`. Server: `DIFFICULTY=hard npm run server`.

## Stage 11: settings menu

`SETTINGS` on the start and pause screens (`src/ui/settings-menu.js`): mouse sensitivity (0.2x-3x), field of view (60-110, ADS zoom scales with it), volume, graphics (render scale 60 / 85 / 100% of the device pixel ratio), bot difficulty, gore, and **key rebinding** for 15 actions (weapon slots 1-6, mouse and Esc stay fixed). Click a key button, press the new key; a key that another action uses swaps the two so nothing is ever unbound; Esc, Tab, 1-6 and F-keys are refused; `Esc` cancels. `settings.js` validates everything it loads (a corrupted or hand-edited save cannot produce NaN, an unknown key or a double binding; a double binding falls back to the default layout) and saves to `localStorage` key `nh_settings_v1` (the old `nh_gore` value is still read once). Portal builds still start with gore off. Game code asks `input.act('jump')` / `input.actPressed('use')` instead of hard-coded key codes.

## Stage 12: server hardening

See `docs/MULTIPLAYER.md` (section "Hardening and reconnect") for how it works and `docs/DEPLOY.md` section C2 for what to run on the VPS (health check, metrics, limits, env vars). Short version: every connection has message-rate buckets and a 4 KB payload cap, flooders are kicked, the server refuses new matches above `MAX_ROOMS`, a dropped player gets 12 s to reconnect before a bot takes over, and `/health` + `/metrics` (token-protected) show tick times and abuse counters.

## Stage 13: guest profile and progression

Everything lives in `src/profile.js` (pure logic, unit-tested in Node) and `src/ui/profile-view.js` (DOM). Saved in this browser under `nh_profile_v1`; nothing is sent anywhere.

- **XP per match**: 20 for playing + survival (8 per minute, up to 15 min) + placement (0-100, linear from last to first) + 30 per kill + 10 per headshot kill + 1 per 20 damage dealt (max 60) + 150 for a win. Capped at 1500. The end screen lists every part.
- **Levels**: level 1 to 50; going from level L to L+1 costs `120 + 40 * (L - 1)` XP, so a normal match is roughly one level early on and one level every few matches later. **Ranks** (cosmetic title): RECRUIT 1, PRIVATE 5, CORPORAL 10, SERGEANT 15, LIEUTENANT 20, CAPTAIN 30, MAJOR 40, COLONEL 50.
- **Weapon skins unlock by level** (carbon 2, damascus 4, gold 7, magma 10, reactive 14). Locked chips show `LV n`. Skins are cosmetic only; operators, guns and abilities are never gated. The `?skin=` URL override still works for testing.
- **Career stats**: matches, wins, top-5 finishes, kills, deaths, K/D, headshot kills, damage, time played, best placement, best kills in a match, kills per weapon (favourite weapon), explosion kills, vehicle kills, last 10 matches.
- **14 badges** (FIRST BLOOD, HUNTER, WARLORD, HEADHUNTER, DEADEYE, SURVIVOR, VETERAN, WINNER, CHAMPION, CONTENDER, BRAWLER, DEMOLITION, ROADKILL, ENDURANCE). They are computed from the lifetime stats, so nothing extra is stored and they can be re-balanced later.
- **How stats are collected**: `MatchTracker` listens to the same sim events solo and online (`hit`, `kill`), counting only the local player's hits and kills (self damage and suicides are ignored). The `end` event (placement, kills, time, won) closes the match once (`G.recorded`), `recordMatch` returns the new profile plus a `gain` report (XP parts, level-up, new badges, new skins), the profile is saved and the cards redraw. Quitting mid-match records nothing.
- **Safety**: every field is validated on load (`sanitizeProfile`): numbers are clamped, wins cannot exceed matches, weapon keys must look like `[a-z0-9_-]{1,16}` (no prototype keys, max 16), history keeps 10 entries, storage errors (private mode, quota) never break the game. RESET PROFILE needs a second click.
- **Honest limits**: the save is client-trusted, which is fine for cosmetics. Anything with real value (leaderboards, a shop, ranked) needs server-side accounts with server-signed results. Cross-device sync, account linking and weapon mastery tiers are still to do.

## Stage 14: the parachute drop-in

The rules live in `src/sim/drop.js` (graphics-free and deterministic, so the browser's solo game, the server and the client predictor agree). Off in unit tests, on in the real game.

- **The plane** flies one straight line across the map (seeded direction, up to 25 m off-centre, 230 m up, 18 m/s, about 14 s over the map). Its position is a pure function of the seed and how long a fighter has been aboard (`f.airT`), so nothing but the fighter's own state is synced. Server, solo game and predictor all build the same plane from `makePlane(seed)`.
- **Four air states** (`f.air`): 0 on foot, 1 in the plane, 2 free fall, 3 parachute. **Space** jumps; a player who never jumps is thrown out 20 m inside the far edge (`Te`), so nobody is carried off the map. **W** dives (26 m/s horizontal), no input drifts (9 m/s). A second **Space** opens the canopy early (not in the first 0.8 s); it opens by itself below 60 m. Under the canopy you steer at 11 m/s and sink at 6.5 m/s, well under the 12 m/s fall-damage threshold, so a normal landing is harmless.
- **Rules while airborne**: cannot be hurt (`damage()` ignores `target.air`), cannot shoot or loot, bots do not target you and contracts ignore you. Air movement uses the same character controller but ignores other fighters' bodies (stacked fighters in the plane used to shove each other and desync the predictor).
- **Zone**: the opening circle covers the whole square map in drop matches (`DROP_START_RADIUS` 165; the corners are 163 m from the centre), and the zone clock only starts at `zoneStart = plane.Te + 14 s`, once the last possible jumper has landed. The HUD timer counts down to that moment. (A browser test caught the original bug: landing near a corner hurt you before the zone had even started.)
- **Bots** pick a landing spot from their goal (loot, contract, hot zone), dive while far away, glide when near and steer onto it. Squad members jump right after their leader and land together.
- **Network**: `exportSelf/importSelf` carry `air`, `airT` and the air velocity; other players' state rides two spare bits of the fighter flags (`FF.airShift` = 9, bits 9-10), so snapshots did not grow. The `welcome` message says `drop: true` and the predictor builds the same plane. `DROP=0` on the server (or `createServer({ drop: false })`) turns it off. `NetSim.planeT()` is the server clock the plane model follows.
- **Client**: `src/render/plane-view.js` (low-poly transport plane), a striped canopy and a belly-down free-fall pose on `FighterView`, a wider field of view in free fall, wind / chute / thud sounds, an `#air` prompt (PRESS SPACE TO JUMP with the exit countdown, FREE FALL altitude, PARACHUTE altitude) and the plane's flight line plus marker on the minimap.
- **URL switches**: `?drop=0` skips the drop (handy for testing), `?drop=1` forces it. Automated browsers (`navigator.webdriver`) default to **no drop** so the older browser scripts keep working; the drop has its own two (`e2e-drop.mjs`, `e2e-online-drop.mjs`).
- **Found while building it**: a lethal fall crashed the physics ("unreachable" inside Rapier) because `_kill` removes the rigid body and the movement code touched it afterwards; both movement paths now stop as soon as the fighter dies, with a regression test.

## What to look at next (open items)

1. **Put the server on a VPS** and play a real match with a friend on another network (`docs/DEPLOY.md`). Everything so far was tested on one machine with fake lag.
2. **Load test** with 16 real humans, and measure network bytes per player.
3. Roadmap milestone 2: one real handcrafted arena, real weapon models and sounds from CC0 packs (`ASSETS.md`). (Loot, health, armor: Stage 8. Abilities, crouch, fall damage: Stage 9.)
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
