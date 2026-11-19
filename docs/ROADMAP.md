# Roadmap

Rule: every milestone ends with something you can open in a browser and play. The statuses below are based on the current `main` branch history as checked 18 November 2026. "Built" means code exists; it does not mean production deployment, load testing or external playtesting is complete.

## Current verified baseline

| Area | Status | Evidence / limitation |
|---|---|---|
| Offline BR simulation | Built | 16-fighter simulation, six weapons, bots, zone, ragdolls, HUD |
| Online multiplayer | Built locally | Colyseus authoritative room, prediction/reconciliation, interpolation, lag-compensated hits; real VPS/friend test pending |
| Bot AI | Built first pass | Utility scoring, personalities, squads, radio, flanking and outpost guards |
| Weapon feel | Built first pass | Tactical/empty reload, dropped-mag visuals, five shader skins |
| Destruction | Built first pass | Crates/props, explosive barrels, chain reactions |
| Match events | Built first pass | Contracts, airdrops, hardpoint, bounty, mortar, weather/night/fog/rain |
| Character visuals | Design only | Five likeness references documented; renderer still uses block-built fighters |
| Environment art | Prototype only | Procedural sand canvas + Lambert world materials; no selected PBR set integrated |
| FPP/TPP | Prototype built | V toggles first/third person (collision-safe boom camera); vehicle chase camera takes over while driving; online fairness tests still to do (camera never changes aim origin or hit rules) |
| Profiles/progression | Guest profile built | XP, levels 1-50, ranks, career stats, 14 badges, skins unlocked by level, saved in the browser; no accounts, cross-device sync or server-signed results yet |
| Drop-in | Built first pass | Everyone starts in a transport plane; Space to jump, free fall, parachute, bots pick landing spots, zone waits for the landing; works solo and online (prediction + server-validated) |
| Vehicles | Built first pass | Buggies + bikes, E to enter, roadkill, bots drive, server-authoritative with prediction; unit, netcode and browser tests |
| Loot and inventory | Built first pass | Guns, ammo, armor LV1-3, medkits, death drops, airdrop crates, hot-zone loot at named places; server-authoritative pickups |
| Map | Greybox | Kavari Basin: Basin Yard, Dry River, Relay Ridge, Forward Outpost, Extraction Pad with minimap labels; still blocks, no real art |
| Operators | Abilities built | Eight operators selectable; all eight active abilities (Q) work, server-validated, bots use them; art and passives still to do |
| Bots | Navigation + difficulty built | A* routes round buildings, four difficulty levels (easy/normal/hard/brutal); smoke grenades and a training range still to do |
| Server safety | Hardened | Rate limits, kicks, payload and room caps, reconnect window, health + metrics; still to do: load test with real players, per-IP limits in the proxy, rejoin after a page refresh |
| Settings | Built | Sensitivity, FOV, volume, graphics, difficulty, key rebinding, saved in the browser; accessibility options still to do |
| Movement | Crouch + fall damage built | C crouch, fall damage; slide, mantle/vault and melee still to do |
| Chat/voice | Not implemented | Own-site only after moderation; portal builds may prohibit it |
| Monetisation | Not implemented | Platform adapters and policy review required |
| Production deployment | Pending | Deploy and test with players on separate networks; load tests outstanding |

## Built so far (milestones 0 to 1.5 plus stages 2-8 of `MASTER_SYSTEMS.md`)

| # | Milestone | Done when | Status |
|---|---|---|---|
| 0 | **Tech proof** | Move, jump, shoot, grenades, physics crates, AI bots, tests, build | DONE |
| 0.5 | **Multiplayer spike** | Colyseus 0.18 server runs Rapier; two fake clients join, move, get blocked by a wall, and shoot each other with server-validated hits | DONE (replaced by Milestone 1) |
| 0.7 | **Battle-royale core (offline)** | Rules split into a graphics-free `Simulation` (`src/sim/`); 6 data-driven weapons with recoil / ADS / reload; bots with line-of-sight, hearing, cover, grenades; shrinking zone; win/lose + play again; zzfx sounds, blood/spark particles, bullet holes, ragdoll deaths, screen shake, HUD + minimap; 25 tests + 22-step browser test | DONE |
| 1 | **Two tabs, one match** | Server-authoritative Colyseus room runs the real `Simulation`; browser prediction + reconciliation, interpolation, lag-compensated capsule hits, lobby with bots filling slots, leaver replaced by a bot, Dockerfile + `DEPLOY.md`. Tested with a real server and two real browsers. **Still to do: deploy to a VPS and test with a friend on another network** | DONE (code) / deploy pending |
| 1.5 | **Systems wave (Master Prompt)** | Utility AI + personalities + squads + garrison guards; tactical/empty reloads, dropped mags, GLSL weapon skins; destructible cover + explosive barrels; contracts (airdrop / hardpoint / bounty / two-stage relay uplink), mortar killstreak, weather + night, gore toggle; arcade buggy + bike with roadkill and bots that drive; loot on the ground (guns, ammo, armor, medkits, grenades), death drops, airdrop crates, bots that loot and heal. 91 unit tests, server test, 8 browser checks. Details: `MASTER_SYSTEMS.md` | DONE |

## Next milestones

| # | Milestone | Done when | Status |
|---|---|---|---|
| 7 | **Production multiplayer validation** | Deploy server to a test VPS; friend joins from another network; reconnect, packet loss, jitter, 2/8/16 clients and many-room tests documented | NEXT (needs you: a VPS) |
| 8 | **Operator abilities + movement polish** | Eight active abilities (server-validated, cooldown HUD, bots use them), crouch, fall damage DONE (Stage 9); slide, mantle/vault, melee and accessibility controls still open | IN PROGRESS |
| 9 | **First real visual slice** | One CC0 PBR ground set integrated; one modular environment kit; one realistic GLB operator with shared rig, LODs and animation; browser performance measured | NEXT (needs asset downloads) |
| 10 | **One complete map** | Kavari Basin vertical slice with three routes per POI, cover, navmesh/AI, story props, weather presets and a working extraction point | PLANNED (greybox exists) |
| 11 | **Mission modes** | Extraction contracts and a short Black Site social-deduction PvPvE mode with evidence, sabotage, counterplay and replayable objectives | PLANNED |
| 12 | **Profiles and progression** | Guest-first profile, local save, settings menu, optional account linking, XP, weapon mastery and cosmetics; privacy policy and migration tests | Guest profile + settings DONE (Stages 11, 13); account linking, weapon mastery, privacy policy still open |
| 13 | **Replay and creator tools** | Short replay buffer, kill snapshot export, streamer mode, custom lobby links, consent-based sharing | PLANNED |
| 14 | **Platform readiness** | Low-end performance pass, mobile touch UI, portal-specific builds/SDK adapters, policy and privacy review | PLANNED |
| 15 | **Monetisation** | Cosmetics-only store/battle pass after retention evidence; platform-specific ads/IAP compliance; no pay-to-win | PLANNED |
| 16 | **Expansion** | Extra maps, named boss events, wildlife, advanced gadgets, mobile/desktop builds and optional Web3 research only after core metrics justify them | LATER |

## Quality gates

- Preserve server authority for all gameplay outcomes.
- Run unit tests, server tests, browser E2E and build after each gameplay stage.
- Measure real FPS, load time, memory, RTT, jitter and packet loss on target hardware.
- Every external asset must be logged in `ASSETS.md` with its exact licence.
- Do not merge a feature just because it compiles; playtest it.
- Keep the first-frame download small and load map/character assets on demand.

See `MASTER_SYSTEMS.md` for the complete product architecture and `ASSET_CATALOG.md` for candidate material sources.
