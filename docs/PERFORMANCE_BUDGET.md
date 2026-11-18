# NIGHTHAWK — Browser Performance Budget and Profiling Plan

These are provisional targets for measurement, not claims about current performance. The game must be profiled on real devices before budgets become release guarantees.

## Target device tiers

| Tier | Example class | Target experience |
|---|---|---|
| Minimum | Older laptop with integrated graphics | Stable 30 FPS at low settings |
| Recommended | Recent office/gaming laptop | Stable 60 FPS at medium/high settings |
| Mobile | Mid-range Android phone | Stable 30–45 FPS with touch controls |

## Initial frame-time goals

| Metric | Minimum tier | Recommended tier |
|---|---:|---:|
| Frame-time p95 | <= 33.3 ms | <= 16.7 ms |
| Frame-time p99 | <= 50 ms | <= 33.3 ms |
| Long tasks during combat | Avoid > 100 ms | Avoid > 50 ms |
| Main-thread simulation/render work | Profile; avoid sustained saturation | Keep enough headroom for input and UI |

## Asset budgets to validate

- Keep the initial page shell and training entry point light; do not eagerly load every operator, weapon skin, map and audio bank.
- Start common ground materials at 1K. Use 2K only for close-up hero surfaces after profiling.
- Use glTF 2.0 GLB for runtime characters and props.
- Evaluate KTX2/Basis Universal for GPU texture memory and upload performance. Compare visual quality and device support before standardising.
- Prefer shared material atlases, instancing for repeated props, LODs and distance/frustum culling.
- Avoid many real-time shadow casters, high-cost transparent layers and excessive post-processing.
- Keep a simple placeholder model/material path when optional assets fail to load.
- Do not create unique 2K texture sets for every pouch, weapon attachment or small prop.

## Three.js colour-space rules

- Base-colour/albedo and emissive colour textures are colour data and should be annotated as sRGB.
- Normal, roughness, metallic, AO and height maps are data textures and should remain in the linear/no-colour-space workflow.
- Prefer glTF 2.0 materials with GLTFLoader for model assets; verify imported maps in the actual game renderer.
- Test normal-map convention (OpenGL vs DirectX), UV orientation, repeat, mipmaps and seams.
- Avoid baking directional lighting or contact shadows into base colour when the scene also uses dynamic lighting.

## Profiling protocol

1. Record device model, CPU/GPU, RAM, OS, browser version, resolution and graphics preset.
2. Run the same 3-minute scene with a fixed number of fighters, bots, props and effects.
3. Capture frame-time p50/p95/p99, draw calls, triangles, texture dimensions, JS heap, network transfer and first playable time.
4. Repeat after a cold reload and after a warm cache.
5. Profile with shadows/effects disabled and enabled to identify the real cost.
6. Change one expensive feature at a time and compare results.
7. Save the raw measurements and test commit SHA. Never claim an optimisation without a before/after comparison.

## Texture compression decision

KTX2/Basis can reduce GPU memory pressure because the texture remains in a compressed GPU-friendly representation, but compression settings affect visual quality. Test at least one colour map and one normal map on the minimum supported hardware before converting the entire library.
