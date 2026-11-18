# Game design: NIGHTHAWK

## One sentence
Drop into a small shrinking map with 15 other fighters, pick up weapons, use your operator's ability, and be the last one standing, in a match that lasts about 5 minutes.

## Why this shape
- **Short matches (4-6 min)** with an instant "play again" button are what makes web games addictive and what portals reward (session length and return visits).
- **Bots fill the lobby.** The game is fun on day one with zero servers. Real players are added later without changing the game.
- **Small map, fast zone.** PUBG's tension without PUBG's 30 minutes of walking.
- **COD's identity** comes from the operators: eight characters, each with one ability and a signature weapon.
- **Simple textures.** Flat colors and low-poly shapes. Cheap to make, loads fast, runs on weak laptops, and is easy to read in a fight.

## Core loop
1. Pick an operator (and a cosmetic).
2. Drop in. Run to loot (weapons, armor, med kits, grenades).
3. Fight bots/players. Use cover, grenades, abilities.
4. The safe zone shrinks. Stay inside it.
5. Match ends: XP, unlocks, challenge progress.
6. **Play again** (one click).

## Operators (original names)
Roms, Shadow, Douglas, Cliffhanger, Navy Blue, Rampol, Maetja, Cleiseis. Roles, abilities and short backstories are in `data/operators.json`. Each has one active ability with a cooldown and a favourite weapon.

## Feel and physics (what makes it satisfying)
- First-person view: exact crosshair aim, no animation needed for the player.
- Rapier physics: jumping, stairs/step-up, sliding along walls, crates you can shove and shoot, bouncing grenades, explosion impulses.
- Hitscan shooting (instant), with recoil, muzzle flash, tracers, hit markers and screen shake. Hit feedback matters more than realism.
- Health plus armor, red screen-edge flash when hurt, directional damage indicator.

## AI bots
Yuka drives them with a state machine: wander, search for loot, chase, take cover, attack, flee when low on health. Bots need line-of-sight (raycast) before they shoot, and miss on purpose at a difficulty-based rate. Bot difficulty scales with the player's level so new players win early (addictive) and veterans get challenged.

## Meta (the reasons to come back)
- XP and player level, daily challenges, a streak counter.
- Cosmetics only (camos, weapon skins, tracer colors, emotes). No pay-to-win.
- Rewarded ads, always optional: revive once, double XP, a free cosmetic crate.

## What we are NOT building first
Vehicles, huge maps, voice chat, ranked mode, a story campaign. They can come after the loop is proven.

## Known issues from the first prototype (all must be fixed)
Strafe keys inverted (fixed + unit tested), aim not on the crosshair (first-person fixes this), weak gun visuals, single life, no hit feedback. See `OLD_CHAT_CONTEXT.md`.
