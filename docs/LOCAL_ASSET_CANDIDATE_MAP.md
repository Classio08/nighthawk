# NIGHTHAWK — Local asset catalogue triage

This document records the pack names and intended use visible in the owner's shared catalogue review. It is a candidate map, not a claim that every listed archive or file has been inspected. The full local extraction remains on the owner's Windows machine under sorted-assets/, which is intentionally gitignored.

## Candidate shortlist from the 41-pack intake

| Role | Pack / candidate named in the catalogue review | Potential use | Current status |
|---|---|---|---|
| Desert ground | Ground087_2K-JPG | Main sand / compacted desert ground | Candidate only; individual maps not inspected |
| Dry river / rock | rocks_ground_03_4k.blend | Rock scatter, riverbed and rocky paths | Candidate only; 4K source should be reduced for browser runtime |
| Outpost structures | Shacks Shanties Sheds and Gantries 0001 | Modular shacks, sheds, gantries and cover | Candidate only |
| Industrial POI | Industrial_exterior_v1 | Industrial yard and outpost dressing | Candidate only |
| Urban structures | URBAN | Distant settlement / compound silhouettes | Candidate only |
| Roadside dressing | Street Furniture; Utility Infrastructure | Signs, poles, street props and infrastructure | Candidate only |
| Weapons | Ultimate Gun Pack by Quaternius | Weapon visual prototypes | Candidate only; exact pack terms need checking |
| Weapons | LowPolyGunAssets | Alternate weapon meshes / attachments | Candidate only; inspect readme and source |
| Stylized weapons | kenney_blasterKit | Stylized secondary weapon / pickup prototypes | Candidate only |
| Destructible props | Brekable_Boxes_FBX_GLTF_Blend_Textures; Breakable_Boxes_Extract-to-Godot-project-folder | Crates and destructible prop visual references | Candidate only; avoid duplicate imports |
| Vehicles | Free Low Poly Vehicles Pack by Rgsdev | Vehicle body prototypes | Candidate only; inspect licence and scale |
| Vehicles | Designersoup Low Poly Car Pack Volume 1 updated | Civilian vehicle silhouettes / traffic props | Candidate only |
| Character motion | Human Basic Motions FREE; Anims_Only_glTF_V1 | Animation retargeting experiments | Candidate only; inspect skeleton, clips and redistribution terms |
| Large texture pool | foxtexcom-renamed; 4. Icons RPG & Military +102 Wenrexa | Reference browsing only until individual assets are selected | Very large pools; do not bulk import |

The review also noted that the audio category appeared sparse and that one PSX-style car pack contained 16 audio files. Do not treat those sounds as approved or suitable for NIGHTHAWK without inspecting the exact files and provenance.

## Immediate implementation decision

The current visual branch adds authored, deterministic procedural PBR maps for sand, gravel, concrete and corrugated metal. This lets the renderer gain normal and roughness response now, without copying any unreviewed archive contents into the repository.

The procedural maps are a runtime fallback, not a replacement for reviewing the owner's local asset packs. When a selected external ground material is ready, compare it against the procedural sand/gravel in the same scene and retain a fallback path.

## How Claude Code should use the local extraction

Claude Code must run from C:\Dev\nighthawk to see the ignored local folders. It should:

1. Read sorted-assets/CATALOG.md and sorted-assets/CATALOG.json.
2. Inspect only candidate folders relevant to a specific NIGHTHAWK need; do not ingest the entire by-type tree.
3. Compare candidate models against the existing map scale, operator scale, weapon sockets, current Three.js renderer and mobile budget.
4. Select a small number of representative files, not a pack wholesale.
5. Check the exact licence/readme for each selected archive before any file is copied into tracked runtime folders. Licence review can be deferred for exploration, but not for shipping.
6. Propose the selected file paths, file sizes, polygon counts, texture maps and intended use before integrating them.
7. Record approved files in ASSETS.md and keep raw-zips/ and sorted-assets/ ignored.

Do not copy files from the local extraction into GitHub using absolute Windows paths. The local files are not visible to remote GitHub automation; Claude Code running on the owner's PC is the right agent to inspect and transfer the selected files.

## Runtime budget guidance

- Start with 1K base colour and 1K normal/roughness maps; reserve 2K for a hero surface after profiling.
- Do not ship raw 4K Blender source files to browsers. Export optimized GLB/GLTF and compressed texture variants.
- Keep authoring archives outside the public runtime tree.
- Prefer shared materials, atlases, instancing, LODs and asynchronous loading.
- No imported asset should become a dependency for match startup; retain procedural placeholders and a load-failure fallback.
