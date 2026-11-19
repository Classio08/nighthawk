# Roadmap

Rule: every milestone ends with something you can open in a browser and play. Status is based on `main` commit `27e84f29` (19 November 2026). "Built" means code exists and has automated coverage; it does not mean production deployment, load testing or external playtesting is complete.

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
| Missions | First offline operation built | Operation DUST LANTERN: seeded rescue/recovery/extraction with clues, escort, alert ladder and debrief (offline only; online mission state needs a versioned snapshot and server validation first) |
| Automated quality | Built | 196 unit tests, smoke checks, server netcode test (retried up to 3x, it is timing-sensitive), 15 browser scripts, production build in `npm run check`; CI workflow merged |
| Persistent accounts/progression | Not implemented | Guest profile is local only; no cross-device account, mission ledger or server-backed economy |
| AI long-term memory | Not implemented | Current AI is tactical/utility based plus a mission alert director; no persistent faction intelligence model |
| Audio/haptics | First pass | ZzFX and gameplay cues exist; full spatial audio and controller/mobile haptics remain open |

## Completed engineering stages

- **Stages 0–8:** playable BR foundation, multiplayer, utility AI, weapon handling/skins, destruction, contracts, vehicles and loot.
- **Stage 9:** eight operator abilities, crouch, fall damage and related netcode.
- **Stages 10–11:** A* bot navigation, difficulty settings and key rebinding.
- **Stage 12:** server hardening, rate limits, room/payload caps, reconnect handling, health and metrics.
- **Stage 13:** guest profile (XP, levels, ranks, stats, badges, skin unlocks).
- **Stage 14:** parachute drop-in (plane, free fall, parachute; solo and online).
- **Operation DUST LANTERN** (ChatGPT, merged and browser-tested): offline rescue mission with an alert director.
- **Frame-time telemetry:** `window.__nhPerf()` gives rolling p50/p95/p99.
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
