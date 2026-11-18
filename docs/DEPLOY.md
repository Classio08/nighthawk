# Run it online (step by step)

Two things exist: the **game page** (static files, `npm run build` makes them in `dist/`) and the **game server** (Node, `npm run server`). Players load the page, the page opens a WebSocket to the server.

## A. On your own PC first (5 minutes)

1. Terminal 1, in the project folder: `npm install` then `npm run server`  
   You should see `NIGHTHAWK server listening on ws://localhost:2567 (lobby 15s)`.
2. Terminal 2: `npm run dev` and open the address it prints (usually http://localhost:5173/).
3. Type a callsign, press **PLAY ONLINE**. You are in a lobby; after 15 seconds the match starts and empty slots are filled with bots.
4. Open the same page in a **second browser window** (a private window works) before the 15 seconds end. Now two humans are in the same match. Walk towards each other and shoot.
5. Want to feel bad internet? Add `?lag=150` to the address of ONE window (150 ms round-trip). Movement still feels instant (prediction) and your shots still hit (lag compensation).
6. Short lobby for testing: `LOBBY_SECS=3 npm run server` (on Windows PowerShell: `$env:LOBBY_SECS=3; npm run server`).

If the page says "Could not join a match", the server is not running or the address is wrong. You can point a page at any server with `?online=ws://host:2567`.

## B. Put it on the internet

You need (1) a small Linux server (VPS) for the game server and (2) any static host for the page.

**Game server (VPS)**
1. Pick a VPS **close to your players** (Johannesburg/Cape Town for Namibia and South Africa, Frankfurt/Amsterdam for Europe). Prices and regions change: check the provider's page. One core is plenty for a first launch: a full 16-fighter match costs about 0.5 ms of CPU per game tick (3% of one core, measured with `node scripts/bench-sim.mjs`).
2. Install Docker, then on the VPS: `git clone https://github.com/Classio08/nighthawk && cd nighthawk && docker build -f server/Dockerfile -t nighthawk-server . && docker run -d --restart unless-stopped -p 2567:2567 --name nh nighthawk-server`
3. Browsers on https pages only allow **wss://** (secure WebSocket). Easiest fix is Caddy (free, gets the certificate by itself). Point a domain name at the VPS (A record), install Caddy, and put this in `/etc/caddy/Caddyfile`:
   ```
   play.yourdomain.com {
       reverse_proxy localhost:2567
   }
   ```
   then `sudo systemctl reload caddy`. Caddy forwards WebSockets automatically.

**Game page**
1. `VITE_SERVER_URL=wss://play.yourdomain.com npm run build` (PowerShell: `$env:VITE_SERVER_URL="wss://play.yourdomain.com"; npm run build`).
2. Upload the `dist/` folder to Cloudflare Pages / Netlify / any static host. The PLAY ONLINE button now connects to your server.

## C. Game portals (CrazyGames, Poki)

Checked in November 2026. Rules change, so re-check before you submit.

- **Poki**: external multiplayer servers are allowed, but they need an up-to-date privacy statement and (for the CSP allow-list) your WebSocket domain; target initial download under 8 MB; Poki prefers **web exclusivity** (the game may only be on Poki on the open web). Source: https://sdk.poki.com/new-requirements and https://sdk.poki.com/deals
- **CrazyGames**: initial download 50 MB or less, content must meet PEGI-12 rules (so keep the **portal-safe** blood setting on, see `docs/COMBAT_SYSTEMS.md`). Source: https://docs.crazygames.com/requirements/technical/ and https://docs.crazygames.com/faq/
- Our build today: about 1.85 MB gzipped for the game plus about 0.1 MB for the multiplayer code, loaded only when someone presses PLAY ONLINE.
- Both portals add their own SDK (ads, loading events). That is a later milestone (see ROADMAP "Monetise").

## D. Things that will bite you

- **Time zone / clock**: none; the game uses tick counts, not wall-clock time.
- **One server process = a few hundred players at most** on one core in theory; we have not load-tested with real players. Before launch: run `node scripts/bench-sim.mjs` on the VPS and watch CPU with `docker stats` during a few matches.
- A player who closes the tab is replaced by a bot instantly, so nobody is stuck waiting.
- The server never trusts the browser: it only reads keys/aim (`src/sim/cmd.js: sanitizeCmd`). Cheats like "give me 999 health" or "teleport" do nothing. Aimbots are still possible (any shooter has them); rate-limiting and server-side checks come later.
