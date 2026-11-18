# ROMS — First Realistic Operator Production Brief

Status: approved as the first character to prototype. Roms is an original NIGHTHAWK operator. The owner supplied reference photos in earlier project discussion; use those exact owner-provided images as likeness guidance only. Do not invent a new face, infer personal details, or use an unrelated online person's face.

## Art direction
Photorealistic / realistic game-ready human, grounded contemporary African special-operations aesthetic, believable anatomy and proportions. Not a superhero, not sci-fi armour, not a low-poly character. The face should read as the supplied reference while remaining a respectful fictional game character.

## Model deliverables
- One full-body GLB with a clean shared humanoid skeleton.
- Separate head/face, hair, body, uniform, vest, belt, gloves, boots, backpack and weapon attachment meshes/materials where practical.
- PBR maps: base colour, normal, roughness, metallic only where physically justified; use 2K for head/hero close-ups and 1K for most gear initially.
- LOD0 hero mesh, LOD1 gameplay mesh, LOD2 distant mesh; hide or merge small details at distance.
- Consistent scale and forward axis documented in the export notes.
- Root at ground plane; origin centred between feet; apply transforms; no negative scale.
- Keep facial features and gear readable at normal third-person camera distance.

## Character rig and animation
- Shared rig for all eight operators; no bespoke skeleton per character.
- Required first-pass clips: idle, walk, run, sprint, crouch idle, crouch walk, jump, land, aim idle, fire, reload, hit reaction, death.
- Animation clips must blend without root drift; use in-place locomotion initially because authoritative movement is simulation-driven.
- Weapon sockets: right hand, left support hand, muzzle, magazine, back carry.
- Validate shoulder/hand alignment with the current weapon viewmodel; do not alter fire origin or hit validation for cosmetic alignment.

## Role identity
Roms is the assault / entry operator. Silhouette: practical plate carrier, compact utility belt, gloves, kneepads and robust boots. Keep ammunition and pouches plausible; avoid excessive gear. Use restrained unit patches with fictional iconography only.

## Technical integration
- Load asynchronously with GLTFLoader; show existing procedural fighter while loading or if load fails.
- Store the model URL in a central asset manifest; no hardcoded remote dependency.
- Clone skeletons safely for multiple fighters (SkeletonUtils.clone); share geometry/materials where possible.
- Do not share mutable skeleton state between fighters.
- Keep physics capsules, movement and hitboxes in simulation unchanged.
- Add frustum culling and LOD; dispose GPU resources on teardown.
- FPP: local full body may be hidden selectively; retain arms/shadow only if correct. TPP: full body visible with shoulder camera.
- If the model fails to load, the match must still start and finish with the procedural fallback.

## Acceptance
- Roms model loads in offline and online matches.
- All 8 fighters can instantiate without skeleton cross-talk.
- Idle/run/aim/fire/reload/death clips play and blend correctly.
- No gameplay collision, damage or weapon-origin changes.
- No visual pop or crash when the model URL is missing.
- Record file size, texture memory, draw calls, FPS and frame-time p95/p99 on test hardware.
- Source, artist, exact licence and redistribution rights recorded in ASSETS.md.
