# NIGHTHAWK — Realistic Asset Production Specification

This document translates the visual direction into technical targets for a browser-based Three.js game. These are starting budgets, not hard limits; profile representative scenes before locking them.

## 1. File formats and conventions

- Editable source: Blender `.blend`.
- Runtime model: glTF 2.0 binary `.glb`.
- Runtime material: glTF metallic-roughness PBR.
- Textures: PNG/TGA for authoring; KTX2/Basis Universal for runtime after visual QA.
- Units: metres; character height target around 1.7–1.9 m unless the owner defines otherwise.
- Forward/up: follow Blender glTF export defaults and validate orientation in Three.js.
- Apply transforms; triangulate at export where required; use consistent names and origin/pivot conventions.
- Keep source assets outside runtime bundles; load only runtime assets.

## 2. Character asset tiers

### Hero operator (selection / close-up)
- One shared humanoid skeleton for all eight operators.
- Distinct head mesh and likeness per operator; shared body topology where practical.
- Modular equipment: headgear, vest, belt, backpack, radio, gloves, boots and optional eyewear.
- Facial features must remain recognisable at selection-camera distance.
- Target 25k–45k triangles for a hero body + kit as an initial budget; profile on target hardware.
- One 2K face/body atlas where needed; 1K shared gear atlas; avoid a separate 2K texture for every pouch.
- LODs: hero / gameplay / distant. Gameplay LOD can reduce facial detail and small gear.
- Use normal maps for fine cloth/skin detail; do not model every stitch or fabric thread.

### Gameplay operator
- Reuse the same skeleton and animation set.
- Target 12k–25k triangles for body and visible kit as an initial budget.
- Prefer shared materials and atlases across operators.
- Keep head/face silhouette and major gear readable at expected engagement distance.
- Disable tiny accessories or switch to cheaper LODs at distance.

### First-person arms and weapon
- Separate first-person arms/weapon rig may be used for camera-specific animation.
- Reuse the same operator identity through gloves, sleeves, watch/bracelet or skin tone where appropriate.
- Weapon meshes should use modular attachments and shared materials.
- Keep weapon sights aligned to the first-person camera and preserve current recoil/ADS behaviour.

## 3. Environment and prop tiers

| Asset class | Initial triangle target | Texture target | Notes |
|---|---:|---:|---|
| Small prop (crate, drum, chair) | 300–2,000 | 512–1K | Reuse materials; instance repeated props |
| Medium prop (generator, vehicle shell, kiosk) | 2k–10k | 1K | Separate collision proxy |
| Building module | 1k–8k per module | Shared 1K–2K atlas | Modular walls, doors, roofs, windows |
| Hero landmark | 10k–30k | 1K–2K | LODs and baked details |
| Ground material | Plane/low mesh | 1K–2K tiling | Break repetition with decals/vertex colour |
| Foliage clump | 100–1k | 512–1K | Instancing and distance culling |

## 4. Material standards

Use glTF metallic-roughness PBR:
- Base Color contains surface reflectance colour, not baked lighting.
- Metallic is 0 for non-metals and 1 for conductive metal regions; avoid arbitrary grey metallic values for dirt/fabric.
- Roughness controls highlight spread; dusty, worn and woven materials are generally rough.
- Normal maps provide small-scale surface detail.
- AO is local crevice shading only; avoid dark baked contact shadows that double under runtime lighting.
- Use emissive only for actual light-emitting surfaces (screens, lamps, indicators).

## 5. Animation requirements

One common skeleton should support:
- Idle / breathing.
- Walk / jog / sprint.
- Start / stop and directional movement.
- Jump / fall / land.
- Aim / hip-fire / ADS.
- Weapon swap.
- Reload.
- Hit reaction / death.
- Optional operator-specific idle and interaction gestures.

Keep locomotion and aim layers separable where practical. Weapon sockets and hand grips must use consistent names. Third-person and remote players must use the same rig and animation naming.

## 6. Runtime performance

- Load GLB assets asynchronously; do not block initial game startup on every operator or prop.
- Use LODs and frustum/distance culling.
- Instance repeated props and vegetation.
- Share materials and texture atlases.
- Avoid excessive transparent materials and real-time shadow casters.
- Prefer baked lighting/AO for static set dressing where appropriate.
- Evaluate Meshopt/Draco for geometry and KTX2 for textures; only add decoder code when the project actually ships those compressed assets.
- Measure network transfer size, decoded memory, GPU memory, draw calls and frame time separately.
- Keep the first playable download lean; stream or lazy-load optional operator previews and high-detail assets.

## 7. Asset acceptance gate

Every runtime asset must pass:
1. Correct scale, origin, orientation and naming.
2. No missing textures or console warnings.
3. Correct PBR colour spaces and normal-map orientation.
4. No visible mesh holes, flipped normals or broken skinning.
5. LOD transition is acceptable.
6. Visual comparison in the real NIGHTHAWK renderer.
7. Performance check on integrated graphics.
8. License/provenance recorded in `ASSETS.md`.
9. No raw personal photographs or unlicensed brand/insignia content in the public build.

## 8. Rollout order

1. One ground material and one building material.
2. One modular building/cover kit.
3. One complete operator prototype on a shared rig.
4. Replace remote fighter boxes after animation and network interpolation are proven.
5. Add remaining operators by reusing the validated rig/material/animation pipeline.
6. Add camera-specific first-person arm rig and third-person local-player camera after the art assets are stable.
