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
| Server safety | Hardened | Rate limits, kicks, payload and room caps, reconnect window, health + metrics; still to do: soak test and a load test with real players, per-IP limits in the proxy, rejoin after a page refresh |
| Settings | Built | Sensitivity, FOV, volume, graphics, difficulty, key rebinding, saved in the browser; accessibility options still to do |
| Movement | Crouch, fall damage, slide, mantle and melee built | C crouch; sprint then C slides (cooldown, bleeds into a crouch walk); jump at a 0.15-0.7 m ledge mantles you up; fall damage; B melee. Predicted on the client, sent in snapshots; first-person view motion (bob, landing dip, slide tilt) with an accessibility switch. Feel and sounds not tuned by ear; prone, wall-run not planned |
| Chat/voice | Not implemented | Own-site only after moderation; portal builds may prohibit it |
| Monetisation | Not implemented | Platform adapters and policy review required |
| Production deployment | Pending | Deploy and test with players on separate networks; localhost load test done (`npm run load`, `docs/DEPLOY.md` C3), VPS and real-network tests outstanding |
| Missions | Two offline operations built, one mission registry | DUST LANTERN (rescue/recovery/extraction) and SIGNAL BLACKOUT (three held relay tasks in any order, garrison response, 8-minute trace, extraction). `MISSIONS` registry + a common HUD/minimap/debrief surface, so a new operation is a class, a view and a button. Offline only; online mission state needs a versioned snapshot and server validation first |
| Automated quality | Built | 247 unit tests (incl. a source-level purity guard for `src/sim`), smoke checks, server netcode test (retried up to 3x, it is timing-sensitive), 20 browser scripts (incl. a draw-call budget check), production build in `npm run check`; CI workflow merged |
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
- **Stage 16:** smoke grenades (`X`; blocks line of sight for about 16 s, bots use them, solo and online).
- **Stage 17:** melee strike (`B`; a kill from behind, bots use it at point blank, solo and online).
- **Stage 18:** draw-call cut (measured 284-618 -> 160-234 per view with 16 fighters and loot; same look), suppression effect for near-miss bullets (client-only), `src/sim` purity guard test, `scripts/e2e-perf.mjs` budget check.
- **Operation DUST LANTERN** (ChatGPT, merged and browser-tested): offline rescue mission with an alert director.
- **Stage 22** (Claude, prototype): mission stealth layer: uniform disguise, VIPER hunter, extraction searchlights (`docs/STEALTH.md`). Sim unit-tested and checked in Chrome; feel, balance and visuals are not tuned.
- **Stage 19** (Claude): slide, ledge mantle and first-person view motion; mission registry and Operation SIGNAL BLACKOUT; end-of-match snapshot card. Details in `docs/MASTER_SYSTEMS.md` (Stage 19), `docs/MISSION_SIGNAL_BLACKOUT.md`, `docs/RESEARCH_NOTES.md`.
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
| P3 | Combat/movement feel | Slide and mantle are built (Stage 19). Still open: input buffering, acceleration curves, weapon animation state machine, spatial sound and haptics, tuning slide/vault/landing by ear on real devices | Before/after responsiveness and performance measurements |
| P4 | Visual vertical slice | One realistic operator, weapon, modular building kit and Southern African PBR environment | LODs, collision review, asset licences and minimum-device benchmark |
| P5 | Identity/progression | Guest-first profile, optional sign-in, server XP/inventory/mission ledger, account linking and recovery | Security/privacy review and migration tests |
| P6 | Operations/social | Extraction/co-op matchmaking, parties, mission rotation, reporting/moderation and replay tools | Abuse controls and real-player playtest |
| P7 | Fair economy | Direct-purchase cosmetics, earnable soft currency and auditable server ledger | No pay-to-win; payment-provider and regional policy approval |
| P8 | Wallet proof, NFT cosmetics, play-money earn and wagering | **Built behind the closed gate (19 Nov 2026), sandbox only**; real value NOT built | `docs/ECONOMY.md`: licence, settlement rail, KYC, audit; never ask for seed phrases |
| Later | Real-value wagering / token prizes | Rail not built; gate closed | Needs recorded licence, written legal advice, settlement rail, audit and region-specific compliance |

## Performance and release gates

- Preserve server authority for position, damage, inventory, objectives, rewards and match results.
- Run unit tests, server tests, browser E2E and build after gameplay changes.
- Record frame-time p50/p95/p99, first playable time, draw calls, memory, input latency, RTT, jitter, packet loss and server tick cost.
- Profile named devices and exact commit SHAs before claiming optimisation.
- Keep the initial load small; stream optional maps, operators, skins and audio.
- Record every external asset and its licence in `ASSETS.md`.
- Do not switch the economy gate to live, or add real-money betting, crypto wagering or cash-out, without a licence recorded by the owner (`docs/ECONOMY.md`).

See `docs/EXPANSION_ARCHITECTURE.md` for the research-backed product, AI, physics, rendering, audio, UX, account, economy and delivery architecture.
