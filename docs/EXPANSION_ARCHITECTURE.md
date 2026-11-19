# NIGHTHAWK — Next-Generation Game Platform Architecture

**Status:** research-backed proposal, not a claim that these systems are already implemented.  
**Baseline:** main commit `27e84f29f458803489e1bc9dedeb9a3c7e5177a4` (19 November 2026).  
**Design rule:** build a playable tactical shooter in vertical slices; do not attempt an MMO, crypto casino and AAA simulation in one release.

## 1. Product direction

NIGHTHAWK becomes a persistent-feeling, session-based African tactical action universe with:
- Competitive PvP modes and co-op PvE operations.
- Replayable contracts, extraction missions, target tracking, rescue/recovery and intelligence operations.
- A fictional Southern African setting with Namibia as the first major creative reference.
- Original fictional military, police tactical, intelligence, border-security, private-security and criminal factions. No real agency affiliation, real insignia or claims of authentic classified procedures.
- Recognisable operators, shared squad identity, progression, cosmetics and player-created stories.
- Browser-first accessibility, with a path to desktop/mobile clients if the game earns it.

The differentiator is not simply a bigger map or more guns. It is **a reactive world in which factions remember what happened, NPCs have motives, and the same mission can unfold differently**.

## 2. Current baseline and gaps

### Already in main
- Three.js 0.187, Rapier 3D, Yuka AI, Colyseus 0.18, Vite and ZzFX.
- Server-authoritative multiplayer, 60 Hz simulation, 20 Hz snapshots, client prediction/reconciliation, interpolation, lag compensation and reconnect handling.
- Eight selectable operators and eight active abilities.
- Utility-driven bots, personality archetypes, squads, radio awareness, cover response, A* navigation and four difficulty levels.
- Kavari Basin greybox, weather/night, destructible crates, explosive barrels and chain reactions.
- Airdrop, hardpoint, bounty and two-stage relay-uplink contracts.
- Arcade buggies and bikes, loot/inventory, armour, healing and weapon reload/skin systems.
- Automated unit, smoke, server and production-build checks.

### Not yet a full game platform
- No persistent account identity or cross-device player profile.
- No server-backed XP, inventory ownership, mission ledger, faction reputation or economy.
- No campaign/multi-stage operation director, hostage/rescue mission loop, or persistent NPC memory.
- No production-quality character/weapon animation pipeline; current fighter art remains procedural/block-based.
- No realistic vehicle dynamics, mobile touch UX, controller rumble layer or complete spatial soundscape.
- No real-player load test, deployed regional fleet or measured production SLOs.
- No crypto wallet integration; no legal approval for wagers or prize pools.

## 3. Game modes and mission families

Keep one authoritative simulation and compose separate mode rules around it.

### Modes
1. **Skirmish:** short competitive matches; fast onboarding and weapon practice.
2. **Operations / Extraction:** PvPvE, limited carried equipment, optional contracts, risk/reward extraction.
3. **Covert Operations:** small-team infiltration, evidence recovery, sabotage, escort or rescue, and escape.
4. **Hunt:** one high-value target is tracked; the target gets counterplay, decoys and escape options. Can be PvP bounty or PvE manhunt.
5. **Black Site:** asymmetric teams with hidden information, intelligence objectives and social deception.
6. **Co-op Campaign:** authored multi-stage operations with persistent mission consequences.
7. **Training / Range:** instant entry, movement drills, recoil practice, vehicle range and accessible control tutorials.

### Mission template vocabulary
- Recon and identify: collect evidence, photograph/scan a site, identify the correct target.
- Capture / detain: incapacitate and secure a fictional target, with non-lethal options and escalation consequences.
- Rescue / recover: locate and extract a civilian, informant, pilot or teammate.
- Kidnap-response: find a missing person, follow evidence, protect the rescue team and extract the person safely. Do not reward harm to captives.
- Bounty: identify, track, intercept and capture/neutralise a named hostile target under clear rules.
- Data theft / relay uplink: secure an objective, then hold it while the data transfer completes.
- Convoy escort / intercept: route choices, vehicle damage, roadblocks and changing escort behaviour.
- Sabotage / counter-sabotage: disable a fictional system, then respond to a defender's repair or countermeasure.
- Search and rescue after a crash, storm or communications blackout.
- Dynamic world events: power failure, false alarm, faction patrol change, evacuation, storm front, civilian sighting or rival team arrival.

Every mission needs: briefing, entry options, primary objective, optional objective, fail conditions, extraction rules, AI response profile, rewards, consequences and accessibility/readability cues.

## 4. NPCs with agency: bounded, testable intelligence

Do not put a language model in charge of movement, aim, hit detection, physics or match outcomes.

Use a layered architecture:
- **Reflex layer (60 Hz):** deterministic state machines/behaviour trees for locomotion, cover, threat response, aiming, weapon handling and collision. No network call or LLM dependency.
- **Tactical layer (event-driven / 2–5 Hz):** utility AI chooses patrol, investigate, search, call backup, flank, retreat, guard, escort, negotiate or evacuate. Uses squad knowledge and uncertainty.
- **Character layer (slower):** goals, traits, fear, loyalty, morale, relationships, suspicion, memory and faction orders. It can choose among allowed tactical intents but cannot issue arbitrary engine commands.
- **Dialogue layer (optional):** constrained local/cloud language model for natural dialogue and squad chatter. All outputs are validated against a strict action/tool schema; no direct access to authoritative state mutation.
- **Director layer:** mission controller changes pressure and opportunities based on player actions, but does not secretly change hitboxes, aim accuracy or damage.

NPC memory should be structured and scoped: personal observations, squad radio reports, faction intelligence and rumours are separate confidence levels. NPCs must not know what they did not see, hear or receive. Memory decays; witnesses can be mistaken; factions may misidentify players. Persist only mission-relevant summaries, not unlimited chat logs.

Unpredictability should come from authored goals + seeded variation + partial information + competing priorities, not random unfairness. Example: a guard hears a distant shot, alerts a nearby patrol, searches the wrong building, then withdraws when isolated. The player can exploit or be surprised by the chain.

Use replayable deterministic seeds for AI tests. Evaluate with scenario suites: detection time, false alarms, search coverage, squad coordination, CPU cost, and fairness. AI must remain useful with language models disabled or offline.

Research pattern: KRAFTON/NVIDIA's PUBG Ally separates a fast behaviour-tree layer from slower language reasoning, grounds the model in game-state observation tools, and validates it through protocol tests and player playtests. Apply the architecture, not necessarily their model or GPU assumptions.

## 5. Movement, weapons, vehicles and physics

### Character movement
Preserve server authority and Rapier as the current physics foundation. Improve in this order:
1. Input buffering, acceleration/deceleration, air control, slope handling and stable ground snapping.
2. Crouch/stand transitions, stamina, sprint start/stop and ADS movement tuning.
3. Slide and vault/mantle on explicitly authored traversal surfaces.
4. Weapon-ready states and animation blending for move/aim/reload/equipment actions.
5. Ragdoll recovery and physical reactions as cosmetic/replicated presentation, not a source of client-authoritative damage.

Use fixed-step simulation, deterministic movement commands and server reconciliation. Do not let animation root motion silently become the authority for multiplayer position.

### Weapon feel
Use game-authored ballistic models, not claims of exact real-world weapon simulation:
- Distinguish hitscan, short-range projectile and longer-range projectile classes.
- Per-weapon recoil pattern, recovery, spread, sway, ADS transition, movement penalty and reload phases.
- Server-authoritative shot validation, fire cadence, ammo and damage.
- Optional penetration/ricochet only where collision material data and performance allow it.
- Attachment trade-offs must be legible and balanced; no paid damage advantage.
- Camera kick, viewmodel kick, muzzle flash, shell ejection, tracer, impact decal, audio and haptics should share one shot event.

### Explosions and destruction
Keep gameplay damage/impulse deterministic and authoritative. Separate:
- gameplay blast radius, falloff, impulse and occlusion;
- visual fireball, smoke, dust, debris and heat distortion;
- audio transient, low-frequency impact and distance/occlusion;
- camera impulse and optional haptics.
Use pooled particles and debris, capped chain reactions, material-aware damage classes and per-client cosmetic quality. Never replicate hundreds of debris bodies.

### Vehicles
Current vehicles are simple arcade models. Improve with a raycast-wheel model (suspension, grip, slip, braking, handbrake, centre of mass, traction and damage) while preserving server authority. Add vehicle classes only after a baseline driving test. Rapier's raycast vehicle controller is a viable first browser prototype; test it before adopting a second physics engine. Consider Jolt Physics for a later native/desktop build or if measured browser requirements exceed Rapier, not as an immediate wholesale replacement.

## 6. Rendering, materials, lighting and world art

- Keep Three.js and the existing render/simulation separation.
- Replace the block-built operator with one high-quality GLB vertical slice, shared skeleton, retargetable animations, LODs and consistent FPP arms/weapon rig.
- Build a Southern African material library: red/pale sand, gravel, dry river rock, sun-faded concrete, corrugated metal, weathered asphalt, canvas, nylon, rubber, glass and sparse hardy vegetation.
- Use glTF PBR materials, correct sRGB/linear texture handling, normal/roughness/metallic maps, texture atlases and KTX2/Basis tests.
- Introduce a shadow budget: one primary sun shadow with tuned cascade/resolution, limited local shadow casters, baked/static occlusion where suitable, contact shading and fog for depth.
- Add geometry through modular kits, instancing, frustum/distance culling and LODs. Collision meshes stay simpler than visual meshes.
- Add lighting presets (clear late afternoon, overcast, dusty sunset, night operation) one at a time; benchmark each.
- Every asset must have a recorded source, licence, attribution requirement, texture budget and fallback.

## 7. Audio, UI/UX, haptics and accessibility

### Sound
Create a spatial audio bus with distance attenuation, stereo/HRTF panning, occlusion, indoor/outdoor filtering, reverb zones, sound pooling and priority/voice stealing. Separate weapon report, mechanical action, impact, environment, UI, radio and voice buses. Support user volume controls and subtitles for important radio cues.

### Haptics
Use the Gamepad API vibration actuator where supported, with graceful fallback. Mobile vibration must be opt-in and use short, distinct patterns for hit, explosion, objective state and vehicle collision. Never vibrate continuously for gunfire. Add a master haptics toggle and intensity setting; respect browser/device support.

### UX
- Guest-first play: training and first match without account friction.
- Clear onboarding: move, aim, fire, reload, interact, objective and extract.
- A clean lobby: operator, loadout, mode, squad, region, party invite and readiness.
- Mission briefing with objectives, risk, rewards and optional intel.
- Strong in-match objective readability without wallhack-style tracking.
- Post-match summary: contribution, mission outcome, XP, unlock progress and replay/share consent.
- Full keyboard/mouse, gamepad and touch action maps; scalable UI, colour-safe signals, captions, remapping and reduced motion.
- UI updates should not block the render loop. Use event-driven HUD updates and avoid rebuilding the full DOM every frame.

## 8. Accounts, progression and fair economy

Build identity before monetisation:
1. Guest profile with local settings and a temporary player ID.
2. Optional email/passkey/social sign-in via a reputable identity provider; never store raw passwords ourselves.
3. Server-side profile, inventory ownership, XP, mission ledger, operator unlocks, cosmetics and account recovery.
4. Link guest progress to an account with explicit conflict resolution and migration tests.
5. Privacy export/delete workflows, age/region controls and moderation/reporting before public social features.

Economy design:
- Soft currency earned through play; premium currency only if payment compliance is solved.
- Cosmetics: uniforms, colourways, patches, weapon finishes, banners, emotes, vehicle liveries and safehouse decorations.
- Battle pass / seasonal track only after retention and content cadence justify it.
- No pay-to-win stats, paid weapon damage, paid matchmaking advantage or paid mission success.
- Publish drop odds for any randomised rewards and prefer direct-purchase cosmetics.
- Keep an auditable server-side ledger for grants, purchases, refunds and reversals. Client UI never decides balances.

## 9. Wallets and crypto: separated from gameplay and wagering

Wallet connection is a later optional identity/ownership experiment, not a prerequisite for playing.
- First possible use: prove ownership of an external wallet and claim a cosmetic badge or optional cosmetic item.
- Never ask for seed phrases/private keys. Use wallet-standard connection and signed nonce challenges to prove control; signatures must be domain-bound, expiring and replay-resistant.
- Do not store wallet private keys or custody player assets.
- Avoid token rewards tied to match performance until anti-cheat, Sybil resistance, tax, consumer-protection and legal treatment are understood.
- Do not launch player-versus-player crypto betting, pooled stakes, winner-takes-pot, cash-out or token wagering as a feature without written Namibian and target-market legal advice, licensing analysis, AML/KYC and age/region controls. A game skill element does not automatically remove gambling regulation. The Namibian Gaming and Entertainment Control Act defines bookmaker activity around receiving/negotiating bets or wagers; the Virtual Assets Act regulates virtual-asset service providers. The precise classification of a proposed game wallet, custody, exchange, prize pool and wager needs specialist review.
- Safer first monetisation: cosmetics sold through ordinary compliant payment providers, plus optional wallet-linked cosmetic proof only after legal and platform review. Keep wallet features disabled by region until approved.

## 10. Performance, networking and reliability

Adopt a Tencent-inspired measurement culture:
- Track frame-time p50/p95/p99, long tasks, draw calls, triangles, GPU/texture memory where measurable, JS heap, asset transfer, first playable time, input-to-photon latency, RTT, jitter, packet loss and server tick cost.
- Record device/browser/GPU/resolution/preset and the exact commit for every benchmark.
- Fixed simulation step; render interpolation; pooled effects; spatial partitioning; budgeted AI thinking; stagger non-critical NPC decisions; snapshot deltas and interest management as player counts grow.
- Keep gameplay simulation free from network calls and large asset loads.
- Define performance tiers and degrade optional effects before reducing input responsiveness or server tick integrity.
- Load test rooms, reconnects, abuse limits, match lifecycle and server memory before public launch.
- Maintain a replayable seeded scenario and automated regression benchmark.

Initial target budgets remain provisional: 30 FPS minimum on older integrated graphics, 60 FPS on recommended laptops, and 30–45 FPS on mid-range Android after touch support. Only publish targets after device testing.

## 11. Open-source technology shortlist

| Need | First choice / candidate | Notes |
|---|---|---|
| Browser renderer | Three.js (MIT) | Already integrated; keep. |
| Browser physics | Rapier 3D (Apache-2.0) | Already integrated; strong default for character and rigid-body work. |
| Alternative physics | Jolt Physics / JoltPhysics.js (MIT) | Evaluate only with a measured use case; native/desktop potential. |
| Vehicle prototype | Rapier raycast vehicle controller | Prototype against the current arcade model; test handling and server determinism. |
| AI steering | Yuka (MIT) + custom utility AI | Already integrated; layer mission planning and memory over it. |
| Navigation | Current A* grid; later Recast Navigation | Navmesh after map geometry stabilises. |
| Multiplayer | Colyseus (MIT) | Already integrated; add account/session service separately. |
| Audio | Web Audio API | Spatial panning, filters, reverb, pooling and buses are available in the platform. |
| Models/materials | glTF 2.0 / GLB, KTX2 | Asset pipeline and licence records required. |
| Engine alternative | Godot / O3DE | Consider only if browser architecture hits a hard ceiling; migration would be a separate product decision. |

Useful references:
- Rapier character controller: https://rapier.rs/docs/user_guides/bevy_plugin/character_controller/
- Three.js physics integration overview: https://threejs.org/manual/pages/physics.html
- Godot 3D features and vehicle-body limitations: https://docs.godotengine.org/en/stable/about/list_of_features.html
- O3DE open-source engine features: https://docs.o3de.org/docs/welcome-guide/features-intro/
- Web Audio spatialisation: https://www.w3.org/TR/webaudio/
- NVIDIA/KRAFTON PUBG Ally architecture: https://developer.nvidia.com/blog/how-krafton-built-pubg-ally-a-co-playable-character-powered-by-nvidia-ace/
- Tencent Delta Force Metaperf GDC session: https://www.gdcvault.com/play/1036028/Metaperf-Industrializing-Performance-Optimization-for

## 12. Delivery order: vertical slices, not feature soup

### Slice A — Tactical mission foundation
- Mission director with data-driven mission definitions and objective graph.
- One complete 5–8 minute mission: insert, identify target, rescue/recover, extract.
- Server-authoritative objective state and rewards.
- Mission briefing, HUD, success/failure summary.
- Automated deterministic mission tests.

### Slice B — Living faction response
- Patrol schedules, suspicion, witness reports and alert levels.
- Search/investigate/reinforce/withdraw behaviours.
- One faction remembers mission outcomes through structured persistent records.
- No LLM dependency for combat.

### Slice C — Movement and combat feel
- Input/animation state machine, slide/vault prototype, weapon handling polish.
- Spatial sound, impact layering, haptics.
- One measured benchmark scene before/after.

### Slice D — Visual vertical slice
- One realistic operator, one weapon, one modular building kit, one PBR environment set.
- Lighting/shadows/LOD and mobile/low-end profiling.

### Slice E — Identity and progression
- Guest-to-account linking, server profile, XP, unlocks, cosmetics and account recovery.
- No payment integration until compliance and support are ready.

### Slice F — Operations and social systems
- Co-op and extraction matchmaking, parties, mission rotation, report/block/moderation.
- Player stats, leaderboards, replay and creator tools.

### Slice G — Optional wallet proof
- Wallet connection for cosmetic ownership only, behind feature flag and legal review.
- Wagering remains off unless independently licensed and approved in every launch region.

## 13. Release gates

A slice is not done because it compiles. It needs:
- Unit tests and deterministic seeded tests.
- Server-side validation and abuse tests for every gameplay/economy action.
- Browser end-to-end test.
- Before/after performance data on named devices.
- Asset and licence review.
- Accessibility and control review.
- At least a small real-player playtest and documented findings.

**Immediate recommendation:** build Slice A on top of the existing contract/uplink system. Do not add wallet wagering, a giant open world or an LLM-driven combat brain before one polished mission is genuinely fun.
