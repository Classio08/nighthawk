# NIGHTHAWK

A fast, addictive browser shooter: **COD-style operators and abilities + PUBG-style last-one-standing matches**, in short sessions, with simple low-poly looks and real physics. Web first (PC browsers), then mobile and a desktop download.

Status: **Milestone 0 done** (tech proof: movement, physics, shooting, grenades, AI bots all working). See `docs/ROADMAP.md`.

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

**Controls:** `WASD` move, `Shift` sprint, `Space` jump, mouse aim, click fire, `G` grenade, `R` reset. If the mouse will not lock, use the arrow keys to look.

**Stop the game:** click the terminal and press `Ctrl + C`.

---

## Check that everything works

```powershell
npm test         # unit tests (movement directions, including the A/D fix)
npm run smoke    # physics + AI engine checks, no browser needed
npm run build    # makes the website files in the dist folder
```

## Folders

| Folder | What is in it |
|---|---|
| `src/` | the game code |
| `src/input/` | keyboard, mouse, movement maths (touch controls plug in here later) |
| `data/` | operators and weapons as plain data (`operators.json`) |
| `docs/` | design, roadmap, tech stack, notes from the old chat |
| `assets/` | models, textures, sounds (empty for now, see `ASSETS.md`) |
| `public/` | files copied as-is into the website (favicon) |
| `scripts/` | helper scripts (`smoke.mjs`) |
| `tests/` | automatic tests |

## Rules for this project
- Every downloaded asset (model, texture, sound) gets a line in `ASSETS.md` with its source and license **before** it is used.
- Only use code with MIT, Apache-2.0, BSD or similar licenses. GPL code is never copied into the game (study its design only).
