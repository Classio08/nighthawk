# NIGHTHAWK

A realistic browser tactical shooter built around an original fictional African-inspired special-operations unit. NIGHTHAWK combines responsive gunplay, squad tactics, AI-driven match stories and a Southern African-inspired setting. The visual direction is a realistic redesign with modern equipment; the current renderer still contains placeholder/block-built character and environment art. Web first, with mobile support planned.

Status: offline battle royale and a local online multiplayer milestone are implemented. This is not yet a public production release: external-network validation, load testing, realistic operator models and integrated PBR materials remain outstanding. See `docs/ROADMAP.md`, `docs/MASTER_SYSTEMS.md`, `docs/PRODUCTION_READINESS.md`, `docs/PERFORMANCE_BUDGET.md`, `docs/ASSET_CATALOG.md`, `docs/PHOTO_TO_TEXTURE_WORKFLOW.md`, `docs/VISUAL_ASSET_REVIEW.md` and `docs/CLAUDE_HANDOFF.md`.

---

## Run it on your computer (baby steps)

Do the downloads once, on wifi (about 200 MB in total).

**1. Install Node.js**
- Go to https://nodejs.org and click the big **LTS** button. Run the installer, click Next until it finishes.

**2. Install Git**
- Go to https://git-scm.com/download/win. Run the installer, click Next until it finishes (defaults are fine).

**3. Open a terminal**
- Press the Windows key, type `PowerShell`, press Enter.

**4. Get the project**
```powershell
mkdir C:\Dev
cd C:\Dev
git clone https://github.com/Classio08/nighthawk.git
cd nighthawk
```

**5. Install the game's parts (one time)**
```powershell
npm install
```

**6. Start the game**
```powershell
npm run dev
```
Open the address it prints (usually http://localhost:5173) in Chrome. Click the screen to play.

**Controls:** `WASD` move, `Shift` sprint, `Space` jump, mouse aim, **left click fire**, **right click aim down sights**, `R` reload, `1`-`6` or mouse wheel switch weapon, `G` grenade, `Esc` pause. If the mouse will not lock, use the arrow keys to look.

**What you are playing:** a 16-fighter battle royale. You and 15 bots (the other seven operators + Recruits) spawn spread across a desert map. A red zone shrinks every ~40 seconds; stand outside it and you take damage. Last one alive wins. Bots see you with real line-of-sight, hear gunfire, take cover, throw grenades and also fight *each other*.

**Stop the game:** click the terminal and press `Ctrl + C`.

---

## Play online (two windows on your own PC)

```powershell
npm run server        # terminal 1: the game server (port 2567)
npm run dev           # terminal 2: the game page
```
Open the page, type a callsign, press **PLAY ONLINE**, and open a second window and do the same within 15 seconds. Empty slots are filled with bots. Add `?lag=150` to one window's address to feel 150 ms of fake lag. Putting it on the internet: `docs/DEPLOY.md`.

## Check that everything works

```powershell
npm test               # unit tests: movement, weapons, bots, zone, ragdolls, multiplayer rules, netcode maths
npm run smoke          # physics + AI engine checks, no browser needed
npm run server:test    # real server + two real clients with 120 ms fake lag (hits, prediction, leaving)
npm run build          # makes the website files in the dist folder
npm run check          # all of the above in one go
```

## Folders

| Folder | What is in it |
|---|---|
| `src/` | the game code |
| `src/sim/` | **the game rules** (no graphics): fighters, weapons, bots, zone, map. Runs in the browser (solo) AND on the server (online) |
| `src/net/` | multiplayer: wire format and the browser-side prediction/interpolation (`netsim.js`) |
| `src/render/` | what you see: world, soldiers, guns, ragdolls (three.js) |
| `src/fx/` | sound, particles, bullet holes, screen shake |
| `src/ui/` | HUD and minimap |
| `src/input/` | keyboard, mouse, movement maths (touch controls plug in here later) |
| `data/` | operators and weapons as plain data (`operators.json`) |
| `docs/` | verified roadmap, master systems, visual production, performance budgets, production gates and technical notes |
| `assets/` | models, textures, sounds (empty for now, see `ASSETS.md`) |
| `public/` | files copied as-is into the website (favicon) |
| `server/` | the multiplayer server (Colyseus room that runs `src/sim`), its Dockerfile and test |
| `scripts/` | helper scripts (`smoke.mjs`, `e2e.mjs`) |
| `tests/` | automatic tests |

## Rules for this project
- Every downloaded asset (model, texture, sound) gets a line in `ASSETS.md` with its source and license **before** it is used.
- Only use code with MIT, Apache-2.0, BSD or similar licenses. GPL code is never copied into the game (study its design only).
