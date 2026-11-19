# Procedural PBR materials

**Branch:** feature/procedural-pbr-materials

The renderer now generates compact, tileable PBR data maps from deterministic project-authored noise. No downloaded archive or third-party image has been copied into the repository.

## Surfaces

| Surface | Base colour | Normal | Roughness | Use |
|---|---|---|---|---|
| Sand | Existing 512px seamless desert texture | Generated 256px wrapped-Sobel normal map | Generated 256px map | Kavari Basin terrain |
| Gravel | Existing sand base texture tinted by the riverbed material | Generated 256px gravel normal map | Generated 256px map | Dry River visual dressing |
| Concrete | Existing weathered concrete texture | Generated 256px normal map | Generated 256px map | Buildings and walls |
| Metal | Existing corrugated steel texture | Generated 256px normal map | Generated 256px map | Shipping containers |

Normal and roughness maps are linear data textures (THREE.NoColorSpace); base-colour maps remain sRGB. Normal-map gradients wrap at image boundaries so the generated normal data does not introduce an artificial edge seam.

## Quality policy

- High graphics quality uses MeshStandardMaterial with normal and roughness maps for ground, riverbed and merged static building/container geometry.
- Low and medium graphics quality retain the existing MeshLambertMaterial path and do not generate the extra PBR maps.
- The simulation and server packages are untouched. All changes are under src/render/.
- The material maps are generated once during world construction, not every frame.
- No SSAO, bloom, extra render pass or shadow caster was added; those effects can be expensive on integrated graphics and mobile.

## Validation status

Source changes and docs are committed to the feature branch. At the owner's instruction, no tests, build, browser session, CI, VPS or deployment checks have been run. The branch should be visually reviewed on high, medium and low quality before considering the PBR path complete.
