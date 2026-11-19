# Roadmap

Rule: every milestone ends with something you can open in a browser and play. Status is based on `main` commit `27e84f29` (19 November 2026). "Built" means code exists and has automated coverage; it does not mean production deployment, load testing or external playtesting is complete.

## Current verified baseline

| Area | Status | Evidence / limitation |
|---|---|---|
| Offline battle royale | Built | 16-fighter simulation, six weapons, bots, zone, ragdolls, HUD |
| Online multiplayer | Built locally | Colyseus authoritative room, 60 Hz simulation, 20 Hz snapshots, prediction/reconciliation, interpolation, lag-compensated hits |
| Bot AI | Built first pass | Utility scoring, personalities, squads, radio, cover response, A* navigation, four difficulty levels |
| Contracts | Built first pass | Airdrop, hardpoint, bounty and two-stage relay uplink; relay mobilises existing garrison |
| Destruction | Built first pass | Destructible crates, explosive barrels and chain reactions |
| Vehicles | Built first pass | Arcade buggies and bikes; not yet realistic wheel/suspension simulation |
| Loot/inventory | Built first pass | Ground weapons, ammo, armour, medkits, grenades, death drops and airdrop crates |
| Operators | Gameplay built | Eight selectable operators and server-validated active abilities |
| Movement | First pass | Sprint, crouch, jump and fall damage; slide, vault/mantle and melee remain open |
| FPP/TPP | Prototype built | Camera toggle and collision-aware third-person camera; needs broad fairness/playtesting |
| World/map | Greybox | Kavari Basin landmarks; renderer still needs realistic GLB/PBR asset integration |
| Character visuals | Design only | Five likeness references documented; current fighter renderer remains procedural/block-built |
| Atmosphere | First pass | Weather, night, fog, rain and storm |
| Settings | Built | Sensitivity, FOV, volume, graphics, difficulty and key rebinding saved locally |
| Server safety | Hardened first pass | Rate limits, kicks, payload/room caps, reconnect window, health and metrics endpoints |
| Automated quality | Built | 150 unit tests, smoke checks, server netcode tests and production build in `npm run check`; CI workflow merged |
| Persistent accounts/progression | Not implemented | No cross-device account, profile, mission ledger or server-backed economy |
| Full mission campaign | Not implemented | Contract building blocks exist; no objective-graph mission director yet |
| AI long-term memory | Not implemented | Current AI is tactical/utility based; no persistent faction intelligence model |
| Audio/haptics | First pass | ZzFX and gameplay cues exist; full spatial audio and controller/mobile haptics remain open |
| Production deployment | Pending | VPS, friend test, real-world latency and load tests outstanding |
| Monetisation / wallet | Not implemented | Compliance, identity, economy and payment-provider review required before launch |

## Completed engineering stages

- **Stages 0–8:** playable BR foundation, multiplayer, utility AI, weapon handling/skins, destruction, contracts, vehicles and loot.
- **Stage 9:** eight operator abilities, crouch, fall damage and related netcode.
- **Stages 10–11:** A* bot navigation, difficulty settings and key rebinding.
- **Stage 12:** server hardening, rate limits, room/payload caps, reconnect handling, health and metrics.
- **Mission objective extension:** two-stage relay uplink; secure the relay alone, then hold it alone for upload. Existing garrison guards redeploy without spawning extra fighters.
- **CI:** GitHub Actions runs `npm ci` and `npm run check`.

See `docs/MASTER_SYSTEMS.md` for the detailed engineering map and tests.

## Next milestones — updated direction

| Priority | Milestone | Deliverable | Gate |
|---|---|---|---|
| P0 | Production multiplayer validation | Deploy test server; friend joins from another network; test 2/8/16 clients, reconnect, jitter and packet loss | Measurements and incident notes, not just "it works" |
| P1 | **Tactical mission foundation** | Data-driven objective graph and one complete 5–8 minute rescue/recovery/extraction mission | Server-authoritative objectives, seeded tests, playable browser build |
| P2 | Living faction response | Patrol schedules, suspicion, witness reports, search, reinforcements, withdrawal and scoped memory | NPC knowledge is evidence-based and fair; deterministic scenario suite |
| P3 | Combat/movement feel | Input buffering, acceleration, slide/vault prototype, weapon animation state machine, spatial sound and haptics | Before/after responsiveness and performance measurements |
| P4 | Visual vertical slice | One realistic operator, weapon, modular building kit and Southern African PBR environment | LODs, collision review, asset licences and minimum-device benchmark |
| P5 | Identity/progression | Guest-first profile, optional sign-in, server XP/inventory/mission ledger, account linking and recovery | Security/privacy review and migration tests |
| P6 | Operations/social | Extraction/co-op matchmaking, parties, mission rotation, reporting/moderation and replay tools | Abuse controls and real-player playtest |
| P7 | Fair economy | Direct-purchase cosmetics, earnable soft currency and auditable server ledger | No pay-to-win; payment-provider and regional policy approval |
| P8 | Optional wallet proof | Wallet-linked cosmetic ownership proof only | Legal, privacy, platform and security review; never ask for seed phrases |
| Later | Wagering / token prizes | Not scheduled or approved | No implementation without written legal advice, licensing analysis and region-specific compliance |

## Performance and release gates

- Preserve server authority for position, damage, inventory, objectives, rewards and match results.
- Run unit tests, server tests, browser E2E and build after gameplay changes.
- Record frame-time p50/p95/p99, first playable time, draw calls, memory, input latency, RTT, jitter, packet loss and server tick cost.
- Profile named devices and exact commit SHAs before claiming optimisation.
- Keep the initial load small; stream optional maps, operators, skins and audio.
- Record every external asset and its licence in `ASSETS.md`.
- Do not add real-money betting, crypto wagering or cash-out as a shortcut to monetisation.

See `docs/EXPANSION_ARCHITECTURE.md` for the research-backed product, AI, physics, rendering, audio, UX, account, economy and delivery architecture.
