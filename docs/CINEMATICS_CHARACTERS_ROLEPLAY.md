# NIGHTHAWK — Cinematics, character roleplay and mission-story production

**Status:** proposed production framework. Existing playable operations and story proposals remain as described in `docs/STORY_AND_ROLES.md`; this document does not make proposed names or plots canon.
**Goal:** make missions feel like episodes in one connected tactical universe, using reusable in-engine cinematics rather than expensive pre-rendered video.

## 1. Narrative pillars

- Fictional Southern African-inspired setting with global appeal; no false affiliation with real armed forces, police or intelligence agencies.
- Characters have motives, history, relationships, loyalties and conflicting information.
- The player has agency: stealth, observation, negotiation/surrender where appropriate, direct action, alternate routes and extraction decisions.
- Consequences are legible and persistent where the server can validate them.
- Story must work without a cloud LLM. Language models may assist optional dialogue drafting or non-authoritative chatter, never combat, mission truth or player outcomes.
- Keep all named characters, factions and story beats provisional until the owner approves them.

## 2. Campaign spine already proposed

Use `docs/STORY_AND_ROLES.md` as the source of current story proposals:
1. **DUST LANTERN** — rescue a missing signals technician; evidence suggests the recovery contract was compromised. Built as an offline operation.
2. **SIGNAL BLACKOUT** — disable three relays before the trace locks and extract. Built as an offline operation.
3. **BLACK GLASS** — planned night infiltration of the buyer's data vault; stealth-first, loud route remains possible.
4. **LAST LIGHT** — planned defence of the extraction pad while a convoy arrives.
5. **THE BROKER** — planned final contract to capture the buyer and decide what to do with the evidence.

Treat this as a season/act structure, not a linear movie. Each operation should be understandable alone, with optional intel and debrief details rewarding players who followed earlier episodes.

## 3. Cinematic language

Prefer real-time in-engine sequences using the same characters, props, lighting, weather and sound as gameplay. This avoids maintaining separate visual assets and supports browser streaming.

Sequence types:
- **Briefing vignette (10–25 s):** map table, radio intercept, satellite/field photo board, commander briefing.
- **Insertion transition (5–12 s):** aircraft/vehicle arrival, storm, distant compound, squad silhouettes.
- **Character beat (5–20 s):** operator checks kit, medic treats a wound, technician hesitates, rival watches from cover.
- **Mission event (2–8 s):** power cuts, relay activates, convoy arrives, extraction signal changes.
- **Debrief (15–35 s):** evidence board, mission outcome, faction reaction and next-operation hook.

Use a restrained camera vocabulary: establishing wide, slow lateral track, shoulder/over-operator shot, close-up on evidence/objective, radio-room insert, then return to player control. Avoid long unskippable sequences. Camera movement must not cause motion sickness or hide mission-critical information.

## 4. Data-driven cinematic timeline

Represent each sequence as versioned data, not a one-off block of imperative code. A timeline event can contain:
- `atMs` or `startTick`: deterministic start time;
- `type`: allow-listed cue (camera, animation, dialogue, subtitle, sound, prop state, lighting cue);
- `subjectId`: a known character or prop in the scene;
- `payload`: schema-validated parameters;
- `durationMs`, easing and optional skip group;
- `visibility`: cinematic-only or gameplay-visible;
- `fallback`: what to do when an asset/voice line is missing.

Never permit timeline data to execute JavaScript, load arbitrary URLs, invoke arbitrary game methods or mutate authoritative match state. Gameplay events (door unlocked, relay disabled, captive rescued, extraction completed) remain owned by the mission simulation. The cinematic can observe and present those events; it cannot decide them.

### Playback states

`idle → preparing → playing → paused → completed`; skip transitions to `completed` with a defined gameplay handoff. Handle:
- player disconnect/reconnect;
- missing GLB, animation, subtitle or audio;
- browser tab hidden or frame-rate collapse;
- multiplayer late join;
- sequence version mismatch;
- skip vote / host departure for co-op;
- accessibility settings and reduced-motion mode.

In multiplayer, server sends a small sequence ID, version, start tick and allowed skip state. Clients render locally from the same timeline. Do not stream full video or per-frame camera data over the game protocol.

## 5. Camera and animation rules

- Cinematic camera is client-side presentation; never changes player position, aim origin, hitbox, weapon state or server simulation.
- Use existing Three.js camera and character rig pipeline. Reuse animation clips and blend into/out of gameplay locomotion cleanly.
- Use a fixed camera rail or authored transform keys with bounded interpolation. Avoid arbitrary physics-driven camera motion.
- Camera collision should avoid clipping through walls and bodies; preserve readable composition if the ideal camera is blocked.
- Restore prior FPP/TPP preference and input state exactly when sequence ends.
- Disable firing/movement only for a clearly communicated local presentation window; in online play, sequence timing and control lock must be server-coordinated.
- No cinematic may reveal a hidden opponent's exact position or future tactical information unavailable to the player.

## 6. Character bible and roleplay model

Every recurring character should have a versioned profile:
- identity: fictional name, callsign, faction, role and visual silhouette;
- motivation: short-term goal, long-term goal, fear and boundary;
- relationships: allies, rivals, debts, family or professional history;
- knowledge: what they personally observed, what their squad reported and what they only suspect;
- voice: cadence, vocabulary, languages/accent direction, radio style and approved voice actor/asset;
- roleplay state: trust, suspicion, loyalty, morale, stress and current disposition;
- continuity: first appearance, last seen, mission outcomes and canonical facts.

Keep private character author notes separate from the in-game memory available to NPCs. The character cannot act on facts they do not know. Relationship and reputation changes should come from explicit mission events, not an LLM's free-form guess.

### Roleplay behaviours

- A guard may warn, challenge, investigate, retreat, surrender or call for help based on role, confidence and faction orders.
- A witness may be frightened, evasive, cooperative or mistaken; they remember only what they saw/heard.
- A captive/protected person has safety rules and cannot be treated as a reward object or harmed for bonus currency.
- A squadmate can comment on a mission, react to a known injury or disagree about a faction decision.
- A recurring rival can recognise prior encounters only if their own memory/briefing supports it.
- Dialogue choices should be short and contextual; consequences are authored state transitions with clear conditions.

## 7. Dialogue system and voice production

Dialogue line schema:
- stable `lineId`, speaker ID, language, text, optional voice asset ID;
- subtitle timing, radio filter, priority and interruption policy;
- preconditions based on explicit mission/character state;
- allowed consequence ID, if any;
- localisation and content rating metadata.

Do not generate free-form dialogue that can trigger arbitrary actions. LLM-assisted writing is an authoring tool only. At runtime, dialogue can use authored lines, weighted variations and bounded intent slots. If optional runtime generation is ever added, validate every output against a strict schema and allow-list; the simulation ignores invalid output.

Voice pipeline:
1. write and approve original script;
2. confirm actor/voice rights and permitted synthetic voice use;
3. record clean dialogue with consistent microphone and room tone;
4. edit, denoise and loudness-normalise;
5. export short compressed browser-ready files plus captions/transcript;
6. log source, performer, licence, language, version and hash;
7. support mute, subtitle-only and dialogue-volume controls.

No imitation of a real person's voice without explicit documented permission. Do not use commercial-game/movie voice clips.

## 8. Mission story design template

Each mission brief must specify:
- premise and what the player knows at insertion;
- primary and optional objectives;
- entry routes and reconnaissance clues;
- factions and NPC roles;
- character motives and information boundaries;
- escalation ladder and director pacing;
- stealth, negotiation, combat and recovery alternatives;
- fail conditions and protected-person safety;
- extraction choices and consequences;
- cinematic moments with skip/fallback rules;
- rewards (cosmetic/progression only, server validated);
- debrief facts, character reactions and next-episode hook;
- deterministic acceptance scenarios.

### Example future episode: BLACK GLASS (proposal only)

Premise: the unit has a partial data fragment linking the compromised recovery contract to a buyer's secure archive. The team must identify the correct vault room, recover the ledger and leave before the facility locks down.

Possible beats:
- briefing: the recovered fragment is incomplete; two archive locations are plausible;
- insertion: night approach during a power fluctuation;
- recon: collect two independent clues to identify the correct room;
- roleplay: a technician may cooperate, hide or raise an alarm based on how the team approaches;
- objective: copy evidence while keeping the relay uplink from being traced;
- escalation: guards search evidence-backed locations, not the player's live coordinates;
- extraction: leave through a service road or wait for a convoy diversion;
- debrief: the recovered ledger reveals the next buyer link; the player's collateral and witness treatment alter faction trust.

This is a design example, not approved canon or implemented mission content.

## 9. CGI / VFX scope for the browser

Prioritise effects that communicate gameplay and sell scale:
- dust plumes, sand gusts and vehicle trails;
- muzzle flash, smoke and heat shimmer;
- metal impact sparks, concrete dust and glass fragments;
- relay activation pulse, signal interference and screen/radio effects;
- searchlight cones and volumetric-looking fog using inexpensive layered geometry;
- restrained explosions with separate authoritative blast logic and client-only presentation;
- cinematic title cards, map overlays, evidence boards and faction insignia (original fictional designs).

Budget rules:
- VFX never controls damage, visibility authority or mission state.
- Pool particles and use instancing; cap simultaneous emitters and lifetime.
- Respect graphics quality, reduced-motion and accessibility options.
- Use GPU-friendly billboards and low-cost shader variants; avoid a new rendering framework.
- Reuse the existing draw-call/frame-time budget and profile on integrated graphics.
- Every external model, texture, font, sound and voice asset needs provenance and licence evidence in `ASSETS.md`.

## 10. Story continuity and persistence

Store compact facts, not entire transcripts:
- mission outcome and seed;
- objective/evidence discoveries;
- protected-person outcome and collateral;
- faction reputation deltas;
- named character state transitions;
- clues unlocked for later operations;
- sequence version viewed/skipped.

The server validates online mission results and writes the campaign event. Offline play can save local continuity but must be marked unverified until synchronised. Conflict resolution during guest-to-account migration must be explicit and never duplicate rewards.

## 11. Production order

1. Approve the campaign spine and character canon.
2. Build the reusable in-engine timeline player with a single short briefing sequence.
3. Add subtitle/dialogue presentation and skip/accessibility behaviour.
4. Add character profiles and evidence-scoped dialogue conditions.
5. Create one mission-specific cinematic beat for BLACK GLASS only after mission gameplay is ready.
6. Add persistent campaign facts and debrief consequences.
7. Expand voice acting, cinematic camera polish and VFX after profiling.

The first deliverable should be a 20-second briefing vignette built from existing assets and a data-driven timeline. It should prove the pipeline without delaying gameplay or creating a separate movie-rendering workload.
