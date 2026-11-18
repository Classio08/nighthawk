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
| FPP/TPP | Not implemented | Current first-person view; third-person requires a rig and fair camera rules |
| Profiles/progression | Not implemented | No persistent cross-device player account system verified |
| Vehicles | Not implemented | Planned; physics and netcode require dedicated tests |
| Chat/voice | Not implemented | Own-site only after moderation; portal builds may prohibit it |
| Monetisation | Not implemented | Platform adapters and policy review required |
| Production deployment | Pending | Deploy and test with players on separate networks; load tests outstanding |

## Next milestones

| # | Milestone | Done when | Status |
|---|---|---|---|
| 7 | **Production multiplayer validation** | Deploy server to a test VPS; friend joins from another network; reconnect, packet loss, jitter, 2/8/16 clients and many-room tests documented | NEXT |
| 8 | **First real visual slice** | One CC0 PBR ground set integrated; one modular environment kit; one realistic GLB operator with shared rig, LODs and animation; browser performance measured | NEXT |
| 9 | **FPP + TPP** | V toggle, collision-safe shoulder camera, camera/aim alignment, online fairness and vehicle camera tests | PLANNED |
| 10 | **Movement and combat polish** | Correct camera-relative movement, slide/mantle prototype, melee, fall damage, aim/recoil practice range; accessibility controls | PLANNED |
| 11 | **One complete map** | Sector 09 vertical slice with three routes per POI, cover, navmesh/AI, story props, weather presets and extraction point | PLANNED |
| 12 | **Operators and customisation** | Eight visual designs; shared rig; passive + tactical abilities; cosmetic-only loadout builder; balanced online validation | PLANNED |
| 13 | **Mission modes** | Extraction contracts and a short Black Site social-deduction PvPvE mode with evidence, sabotage, counterplay and replayable objectives | PLANNED |
| 14 | **Profiles and progression** | Guest-first profile, local save, optional account linking, XP, weapon mastery and cosmetics; privacy policy and migration tests | PLANNED |
| 15 | **Replay and creator tools** | Short replay buffer, kill snapshot export, streamer mode, custom lobby links, consent-based sharing | PLANNED |
| 16 | **Platform readiness** | Low-end performance pass, mobile touch UI, portal-specific builds/SDK adapters, policy and privacy review | PLANNED |
| 17 | **Monetisation** | Cosmetics-only store/battle pass after retention evidence; platform-specific ads/IAP compliance; no pay-to-win | PLANNED |
| 18 | **Expansion** | Vehicles, extra maps, named boss events, wildlife, advanced gadgets and optional Web3 research only after core metrics justify them | LATER |

## Quality gates

- Preserve server authority for all gameplay outcomes.
- Run unit tests, server tests, browser E2E and build after each gameplay stage.
- Measure real FPS, load time, memory, RTT, jitter and packet loss on target hardware.
- Every external asset must be logged in `ASSETS.md` with its exact licence.
- Do not merge a feature just because it compiles; playtest it.
- Keep the first-frame download small and load map/character assets on demand.

See `MASTER_SYSTEMS.md` for the complete product architecture and `ASSET_CATALOG.md` for candidate material sources.
