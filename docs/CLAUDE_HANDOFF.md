# Claude Code Handoff — NIGHTHAWK next sprint

Use this after pulling the latest `main`. The owner is running Claude Code in the same repository, so keep changes on a new feature branch and never overwrite another agent's branch.

## Owner-approved direction
- Realistic art direction; redesign, not low-poly.
- Fictional African-inspired special-operations unit; modern equipment.
- Support FPP and TPP.
- Five likeness references are approved as design inputs: Roms, Cleiseis, Shadow (black shirt), Rampol (green work overall), Maetja (blue shirt). Do not copy social-media UI, captions, watermarks, logos or reference clothing as the final uniform. Douglas, Cliffhanger and Navy Blue still need references or approved visual descriptions.

## First: reconcile reality before coding
1. Pull latest `main` and read `docs/ROADMAP.md`, `docs/MASTER_SYSTEMS.md` (engineering log, what is built), `docs/MASTER_PRODUCT_PLAN.md` (product plan), `docs/ASSET_CATALOG.md`, `docs/CHARACTER_VISUAL_BIBLE.md`, `docs/MULTIPLAYER.md`.
2. Inspect actual code and tests; do not assume pasted chat progress is current.
3. Run `npm run check` and record the exact result. Do not change unrelated simulation code while doing the art slice.
4. Check whether PR #2 is still open or superseded before touching it.

## Sprint A — production multiplayer validation
- Add a concise deployment / external-network test checklist.
- Add reconnect/session recovery design and tests before multi-region complexity.
- Measure real server tick p50/p95/p99, memory and room CPU at 2/8/16 clients; do not invent results.
- Keep current 60 Hz authoritative simulation / 20 Hz snapshot settings until measurements justify a change.
- Add input rate limits and server validation for movement, fire rate, ammo, ability cooldowns and objective interactions.
- Do not add voice chat yet.

## Sprint B — first visual slice (the next creative deliverable)
- Download official 1K PBR archives for Ground 087 and Ground 064 from ambientCG; retain licence and provenance in `ASSETS.md`.
- Keep source maps out of the initial critical path; lazy-load them for the arena.
- Integrate one PBR material into the current Three.js scene and prove correct color space, repeat, normal orientation, roughness, mipmaps and seam quality.
- Use a single reusable GLB humanoid rig. Prototype one operator first; keep gameplay hit capsules and physics separate from visual mesh.
- Do not invent or replace the likenesses of Douglas, Cliffhanger or Navy Blue.
- Add a visual fallback so missing assets never prevent a match from starting.

## Sprint C — FPP/TPP prototype
- First inspect the current camera and viewmodel implementation.
- Implement V toggle with shoulder swap, collision-safe spring arm and stable camera smoothing.
- Do not let TPP camera peek around cover unfairly; consider separate FPP/TPP queues if needed.
- Keep authoritative hit origin and server validation consistent across camera modes.
- Add browser tests for camera switching, wall collision, ADS and online aim consistency.

## Hard engineering constraints
- Server authoritative for gameplay state and outcomes.
- Cosmetic-only local VFX can be client side; damage and objective state cannot.
- Avoid huge feature batches. One vertical slice at a time.
- No dependency additions without a measured need.
- No Web Worker physics rewrite, tick-rate change, blockchain, marketplace, voice chat, or vehicles in this sprint.
- Every asset must have a licence record; no GTA/Vice City game data.
- Run unit tests, server tests, browser E2E and build before calling a stage done.

## Completion report
Report: branch name, commit SHA, files changed, tests actually run and results, performance measurements (if any), known gaps, and a browser screenshot/playtest result if available.

## Owner-approved implementation ticket
- Track the first realistic operator + PBR environment vertical slice in GitHub issue #4: https://github.com/Classio08/nighthawk/issues/4
- Use `docs/PRODUCTION_READINESS.md`, `docs/PERFORMANCE_BUDGET.md` and `docs/VISUAL_ASSET_REVIEW.md` as acceptance gates.
- The issue is a task brief, not permission to overwrite another agent's work. Branch from latest `main` and report actual tests and measurements.

---

## Owner direction update — 19 November 2026

The owner has expanded the product vision beyond the older art-only sprint. Read `/CLAUDE.md` and `docs/PROJECT_DIRECTION_AND_CHAT_NOTES.md` before planning further work. The project direction note is the authoritative record of the latest conversation and supersedes conflicting older sprint restrictions below.

**Immediate priority:** first offline playable operation, Operation DUST LANTERN. The owner explicitly approved this work. Build a compact, complete insertion → recon → identify → rescue/recover → extraction → debrief loop, with deterministic mission variation and tests. Keep it isolated from online multiplayer until the mission state has a versioned snapshot and server validation.

The owner also wants the long-term product to include:
- African/Namibian-rooted fictional military, intelligence, police tactical and other factions with global appeal.
- Co-op/PvP/PvPvE, extraction, bounty hunting, target contracts, kidnap-response/rescue, covert operations and campaign missions.
- NPCs with bounded agency, memory, morale, suspicion, relationships and evidence-based knowledge.
- Stronger movement, weapon feel, vehicles, explosions, physics, lighting, shadows, PBR, spatial audio, haptics and responsive accessible UX.
- Guest-first accounts, persistent progression and fair cosmetics economy.
- Optional wallet proof for cosmetics only as a later, legally reviewed feature. No wagering, staking, pooled pots, cash-out or token rewards without written legal/licensing approval. See the Namibia compliance section in the project notes.

Do not attempt all systems in one sprint. Preserve the existing Three.js/Rapier/Colyseus architecture until profiling demonstrates a reason to change it. Keep LLM reasoning out of authoritative combat, movement, hit detection and physics.

### Current parallel implementation
- ChatGPT is contributing the first offline DUST LANTERN mission on `feature/dust-lantern-first-playable`, draft PR #20. Do not edit or overwrite that branch; inspect its diff/CI and coordinate any follow-up on a fresh branch.
- The full owner direction and acceptance criteria are in `docs/PROJECT_DIRECTION_AND_CHAT_NOTES.md` and root `CLAUDE.md`.


## Mission alert director — 19 November 2026

A follow-on branch `feature/dust-lantern-alert-director` (draft PR #22) builds on the first playable DUST LANTERN branch. It adds `MissionAlertDirector` which derives a compact operation-wide threat level from evidence already held by living guard NPC brains: direct visual contact, recent sound investigation, and recent last-known-position reports. The pressure rises faster than it cools, and the HUD reports routine / uneasy / searching / alert / crisis. This system must never reveal hidden player coordinates or grant guards omniscient tracking. Tests cover escalation, observer counts, decay, and exclusion of dead/non-guard NPCs.

Do not merge this follow-on before PR #20 is reviewed; it is based on the PR #20 branch to keep the dependency explicit. The alert director is an initial aggregate signal, not yet a full witness/body discovery, radio network or branching mission director.

## Physics correlation extensions — 19 November 2026

Dependent branch: `feature/physics-shrapnel-correlation`, based on Claude's `feature/physics-correlation-foundation`. Do not merge this child branch ahead of its physics foundation.

- `src/sim/world.js` adds bounded seeded shrapnel traces for grenade, barrel and mortar blasts. Every fragment stops at the first solid Rapier collider; it can only hit a fighter capsule before that wall. Per-blast hit de-duplication prevents repeated fragments hitting one fighter, and armor applies to the fragment damage. These are instant server-side traces, **not** persistent flying rigid bodies or curved ballistic projectiles.
- Material sound transmission is now used by NPC hearing. A path is checked through at most two solid surfaces, weather still limits hearing range, and repeated fire reports are coalesced to roughly eight updates per second per NPC. NPCs receive only a sound clue at the reported source; no live player position is revealed.
- `src/fx/blood-pools.js` is client presentation only: an instanced pool follows a cosmetic Rapier ragdoll while it settles, then remains and fades. It respects the gore setting. Ragdolls mark themselves freed to prevent effects reading removed Rapier bodies.
- `src/main.js` wires the pool into the existing effect loop. It does not add a second gameplay physics engine or alter the authoritative hit/health simulation.
- The original Rapier blast, crate/vehicle damage, barrel chaining, material bullet response, recoil, hit push, leg limp, jump buffering, coyote time and fall response are retained.
- Still open: true ballistic projectile travel with replicated/server flight-time decisions, physical shrapnel debris, alive-character articulated physics (alive fighters remain kinematic capsules), bleeding/bandages, detailed water-volume effects, persistent wall blood decals, doors/glass/cover physical interactions, full acoustic occlusion/reverb for player audio, and haptics.
- Tests were added/extended as specifications, but the owner explicitly asked not to run tests/builds yet. Do not claim these branches passed CI or were playtested.
- Integration order: review/merge the foundation branch only when the owner approves; then review this dependent extension. No merge has been performed.

## Acoustic response extension — 19 November 2026

The physics correlation child branch now shares material attenuation with both NPC hearing and player audio:
- NPCs hear gunshots/explosions through a maximum of two solid material surfaces, attenuated by each material's sound coefficient. Weather still limits hearing. Repeated reports are throttled to approximately 8 Hz per NPC.
- Player-heard remote gunshots and explosions use the full 3D source/listener distance for sound-travel delay (distance / 343) and material path attenuation for volume.
- Audio attenuation is presentation-only. Server hit registration, weapon fire cadence and explosion timing are not delayed. This is volume reduction, not frequency-dependent low-pass filtering, indoor reverb or reflections.
- soundOcclusionGain() in src/fx/audio.js clamps invalid gains safely; the unit specification lives in tests/audio-occlusion.test.js and has not been run.


## Ballistic projectile continuation — 19 November 2026

Dependent follow-on: `feature/ballistic-projectile-foundation`, based on `feature/physics-shrapnel-correlation`.

- Review `docs/BALLISTICS.md` and `src/sim/ballistics.js` before changing bullet movement.
- The projectiles are server-authoritative fixed-step swept paths. Rapier owns world collision; no second physics engine or dynamic body per bullet is introduced.
- Keep the active projectile cap, deterministic per-shot impact random stream, existing material response, and lag-compensated target samples.
- Tracer segments are transient events through the existing snapshot event buffer; avoid adding 60 Hz replicated projectile state.
- Net prediction reconciles in-flight rounds by input sequence. Preserve accepted projectiles; prune only unacknowledged predictions before replay.
- The current branch has not been tested, built or playtested at the owner's request.
