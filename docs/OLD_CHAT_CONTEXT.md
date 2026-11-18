# Carried over from the first Claude Code chat

## The original brief
A simple, fun video game about 8 special-unit operators of the Namibian Defence Force (NDF), each with a backstory, an ability and customization. Open map, missions, a story, AI-controlled enemies and allies, good physics, a "COD mobile" feel. Wanted as a playable demo fast, in the cloud, with limited data.

## Characters (original names, kept exactly)
Roms, Shadow, Douglas, Cliffhanger, Navy Blue, Rampol, Maetja, Cleiseis. Data: `data/operators.json`.

## The first build
"CLS: Nighthawk 3D" - a single-file browser game (three.js r128 from a CDN). Still live and untouched:
https://claude.ai/artifact/3FwZpG3zWEoYS8PTVzixxx

It is kept only as a reference. This repo replaces it.

## Bugs the player reported (and where they are fixed)
| Bug | Cause | Fix in this repo |
|---|---|---|
| A moved right and D moved left | The sideways vector used the wrong sign | `src/input/move.js`, locked in by `tests/move.test.js` |
| Aim was off the crosshair | Camera sat behind the player, bullets started at chest height | First-person camera, ray fired from the camera |
| Weak gun graphics | Placeholder boxes | Gun models improve in Milestone 1 |
| One life, no hit feedback | Not built | Health, armor, hit markers, damage indicator in Milestone 1 |
| Pointer lock loss left the game running | No pause | Pause on focus loss in Milestone 1 |
| Enemies saw through walls | No line-of-sight check | Raycast line-of-sight for bots in Milestone 1 |

## Ideas worth keeping from the old prototype
Procedural textures (no image downloads), operator ability list, weapon stat table (copied into `data/operators.json`), the NDF/Namibia flavour (Namib, Skeleton Coast, Fish River Canyon, Katutura, Windhoek locations for maps and backstories).

## Decisions made in this fresh start
- New repo and a real build setup (Vite) instead of one big HTML file.
- Battle-royale-with-operators concept instead of an open-world story game, because it is the fastest path to an addictive, monetizable web game.
- Story and missions can return later as a separate mode.
