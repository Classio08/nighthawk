# NIGHTHAWK — Photo-to-Texture Workflow

Purpose: turn owner-supplied real-world photos into original, game-ready environmental materials for the realistic NIGHTHAWK art direction.

This workflow is for **surfaces and props** (sand, soil, gravel, rock, concrete, painted metal, corrugated sheets, fabric, rubber, wood and vegetation). Character photographs are likeness references, not texture atlases. Do not project a person's face photo onto a body as a shortcut to a character model.

## 1. What to photograph

Start with five high-value surfaces:
1. Dry compacted soil / sandy gravel.
2. Rough weathered concrete.
3. Painted or oxidised steel.
4. Corrugated metal or shipping-container paint.
5. Woven nylon / canvas / tactical fabric.

For each material capture:
- A close, square-on image with the camera sensor parallel to the surface.
- A second image from a little farther away to capture context and scale.
- Soft, even light (open shade or overcast); avoid hard directional shadows.
- No people, logos, readable private information or distinctive location markers unless specifically cleared.
- Include a ruler or known-size object in a separate scale photo when physical dimensions matter.
- Highest original resolution available; avoid screenshots, social-media compression and digital zoom.

For seamless tiling, photograph a sufficiently large patch with even illumination and no strong gradient. A single photo is not automatically seamless or physically calibrated.

## 2. Capture cautions

- Avoid direct flash, blown highlights, deep shadows and strong reflections.
- Avoid portrait mode, beauty filters, HDR halos and aggressive phone sharpening.
- Keep the lens clean; use the main camera rather than ultra-wide where possible.
- Take several exposures and select the sharpest one.
- For shiny metal, glass and wet surfaces, a single photo cannot reliably recover true reflectance; use a reference photo for colour/shape and author a plausible PBR material separately.
- Get permission before using photos of private property, branded products, people or third-party artwork. Keep source photos private and out of the public Git repository unless distribution rights are explicit.

## 3. Build the material

Recommended free workflow:
1. Keep the original photo untouched in a private source folder.
2. Crop/rectify perspective and remove obvious lighting gradients.
3. Create a seamless tile; inspect edges at 1:1 and at gameplay scale.
4. Generate or author the PBR maps:
   - Base Color (sRGB): colour only; remove baked lighting and shadows.
   - Normal (linear): surface micro-relief; never use a colour photo as a normal map.
   - Roughness (linear): matte-to-gloss variation.
   - Ambient Occlusion (linear, optional): only local crevice occlusion; do not bake broad shadows.
   - Height (linear, optional): subtle displacement/parallax source if needed.
   - Metallic (linear, usually black for soil, concrete, fabric and rubber; only metal regions should be metallic).
5. Test under the current game lighting and at actual player distance.
6. Make at least two scale variants where the material could appear on both small props and large terrain.
7. Export source maps and a runtime-optimised version. Keep an editable master.

Suggested tools: Blender for UVs, material setup and baking; Material Maker (open source) for procedural correction/tiling and map authoring; GIMP or Krita for image editing. Tool choice can change; avoid committing to a paid dependency before the first asset proves the workflow.

## 4. Texture conventions

- Use power-of-two dimensions.
- Start at 1024 x 1024 for common world materials; 2048 x 2048 only for close-up hero assets.
- Use 512 x 512 for small props or distant objects.
- Keep Base Color separate from linear data maps.
- Name maps consistently:
  `mat_soil_dry_basecolor.png`
  `mat_soil_dry_normal.png`
  `mat_soil_dry_roughness.png`
  `mat_soil_dry_ao.png`
- For runtime, evaluate KTX2/Basis Universal compression after quality review. Do not blindly compress every source map with the same settings.

## 5. First NIGHTHAWK material set

| ID | Material | First use | Notes |
|---|---|---|---|
| MAT-001 | Dry compacted soil | Arena ground / tracks | Warm earth; subtle gravel; no obvious repeating stamp |
| MAT-002 | Fine sand | Dry river / shoulders | Slightly lighter than soil; low gloss |
| MAT-003 | Weathered concrete | Outpost / relay station | Hairline cracks, dust, restrained stains |
| MAT-004 | Painted steel | Containers / doors | Layered paint wear; metallic only on exposed metal |
| MAT-005 | Corrugated sheet | Sheds / roofs | Repeating geometry should be mesh detail, not painted stripes alone |
| MAT-006 | Woven nylon | Vests / packs | High roughness, fine weave normal, restrained colour |
| MAT-007 | Rubber | Boots / tyres / grips | Very high roughness; subtle mould seams |
| MAT-008 | Dry scrub | Ground scatter | Use geometry/cards for silhouette; photo for colour variation only |

## 6. Validation checklist

- [ ] Tile seams are not visible at 1x and 4x repetition.
- [ ] No baked shadows/highlights in Base Color.
- [ ] Normal map is correctly oriented and does not invert dents.
- [ ] Roughness and metallic are linear data maps.
- [ ] Material reads correctly under midday and overcast lighting.
- [ ] Material scale matches real-world expectations.
- [ ] Repetition is broken with vertex colour, decals, mesh variation or multiple tile variants.
- [ ] Runtime texture size and GPU memory are measured on an integrated-GPU laptop.
- [ ] Source photo rights and asset provenance are recorded in `ASSETS.md`.

## 7. Folder layout proposal

```
assets/
  source-private/             # never commit raw personal/reference photos
  materials/
    soil-dry/
      source-notes.md
      basecolor.png
      normal.png
      roughness.png
      ao.png
      preview.jpg
    concrete-weathered/
    steel-painted/
  models/
    operators/
    props/
    environment/
  previews/
```

The `source-private/` directory should be ignored by Git. Only approved derived assets and documentation belong in the repository. Do not upload identifiable character reference photographs into public asset folders.

## 8. First practical batch

The owner can upload 3–5 photos of dry soil, concrete, metal or fabric. Process one material first (MAT-001 dry compacted soil), agree on its look and tiling, then repeat the proven workflow. This avoids generating a large inconsistent texture library.
