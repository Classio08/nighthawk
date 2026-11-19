# Asset audit, 19 Nov 2026 (owner's local library)

Two documents from the owner's own audit are stored here unchanged: `LICENSE_AUDIT_2026-11-19.md` (what each pack's own licence files say) and `ASSET_SHORTLIST_2026-11-19.md` (which packs fit the look). The two big machine files (`asset-manifest.json` ~3.8 MB, `CATALOG.json` ~6 MB) are NOT committed: they are inventories of the owner's disk, not licence evidence, and they are regenerable.

**Nothing from this library has been imported into the game.** No model, texture, animation or icon from it is in `public/`, `assets/` or the build. This folder is a decision record only.

## Cleared to import: licence text found INSIDE the archive (CC0)

| Pack | Author | Notes for the importer |
|---|---|---|
| Universal Base Characters [Standard] | Quaternius | 65-bone rig. Use the Standard (non-mannequin) meshes. `Superhero_Male_FullBody` is ~14k triangles: check the browser budget before using more than a few at once |
| Universal Animation Library 1 and 2 [Standard] | Quaternius | 86 clips between them. Use the non-root-motion `Unreal-Godot/UAL1_Standard.glb` and `UAL2_Standard.glb` (the game moves the body itself) |
| Ultimate Gun Pack | Quaternius | 40 guns + 15 accessories. About 0.18 scale, no muzzle sockets. Rename to the game's fictional weapons; do not ship real model names |
| Stylized Nature MegaKit [Standard] | Quaternius | Low-poly and saturated: desaturate and test against the PBR look before using |
| Free Low Poly Vehicles Pack | Rgsdev | The Monster Truck's wheels sit 2.7 m off its body: fix before use. Do not import `All vehicles.fbx` |
| Breakable Boxes (FBX/glTF/Blend, and the Godot folder) | loafbrr | Barrel, crate, jar. FBX textures need relinking |
| Classic 64 Asset Pack 0.6 | Craig Snedeker | CC0, but a PSX look that clashes with the rest: skip. Its `Nature` and `Rocks` items are individually unverified |

## Blocked: do NOT import (no licence text in the archive, or terms unresolved)

URBAN, Utility Infrastructure, Shacks/Shanties/Sheds/Gantries, Street Furniture, Industrial exterior, tree_pack_1.1, Retro Weapon Pack, LowPolyGunAssets, Human Basic Motions (Kevin Iglesias: web redistribution unresolved), all Wenrexa UI and icon packs, Designersoup / PolyPack / PSX Style cars (and the 16 car sounds), every loose file in `raw-zips/`, and the `Ground087` / `rocks_ground_03` ZIPs (the official ambientCG and Poly Haven pages do state CC0, but these ZIPs carry no licence file: re-download from the official page, then log it).

Conditional: the CMU motion-capture set (`Anims_Only_glTF_V1`) allows commercial use but bans reselling the animations and requires passing the same rules to anyone who receives the files. Serving it to players collides with that clause, so it needs the owner's decision. Skipped.

Not ours to redistribute: `Hospital Models.zip` is a paid pack. foxtexcom textures are unlicensed. The real portraits of friends stay out of any shared catalogue (see ASSETS.md: owner-provided with permission, for this project only). `.rar` and `.unitypackage` files were not inspected.

## How an import happens (per pack, one at a time)

1. The owner says which pack. 2. Re-read the licence file in the archive and record the file's SHA-256 in `ASSETS.md`. 3. Import only the files used, into a named folder. 4. Add a line to `ASSETS.md` (pack, author, licence version, date, files, hashes). 5. Test the budget on integrated graphics before adding a second pack.

The audit's own note applies: it was done offline from the archives, so "CC0 per the pack's licence file" is the evidence, not a legal opinion.
