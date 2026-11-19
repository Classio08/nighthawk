# Model drop (owner cleared the shortlist on 19 Nov 2026)

The owner confirmed the local packs may be used in Nighthawk, including packs the inspection marked unverified. That confirmation is recorded in `ASSETS.md`. The raw ZIPs stay on the PC. Copy only the files below into `public/models/`.

| Put this file here | Take it from the local pack |
|---|---|
| `public/models/characters/superhero-male.glb` | Universal Base Characters, Godot/UE glTF, `Superhero_Male_FullBody` |
| `public/models/anims/ual1.glb` | Universal Animation Library, `Unreal-Godot/UAL1_Standard.glb` (the file **without** root motion) |
| `public/models/vehicles/police-sedan.glb` | Rgsdev police sedan. Convert the FBX to GLB in Blender (scale so the car is about 4.6 m long, wheels named). |
| `public/models/props/barrel.glb` | Breakable Boxes barrel, one mesh, textures packed in the GLB |
| `public/models/props/crate.glb` | Breakable Boxes crate, same |
| `public/models/weapons/*.glb` | Quaternius guns, rescaled to about 0.9 m, fictional names |

Ground already in the game (re-downloaded from the official pages, 1K):

- `/textures/ground/ground087_color.jpg` + `ground087_normal.jpg` — ambientCG Ground087, CC0
- `/textures/ground/rocks_diff.jpg` + `rocks_normal.jpg` — Poly Haven rocks_ground_03, CC0 (ready; the river bed still uses the procedural sand)

Do not commit `raw-zips/` or `sorted-assets/`.
