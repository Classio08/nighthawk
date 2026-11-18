# Asset log

Rule: every asset must be logged before it is used. A public URL or a free download does not by itself prove permission to ship the file. Record the exact pack/page, creator, licence version, download date, files and hashes.

## Existing project assets

| Asset | Source URL | Licence | Used in |
|---|---|---|---|
| zzfx 1.4.0 | https://github.com/KilledByAPixel/ZzFX | MIT | `src/fx/audio.js` — synthesised sounds |
| Procedural block geometry and placeholder materials | authored in this repository | Project-owned code | `src/render/*`, `src/fx/*` |

## Selected environment material candidates (not yet downloaded or integrated)

| Asset | Official source | Licence | Intended use |
|---|---|---|---|
| Ground 087 | https://ambientcg.com/view?id=Ground087 | ambientCG CC0 1.0 | pale dry sand |
| Ground 064 | https://ambientcg.com/view?id=Ground064 | ambientCG CC0 1.0 | sandy gravel / outpost ground |
| Rocks Ground 03 | https://polyhaven.com/a/rocks_ground_03 | Poly Haven CC0 | rocky paths and dry riverbed |
| Coast Sand 01 | https://polyhaven.com/a/coast_sand_01 | Poly Haven CC0 | coastal shoreline |
| Sandy Gravel 02 | https://polyhaven.com/a/sandy_gravel_02 | Poly Haven CC0 | compacted earth |
| Gravelly Sand | https://polyhaven.com/a/gravelly_sand | Poly Haven CC0 | secondary ground blend |

These are candidates only. No binary texture files have been added to the runtime yet. See `docs/ASSET_CATALOG.md` for the workflow and exact licence references.

## Other libraries — check each pack's current licence

- Kenney: https://kenney.nl/assets — many packs are CC0; inspect the archive's licence file.
- Poly Haven: https://polyhaven.com — assets are CC0.
- ambientCG: https://ambientcg.com — downloadable assets are CC0 1.0.
- OpenGameArt: https://opengameart.org — mixed licences; use only after checking each asset.
- Poly Pizza: https://poly.pizza — licence is per model; retain creator attribution where required.
- Quaternius: https://quaternius.com — newer packs may use the Quaternius Asset License, not CC0. Verify the exact pack and restrictions before use.
- Mixamo: https://www.mixamo.com — review current Adobe terms and redistribution restrictions before including animations or character files.

## Never import without review

Random search-engine images, Instagram photos, movie screenshots, ripped commercial-game assets, trademarks/logos, or GitHub files without a clear licence. Do not redistribute proprietary GTA/Vice City game data. A game engine port is not permission to use the original game's art/audio/maps.
