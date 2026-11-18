# How the combat, bots and "feel" work

Everything below is small on purpose. When you want to tune the game, the number you need is almost always in one of the files named here.

## The big idea: rules and graphics are separate

```
src/sim/      THE RULES. No graphics. Runs in the browser today, on the multiplayer server later.
  world.js      Simulation: fighters, shooting, grenades, damage, kills, win/lose, one fixed 60 Hz step()
  bot.js        BotBrain: what a bot does each tick (Yuka steering + Rapier line-of-sight)
  weapons.js    all 6 weapons as numbers (damage, fire rate, recoil, spread, ADS zoom, noise...)
  zone.js       the shrinking circle (pure maths)
  map.js        the arena, built from a seed (+ findCover for bots)
  rng.js        seeded random numbers (same seed = same match)

src/render/   WHAT YOU SEE (three.js). Reads the Simulation, never changes it.
src/fx/       sound (zzfx), particles, bullet-hole decals, tracers, camera shake
src/ui/       HUD + minimap (plain HTML/CSS)
src/main.js   the glue: input -> Simulation -> events -> effects
```

The Simulation talks to the outside world with **events** (`shot`, `hit`, `kill`, `explosion`, `reload`...). `main.js` reads them once per frame and plays the sound / spawns blood / shakes the camera. That is why the same Simulation can later run on a server with no graphics at all.

## Weapons (`src/sim/weapons.js`)
Add or change a gun by editing one block of numbers. Key fields: `dmg`, `headMul`, `rof` (seconds between shots), `mag`, `reload`, `spreadHip` / `spreadAds` (accuracy), `bloom` (spread that grows while firing), `recoilUp` / `recoilSide` (how the view climbs), `kick` (how hard the gun model jerks), `adsFov` (zoom), `noise` (how far bots hear it).

## Gun feel (`src/render/viewmodel.js`, `spring.js`)
No hand-made animations. A **spring** (`Spring`) is a number that chases a target with some bounce. Four springs + a few sine waves give: mouse sway (gun lags behind your look), recoil kick, walk bob, landing dip. Aim-down-sights, sprint pose, reload dip and weapon raise are smooth blends. The view recoil itself is in `main.js` (`G.recoil`): the aim climbs when you shoot and settles back ~60 % when you stop.

## Bots (`src/sim/bot.js`)
Priority each tick: **zone** (outside the circle -> run in) > **cover** (hurt badly or reloading in a fight -> `findCover`) > **engage** (sees an enemy) > **hunt** (lost sight < 3 s ago) > **investigate** (heard gunfire) > **roam** (walk to a point inside the next zone).
- *Eyes:* every ~0.2 s `sim.canSee()` = distance + field of view (1.9 rad, people very close are noticed) + a **Rapier ray** that must not hit a wall. No wall-hacks.
- *Ears:* every shot calls `sim.makeNoise()`; bots inside the weapon's `noise` radius may turn and walk to the sound.
- *Aim:* turn speed, reaction delay and aim error all come from one `skill` number per bot (0.35-0.9). Bursts with pauses. Bots lob grenades at medium range.
- *Movement:* a Yuka `Vehicle` (Seek + ObstacleAvoidance) decides the direction, the Rapier character controller does the actual moving. Stuck > 1 s -> random direction for a moment.
- *Bot vs bot:* any fighter is a valid target, the nearest wins. That is what makes matches feel alive even when you hide.
- **Pacing knob:** bots aggression is the top of `bot.js` (`reaction`, `aimErr`, `fov`, sight range, hear chance). Matches currently last ~2 minutes with a passive player.

## Zone (`src/sim/zone.js`)
5 phases (`ZONE_PHASES`): wait, then shrink, damage per second grows from 1.5 to 12. Each new circle is always inside the old one. Bots pick roam points inside the *next* circle so they drift towards it before it closes.

## Brutal feedback
| Thing | File |
|---|---|
| Sounds (20, generated from numbers) | `src/fx/audio.js` (edit the `SOUNDS` table, design new ones at the ZzFX site) |
| Blood / sparks / dust / explosion / casings (one draw call) | `src/fx/particles.js` |
| Bullet holes + blood stains (ring buffers, constant cost) | `src/fx/decals.js` |
| Screen shake ("trauma" system) | `src/fx/camerafx.js` |
| Hitmarkers, damage direction arrows, red vignette, kill feed | `src/ui/hud.js` |
| Ragdoll deaths (own cosmetic Rapier world, 6 jointed boxes, impulse from the killing bullet) | `src/render/ragdoll.js` |

Ragdolls never touch gameplay, so they can never desync a multiplayer match.

## Tests
- `npm test` - 25 tests: movement maths, weapons, map, zone, springs, ragdoll stability, line of sight, headshots, zone damage, grenades, hearing, 16-fighter battle, **determinism** (same seed + inputs = same match).
- `node scripts/e2e.mjs` - plays the real game in headless Chrome (22 checks). Needs `puppeteer-core`, a build and `vite preview`.

## Licence verdicts on the repos the other AI suggested (checked 18 Nov 2026)
| Repo | Licence | What we do |
|---|---|---|
| Claude-of-Duty | MIT (LICENSE file; its package.json says ISC) | Studied for ideas, **no code copied** (67k lines, built for high-end graphics). If we ever copy a file, keep its copyright notice |
| rapierjs-ragdoll | no licence file | Cannot copy. We wrote our own joint ragdoll |
| threejs-rapier | no LICENSE file (package.json says MIT), 752 MB | Not used |
| gear | no licence | Not used |
| survev, Suroi | GPL | Study only - copying would force us to open-source the whole game |
