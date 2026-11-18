# Roadmap

Rule: every milestone ends with something you can open in a browser and play. Estimates are "focused working sessions" with Claude, not calendar promises.

**Change (decided with Cleis):** multiplayer moves from Milestone 7 to Milestone 1. The game is built on a server-authoritative loop from the start. See `MULTIPLAYER.md`.

| # | Milestone | Done when | Status |
|---|---|---|---|
| 0 | **Tech proof** | Move, jump, shoot, grenades, physics crates, AI bots, tests, build | DONE |
| 0.5 | **Multiplayer spike** | Colyseus 0.18 server runs Rapier; two fake clients join, move, get blocked by a wall, and shoot each other with server-validated hits | DONE (replaced by Milestone 1) |
| 0.7 | **Battle-royale core (offline)** | Rules split into a graphics-free `Simulation` (`src/sim/`); 6 data-driven weapons with recoil / ADS / reload; bots with line-of-sight, hearing, cover, grenades; shrinking zone; win/lose + play again; zzfx sounds, blood/spark particles, bullet holes, ragdoll deaths, screen shake, HUD + minimap; 25 tests + 22-step browser test | DONE |
| 1 | **Two tabs, one match** | Server-authoritative Colyseus room runs the real `Simulation`; browser prediction + reconciliation, interpolation, lag-compensated capsule hits, lobby with bots filling slots, leaver replaced by a bot, Dockerfile + `DEPLOY.md`. Tested with a real server and two real browsers. **Still to do: deploy to a VPS and test with a friend on another network** | DONE (code) / deploy pending |
| 1.5 | **Systems wave (Master Prompt)** | Utility AI + personalities + squads + garrison guards; tactical/empty reloads, dropped mags, GLSL weapon skins; destructible cover + explosive barrels; contracts (airdrop / hardpoint / bounty / two-stage relay uplink), mortar killstreak, weather + night, gore toggle; arcade buggy + bike with roadkill and bots that drive; loot on the ground (guns, ammo, armor, medkits, grenades), death drops, airdrop crates, bots that loot and heal. 91 unit tests, server test, 8 browser checks. Details: `MASTER_SYSTEMS.md` | DONE |
| 2 | **Playable arena (online)** | One real map, 6 weapons from CC0 packs (reload, ammo, recoil), sounds, hit markers, damage direction, health + armor, death and respawn, pause on focus loss | |
| 3 | **Server bots** | Yuka bots with line-of-sight + recast navmesh living on the server; they fill empty slots so a match always starts instantly | |
| 4 | **Battle royale loop** | 16 fighters, drop-in, loot on the ground, shrinking zone, win/lose screen, "play again" in one click | |
| 5 | **The eight operators** | Roms, Shadow, Douglas, Cliffhanger, Navy Blue, Rampol, Maetja, Cleiseis: pickable, abilities work, visible on other players | |
| 6 | **Addiction layer** | XP, levels, daily challenges, unlockable cosmetics, settings, saved progress (needs accounts or local save) | |
| 7 | **Portal-ready** | Fast loading, under-5 MB first load, portal SDK hooks (ads, rewarded revive), portal rules for external servers checked, performance pass on weak laptops | |
| 8 | **Launch on web** | Own domain on Cloudflare Pages; portals (Poki / CrazyGames / itch.io) submitted; watch the numbers | |
| 9 | **Mobile** | Touch controls on the same input layer, landscape lock, Capacitor wrap | |
| 10 | **Desktop** | Tauri/Electron Windows build, Steam page if web numbers justify it | |

## Honest expectations
- By 5pm today you have: the project on GitHub, the plan, a proven engine, a proven multiplayer server, and a playable single-player tech demo. Not a finished battle royale.
- Milestone 1 is the hardest technical step (prediction + lag compensation + deploy). Milestones 2-4 are where it starts to feel like a game. Milestone 7 is where it can earn.
- Portal acceptance is not guaranteed and terms change. Our own domain with ads and cosmetics is the fallback.
- Multiplayer adds running costs (a small server, roughly $15-25/month at the start) and latency work for players far from the server.
