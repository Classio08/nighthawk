# Asset log

Add a line **before** using any asset. If you cannot fill in the license, do not use it.

## Project art direction

NIGHTHAWK is moving toward realistic, Southern African-inspired environments and operators. Use original owner-supplied photos as references only when usage rights are clear. Do not commit identifiable character reference photos or social-media screenshots to the public repository. Keep raw source images private; commit only approved derived assets and provenance notes.

See:
- `docs/PHOTO_TO_TEXTURE_WORKFLOW.md` — how to turn real surface photos into PBR textures.
- `docs/REALISTIC_ASSET_SPEC.md` — model, texture, rig and browser-performance targets.
- `docs/WEB_3D_ART_RESEARCH.md` — Three.js/glTF/KTX2/mesh compression research and recommendations.
- `docs/CHARACTER_VISUAL_BIBLE.md` — operator identity and likeness references.
- `docs/WORLD_AND_FACTION_BIBLE.md` — fictional world and environment art direction.

## Preferred sources

These are candidate sources, not blanket approval for every item. Re-check the exact asset's current license and restrictions before use:
- Kenney (kenney.nl) - CC0 packs.
- Quaternius (quaternius.com) - check exact pack license.
- KayKit (kaylousberg.itch.io) - check exact pack license.
- Poly Haven (polyhaven.com) - CC0 textures and HDRIs.
- Mixamo - read current Adobe terms and attribution/redistribution restrictions before use.
- Poly Pizza - many assets are CC-BY; log the author and provide attribution.

| Asset | Source URL | License | Author (if credit needed) | Used in |
|---|---|---|---|---|
| zzfx 1.4.0 (npm package, code) | github.com/KilledByAPixel/ZzFX | MIT | Frank Force | `src/fx/audio.js` - generated sounds |
| Existing procedural guns, soldiers, buildings, ragdolls and particles | Project source code | Project-authored | | `src/render/*`, `src/fx/*` |

## Candidates (NOT downloaded or approved yet)

| Candidate | Where | Claimed license | Planned use |
|---|---|---|---|
| Quaternius Ultimate Gun Pack | quaternius.itch.io / quaternius.com | Verify exact pack | Weapon prototypes |
| Kenney Blaster Kit | kenney-assets.itch.io | Verify exact pack | Placeholder props / effects |
| KayKit Adventurers + Character Animations | kaylousberg.itch.io | Verify exact pack | Rig/animation reference only |
| Quaternius Universal Base Characters | quaternius.com | Verify exact pack | Base mesh / rig reference |
| Poly Haven surface materials | polyhaven.com | CC0 | Environment material reference |
| Mixamo animations | mixamo.com | Review current terms | Animation prototype |
| Recast Navigation | npmjs.com/package/recast-navigation | MIT | Bot navmesh |

## Rules

- Record exact asset URL, creator, license and any attribution before integrating.
- Do not treat a website's general license statement as proof for a specific asset.
- Do not copy GPL code into the game.
- Do not upload raw personal likeness photos or social-media screenshots to public asset folders.
- Keep source project files and runtime exports clearly separated.
- Re-check licenses before release; terms can change.
