# NIGHTHAWK — Character & Environment Asset Production Plan

Status: planning document; no game code or existing assets changed.
Working branch: `chatgpt/nighthawk-asset-production-plan`

## Goals

Raise the visual quality of NIGHTHAWK while preserving its current browser-game stack and keeping the game performant. Build an original Southern African tactical visual identity rather than relying on generic military-shooter assets.

Current technical direction to preserve:
- Three.js rendering and glTF 2.0 / GLB asset delivery
- Rapier physics
- Yuka bot AI
- Colyseus multiplayer
- Vite / JavaScript build

## Character roster

The eight original characters supplied by the project owner are:
1. Roms
2. Shadow
3. Douglas
4. Cliffhanger
5. Navy Blue
6. Rampol
7. Maetja
8. Cleiseis

Only Roms and Cleiseis have visual references in the first reference batch. Do not invent facial references for the other six characters; develop their appearance from owner-approved descriptions or photos.

### First reference batch (private working references; not committed)

- **Roms:** one Instagram-story screenshot showing a full-body outdoor photo. Visible reference cues include short dark hair, sunglasses, a dark navy sports T-shirt with a light horizontal stripe, and dark shorts. This is a pose/clothing reference, not a final uniform design.
- **Cleiseis:** two Instagram screenshots showing a close portrait and a mirror selfie. Use these to guide facial likeness, head shape, haircut and general build. The screenshots include Instagram UI and are not clean source photographs.

The references are not included in this repository. Before publishing or distributing any likeness-based asset, confirm the people depicted have agreed to its use in the game and that the project owner has rights to use the photographs.

## Character art direction

Target: grounded, recognisable, stylised-realistic tactical operators. Preserve each character's recognisable face and body proportions; do not make all operators share one generic head or physique.

Each operator should receive:
- A clean front, side and back character turnaround for approval
- A face close-up and neutral expression sheet
- A consistent body scale and rig
- A distinct tactical outfit silhouette, helmet/headwear, vest, pouches, gloves, boots and optional backpack
- A restrained personal colour accent and readable silhouette
- Idle, walk, run, crouch, aim, fire, reload, hit-reaction and downed animations
- Optional cosmetic variants that do not affect competitive balance

Design the uniform as fictional game equipment. Avoid real unit insignia, official badges or identifiable real-world unit markings unless specifically cleared.

## Photo-to-material workflow

Use owner-supplied photographs as source material for original surface textures:
1. Select close, evenly lit, sharply focused images of sand, gravel, rock, concrete, painted metal, rust, corrugated sheet, fabric and wood.
2. Crop and correct perspective; remove recognisable private details and unwanted objects.
3. Make tileable textures only when the surface needs repetition. Keep unique decals and signage as separate textures.
4. Create a PBR set where useful: base colour/albedo, tangent-space normal, roughness, ambient occlusion and optional height. Avoid baking strong lighting or shadows into albedo.
5. Validate colour space and channel packing in the existing Three.js material pipeline.
6. Test at gameplay camera distance and under daylight, sunset and night lighting.
7. Keep texture dimensions and material count modest; use atlases/trim sheets where practical.

Suggested first environment material batch:
- warm red/orange desert sand
- pale dry sand
- compacted dirt and gravel
- Namib-region rock
- sun-weathered concrete
- dusty painted metal
- rusted corrugated steel
- worn road/asphalt
- canvas and tactical fabric

## Environment direction

Build a compact, high-quality Southern African-inspired map before attempting a huge open world. Potential location language:
- desert escarpment and rocky ridges
- isolated communications tower
- mining or logistics outpost
- corrugated workshops and shipping containers
- dry riverbed / gravel road
- fuel and maintenance yard
- small airstrip and watchtower

Use fictional place names and signage. Compose the map around meaningful cover, readable lanes, flank routes and squad objectives.

## Asset technical standards

- Prefer GLB/glTF for static and skinned 3D models.
- Apply transforms and sensible origins before export.
- Use a consistent character skeleton if operators share animation sets.
- Keep collision geometry separate and simpler than render geometry.
- Use PBR textures and mipmaps; avoid excessive unique materials.
- Set texture sizes by screen-space importance; reserve 2K/4K for close-up hero assets.
- Compress GLB and textures where the current build supports it (for example Meshopt/Draco and KTX2/Basis after compatibility testing).
- Keep source files (for example .blend) outside runtime bundles when practical.
- Record attribution and licence for every third-party asset.

## Priority sequence

1. Approve the character look and likeness for Roms and Cleiseis.
2. Obtain clean, original photo references and owner-approved descriptions for the remaining six characters.
3. Produce one hero operator as a complete rigged GLB proof of pipeline.
4. Create the first 6–8 seamless environment materials from real photographs.
5. Replace one test map area with modular outpost props and improved terrain materials.
6. Profile frame time, draw calls, texture memory and multiplayer performance before scaling the asset count.
7. Roll the validated pipeline across the remaining operators and map.

## Approval gates

Do not replace procedural player meshes, weapon models, map geometry or runtime materials until a proposed asset has been reviewed in-game. Keep the existing playable version working while new art is developed on a separate branch. This plan intentionally makes no runtime code changes.
