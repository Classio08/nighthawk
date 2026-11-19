# Free friend test (no VPS, no money)

Goal: let one or two friends join a match from their own phone or laptop while your computer is the server. Cost: 0.

## What you need
- This repo on your computer, Node 20+ (`npm install` once).
- Optional but recommended: `cloudflared` (free, no account needed for a quick tunnel).
  - Windows: `winget install Cloudflare.cloudflared`
  - macOS: `brew install cloudflared`
  - Linux: see <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>

## Steps
1. `npm install` (first time only).
2. `npm run host`
   - builds the game if `dist/` is missing (add `--build` to force a rebuild after you change code);
   - starts the server **and** serves the game page from the same port (default 2567);
   - prints `http://localhost:2567/`, the same-Wi-Fi link, and (when `cloudflared` is installed) a public `https://....trycloudflare.com` link.
3. Send the public link to your friend. They open it, press **PLAY ONLINE**. The page detects that it is hosted by a game server and connects to itself (no `?online=` needed).
4. Keep the terminal open. Closing it ends the session. The link changes every time.

No `cloudflared`? Try `npm run host -- --tunnel=ssh` (uses `ssh` and the free localhost.run service; no install) or `--no-tunnel` for same-Wi-Fi only.

## Settings (environment variables, same as `npm run server`)
`MATCH_SIZE` (default 8 here), `LOBBY_SECS` (15), `DIFFICULTY` (`easy|normal|hard`), `MAX_ROOMS` (4 here), `PORT`. Example (PowerShell): `$env:MATCH_SIZE=6; npm run host`.

## What is verified and what is not
- PLAY ONLINE picks the server in this order: `?online=ws://host:port` or the `VITE_SERVER_URL` build setting, then **the server that served the page** (so `npm run host -- --port=3000` works), then `ws://localhost:2567` when developing on the same machine. (Before 19 Nov 2026 the localhost default came first, so a host on another port was missed.)
- Verified by script in the sandbox: the server serves `index.html`, hashed assets (cached for a year), the voice mp3s, `/health`; path traversal and dotfiles return 404; the same-origin detection logic is unit tested (`tests/static-serve.test.js`).
- NOT verified: the tunnel itself (my sandbox cannot reach Cloudflare or localhost.run), real latency from a friend's phone, and mobile touch controls over the tunnel. First real friend session is the test. Report what you see.
- A quick tunnel has no uptime promise and is rate limited; it is for tests, not for a public launch.

## When you want it permanent and still cheap
| Option | Cost | Notes |
|---|---|---|
| Your own PC + a named Cloudflare Tunnel on a domain you own (e.g. one of your `.com` domains) | free tunnel, domain cost only | stable link, PC must stay on; set it up in the Cloudflare Zero Trust dashboard |
| Oracle Cloud "Always Free" Arm VM | 0 (needs a card for sign-up; availability varies by region) | can run `npm run host -- --no-tunnel` behind Caddy or a Cloudflare Tunnel; no Windhoek region, expect 150-250 ms |
| Render / Fly.io / Railway | free tiers change often and may sleep | WebSocket game servers dislike sleeping; check current terms before relying on it |
| Static only (GitHub Pages / Cloudflare Pages / itch.io) | 0 | offline operations and solo skirmish only; there is no game server there |

Latency note: players far from the host feel it. Your PC in Windhoek is best for friends in Namibia; for friends abroad a VPS in Johannesburg/Cape Town (when you can afford one) is better. `docs/DEPLOY.md` has the paid route.

## Safety
The tunnel exposes only this game server (the WebSocket and the built game files). It does not expose your disk: file serving is limited to `dist/`, refuses `..`, dotfiles and backslashes. Do not run it from a folder that contains secrets you have placed inside `dist/`. Keep `METRICS_TOKEN` set if you expose `/metrics`.
