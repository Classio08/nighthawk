# Free resources: code, games, weapons, sounds, characters

Rule: **a resource is only used after it is logged in `ASSETS.md` with its real license.** "Free to download" is not the same as "free to sell with". Check the license on the author's own page when you download, not only here (this list comes from search results, not from reading every license file).

## 1. Existing games and source code

There is no ready-made, permissively licensed, production-quality browser battle royale to fork. What exists is good to **study**:

| Project | What it is | License | Use |
|---|---|---|---|
| Colyseus (framework) | Authoritative server, prediction, lag compensation | MIT | **Use** (our multiplayer base) |
| Colyseus `realtime-tanks-demo` (GitHub) | Server + Three.js client, one shared authoritative server | MIT | Study project layout |
| Colyseus Prediction Playground | Public lab pages for each netcode idea | public repo | Study/copy patterns |
| ColyStrike (Colyseus FPS demo) | Exactly our netcode use case | source is sponsor-only | Cannot copy. Play the demo, read the docs |
| L-Town (`besoeasy/l-town`) | Browser multiplayer FPS, Node + WebSockets + Three.js | MIT (per its README) | Study (claims up to 300 players per server; verify) |
| POLY ARENA (`bhittu21/polygame`) | Low-poly multiplayer FPS, Three.js + Socket.IO | not confirmed | Study only until a license is confirmed |
| `whitwhoa/open-browser-fps` | Authoritative server example (Socket.IO + Three.js) | not confirmed | Author says it is not the "correct" way. Skim only |
| survev, Suroi (2D browser battle royales) | Closest in genre | GPL-3.0 | **Never copy code.** Study design ideas only |
| NotStrike FPS template (Gumroad) | Three.js + Rapier + TypeScript FPS starter | paid | Not free, skipped |

## 2. Libraries worth adding (all permissive)

| Need | Library | License | Notes |
|---|---|---|---|
| Real navmesh for bots on the final map | `recast-navigation` (+ `@recast-navigation/three`) | MIT (Recast & Detour itself: zlib) | WASM, works in browser **and Node**, so server bots can use it. Better than Yuka's navmesh for 3D maps |
| Instant sound effects with no files | ZzFX | MIT | Tiny sound synth, perfect for placeholder shots/hits and keeping load size small |
| Retro SFX designers | jsfxr (sfxr.me), jfxr | code: MIT / BSD | Sounds you make are yours |
| Positional (3D) audio | three.js `PositionalAudio` | MIT | Already inside three.js |
| Physics, bots, rendering, netcode | Rapier, Yuka, three.js, Colyseus | Apache-2.0 / MIT | Already chosen |

## 3. Weapons (3D models)

| Pack | Contents | License | Notes |
|---|---|---|---|
| Quaternius "Ultimate Gun Pack" | 50+ low-poly guns (pistols, rifles, shotguns, snipers) | CC0 | FBX/OBJ/Blend, about 7 MB. Convert to glTF/GLB in Blender |
| Kenney "Blaster Kit" | Blasters, targets, bullets, magazines, crates | CC0 | 1.1 MB, very simple look that matches our flat style |
| Quaternius "Low Poly Animated Guns" | Animated guns | CC0 | Check the pack page for formats |
| Itch.io free gun packs (Delthor, Zsky, styloo...) | Many | **varies per pack** | Only use packs that state CC0 on their page; some are "free" but restrict commercial use |

## 4. Sounds

| Source | Contents | License | Notes |
|---|---|---|---|
| Kenney audio packs | UI, impacts, sci-fi, RPG | CC0 | Clean, game-ready |
| "The Free Firearm Sound Library" (OpenGameArt) | Many real firearm recordings | listed CC0 | Verify on the page before use |
| OpenGameArt "25 CC0 bang SFX" | Bangs usable as gun shots | CC0 | Small |
| Freesound | 700,000+ sounds | **per sound: CC0, CC-BY or CC-BY-NC** | Filter to CC0. Never use CC-BY-NC for a game we sell |
| Sonniss GDC audio bundle | 200 GB of pro sound effects | royalty-free, commercial, no attribution | Large download, take only what we need |

A gun is a small sound system, not one file: shot, reload, empty click, impact. Plan 4 sounds per weapon.

## 5. Characters and animation (for bots and other players)

| Pack | Contents | License |
|---|---|---|
| KayKit Adventurers + KayKit Character Animations | Rigged low-poly characters, many animations, glTF/FBX | CC0 |
| Quaternius Universal Base Characters + Universal Animation Library | 26 base characters, glTF/FBX | CC0 (listing says 60-70% of the pack is the free part) |
| Kenney Animated Characters (Survivors, Retro, Protagonists) | Blocky rigged characters with animations | CC0 |
| Mixamo | Thousands of animations | free to use in games with an Adobe login; read their current terms |

Our eight operators need to be recognisable: one base character + a colour/accessory per operator (colors are in `data/operators.json`).

## 6. Environment and textures

Kenney (city, nature, modular kits), Quaternius (modular street, sci-fi), Poly Haven and AmbientCG (CC0 textures/HDRIs). Namibian flavour (Namib dunes, Skeleton Coast, Katutura streets) should come from our own colour palettes and layouts, not from copying real locations' photos.

## Shopping list for the next two milestones

1. Weapons: Quaternius Ultimate Gun Pack + Kenney Blaster Kit (about 9 MB).
2. Sounds: ZzFX now; one CC0 firearm library later.
3. Characters: one KayKit or Quaternius base character + animations.
4. Library: `recast-navigation` when the real map exists.

Everything above costs data to download, so do it on wifi, one pack at a time, and log each pack in `ASSETS.md`.
