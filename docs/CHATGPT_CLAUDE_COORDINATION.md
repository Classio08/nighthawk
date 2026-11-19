# NIGHTHAWK — Shared Claude / ChatGPT coordination note

**Updated:** 19 November 2026  
**Verified base:** `main` at `e8c54cdcd5fb6c182efa9325677f870d38d230bb`  
**Purpose:** shared handoff for parallel contributors. Read this alongside `CLAUDE.md`, `docs/PROJECT_DIRECTION_AND_CHAT_NOTES.md`, `docs/ROADMAP.md` and `docs/MASTER_SYSTEMS.md`.

This file is the durable bridge between the owner's parallel AI sessions. It records the verified baseline, current work ownership, decisions and next actions. It does not authorize merging or overwriting another contributor's branch.

## 1. Verified current baseline — code wins over chat snippets

At the verified base, the game already has:
- Main start/menu screen, operator dropdown, operator role/ability summary, guest profile card, weapon-skin selector and settings.
- Offline 16-fighter battle royale and Colyseus online matches with server-authoritative simulation, client prediction/reconciliation, remote interpolation, lag-compensated hits and reconnect handling.
- Eight selectable operators and eight server-validated active abilities.
- Utility-scored bots, personalities, squad radio/coordination, cover reactions, A* navigation, difficulty tiers and outpost guards.
- First-/third-person presentation toggle on `V`; this is implemented in `src/main.js` and `src/render/camera.js`, not merely a future design.
- Six weapons, tactical/empty reload phases, dropped-mag visuals, skins, grenades, smoke grenades, melee, ragdolls, decals, particles, contracts, airdrops, loot, armor/medkits, mortar strikes, weather/night, buggies, bikes and parachute insertion.
- Kavari Basin greybox with named locations and DUST LANTERN offline rescue/recovery/extraction mission plus an evidence-based alert ladder.
- 216 unit tests documented, server integration test, smoke test, build, 17 browser E2E scripts and the CI workflow.

Still not production-complete:
- Character visuals are still block-built; realistic rigged operator models and a polished animation pipeline are missing.
- Kavari Basin remains a greybox; integrated production PBR material set and art pass are missing.
- Mobile virtual controls and a tested controller layer were not in main at the verified base.
- Profiles are local guest profiles; secure accounts, server-backed progression/inventory/mission ledger and cross-device persistence are missing.
- DUST LANTERN is offline-only until mission state has a versioned server snapshot and server-side interaction validation.
- No production VPS friend test, regional latency validation, soak test or multi-room production load test was verified.

The current public main branch's latest CI run at the time of this handoff completed successfully. This is not proof of external-network, real-device or production readiness.

## 2. Current parallel ownership

### ChatGPT workstream
Branch: `feature/mobile-touch-controls`  
Scope: mobile-native virtual joystick, right-side touch-look surface, action buttons and touch-to-existing-input adapter. It deliberately reuses `src/input/input.js` and the existing command pipeline; it does not create a second player, simulation, physics loop or network layer.

The design provides:
- Native Pointer Events, not a new dependency or a second input library.
- Multi-pointer tracking so move/look/fire/ADS/buttons can be used concurrently.
- Two-thumb and four-finger presets, opacity control, a compact secondary-action drawer, and weapon cycling buttons.
- A pause button, release-on-blur/visibility handling and a `?touch=1` / `?touch=0` override for testing.
- Tests for stick normalization, detection, shared movement, action edges and release behaviour.

Status is **implementation in a draft branch; CI and actual device testing still required**. Do not describe it as validated on iOS/Android until it is tested on those devices.

### Claude / owner workstream
Keep the visual vertical slice, NPC/faction intelligence, missions, and production deployment validation on separately named branches. Before editing, check the latest main SHA and the open PR list. Do not rewrite the mobile-controls branch or any other contributor branch.

## 3. Reconcile the new AI material before using it

The uploaded AI outputs contain useful concepts and several unintegrated code proposals. The actual main-branch tree did not contain proposed files such as `src/ui/boot.js`, `src/ui/forge.js`, `src/features/bases.js`, `src/services/economy.js`, `src/vfx/effects.js`, `src/physics/physics_worker.js`, `src/sim/bot_brain.js` or `src/net/snapshot-budget.js` at the verified base. Treat them as proposals, not already committed features.

**Do not paste the proposed replacement `src/main.js`.** It creates a placeholder scene/player and a separate gameplay loop and does not connect to the existing `Simulation`, `NetSim`, world renderer or authoritative Colyseus flow. Integrate by small adapters into the real architecture.

**Do not add a second simulation or a parallel network service.** `src/sim/world.js` is shared by offline and authoritative server play. `src/net/protocol.js`, `src/net/netsim.js` and `server/src/MatchRoom.js` already own the current networking path.

**Do not add the proposed generic JSON snapshot-budget stripper as-is.** Current snapshots are compact packed arrays/objects sent through Colyseus/MessagePack and now use measured WebSocket per-message compression. Dropping fields such as event or smoke state without protocol design can silently break gameplay. Measure bytes and update the real packer/versioned protocol instead.

**Do not add a duplicate melee system.** Melee is already implemented in the shared simulation and covered by tests.

**Do not add `nipplejs` just to get a joystick.** Pointer Events cover the core requirements without an extra dependency; keep this decision only if later device testing reveals a concrete missing capability.

**Do not copy GTA / Vice City data.** The browser ports work by compiling a compatible engine to WebAssembly and streaming a legally owned local game install into the browser. Their page/streaming architecture is worth studying; the game assets, maps, models, music and upstream engine terms are not a NIGHTHAWK asset licence.

## 4. Priority decisions

### P0 — production truth, security and latency
1. Deploy one staging server in a region appropriate for Southern African players and run friends on genuinely separate connections.
2. Record RTT, jitter, packet loss, client frame-time p50/p95/p99, server tick p50/p95/p99, room CPU/RSS, reconnect success and packet rates at 2/8/16 real clients.
3. Add a second-region comparison only after the baseline. A bigger server in the wrong region does not solve distance-driven latency.
4. Keep client-prediction and lag-compensation changes incremental. Audit the hand-rolled code against Colyseus 0.18 first-party primitives, starting with rewind/lag compensation and a moving-target test; do not rewrite the whole netcode while the current system passes local tests.
5. Audit the public repository's commit history, actions, workflow logs and deployment configuration for secrets. Changing the GitHub visibility back to private does not retract clones, forks, cached copies or secrets already exposed; rotate anything that may have been committed.

### P1 — mobile usability
Finish the mobile-control branch and require:
- iOS Safari and Android Chrome checks in landscape on real devices.
- Movement, camera look, fire, ADS, jump, sprint, crouch, reload, ability, interact, grenade, smoke, melee, heal, weapon cycle and FPP/TPP all tested.
- No stuck inputs after pointer cancellation, tab switching, screen rotation, browser interruption or pause/resume.
- Control opacity/scale/layout preferences, safe-area spacing, large touch targets and a beginner-friendly default; keep extra actions tucked away so the HUD is not overwhelming.
- Compare two-thumb and four-finger play. Add full drag-to-place HUD customization only after the fixed presets are stable.

### P2 — living faction AI
Extend the existing utility/personality/squad systems rather than introducing a disconnected `bot_brain`:
- Witnesses, body discovery, last-known-position reports, suspicion and search areas.
- Delayed radio messages with source, timestamp, uncertainty and confidence.
- Different factions with patrol schedules, orders, morale, fear, loyalty, rivalries and retreat/surrender choices.
- Civilians and animals with believable flee/hide/investigate responses, not just decorative spawns.
- Seeded scenario tests for false alarms, missed detections, search coverage, fairness and CPU cost.
- LLMs may help with constrained dialogue or slow planning only; no LLM controls aim, hit detection, movement, damage, physics or rewards.

### P3 — one excellent art/animation slice
Before expanding the whole world, finish one operator, one weapon and one environment pocket:
- One shared humanoid GLB rig and a small set of retargetable locomotion/combat/reload animations.
- Separate gameplay hit capsules and physics from rendered skeletons.
- One licensed 1K PBR surface set integrated with correct colour spaces, mipmaps and normal orientation.
- Low/medium/high LODs, simple collision meshes and missing-asset fallback.
- Benchmark on integrated graphics and a mid-range Android device before expanding the asset set.

### P4 — missions and game identity
Build distinct modes on the existing simulation:
- Co-op Operations and PvPvE extraction contracts.
- Bounty/HVT, rescue/recovery, convoy escort/intercept, reconnaissance, evidence recovery, relay/power sabotage and multi-stage campaigns.
- A dedicated **Black Site / Double Agent** social-tactical mode inspired by social deduction: hidden roles, limited sabotage, evidence trails, repair/counterplay and short discussion/report windows. Do not randomly inject impostors into ordinary battle royale; deduction depends on understandable rules, trustworthy evidence and a balanced role distribution.
- Keep the Southern African fictional identity: invented factions, languages, locations, insignia and histories; global expansion can introduce other fictional regions later.

### P5 — accounts, persistent servers and property
Build identity and secure persistence before selling or trading valuable items:
1. Optional sign-in/account linking after guest play; server-side profiles and recoverable sessions.
2. Server ledger for XP, inventory, mission outcomes, currency, purchases and refunds.
3. Instanced/rented squad safehouses as a limited prototype.
4. Persistent community servers, server browser, owned bases and raid windows only after durable storage, moderation, anti-cheat, backups, region operations and offline protection are designed.
5. Player-created characters should be cosmetic modular customization first; player-created powers/abilities/weapons need strict balance and server validation. Do not sell combat superiority.

### P6 — monetisation and wallets
- Establish the distribution route (own site vs game portals) before integrating monetisation; their SDK/purchase rules differ.
- Start with direct-purchase cosmetics, optional earned soft currency and a transparent server-side ledger. Do not launch loot boxes or paid gameplay advantages.
- Optional wallet connection could later prove ownership of an external cosmetic using signed nonce challenges. Never request seed phrases or hold player keys.
- No crypto staking, wagers, pooled pots, token rewards, cash-out or player-versus-player prize pools without written legal advice and required licensing in Namibia and each target market.

## 5. Research patterns worth adopting

- **Colyseus 0.18:** first-party input buffering, fixed timestep and rewind/lag-compensation APIs are available as incremental alternatives to hand-rolled components. Audit and test before migrating; docs: https://docs.colyseus.io/migrating/0.18 and https://docs.colyseus.io/netcode.
- **Vice City in a browser:** the current `wasm-revc` example uses a WebAssembly port, WebGL2, on-demand access to a user's own installed files, IndexedDB saves and SharedArrayBuffer under a secure cross-origin-isolated context. Its own README says game logic retains upstream reVC terms and the repository distributes no game data. Study asset streaming/caching and the browser shell, not game content: https://github.com/origami-ltd/wasm-revc.
- **Three.js / Rapier playground:** `ryanfitzpatrickio/threejs-playground` is MIT and useful as a reference for procedural worlds, vehicles and rendering experiments; it explicitly describes itself as a prototype workspace, not a drop-in engine: https://github.com/ryanfitzpatrickio/threejs-playground.
- **Navigation:** `recast-navigation-js` is MIT. Consider it only when Kavari geometry stabilises and current A* navigation proves insufficient: https://github.com/isaac-mason/recast-navigation-js.
- **Performance culture:** Tencent's Delta Force / Metaperf conference material is a reminder to attribute frame-time costs on actual device classes and large session samples. NIGHTHAWK should optimise from recorded p95/p99 stalls and server tick costs, not claims of 60 FPS: https://www.gdcvault.com/play/1036028/Metaperf-Industrializing-Performance-Optimization-for.
- **Portal monetisation differs:** Poki's official documentation describes midroll and optional rewarded ads through the Poki SDK, with no IAP or third-party ad vendors. Do not assume one portal's revenue model applies everywhere: https://developers.poki.com/guide/how-monetization-works.
- **Player feedback (community discussions, not representative surveys):** PUBG Mobile players repeatedly ask to move/resize/hide controls, report accidental touches and overlapping action buttons, and prefer different thumb/claw layouts and opacity levels (examples: https://www.reddit.com/r/PUBGMobile/comments/1uusa1k/ and https://www.reddit.com/r/PUBGMobile/comments/1wi04m6/). The current branch starts with two presets and opacity; full drag-to-place should follow real device testing. Among Us players describe over-saturated roles and inconsistent public-lobby rules as damaging deduction (https://www.reddit.com/r/AmongUs/comments/1vx5eju/); make the first social-tactical mode legible and curated, not role-heavy. DayZ players describe cheaters attacking even low-population official bases and recommend well-administered community servers (https://www.reddit.com/r/dayz/comments/1xt5tqq/); persistent bases therefore require active moderation, server logs, reports and enforceable rules before launch. Delta Force players also reported mobile lag, freezes, crashes and matchmaking issues in November 2026 (https://www.reddit.com/r/DeltaForceGlobal/comments/1xnpirp/); do not add visual effects or complex matchmaking until device and network telemetry show headroom.

## 6. Open branch / handoff hygiene

- ChatGPT's touch-control work is on `feature/mobile-touch-controls` and must remain a draft until CI and real-device checks pass.
- DUST LANTERN alert-director changes are already present on main through Claude's merge commit. A stale draft PR #22 still appears open against the old mission branch; reconcile its state after confirming it adds no unique commits. Do not merge it blindly or close it without checking.
- The latest roadmap and engineering log are the source of truth for built/not-built status. Update them whenever a system really lands on main.
- Every contributor reports exact branch, base SHA, commits, changed files, CI result, test environment and unverified limitations.

## 7. Working agreements

1. Work on separate feature branches; no force-push, no merging and no edits to another agent's active branch without the owner's explicit instruction.
2. Never copy another game's art, source code or assets without a compatible licence. Study mechanics and architecture; build original NIGHTHAWK content.
3. Keep the first playable path fast and guest-accessible. Stream optional content; do not put a huge map, LLM, wallet or cosmetics marketplace in the critical load path.
4. Use seeded deterministic tests for simulation and AI; client visuals may be cosmetic, but valuable state and match outcomes stay server-authoritative.
5. Prefer the smallest playable vertical slice over a feature dump.
