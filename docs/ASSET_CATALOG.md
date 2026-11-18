# NIGHTHAWK — Free Asset Shortlist and Provenance Rules

Research snapshot: 18 November 2026. The links below are asset pages, not yet imported files. Before shipping, download the chosen resolution, inspect the included maps, record the exact asset name/version/hash and confirm the current licence page.

## First environment materials to prototype

| Priority | Asset | Why it fits | Source | Licence |
|---|---|---|---|---|
| 1 | Ground 087 | Light yellow sand with subtle tracks; good base for dry dunes and compacted sand | https://ambientcg.com/view?id=Ground087 | ambientCG CC0 1.0 |
| 2 | Ground 064 | Sandy gravel and small stones; useful for roads, outpost yards and rocky patches | https://ambientcg.com/view?id=Ground064 | ambientCG CC0 1.0 |
| 3 | Rocks Ground 03 | Coarse rocky ground; use for dry riverbeds and cliff paths | https://polyhaven.com/a/rocks_ground_03 | Poly Haven CC0 |
| 4 | Coast Sand 01 | Damp coastal sand and pebbles; useful near shipwreck / shoreline | https://polyhaven.com/a/coast_sand_01 | Poly Haven CC0 |
| 5 | Sandy Gravel 02 | Warm brown compacted earth; use as a secondary ground layer | https://polyhaven.com/a/sandy_gravel_02 | Poly Haven CC0 |
| 6 | Gravelly Sand | Fine granular earth for transition masks and paths | https://polyhaven.com/a/gravelly_sand | Poly Haven CC0 |
| 7 | Dry rough sandy desert path | Seamless photographic ground reference | https://commons.wikimedia.org/wiki/File:Dry_rough_sandy_desert_path_seamless_ground_texture.jpg | Check the file's individual Commons licence and attribution before use; not assumed CC0 |

Official licence references:
- ambientCG: https://docs.ambientcg.com/license/ — downloadable assets are CC0 1.0 and may be used commercially.
- Poly Haven: https://polyhaven.com/license — assets are CC0.

## Download and integration workflow

1. Download the material archive from the asset's official page. Do not use the preview JPG as the shipped material if a full PBR archive is available.
2. Start with 1K or 2K maps; 4K is reserved for close-up hero surfaces after memory profiling.
3. Keep Base Color, Normal (OpenGL convention), Roughness, and optional Ambient Occlusion/Height. Do not assume every pack includes every map.
4. Convert shipped textures to KTX2/Basis only after quality and GPU memory testing; keep original source maps in the authoring archive.
5. Add the asset under a named folder, e.g. `assets/materials/ground_087/`, and record source URL, author, licence, download date, resolution, files and hashes in `ASSETS.md`.
6. Integrate one ground material in Three.js using `MeshStandardMaterial` or `MeshPhysicalMaterial`; use repeat wrapping, correct colour space for Base Color, and normal/roughness map settings.
7. Test seams, scale, tiling frequency, slope behaviour, mipmaps and performance on integrated graphics.
8. Add a second material only after the first one is visually and technically accepted.

## Photo-derived textures from real photographs

A photo is not automatically a usable game texture. For a tileable PBR material:
- photograph the surface close to perpendicular, evenly lit, with no hard shadows or strong perspective;
- capture several overlapping shots for large surfaces;
- remove perspective and lighting gradients; create seamless edges;
- generate/author a normal map and roughness map carefully (do not treat a fake normal map as measured geometry);
- inspect tiling at game scale and avoid recognisable private property, logos, people or number plates;
- get permission for any identifiable person or private property if it appears in a shipped texture.

For NIGHTHAWK's first pass, use the CC0 PBR packs above to prove the pipeline, then replace or supplement them with original Namibian field photos after obtaining permission.

## Other asset libraries

- Kenney: https://kenney.nl/assets — many packs are CC0; inspect each pack's included licence.
- Poly Haven: https://polyhaven.com — CC0 textures, HDRIs and models.
- ambientCG: https://ambientcg.com — CC0 PBR materials, HDRIs and models.
- OpenGameArt: https://opengameart.org — mixed licences; use only assets whose individual licence is compatible (CC0, CC-BY with attribution, or another reviewed commercial licence).
- Poly Pizza: https://poly.pizza — licence is per model; inspect each model's licence and attribution.
- Quaternius: https://quaternius.com — licence changed for newer releases; check the exact pack. Do not assume every current pack is CC0 or that redistribution of source files is permitted.

## Do not import

- Random Google Images, Instagram photos, movie screenshots, ripped game files, brand logos or assets with unclear rights.
- GTA / Vice City models, textures, sounds, maps or music. Use only the open-source engine ideas and user-supplied legally owned data; NIGHTHAWK must have its own original assets.
- Unlicensed GitHub models or code. A public repository is not a licence.

## Asset log template

| File/path | Asset name | Creator | Source URL | Exact licence | Download date | Resolution | Hash | Notes |
|---|---|---|---|---|---|---|---|---|
| pending | Ground 087 | ambientCG | https://ambientcg.com/view?id=Ground087 | CC0 1.0 | pending | choose 1K/2K | pending | Not yet downloaded or integrated |
