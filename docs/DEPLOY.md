# Run it online (step by step)

Two things exist: the **game page** (static files, `npm run build` makes them in `dist/`) and the **game server** (Node, `npm run server`). Players load the page, the page opens a WebSocket to the server.

## A. On your own PC first (5 minutes)

1. Terminal 1, in the project folder: `npm install` then `npm run server`  
   You should see `NIGHTHAWK server listening on ws://localhost:2567 (lobby 15s)`.
2. Terminal 2: `npm run dev` and open the address it prints (usually http://localhost:5173/).
3. Type a callsign, press **PLAY ONLINE**. You are in a lobby; after 15 seconds the match starts and empty slots are filled with bots.
4. Open the same page in a **second browser window** (a private window works) before the 15 seconds end. Now two humans are in the same match. Walk towards each other and shoot.
5. Want to feel bad internet? Add `?lag=150` to the address of ONE window (150 ms round-trip). Movement still feels instant (prediction) and your shots still hit (lag compensation).
6. Short lobby for testing: `LOBBY_SECS=3 npm run server` (on Windows PowerShell: `$env:LOBBY_SECS=3; npm run server`). Bot difficulty for the whole server: `DIFFICULTY=hard npm run server` (`easy`, `normal`, `hard`, `brutal`).

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

## C2. Running it safely (Stage 12)

| What | Detail |
|---|---|
| **Health check** | `GET /health` -> `{"ok":true,"uptimeSecs":..,"rooms":..,"players":..}`. No player data. Point an uptime monitor (UptimeRobot, Cloudflare health check, Docker `HEALTHCHECK`) at `https://play.yourdomain.com/health`. |
| **Metrics** | `GET /metrics` (JSON) or `GET /metrics?format=prom` (Prometheus text): rooms, humans, bots, tick time avg / p99 / max, slow ticks, joins, rate-limit drops, kicks, reconnects, refused rooms, memory. Set `METRICS_TOKEN=somesecret` and it needs `Authorization: Bearer somesecret` (or `?token=`). **Always set it on a public server.** |
| **What to watch** | `tick.p99` should stay under 8 ms (a tick is 16.7 ms); if it creeps up, you hold too many matches per core (`MAX_ROOMS`). `kicks` or `rateLimited` jumping means somebody is flooding. `reconnectsFailed` high means bad networks or a too-short `RECONNECT_SECS`. |
| **Message limits** | Per player: 400 input messages/s (burst 120; a 240 Hz monitor sends 240), 4 pings/s, 5 unknown messages/s. Excess is dropped; 120 dropped in a row = the connection is closed (code 4003). Any single WebSocket message over 4 KB closes the connection (a real input batch is under 1 KB). Every input is also clamped by `sanitizeCmd`. |
| **Room cap** | `MAX_ROOMS=40` (default). When reached, new players get `server busy - try again in a minute` instead of everybody lagging. One match is about 5.5% of one core (`node scripts/bench-sim.mjs`), so 40 rooms is about two cores: size it to your VPS. |
| **Per-IP limits** | Not in the game server on purpose: put them in the reverse proxy. With Caddy install the rate-limit plugin, with nginx use `limit_req_zone` / `limit_conn_zone` on the WebSocket route (for example 10 new connections per minute per IP). Cloudflare in front of the VPS gives basic DDoS protection too. |
| **Env vars** | `PORT`, `LOBBY_SECS`, `MATCH_SIZE`, `VEHICLES=0`, `LOOT=0`, `DROP=0` (skip the parachute drop), `DIFFICULTY=easy/normal/hard/brutal`, `MAX_ROOMS`, `RECONNECT_SECS`, `METRICS_TOKEN`. |

Quick look from the VPS: `curl -s localhost:2567/health` and `curl -s -H "Authorization: Bearer $METRICS_TOKEN" localhost:2567/metrics | head`.

## C3. What a server costs (measured, 19 Nov 2026)

`npm run load` (`scripts/load-test.mjs [humans] [seconds] [rooms]`) starts the real server and joins N real network clients (the same `NetSim` code the browser uses, 40 ms artificial lag, random walking, shooting, jumping, grenades and melee) and reports server tick time, memory and the bytes each player receives and sends, counted on the client's WebSocket.

Result on this 2-core, 8 GB sandbox, with the **clients running in the same process as the server** (so the server was sharing the CPU with 16 to 32 client predictors, which makes these numbers pessimistic for the server):

| Run | Server tick avg / p99 (budget 16.7 ms) | Memory (rss) | Per player download | Whole server |
|---|---|---|---|---|
| 1 room, 16 humans + bots, 25 s | 0.87 ms / 1.9 ms | 458 MB | 37.9 KB/s (21 messages/s) | 607 KB/s = 2.1 GB per hour |
| 2 rooms, 32 humans + bots, 30 s | 0.60 ms / 1.1 ms | 499 MB | 38.5 KB/s | 1.2 MB/s = 4.2 GB per hour |

What this does and does not tell you:
- **CPU is not the problem**: a full 16-player match with bots uses about 1 ms of a 16.7 ms tick, so one small VPS core should carry several rooms. Rare single ticks of 65 to 70 ms were seen once per run (probably match start or garbage collection); the 2 s worst-case p99 stayed under 15 ms. A 2-hour soak is still to do.
- **Bandwidth is the bill**: about 38 KB/s per player is roughly 137 MB per player-hour (upload is only about 1.4 KB/s). A 16-player match for an hour is about 2 GB out. A plan with 1 TB of outbound traffic a month covers roughly 500 full-match hours. Ways to cut it later: send nearby fighters at 20 Hz and far ones at 10 Hz, quantise positions harder, and skip unchanged fighters (delta snapshots).
- **Not measured**: real players on real networks (loss, jitter), browsers on the other end, many matches starting at once, a server on a VPS instead of localhost. Those are still on the list; this is the localhost ceiling, not a promise.

## D. Things that will bite you

- **Time zone / clock**: none; the game uses tick counts, not wall-clock time.
- **One server process = a few hundred players at most** on one core in theory; we have not load-tested with real players. Before launch: run `node scripts/bench-sim.mjs` on the VPS and watch CPU with `docker stats` during a few matches.
- A player whose connection drops (wifi blip, laptop lid, page refresh does NOT count: that is a new page) has **12 seconds** to come back: the game client reconnects by itself and the fighter stands still meanwhile. After that a bot takes over. Someone who leaves on purpose (menu, closing the tab politely) is replaced by a bot at once. `RECONNECT_SECS=20` changes the window.
- The server never trusts the browser: it only reads keys/aim (`src/sim/cmd.js: sanitizeCmd`). Cheats like "give me 999 health" or "teleport" do nothing. Aimbots are still possible (any shooter has them); rate-limiting and server-side checks come later.
