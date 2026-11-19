# NIGHTHAWK — Owner direction and conversation notes

**Last updated:** 19 November 2026  
**Purpose:** durable handoff of the owner's latest direction from the ChatGPT project-planning conversation. Read this before proposing or implementing major features. This document is intended to be found by Claude Code during whole-repository analysis.

## 1. Owner's vision

Build NIGHTHAWK into a full, high-quality, African-rooted tactical shooter with global appeal. Namibia and Southern Africa are the first creative foundation, not a limit on the audience or future settings.

It should feel like a coherent game universe rather than a collection of disconnected arena features:
- Distinct fictional African military, intelligence, police tactical, border-security, private-security and criminal organisations.
- Operators with identities, roles, personal histories, relationships, equipment, cosmetics and progression.
- Competitive multiplayer, co-op PvE, extraction, contracts, bounty hunts, covert operations and multi-stage campaigns.
- Missions involving target tracking, capture/detention, rescue/recovery, kidnap-response, intelligence gathering, sabotage, escort, convoy, extraction and changing world events.
- NPCs with their own motives, memory, fear, loyalty, morale, suspicion, relationships and incomplete information. Their behaviour should sometimes surprise players, but remain fair and testable.
- A world that remembers meaningful outcomes: faction reputation, mission consequences, rivalries, witnesses, recurring characters and changing patrol/alert states.
- Strong first-person and third-person presentation, responsive movement, satisfying weapons, vehicles, physics, explosions, spatial sound, lighting, shadows, animation and haptics.
- Accessible browser-first play, with controller/mobile support and a possible desktop path if justified.

The ambition is high. Delivery must remain staged: ship one polished vertical slice at a time, measure it, then expand.

## 2. Product principles

1. **African identity with global production quality.** Use original fictional names, flags, uniforms, patches, languages, environments and stories inspired by the region. Do not falsely claim affiliation with real armed forces or agencies, and do not reproduce real insignia without permission.
2. **Player agency.** Missions should allow stealth, observation, negotiation/surrender where appropriate, direct combat, alternate routes and meaningful extraction decisions.
3. **Fair NPC intelligence.** NPCs only know what they see, hear, infer or receive over communications. Reports carry source, timestamp, location uncertainty and confidence. No omniscient tracking or hidden accuracy cheats.
4. **Responsive before realistic.** Game feel matters more than a complicated simulation. Tune input latency, acceleration, animation transitions, recoil and hit feedback with measured playtests.
5. **Server authority.** Clients send inputs; server owns outcomes and valuable state.
6. **Cosmetics, not pay-to-win.** No paid damage, accuracy, matchmaking advantage or mission success.
7. **Accessibility and performance from the start.** Clear objectives, remappable controls, captions, colour-safe cues, reduced motion, adjustable quality and mobile fallbacks.
8. **Build for actual hardware.** Profile low-end integrated graphics, typical laptops and mid-range Android rather than designing only for a high-end PC.

## 3. First mission to make playable: Operation DUST LANTERN

### Premise
A civilian communications technician and field recorder disappeared during a storm near a remote relay site. Conflicting reports indicate that one of two fictional security compounds may be holding the technician, while another faction is searching for the recorder. The player must investigate, identify the correct site, recover the technician safely and extract.

This is a rescue/recovery mission. The captive is a protected person, not a target to harm. A successful run should be possible without killing anyone.

### Intended flow
1. **Insert:** enter Kavari Basin from a selected insertion point.
2. **Recon:** find two of three evidence clues (damaged radio, vehicle tracks, access card/witness report).
3. **Identify:** use evidence to establish which of two compounds holds the missing technician. The selected site varies by deterministic mission seed.
4. **Recover:** reach and secure the technician. They become an escort NPC, follow at a safe distance, wait/rejoin if separated and do not blindly run into danger.
5. **Extract:** choose one of two extraction points/routes. Reach the extraction zone with the technician and hold the area for a readable short timer.
6. **Debrief:** show completion, evidence, captive safety, time, alarm escalation and collateral. Do not grant persistent currency until a server-side ledger exists.

### Variation
Use a deterministic seed to vary captive site, clue placement/required clues, patrol routes/check-in timing, extraction availability and one secondary event (storm, power outage, false alarm, witness hiding or rival contractor arrival). Same seed must reproduce the same setup.

### NPC roles and alert ladder
- Routine patrol: waypoint route, periodic check-in, responds to visible/heard anomalies.
- Gate guard: watches an entry sector and reports suspicious events.
- Search pair: investigates a confidence-rated last-known area and may search the wrong place.
- Supervisor: coordinates search, reinforcement, retreat or surrender decisions.
- Civilian/witness: hides, flees or provides partial information based on what they observed and trust.

Alert states: routine → uneasy → searching → alert → crisis. Suspicion decays when evidence goes cold. Losing line of sight must remove live player tracking; radio reports are delayed and uncertain. No dynamic enemy spawning until fighter roster replication and snapshot handling are deliberately designed.

### Acceptance criteria
- Mission mode is separate from the current battle-royale loop; do not run a shrinking-zone deathmatch in the rescue operation.
- At least one complete playable path from insertion through debrief.
- At least two clues required; the third is optional.
- Wrong-site investigation remains recoverable.
- NPCs do not know unobserved player locations.
- Captive can be secured, escorted, separated, recovered and extracted.
- Extraction cannot complete if captive is not in the zone.
- Mission state and interactions are server-authoritative when online is eventually enabled.
- Mission runs without an LLM or cloud service.
- Deterministic tests cover seed variation, clue gates, rescue, escort, extraction, failure and replay.
- No rewards are persisted to a client-trusted profile as if they were secure currency.

## 4. Game modes and mission families

Target modes:
- Skirmish / quick match.
- Operations / PvPvE extraction.
- Co-op tactical operations and multi-stage campaign.
- Covert operations / Black Site with hidden information and counterplay.
- Bounty Hunt / target tracking and capture.
- Rescue and kidnap-response.
- Convoy escort/intercept and search-and-rescue.
- Training range and movement/weapon drills.

Mission types should include recon, evidence recovery, capture/detention, rescue, escort, sabotage/counter-sabotage, relay uplink, convoy, extraction and dynamic events. Each mission needs clear briefing, primary/optional objectives, entry choices, fail conditions, extraction rules, AI response, rewards/consequences and accessibility cues.

## 5. NPC intelligence architecture

Use layers:
- **Reflex (60 Hz):** deterministic movement, aim, cover, collision, weapon handling and immediate threat response.
- **Tactical (event-driven / 2–5 Hz):** utility AI chooses investigate, search, patrol, guard, call backup, flank, retreat, escort, negotiate or evacuate.
- **Character (slower):** goals, traits, fear, loyalty, morale, relationships, suspicion and structured memory.
- **Dialogue (optional):** constrained language model only for dialogue/chatter/slow planning; validate output against strict allowed intents. No direct access to authoritative state mutation.
- **Mission director:** controls pacing and opportunities but never secretly alters hitboxes, damage or aim accuracy.

Memory is scoped: personal observation, squad radio, faction intelligence and rumour are separate confidence levels. It decays. NPCs can be wrong. Use seeded tests and evaluate detection fairness, search coverage, coordination and CPU cost. LLM features must be optional and offline-safe.

## 6. Movement, weapons, vehicles and world simulation

- Keep Rapier initially. Improve acceleration/deceleration, input buffering, slope/stair handling, crouch transitions, sprint, ADS movement, slide/vault prototypes and animation blending.
- Maintain fixed-step server authority and reconciliation. Animation root motion must not silently become multiplayer position authority.
- Weapon feel: per-weapon recoil/recovery, sway, spread, ADS transitions, reload phases, movement penalties, clear attachment trade-offs, validated fire cadence/ammo/damage. Use game-authored ballistic abstractions, not claims of exact real-world weapon simulation.
- Explosions: separate authoritative blast radius/falloff/occlusion/impulse from cosmetic fireball, smoke, debris, audio, camera shake and haptics. Pool effects and cap chain reactions.
- Vehicles: current buggies/bikes are arcade first-pass. Prototype raycast wheels, suspension, grip, slip, braking, handbrake and centre of mass in Rapier before considering another engine.
- Character/world physics should be deterministic enough for server authority and tested for frame/tick performance.
- Preserve the distinction between collision meshes and visual geometry.

## 7. Rendering, materials, lighting and art

- Continue Three.js and GLB/glTF asset pipeline unless measurements justify an engine change.
- Build a Southern African PBR library: red/pale sand, gravel, dry river rock, sun-faded concrete, corrugated metal, weathered asphalt, canvas, nylon, rubber, glass and hardy vegetation.
- Use correct sRGB/linear workflow, normal/roughness/metallic maps, texture atlases, KTX2/Basis, instancing, frustum culling and LODs.
- Shadow budget: one main sun shadow, tuned cascades/resolution, limited local casters, baked/static occlusion where appropriate, contact shading and atmospheric fog.
- Create distinct clear afternoon, overcast, dusty sunset and night presets.
- Replace block-built operator visuals with shared-rig GLB characters and retargeted animations, one vertical slice at a time.
- Keep likeness references restricted to approved use; no social-media UI, watermarks, unrelated clothing or unapproved real insignia.

## 8. Audio, responsiveness, UI/UX and haptics

- Measure frame-time p50/p95/p99, input-to-photon, RTT, jitter, packet loss, server tick and first playable time.
- UI should be event-driven; do not rebuild the entire DOM each frame.
- Spatial audio: attenuation, stereo/HRTF panning, occlusion, indoor/outdoor filtering, reverb zones, priority and separate weapon/mechanical/impact/environment/radio/UI buses.
- Haptics: Gamepad API where supported; mobile vibration optional and user-controlled. Distinct short patterns for hit, explosion, objective and vehicle impact. Provide master toggle/intensity and graceful fallback.
- Support keyboard/mouse, gamepad and touch action maps; remapping, captions, colour-safe signals, scalable UI, reduced motion and readable objective markers.
- Keep first load lean; stream optional assets and degrade visual effects before input responsiveness.

## 9. Accounts, progression and economy

- Guest-first play and local settings; optional passkey/email/social sign-in via a reputable identity provider.
- Persistent server profile, inventory ownership, XP, mission ledger, operator unlocks, cosmetics, account recovery, privacy export/delete and guest migration.
- Server-side auditable ledger for any item or balance with real value. Client-side localStorage is not authoritative.
- Earnable soft currency and direct-purchase cosmetics; uniforms, patches, skins, banners, emotes, vehicle liveries and safehouse cosmetics.
- No pay-to-win stats. Prefer direct-purchase cosmetics; publish odds if randomised items are ever used.
- Add moderation/report/block and age/region controls before public social systems.

## 10. Wallets and wagering: hard legal gate

Owner is interested in optional wallet connection and player-versus-player crypto stakes with a winner payout. This is **not approved for implementation**.

- Never request or store seed phrases/private keys. A future wallet proof-of-control flow would use a signed, expiring, domain-bound nonce and no custody.
- Wallet ownership proof for optional cosmetics is a possible later experiment after security, platform and legal review.
- Do not implement player stakes, pooled pots, winner-takes-pot, cash-out, token rewards or custodial services without written Namibian and target-market legal advice, licensing analysis, AML/KYC, age and region controls.
- Namibia's Gaming and Entertainment Control Act includes provisions concerning player-to-player staking on uncertain outcomes, paid games with prizes where skill/chance may determine outcomes, and unauthorised online gaming. Do not assume a skill-based match, cryptocurrency or smart contract avoids gambling regulation.
- The Virtual Assets Act may apply to defined virtual-asset services. Wallet signature proof, custody, exchange, transfer and pooled funds require distinct legal analysis.
- Safer first monetisation is ordinary compliant payments for cosmetics, not betting.

## 11. Open-source shortlist (evaluate; do not migrate without evidence)

| Need | Candidate | Direction |
|---|---|---|
| Browser rendering | Three.js (MIT) | Keep current |
| Browser physics | Rapier 3D (Apache-2.0) | Keep current, profile |
| Alternative physics | Jolt (MIT) | Benchmark only if Rapier has a measured limitation |
| AI steering | Yuka + custom utility AI | Keep and extend |
| Navigation | Existing A*; later Recast Navigation | Add when geometry stabilises |
| Multiplayer | Colyseus (MIT) | Keep current |
| Audio | Web Audio API | Build spatial audio layer |
| Assets | glTF/GLB + KTX2 | Standardise pipeline |
| Engine alternatives | Godot / O3DE | Only if browser architecture reaches a hard ceiling |

Research references:
- Rapier character controller: https://rapier.rs/docs/user_guides/bevy_plugin/character_controller/
- Three.js physics overview: https://threejs.org/manual/pages/physics.html
- Web Audio API: https://www.w3.org/TR/webaudio/
- Tencent Delta Force Metaperf GDC session: https://www.gdcvault.com/play/1036028/Metaperf-Industrializing-Performance-Optimization-for
- KRAFTON/NVIDIA PUBG Ally architecture: https://developer.nvidia.com/blog/how-krafton-built-pubg-ally-a-co-playable-character-powered-by-nvidia-ace/
- Godot features: https://docs.godotengine.org/en/stable/about/list_of_features.html
- O3DE features: https://docs.o3de.org/docs/welcome-guide/features-intro/

## 12. Delivery order

A. First complete offline operation (DUST LANTERN), seeded mission tests and readable briefing/debrief.  
B. Faction response, patrol schedules, suspicion, witnesses and scoped memory.  
C. Movement/weapon feel, spatial audio and haptics, with benchmarks.  
D. One realistic operator + weapon + modular Southern African environment visual slice.  
E. Guest-to-account identity, server progression, cosmetics and account recovery.  
F. Co-op/extraction matchmaking, parties, moderation and replay tools.  
G. Optional wallet proof for cosmetics only after legal/security/platform review.  
H. Any wager/prize pool is blocked until formal legal and licensing approval; not part of the current roadmap.

## 13. Collaboration and branch hygiene

The owner uses Claude Code and ChatGPT in parallel. Always:
- Check latest main SHA and all open PRs before coding.
- Create a separate branch from latest main.
- Do not push to, rebase, close or merge another contributor's branch.
- Keep PRs small and reviewable; do not merge without owner permission.
- Reconcile changes if main advances; do not overwrite Claude's commits.
- Report exact files, commits, test results, performance measurements and known limitations.
