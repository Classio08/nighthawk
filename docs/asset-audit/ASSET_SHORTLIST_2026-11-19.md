# NIGHTHAWK asset shortlist (local inspection, 2026-11-19)

Inspected with Blender 3.6.0 (background Python API) for FBX / OBJ / Blend files and a purpose-written dependency-free reader for GLB / glTF (nothing was installed). 4,620 model files across 31 pack entries were measured; 15 contact sheets were rendered with Blender's Workbench renderer (geometry plus whichever textures resolved — **not** a game-engine lighting preview). Raw measurements are in `geometry-inventory.csv`, `animation-inventory.csv`, `rig-inventory.csv`, `asset-manifest.json`; look at `previews/`.

## Headline conclusions

1. **Nothing in this library meets the owner's "realistic, modern, not low-poly" art direction.** Everything is stylised or retro low-poly (the most realistic items are the Utility Infrastructure poles and the two PBR ground sets). The library is useful as **prototype-grade content with real, reusable rigs**, which is what the first visual slice needs (one shared GLB humanoid rig, PBR ground, destructible props), not as final art.
2. **The licence situation decides the plan.** Only 9 pack entries carry licence text in the archive (all CC0): the Quaternius characters / animations / guns / nature kit, the Rgsdev vehicles, the Breakable Boxes, and Classic 64. **The modular urban kit (URBAN), the best environment art (Utility Infrastructure, Shacks), the best first-person kit (RetroWeaponPack), the 118-clip locomotion set (Human Basic Motions) and all UI packs have no usable licence evidence — do not import them yet.**
3. **Characters and animation are the strongest verified match.** The Universal Base Characters and both Universal Animation Libraries share an identical 65-bone skeleton (name overlap 1.00), so 86 clips play on the characters with no retargeting. Gaps: no rifle/SMG/shotgun/ADS/prone/lean/vault clips, and **forward-only locomotion** (no backward or strafe loops).
4. **There is no verified building/street kit.** A first modern urban/industrial map therefore needs either (a) provenance for URBAN + Utility Infrastructure + Shacks, or (b) authored modules. Verified vegetation, rocks, crates/barrels and vehicles can populate it meanwhile.

## Ranking (all pack entries)

Score = 0.25 × visual quality + 0.25 × technical suitability + 0.15 × performance + 0.15 × compatibility + 0.20 × licence (verified 5, conditional 3, unverified 1). Visual / technical / performance / compatibility are my 1–5 judgements from the measurements and sheets, judged against `docs/REALISTIC_ASSET_SPEC.md` budgets and the Three.js + shared-rig pipeline; they are not computed values. The licence gate overrides the score: **a high score with an UNVERIFIED status still means do not import.**

| # | Pack | Use | Vis | Tech | Perf | Compat | Licence | Score | Verdict |
|---:|---|---|---:|---:|---:|---:|---|---:|---|
| 1 | Universal Base Characters [Standard] (Quaternius) | player/NPC base bodies + hair | 3.5 | 4.5 | 3 | 5 | VERIFIED | 4.20 | **USE FIRST** |
| 2 | Breakable Boxes - FBX/glTF/Blend (loafbrr) | intact + broken barrel, crate, jar | 3 | 4 | 5 | 4 | VERIFIED | 4.10 | **USE FIRST** |
| 3 | Free Low Poly Vehicles Pack (Rgsdev) | civil / police / emergency / trucks | 3 | 4 | 4 | 4 | VERIFIED | 3.95 | **USE FIRST** |
| 4 | Stylized Nature MegaKit [Standard] (Quaternius) | vegetation, rocks, pebbles, flowers, mushrooms | 3.5 | 4 | 3 | 4 | VERIFIED | 3.93 | **USE SELECTIVELY** |
| 5 | Ultimate Gun Pack (Quaternius) | world/third-person weapons + pickups + attachments | 3 | 3 | 5 | 4 | VERIFIED | 3.85 | **USE FIRST** |
| 6 | Universal Animation Library [Standard] (Quaternius) | 43 humanoid clips (+ root-motion variant) | 2 | 4.5 | 3 | 5 | VERIFIED | 3.83 | **USE FIRST** |
| 7 | Universal Animation Library 2 [Standard] (Quaternius) | 43 more clips + female mannequin | 2 | 4 | 3 | 5 | VERIFIED | 3.70 | **USE SELECTIVELY** |
| 8 | Ground087 2K (ambientCG naming) | pale dry-ground PBR set | 4.5 | 4.5 | 3.5 | 4.5 | UNVERIFIED — DO NOT IMPORT | 3.65 | **BLOCKED (licence)** |
| 9 | Breakable Boxes - Godot folder (loafbrr) | duplicate of the glTF set + Godot materials | 3 | 2 | 5 | 3 | VERIFIED | 3.45 | **SKIP** |
| 10 | Utility Infrastructure (author not stated) | power poles and utility props with 3 LODs | 4 | 4.5 | 3.5 | 4 | UNVERIFIED — DO NOT IMPORT | 3.45 | **BLOCKED (licence)** |
| 11 | rocks_ground_03 4K (Poly Haven naming) | rocky ground PBR set | 4.5 | 4 | 2.5 | 4 | UNVERIFIED — DO NOT IMPORT | 3.30 | **BLOCKED (licence)** |
| 12 | RetroWeaponPack V1 | first-person arms + 4 rigged guns + 17-19 FP clips per gun | 2.5 | 5 | 4 | 3 | UNVERIFIED — DO NOT IMPORT | 3.13 | **BLOCKED (licence)** |
| 13 | URBAN (author not stated) | modular urban kit: building parts, prebuilt buildings, roads, fences, bus stops, traffic lights, litter, pipes, vents | 2.5 | 3.5 | 5 | 4 | UNVERIFIED — DO NOT IMPORT | 3.05 | **BLOCKED (licence)** |
| 14 | Classic 64 Asset Pack 0.6 (Craig Snedeker) | 130 N64-style props (food, books, boxes, shelves, doors, panels...) | 1.5 | 2.5 | 5 | 2 | VERIFIED | 3.05 | **SKIP** |
| 15 | Wenrexa Free Hologram Interface | 48 UI sprites | 2.5 | 3 | 5 | 4 | UNVERIFIED — DO NOT IMPORT | 2.93 | **BLOCKED (licence)** |
| 16 | Wenrexa More UI Hologram Interface | 49 UI sprites | 2.5 | 3 | 5 | 4 | UNVERIFIED — DO NOT IMPORT | 2.93 | **BLOCKED (licence)** |
| 17 | Wenrexa UI Sci-Fi Minimalism #01 | 50 PNG + PSD | 2.5 | 3 | 5 | 4 | UNVERIFIED — DO NOT IMPORT | 2.93 | **BLOCKED (licence)** |
| 18 | Shacks, Shanties, Sheds and Gantries 0001 | corrugated-metal sheds, lean-tos, gantry floor, stairs, handrail, barricades, fence | 3 | 3 | 5 | 3 | UNVERIFIED — DO NOT IMPORT | 2.90 | **BLOCKED (licence)** |
| 19 | Wenrexa Icons RPG & Military (+102) | 4,080 PNG + 102 SVG icons incl. military weapon/ammo set | 3 | 3 | 4 | 4 | UNVERIFIED — DO NOT IMPORT | 2.90 | **BLOCKED (licence)** |
| 20 | Street Furniture (author not stated) | 13 small props (barrel, box, crowbar, flashlight, gas mask, hammer, lock, trash can...) | 2.5 | 3 | 5 | 3 | UNVERIFIED — DO NOT IMPORT | 2.78 | **BLOCKED (licence)** |
| 21 | Wenrexa Icons Potions | 155 fantasy potion icons | 2 | 3 | 5 | 3 | UNVERIFIED — DO NOT IMPORT | 2.65 | **SKIP** |
| 22 | Wenrexa Icons Spells | 350 fantasy spell icons | 2 | 3 | 5 | 3 | UNVERIFIED — DO NOT IMPORT | 2.65 | **SKIP** |
| 23 | LowPolyGunAssets (datguyjack) | 10 low-poly rifles | 2.5 | 2.5 | 5 | 3 | UNVERIFIED — DO NOT IMPORT | 2.65 | **BLOCKED (licence)** |
| 24 | PolyPack Vehicles-AI 1.2 | 15 vehicles | 2.5 | 3 | 4 | 3 | UNVERIFIED — DO NOT IMPORT | 2.63 | **BLOCKED (licence)** |
| 25 | Designersoup Low Poly Car Pack Vol.1 | 5 detailed cars | 3.5 | 2.5 | 3 | 3 | UNVERIFIED — DO NOT IMPORT | 2.60 | **BLOCKED (licence)** |
| 26 | Human Basic Motions FREE 2.4 (Kevin Iglesias) | 118 locomotion clips (8-direction walk/run/sprint, jump, idles) + 2 mannequins | 2 | 4 | 3 | 2 | UNVERIFIED — DO NOT IMPORT | 2.45 | **BLOCKED (licence)** |
| 27 | PSX Style Cars (GGBot) + 16 car SFX | 8 PSX cars + wheel + 16 OGG car sounds | 2 | 2 | 5 | 3 | UNVERIFIED — DO NOT IMPORT | 2.40 | **BLOCKED (licence)** |
| 28 | Loose files in raw-zips (never unpacked) | 29 FBX/blend files: guns, boats, planes, helicopters, Industrial_exterior_v2.glb, tree pack blend | 2 | 2.5 | 4 | 3 | UNVERIFIED — DO NOT IMPORT | 2.38 | **BLOCKED (licence)** |
| 29 | tree_pack_1.1 | 44 cross-plane trees and bushes | 1.5 | 2 | 5 | 3 | UNVERIFIED — DO NOT IMPORT | 2.28 | **BLOCKED (licence)** |
| 30 | Industrial exterior (IndustrialHorror_PS_like) | one FBX 'kit layout' of 78 industrial parts | 2 | 2 | 4 | 2 | UNVERIFIED — DO NOT IMPORT | 2.10 | **BLOCKED (licence)** |
| 31 | Anims_Only_glTF_V1 (CMU mocap, converted) | 2,548 raw mocap clips, 43-bone rig | 1 | 2 | 2 | 2 | CONDITIONAL | 1.95 | **SKIP** |

## Recommended first combination

### Tier A — licence-verified, can be imported after the normalisation steps listed

| Role | Assets | Preferred file(s) | Normalisation needed |
|---|---|---|---|
| Player / NPC bodies | Universal Base Characters: `Superhero_Male_FullBody` (14,318 tris, 1.86 × 1.82 m T-pose), `Superhero_Female_FullBody` (15,060 tris); hair `Hair_Buzzed`, `Hair_Buns`, `Hair_Long`, `Hair_Beard` (rigged-to-head-bone glTF) | `Base Characters/Godot - UE/*.gltf` (2K textures, 65-bone skin) | Gear/uniform and approved-likeness heads must be authored; underwear-only base. One body mesh is already inside the 12k–25k gameplay budget, so add LODs before adding kit. |
| Animation | UAL1 + UAL2 (86 clips, 30 fps, same rig) | `Unreal-Godot/UAL1_Standard.glb`, `UAL2_Standard.glb` (non-RM) | Use the clips, not the bundled mannequin. See the clip map below. |
| Held weapons / pickups | Quaternius Ultimate Gun Pack: 40 guns + 15 accessories (0.7k–2.8k tris) | `FBX/*.fbx` (identical to OBJ/Blend) | Rescale ≈0.18 (an AR is 5.2 m long as exported); author muzzle/grip/magazine/optic sockets; rename to fictional weapons. |
| Vehicles | Rgsdev: Police Sedan, Police SUV, Pickup, SUV, Van, Truck, Ambulance, Bus, Taxi, Firetruck, Sedan, Hatchback | `<Name>/<Name>.fbx` | Body + 4 named wheel objects, wheel origins ≤0.09 m from centre (not Monster Truck). ≈2.8 m wide as exported (track 1.95 m, wheelbase 3.22 m on cars): normalise scale, add a collision proxy; do **not** import `All vehicles.fbx` as well. |
| Destructible props | Breakable Boxes: Barrel (736 tris) + Barrel_Broken_1/2 + Barrel_Ring; Crate (136) + Crate_Broken_1/2; Jar (570) + Jar_Broken_1–4 | `FBX/Barrel/, FBX/Crate/, FBX/Jar/ (*.fbx)` | Relink the 1024 px textures (FBX does not bind them); intact→broken swap with server-driven impulses. |
| Vegetation / rocks | Stylized Nature MegaKit: `Bush_Common` (900 tris), `Fern_1`, `Grass_Common_Short`, `Pebble_*`, `RockPath_*`, `DeadTree_1` | `glTF/*.gltf` | Choose desaturated, low-poly pieces; the 5k–10k-tri trees and colourful flowers do not fit the sand/industrial look. |

### Tier B — best technical fit, but **UNVERIFIED — DO NOT IMPORT** until provenance is recorded

| Role | Asset | Why it is the best fit | What blocks it |
|---|---|---|---|
| Urban buildings + streets | URBAN (GLB): `Buildings Prebuild/flat_*.glb`, `Hangar1.glb`, Roads, Bus stops, Traffic lights, Cones & Barriers, Litter | Only modular urban kit; 3 m grid; median 88 tris; 1024 px facades; GLB complete | No licence/author. Wall tiles are zero-thickness quads (need collision and a back face). |
| Utility props | Utility Infrastructure `pole_*` + `prop_transformer`, `prop_lamp` | Real 3-level LODs; 256–512 px textures | No licence/author. |
| Industrial yard | Shacks/Shanties/Sheds/Gantries (sheds, lean-tos, ramps, gantry floor, barricades) | 24–270 tris, corrugated-metal textures | No licence; `.blend` only. |
| First-person arms + guns | RetroWeaponPack: `FP_Arms.fbx` (63 bones incl. hand IK/elbow-pole controls) with 17–19 clips per Pistol/Rifle/Shotgun/SMG (Breathing, Walk, Run, Crouch, AimStart/AimEnd, Fire, Fire_Aiming, Reload, Draw, Hide, Interact) and rigged guns (slide/hammer/trigger/magazine bones) | The only complete FP kit; matches the spec's separate FP arms rig | Licence is one informal sentence, no author; retro texture style. |
| Locomotion | Human Basic Motions FREE: 8-direction walk/run/sprint ± root motion, jump begin/land | Fills the strafe/backpedal gap in UAL | Asset Store licence unresolved; separate 56-bone rig needs retargeting. |
| PBR ground | Ground087 2K, rocks_ground_03 | Right material set for the PBR ground slice | ZIP has no licence file; re-download from the official CC0 pages (needs approval). |

### Style coherence

Tier A is internally coherent: the Quaternius pieces (characters, guns, nature) and the Rgsdev/Breakable-Box props share a clean flat-shaded or hand-painted low-poly look with limited texturing. URBAN's muted photographic 1024 px facades sit between that look and the ground PBR sets; they would blend acceptably in a stylised greybox but not in a realistic one. Retro Weapon Pack and Classic 64 (N64/PSX look) would clash with everything else.

## Category notes

### Characters and animation

- **Rig compatibility (bone-name overlap, normalised):** Base Characters ↔ UAL1 ↔ UAL2 mannequin = **1.00** (65 bones: `root, pelvis, spine_01–03, neck_01, Head, clavicle_l …`, max depth 12). Retro FP arms rig = 0.41 (name overlap only; a different 63-bone arms skeleton). Human Basic Motions (`B-root`, 56 bones) and CMU (`hip`, 43 bones) = 0.00 — **retarget required**.
- **Clips that cover NIGHTHAWK today (UAL1/UAL2):** `Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop`, `Crouch_Idle_Loop`, `Crouch_Fwd_Loop`, `Jump_Start/Jump_Loop/Jump_Land`, `Roll`, `Slide_Start/Loop/Exit`, `ClimbUp_1m`, `Hit_Chest`, `Hit_Head`, `Hit_Knockback`, `Death01`, `Pistol_Idle_Loop`, `Pistol_Aim_Up/Neutral/Down`, `Pistol_Shoot`, `Pistol_Reload`, `OverhandThrow` (grenade), `Interact`, `PickUp_Table`, `Punch_Jab/Cross`, `Melee_Hook`.
- **Missing (must be sourced/authored):** rifle/SMG/shotgun hold, ADS, fire, reload; backward and strafe locomotion; prone; lean; vault/mantle; weapon switch; revive/drag. Not rig problems — content gaps.
- **Root motion:** the `_RM` GLB bakes forward travel into `root` (e.g. `Crouch_Fwd_Loop` 1.5 m); the plain file keeps the character in place. Use the plain file because NIGHTHAWK movement is server-authoritative and must not take position from animation.
- **Human Basic Motions** clips come in pairs with and without `[RM]`; 118 clips total; the pack has no weapon animations.
- **CMU mocap:** 2,548 clips, every one with root translation in unknown units (extents of 14–379 on the horizontal axes); not game-labelled. Skip.

### Weapons and first-person arms

- **Scale (longest dimension as exported):** Quaternius guns 1.5–7.4 m (median 4.0 m); LowPolyGunAssets 7.3–10 m; loose guns 4.9–14.6 m; Retro guns 0.22–0.94 m (correct scale). Quaternius/LowPoly/loose guns need rescaling; Retro does not.
- **Attachment points:** none of the Quaternius or LowPoly guns has empties, bones or named sub-parts (single mesh); accessories are separate FBX files. Retro guns are the only ones with bones (pistol: Main/Slide/Hammer/Trigger/Magazine; rifle 9 bones; shotgun 6; SMG 7) and sub-meshes (e.g. `Slide_Mesh`, `ChargeHandle_Mesh`, `EjectionCover_Mesh`).
- **First-person arms:** `FP_Arms.fbx` is 3,596 tris, one material, 63 bones with IK controls (`ctrl_HandIK_l/r`, `ctrl_pole_elbow_l/r`) and a `camera` bone; each weapon has its own animation set (clips listed under Tier B). Animation files are keyed extremely densely (Blender reports an estimated native rate near 2,400 per second — treat as a baking artefact and resample on import).
- **Texture state:** Retro and several FBX files do not bind their textures; previews show magenta where the file could not be found.

### Vehicles (wheel separation, pivots, scale, physical suitability)

| Pack | Vehicles | With separate wheel objects | Wheel origin offset from wheel centre (m) | Longest horizontal dimension | Triangles |
|---|---:|---:|---|---|---|
| Rgsdev | 21 | 21 | 0.05–2.69 | 5.0–13.7 m | 1378–3588 |
| PolyPack | 15 | 15 | 0.04–0.07 | 1.2–2.3 m | 1652–3050 |
| Designersoup | 5 | 5 | 0.31–2.64 | 3.5–4.6 m | 5468–11648 |
| PSX Cars | 10 | 0 | — | 5.6–7.4 m | 304–476 |

- Rgsdev is the only set that is simultaneously verified, wheel-separated and pivot-correct (Monster Truck excepted). Typical car: track 1.95 m, wheelbase 3.22 m, wheel radius 0.41 m, 2.8 m wide overall.
- PolyPack is separated and pivot-correct but built at about half scale; Designersoup has high triangle counts (5k–11.6k) and wheel pivots at the model origin; PSX cars are single meshes with a separate 28-tri wheel and no wheel separation.
- No pack provides suspension nodes, steering pivots, interiors, damage states or collision meshes. Current NIGHTHAWK vehicles use an arcade model with a kinematic box collider, so a body mesh plus named wheels is enough.

### Destruction

- Breakable Boxes (CC0, author credit "loafbrr" in the glTF header): barrel 736 → 490 / 490 tris (two halves) + 224-tri hoop; crate 136 → 197 / 193; jar 570 → 248 / 586 / 256 / 248 (four shards). All 12 FBX pieces are separate files with consistent scale (intact props 0.6–1.0 m, fragments 0.3–0.9 m). The glTF files bundle every fragment in one scene spaced about 1 m apart (6.4 m wide) — use them as a reference, not as runtime assets.
- Everything else breakable-looking (Street Furniture barrel/box, Shacks barrel/pallet, Classic 64 boxes) is intact-only and unlicensed or low quality.

### Environment, terrain and UI

- **URBAN** — 483 models: 9 prebuilt buildings (1.1k–2.8k tris, 17–29 m), 49 wall/door/window parts (2–18 tris; 34 are flat quads — **no thickness, no collision**), 104 road tiles (16 m squares, 8–400 tris), 142 fence/wall pieces, 72 litter/dumpster props, 34 bus-stop pieces, 31 cones/barriers, 8 traffic lights, 24 pipes, 10 vents. Triangle total is only 73k for all 483. The flat prebuilt blocks show large blank roofs; usable as backdrop buildings, not as enterable ones.
- **Utility Infrastructure** — 42 GLB: 12 poles (6 concrete, 6 wood) in three LODs plus lamp, transformer, ring and non-conducting props. Heaviest LOD0 13.5k tris; `pole_concrete_b` LOD chain is 4,116 / 2,045 / 596 tris.
- **Industrial exterior** — a spread-out 78-part kit sheet (87.8 × 211.4 m), not an assembled level.
- **Ground087 / rocks_ground_03** — PBR sets (2K / 4K) with colour, normal (GL and DX), roughness, AO, displacement. Colour and data maps must be tagged sRGB vs linear per `docs/PERFORMANCE_BUDGET.md`.
- **UI** — Wenrexa icons are single-colour silhouettes (military ammo/weapon/medkit/grenade/armour included); hologram and sci-fi UI sprites are cyan/sci-fi in style. All UNVERIFIED. Easiest compliant path: author HUD icons in the project's own style and keep these only as layout reference.
- **Audio** — the only audio in the shortlist is the PSX Cars set (16 stereo OGG, 44.1/48 kHz, 0.37–6.08 s, 7–56 KB): engine loops (Car_Engine_Loop 2.97 s, Car_Engine_Loop_2 3.98 s, Car2_Engine_Loop 6.08 s), start-up/shut-off, two acceleration clips, doors, hood, trunk, horn, parking brake. Licence unverified.

## What a first modern urban/industrial map would look like with these assets

- **Now (Tier A):** shared-rig operators (UBC + UAL clips, authored gear), Quaternius weapons in the world/third person, Rgsdev vehicles on the existing arcade vehicle model, Breakable Box destruction states, scattered desaturated Stylized Nature rocks/shrubs. Ground stays procedural until Ground087 is re-downloaded from its official page.
- **After provenance is recorded (Tier B):** URBAN + Utility poles + Shacks for the built environment, Retro FP arms/guns (or an authored equivalent) for first person, Human Basic Motions for strafing.
- **Authored by the project:** tactical uniforms/vests/helmets and approved-likeness heads, FP arms and rifle/SMG/ADS animation set if Retro stays blocked, weapon sockets, collision proxies, HUD icons.

## Verification status

### Inspected successfully

- 4,620 model files (3,172 GLB/glTF via the custom reader; 1,448 FBX/OBJ/Blend via Blender 3.6) — 0 import errors. Triangles, vertices, bounding boxes (metres), materials, texture references and resolutions, LOD naming, skeleton hierarchies, animation clips (names, durations, frame rates, root translation) and exact SHA-1 duplicates are all recorded.
- 11 rigs identified and compared by bone name; 3,205 animation clips catalogued; vehicle wheel objects, pivots and spacing measured for 42 vehicles; 16 OGG files read.
- 15 contact sheets rendered. I looked at 11 of them closely (01, 03, 04, 06, 07, 08, 10, 11, 12, 13, 14); **02, 05, 09 and 15 were rendered but not reviewed**.

### Needs manual review

1. Licence provenance for every UNVERIFIED pack (see `license-audit.md`); the Human Basic Motions licence page; the CMU redistribution clause; Quaternius download-page confirmation.
2. Texture relinking: FBX files whose textures Blender could not resolve (Retro guns/arms, Breakable Box barrel, Superhero FBX, tree_pack, Industrial FBX). The previews show magenta there; the images exist in most packs.
3. URBAN FBX-versus-GLB length mismatch on the drystone walls and picket-fence gate, and which export is the intended size.
4. Gun rescale and socket authoring; real-firearm and real-brand names.
5. Collision proxies, shadow behaviour of zero-thickness wall quads, and mobile performance — none of these were measured. No game, browser, GPU render or frame-time test was run.

### Not inspected

- `.rar` archives and the `.unitypackage` (never unpacked by the intake script); Modular SciFi MegaKit and Kenney Blaster Kit (outside the requested list); `foxtexcom-renamed` textures; Hospital assets.
- Texture image *content* quality (normal maps, tiling, seams) beyond resolution and format; vertex normals/UV overlap; material shader settings.
- Licence web pages (no network access was used).

## Suggested order for the next implementation task (not started)

1. Resolve provenance for URBAN, Utility Infrastructure, Shacks, RetroWeaponPack and Human Basic Motions (and re-download Ground087 from ambientCG); log in `ASSETS.md`.
2. Import **one** operator: Superhero_Male glTF + UAL clips on the shared rig, behind a visual fallback, keeping hit capsules separate (issue #4 / Sprint B).
3. Import the Rgsdev police sedan and the Breakable Box barrel/crate as the first vehicle and destruction swap.
4. Normalise scale and add sockets for 4–6 Quaternius guns.
