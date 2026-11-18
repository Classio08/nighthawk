# Tech stack

All parts are free and open source with commercial-friendly licenses.

| Job | Tool | License | Why |
|---|---|---|---|
| Rendering (3D in the browser) | three.js 0.187 | MIT | Biggest web 3D library, huge community |
| Physics | Rapier (`@dimforge/rapier3d-compat`) | Apache-2.0 | Fast Rust/WASM physics, character controller, raycasts. WASM is embedded in the package, so no extra build plugin |
| AI bots | Yuka | MIT | State machines, steering, obstacle avoidance, perception, navmesh |
| Build tool / dev server | Vite | MIT | Instant reload, small production builds |
| Language | JavaScript (ES modules) now, TypeScript when the code grows | | Keep it simple until it hurts |
| Multiplayer (Milestone 1) | Colyseus 0.18 | MIT | Authoritative server with built-in prediction and lag compensation. Spike verified in `server/`. See `MULTIPLAYER.md` |
| Bot navmesh (Milestone 3) | recast-navigation | MIT | Real navmesh on the final map, runs in browser and Node |
| Placeholder sounds | ZzFX | MIT | Tiny synth, no sound files needed |
| Mobile (later) | Capacitor | MIT | Wraps the same web game as an Android/iOS app |
| Desktop (later) | Tauri (or Electron) | MIT / Apache-2.0 | Wraps the same web game as a Windows download |
| Hosting | Cloudflare Pages | free tier | Fast worldwide, free |

## Architecture rule
**Yuka decides, Rapier is the physical truth, three.js only draws.** Every bot has a Yuka brain and a kinematic Rapier capsule that follows it, so bullets and grenades hit bots through the same physics that hit crates and walls.

## Input
`src/input/` turns raw keyboard/mouse into game actions (`readMove`, `readLook`, `fire`). Touch controls will plug into the same functions later, so the game code never knows which device is used. Movement maths lives in `src/input/move.js` with unit tests.

## Verified so far (Milestone 0)
- `npm test`: 4 movement tests pass (A = left, D = right, W = forward, no faster diagonals).
- `npm run smoke`: 8 physics/AI checks pass (bounce, rest, wall block, ray hit, state machine, steering).
- Real headless Chrome: page loads with no errors, WASM physics starts, D/A/W move the correct way, a shot damages a bot, a grenade moves crates.
- Production build: about 4.9 MB raw / 1.8 MB gzip (Rapier's embedded WASM is most of that). Fine for now; we will code-split and lazy-load later (portals like under ~5 MB initial).

## Licenses to watch
- survev / Suroi (open-source 2D battle royales) are **GPL-3.0**. We study their design ideas only and never copy code.
- Check every asset's license before using it (see `ASSETS.md`).
