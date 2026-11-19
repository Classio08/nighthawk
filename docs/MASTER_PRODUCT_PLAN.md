# NIGHTHAWK — Master Product and Production Plan (ChatGPT)

> Note from the build side: this is the product/production plan written by ChatGPT in the `docs/master-systems-and-assets` branch. `docs/MASTER_SYSTEMS.md` is the engineering log of what is actually built, stage by stage. Where the two disagree about what exists, `MASTER_SYSTEMS.md` and the code win (for example: vehicles, loot, armor/medkits, third-person camera and the Kavari greybox map are built; section 1 below pre-dates them).

Status: design and implementation roadmap; not every proposal below is implemented.
Owner decisions: realistic visual direction; redesign the operators; fictional African special-operations unit; modern equipment; support both first-person (FPP) and third-person (TPP) cameras.
Engineering rule: preserve the server-authoritative simulation. Any feature that affects position, damage, inventory, cooldowns, objectives or match outcomes must be validated by the server.

## 1. What exists in the repository (verified against main, 18 November 2026)

The current main branch includes:
- Three.js 0.187 renderer, Rapier physics, Yuka AI and Colyseus 0.18 server.
- Offline 16-fighter battle-royale simulation with six weapons, bots, shrinking zone, damage, grenades, ragdolls, HUD and minimap.
- Online server-authoritative matches with browser prediction, reconciliation, interpolation and lag-compensated hits; 60 Hz server simulation and 20 Hz snapshots.
- Utility-scored bot behaviours, personality archetypes, squad radio/flanking and a third-faction outpost garrison.
- Tactical versus empty-mag reload handling, dropped-magazine cosmetic effects and five shader weapon skins.
- Destructible crates/props, explosive barrels and chain-reaction explosions.
- Contracts (airdrop, hardpoint, bounty), mortar killstreak, seeded weather/night/fog/rain and a gore toggle.
- Character art-direction documentation has been merged, but the rendered fighters are still primitive/block-based in `src/render/fighter.js`; the environment still uses a simple generated sand canvas and Lambert materials in `src/render/scene.js`.

Important: repository history shows gameplay stages 3–6 are already on main. The old roadmap had not been updated and incorrectly listed these systems as future work. This plan corrects that gap.

Not verified yet: production VPS deployment, real-world friend/network testing, load tests with many simultaneous rooms, regional matchmaking, production-quality FPP/TPP rigging and fairness validation, full-body GLB characters, mobile touch controls, controller support, persistent accounts/progression, chat/voice, monetization, polished vehicle dynamics, and an actual photo-derived PBR material integrated into the renderer. A first-pass FPP/TPP toggle, arcade vehicles and bikes are already in main.

## 2. Product identity

NIGHTHAWK should be a realistic, accessible, fast-loading browser tactical action game with a distinct Southern African-inspired fictional setting—not a clone of COD, PUBG or GTA.

Core pillars:
1. Readable, responsive gunplay and movement.
2. Matches that generate memorable stories through AI, objectives and environmental events.
3. Eight recognisable original operators plus fair customisation.
4. Squad play, social deduction and tactical choices.
5. Strong performance on ordinary laptops and mobile browsers.
6. A creator-friendly identity, shareable match moments and ethical cosmetics economy.

Proposed fiction (not canon yet): **Operation BLACKOUT** takes place in the **Kavari Exclusion Zone**, with the first arena provisionally called **Kavari Basin / Sector 09**. A fictional private security consortium (working name: AEGIS) has sealed a remote proving ground after a classified communications/energy incident. Nighthawk operators, rival contractors and local security factions compete to recover evidence and extract. The shrinking hazard should be an in-world electromagnetic storm / containment perimeter, not a generic magic circle. The owner must approve the zone, operation, consortium and map names before they appear as established lore.

## 3. Game modes and repeatable match loops

Build modes as separate rule configurations on the same simulation, not one giant if/else mode.

### Launch modes
- **Last Team Standing / Solo BR:** existing 16-fighter foundation; improve match pacing and spawn fairness.
- **Squad BR:** 2- or 3-player teams, revive/downed state and team objectives. Only launch after team state is tested server-side.
- **Black Site (social-tactical PvPvE):** 8–12 players, two covert saboteurs, shared objectives, evidence collection and extraction. Use Among Us-style uncertainty and discussion through environmental evidence, not a direct copy of its art or tasks.
- **Extraction Contracts (PvPvE):** enter, gather intel/loot, complete optional contracts, then decide when to call extraction. High reward means high visibility and risk.
- **Training Range:** instant solo practice for movement, aim, recoil, grenades and abilities. No login wall.

### Mission building blocks
- Hack a relay: hold a terminal while a progress bar advances; defenders can interrupt.
- Restore or cut power: changes lights, doors, cameras and alarm systems for a short period.
- Recover encrypted drives: carry an objective item that reveals a rough location, not an exact wallhack.
- Escort / intercept a convoy: vehicles follow a route with multiple attack and defence choices.
- Secure a crash site: timed loot, AI guards and dynamic cover.
- Bounty / HVT: target receives counterplay (decoy route, bodyguards, jammer).
- Rescue / revive: recover a downed NPC or teammate under pressure.
- Extraction: call a visible helicopter/ground convoy; arrival delay creates a defendable event.
- Double-agent round: secret roles, limited sabotage charges and evidence trails. Keep the first version short and readable.

### Match pacing
Target a 6–10 minute full BR match after playtests, with a 2–3 minute quick-play variant. Do not hard-code a desired duration: measure median match time, early-elimination rate, comeback rate and quits. Current prototype match duration has been reported as short; tune bots and zone only after collecting match telemetry.

## 4. Movement, combat and physics

### Movement order
1. Correct WASD direction, camera-relative movement and input remapping.
2. Sprint, crouch, slide with friction and stamina/cooldown trade-off.
3. Jump and reliable ledge mantle.
4. Vault through designated windows/low cover.
5. Zipline / ladder traversal on authored routes.
6. Vehicles and seat switching.
7. Only test wall-running, wingsuit and dolphin-dive if the core movement is already stable. Too many movement verbs make tactical readability and mobile controls worse.

### Weapon feel
- Per-weapon recoil curves, recovery, ADS transition, spread, range falloff and audio identity.
- Tactical reload vs empty reload already exists; validate the chamber/ammo edge cases and network replication.
- Attachments should create trade-offs (optic clarity vs ADS speed, suppressor vs velocity/damage, extended mag vs reload speed), not strict upgrades.
- Keep hit validation, ammo, fire rate, recoil-affecting stats and weapon inventory server authoritative.
- Add weapon range / recoil test room and weapon stat comparison.

### Physics
- Fixed-step simulation; use deterministic or server-owned outcomes for network-critical objects.
- Keep collision meshes simple and separate from visual meshes.
- Use a capped pool for debris, decals, shells and particles; cosmetic client-only effects must never decide damage.
- Destructible cover should have authored damage tiers and server replication, not arbitrary per-triangle fracture.
- Add fall damage, ragdoll impulse limits, moving-platform tests, vehicle collision tests and grenade occlusion tests.
- Avoid persistent high-count rigid bodies. Convert debris to cheap particles after a short time.

### Melee
Add a fast, readable melee strike first; cinematic rear takedowns later as an optional animation with strict distance/angle checks. Never lock the camera for long in multiplayer. Melee hit confirmation must be server-side. Provide reduced-intensity effects and a gore toggle.

## 5. Operator design and customisation

Keep the eight originals as the core roster: Roms, Shadow, Douglas, Cliffhanger, Navy Blue, Rampol, Maetja and Cleiseis.

Each operator should have:
- one role identity and a clear silhouette;
- one passive and one active ability at launch;
- a distinct voice/radio personality (optional text subtitles);
- a balanced weapon preference, not a weapon exclusive to that operator;
- a face/gear/colour customisation system;
- progression that unlocks cosmetics and lore, not raw combat power.

Ability proposals are provisional and require balancing:
- Roms — assault/breacher: short overdrive sprint or controlled recoil window.
- Shadow — recon/infiltration: temporary sound masking / decoy signature; no invisibility wallhack.
- Douglas — field medic: deployable cover/first-aid station.
- Cliffhanger — mobility: short grapple to authored anchors.
- Navy Blue — signals: limited radar pulse / comms disruption with counterplay.
- Rampol — engineer: breach charge / temporary reinforced cover.
- Maetja — support/tech: team resupply or short repair/heal beacon.
- Cleiseis — trapper/control: visible, detectable tripwire or sensor trap.

Balance principles: ability has clear audio/visual tells, counterplay, cooldown, duration and server validation. No pay-to-win stats. Cosmetic creator should support modular head, hair, vest, gloves, boots, backpack, patches and colour palette. Do not let custom skins obscure hitboxes or team readability.

## 6. Autonomous AI and living world

The current Yuka-based utility AI and squad blackboard are a foundation. Extend it incrementally:
- Personality weights and short/long-term memory (last heard sound, last seen position, squad orders, known threat).
- AI perception should use line-of-sight, sound radius, cover and uncertainty; never omniscient tracking.
- Needs/goals: survive, regroup, loot, rescue, patrol, investigate, escort, defend, sabotage, extract.
- NPC factions: neutral traders/rescue crews in non-combat hubs; hostile garrisons and roaming patrols in combat zones.
- Wildlife as ambience and readable world feedback (birds scatter, small animals flee); wildlife should not become arbitrary damage sources.
- Named villains and boss events should be objective-driven, telegraphed and optional. First prototype: a convoy commander with guards, radio calls and a weak point—not a helicopter boss that dominates every match.
- Keep AI decision-making on server; send compact state/events to clients. Use lower AI update frequency for distant actors and sleep actors outside relevant zones.

## 7. Map and world design

Start with one polished, compact, multi-route map before a huge open world. Proposed first map: **Skeleton Coast / Sector 09**—fictional coastal desert, rusted cargo wreck, dry river channel, radar station, outpost, underground service tunnel, small settlement and extraction pad.

Map principles:
- 3–4 major landmarks visible from distance.
- At least three routes between major points: exposed fast route, covered slow route, vertical/flank route.
- Strong sightline breaks every 30–50 metres in combat spaces.
- Clear spawn safety and no immediate long-range spawn kills.
- Verticality with readable traversal and counterplay.
- Storytelling props: abandoned research gear, radio logs, convoy wreckage, evacuation markings, damaged comms equipment.
- Build modular kits (wall, doorway, roof, stairs, ladder, container, fence, sandbag, light, cable) with snap-grid and shared materials.
- Later maps: Windhoek-inspired industrial outskirts (fictionalised), flooded dam, mountain relay station, dense port district. Rotate biomes only after the first map is fun.

## 8. FPP + TPP camera architecture

Target V key toggle, with a settings option and controller binding.
- FPP: existing weapon viewmodel and camera. Hide the local full-body mesh only where necessary; retain shadow/arms if stable.
- TPP: full-body rig, shoulder camera spring arm, camera collision ray/sphere cast, shoulder swap and ADS zoom.
- Both modes must use the same authoritative aim origin and server hit validation rules. Camera perspective must not create a competitive peeking advantage; consider FPP-only ranked queues or camera restrictions per mode.
- Vehicles can force a suitable third-person/vehicle camera but must return cleanly to the chosen mode.
- Build order: full-body rig → animation/aim sockets → camera boom/collision → shoulder ADS → online fairness tests.
- Acceptance: toggle does not change player position, aim direction, hit result or input state unexpectedly; no wall clipping; 30/60 FPS camera stability.

## 9. VFX, sound and accessibility

Prioritise readable feedback:
- muzzle flash, casing ejection, tracer, impact dust/sparks, suppression kick, grenade warning, armor break, hit confirmation, kill confirmation, objective progress, extraction flare.
- Weather: dust, rain, fog and night are seeded by match and affect visibility/sound consistently.
- Post-processing: subtle bloom, exposure adaptation, damage vignette; avoid expensive full-screen stacks on low-end devices.
- Kill replay should be server-event-driven and store a short ring buffer of transform/event samples; do not record private chat or upload automatically.
- Kill snapshot: local PNG with weapon, distance, player alias, map, timestamp and optional watermark. Share/download only on explicit player action.
- Audio: spatialised gunfire/footsteps, indoor/outdoor occlusion approximation, directional damage, squad pings and optional subtitles.
- Accessibility: remappable keys, mouse sensitivity, FOV, colour-safe enemy/team indicators, subtitle controls, reduced flashes, reduced gore, hold/toggle options and mobile UI scale.

## 10. Multiplayer reliability and global ping

Current code has client prediction, reconciliation, interpolation and lag compensation; this is good groundwork, not proof of production scalability.

Next:
1. Deploy a single test server in a region close to initial testers (South Africa first if affordable).
2. Measure real RTT, jitter, packet loss, server tick time, room CPU, memory and disconnects.
3. Add reconnect tokens and match rejoin before regional matchmaking.
4. Add server-side rate limits, input validation, speed/fire-rate/ability sanity checks and basic telemetry.
5. Run 2, 8 and 16-client load tests, then many-room tests.
6. Evaluate interest management and compact binary snapshots if profiling shows bandwidth pressure.
7. Add region selection only when player counts justify multiple regions; show measured ping and do not promise a magic low-ping experience.
8. Scale Colyseus horizontally with shared presence/driver (Redis or managed equivalent) when required; rooms remain pinned to the process that created them.

Do not move physics into a Web Worker or switch tick rates just because a blog suggests it. Profile first. A worker adds synchronisation complexity; isolate expensive AI/pathfinding or asset decode before moving the authoritative physics loop.

## 11. Browser streaming and the Vice City lesson

The public Vice City browser ports are not magically downloading Rockstar's full game as a tiny web page. They compile an existing/reimplemented C++ engine to WebAssembly, then read game data supplied by the user, often through OPFS, a Service Worker and workers. The user must supply a legitimate game copy; the port does not ship proprietary game data. Their architecture is a useful reference for local caching and streaming, not something to copy wholesale.

NIGHTHAWK is a Three.js game, so use the transferable ideas:
- lazy-load map sectors and GLB assets;
- cache versioned assets with a Service Worker / Cache Storage first; evaluate OPFS only for large persistent local packs;
- load low LOD first, then high LOD near the player;
- use KTX2/Basis textures and Meshopt/Draco only after measuring decode time and quality;
- use InstancedMesh for repeated props;
- move expensive asset parsing and optional AI work off the render thread where practical;
- use compressed, versioned asset manifests and graceful fallback if storage is unavailable.

## 12. Progression, profiles and social

First release should support guest play with a stable local guest profile, then optional account linking for cross-device persistence. Keep the game playable without sign-in.

Profile:
- callsign, operator, level, match history, favourite weapon, cosmetic showcase, badges and privacy controls.
- XP from participation, objectives, assists, teamwork and wins; avoid kill-only progression.
- daily/weekly missions with generous completion windows; no streak punishment.
- weapon mastery unlocks cosmetics and practice challenges, not damage/recoil advantages.
- party invites via shareable room links; quick-ping wheel first.
- Text/proximity voice chat only on own-site build after moderation, mute/block/report, privacy and safeguarding design. Do not assume portal approval.

Creator tools:
- local replay and kill-card export;
- streamer mode hides room codes and personal IDs;
- custom match code and spectator/caster camera later;
- creator codes only if transparent, optional and supported by payment partner.
- social growth loop: weekly challenge, community map vote, creator playtest nights, short highlight clips, patch notes and a public roadmap. Do not auto-post to social accounts without player consent.

## 13. Monetisation and platform strategy

Separate platform builds behind adapters. Never assume one monetisation setup works on every portal.

- **Own site:** optional account, cosmetics, battle pass only after retention is proven; transparent prices and parental-friendly controls. No paid combat advantage.
- **Poki:** current docs say ads are through Poki SDK only; no IAP, no third-party ads, no external account systems or chat, and external requests are blocked by default unless approved. Bundle assets; do not add Discord/Google login or external voice chat to the Poki build.
- **CrazyGames:** Basic Launch has no monetisation; Full Launch uses CrazyGames SDK ads. IAP is only for selected games/invite-only and uses their supported Xsolla integration. Account, save, social and multiplayer features must follow current SDK/QA requirements.
- **itch.io:** useful for prototype feedback and community; do not rely on it as the only live multiplayer backend.
- **Steam/desktop:** only after web retention and controls prove the game deserves a native build.

Web3/NFTs/tokens: defer. They add wallet friction, fraud/security, consumer-protection, platform-policy and regulatory complexity, and can distract from core fun. If ownership is ever tested, start with optional wallet-linked cosmetic proof on the standalone site, no token speculation, no pay-to-win, no gambling and no impact on portal builds. Obtain legal and platform review before any paid token, marketplace or tournament entry fee.

## 14. Analytics and playtesting

Instrument only privacy-safe game telemetry with clear disclosure:
- first-frame time, load size, crash/error rate, device class, FPS buckets;
- tutorial completion, time to first match, match length, early quits;
- kills/deaths/assists/objective participation, weapon pick and win rates;
- ping/jitter/packet loss, reconnect rate, server tick p50/p95/p99;
- retention cohorts (D1/D7) only after consent/privacy policy is in place.
Do not collect real names, precise location, microphone or chat content for gameplay analytics.

Run moderated tests with 5–10 people at a time. Ask where they got confused, what felt unfair, when they wanted to quit, and which moment they would share. Watch play sessions rather than relying only on ratings.

## 15. Production gates

A feature is not "done" until:
- unit tests cover simulation rules;
- server tests cover replication and adversarial inputs;
- browser tests cover the real player flow;
- a performance comparison exists on low-end integrated graphics;
- asset licence/provenance is recorded;
- accessibility and reduced-effects settings work;
- feature is behind a config/flag until stable.

## 16. Immediate priority order

P0 — correct stale docs, real-network deployment test, fix movement/camera feel, profile current build.
P1 — FPP/TPP prototype and one full-body GLB operator; one real PBR ground material integrated end-to-end.
P2 — one vertical slice of the Sector 09 map, then movement polish, mission contracts and AI improvements.
P3 — guest profile + local progression, party invites, quick pings, kill snapshot/replay.
P4 — multi-region/scale only after load-test evidence; own-site chat only after moderation design.
P5 — portal adapters, cosmetics monetisation, creator programme.
P6 — vehicles, extraction mode, Black Site social-deduction mode, advanced bosses and optional Web3 experiment.

Do not attempt all features at once. Ship one complete vertical slice and measure it.
