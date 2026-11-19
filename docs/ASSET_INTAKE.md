# How to give Claude and Grok the downloaded packs

The packs stay **on your PC**. They are not committed. Both AIs can read them only after they are inside the local checkout that the AI is running in (Claude Code on `C:\Dev\nighthawk`).

## Put them here (local only)

```
C:\Dev\nighthawk\raw-zips\          original ZIPs
C:\Dev\nighthawk\sorted-assets\     unpacked, catalogued copies
```

Add both paths to `.gitignore` before `git add`. Never `git add raw-zips` or `sorted-assets`.

## What to commit later

Only files that passed three checks:

1. Licence read from the pack's own README (CC0 or a licence that allows commercial use and modification). Unsure = `UNVERIFIED — DO NOT IMPORT`.
2. Shortlist from the inspection (`ASSET_SHORTLIST.md`), not the whole pack.
3. A line in `ASSETS.md` with source URL, licence, and files used.

Preferred runtime format is a complete glTF/GLB. Keep the chosen files small (1K textures for ground, not 8K).

## First packs to inspect (same order as the inspection task)

Urban modular buildings, RetroWeaponPack, Universal Base Characters, Breakable Boxes, Ground087, rocks_ground_03. Skip audio and UI until the map and the first-person gun read clearly.

## Portraits already in this branch

Owner-supplied 512×512 faces, web-ready:

| URL | Operator |
|---|---|
| `/portraits/roms.jpg` | Roms |
| `/portraits/roms-alt.jpg` | Roms (alt) |
| `/portraits/cleiseis.jpg` | Cleiseis |
| `/portraits/cleiseis-alt.jpg` | Cleiseis (alt) |
| `/portraits/douglas.jpg` | Douglas |
| `/portraits/maetja.jpg` | Maetja |
| `/portraits/rampol.jpg` | Rampol |
| `/portraits/shadow.jpg` | Shadow |

Concept sheet (reference only, not a texture): `/art/operators-concept-sheet.png`.

These are photos and concept art the owner provided. Do not republish them outside the game.
