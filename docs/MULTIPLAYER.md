# Multiplayer plan

Decision: **multiplayer comes right after the tech proof, not at the end.** Retro-fitting networking into a finished single-player game is the classic way these projects die. Building the game on a server-authoritative loop from the start also gives us anti-cheat, bots that live on the server, and portal-style lobbies for free.

## What we found (research summary)

- **Colyseus 0.18 (MIT) now ships the hard parts built in**: fixed-tick server simulation, client-side prediction with reconciliation, smoothed/interpolated remote players, and hitscan **lag compensation** (`allowRewindState`, `rewind.lastSeenBy`). Source: https://docs.colyseus.io/netcode
- Its docs name **Rapier** as a supported "opaque engine" for prediction (`predict.sim`). Caveat from the same page: engine-internal state (contact caches, solver data) is not rolled back on reconcile, so we only predict the **kinematic player controller** (stateless, cheap to replay) and keep crates, grenades and bots server-only. Source: https://docs.colyseus.io/netcode/client-prediction
- Colyseus' own FPS demo ("ColyStrike") exists, but **its source code is sponsor-only**, so we cannot copy it. We build our own from the public docs. The "Prediction Playground" labs are public on GitHub.
- npm check (today): `colyseus` 0.18.12, `@colyseus/core` 0.18.28, `@colyseus/sdk` 0.18.10, `@colyseus/schema` 5.0.49. All MIT.

## Spike result (done, in this repo: `server/`)

`cd server && npm install && npm test` boots a real Colyseus 0.18 server, joins two fake players and checks:

- both players see each other
- pressing D moves a player to the **right** (+X) for everyone (it uses the same `src/input/move.js` as the browser, so the old A/D bug cannot return on the server)
- a shot through a wall does **no** damage
- a clear shot lowers the target's health **on the server** (clients never say "I hit him")
- kills count and the victim respawns

Rapier physics runs inside Node on the server (same character controller as the browser).

**What the spike did NOT prove yet** (be honest about it):
- Client-side prediction and interpolation in the browser (Milestone 1).
- Lag compensation under real latency. The Node test clients do not stamp inputs, so the server falls back to live positions.
- Load: how many rooms/players one small server holds. We must load-test.
- Hit boxes are a rough sphere for now (proper head/body boxes later).

## Architecture

```
Browser (three.js)  --inputs 30/s-->  Colyseus room (Node)  --state patches-->  Browser(s)
 - predicts YOUR movement             - fixed 30 Hz tick, 60 Hz physics        - interpolates OTHERS
 - draws everything                   - Rapier world, Yuka bots, zone, loot
                                      - validates every shot (lag compensated)
```

Rules:
1. **Server decides, client suggests.** Clients send keys + look direction (and "fire"), never positions or hits.
2. **One movement function** (`moveVector` + controller step) shared by client and server. Never copy-paste it.
3. **Offline mode keeps working:** keep game rules in a plain `Simulation` module that does not import Colyseus. The room wraps it for online play; the browser can run the same module locally for "practice vs bots" with no server. (We will extract this in Milestone 1.)
4. **Bots live on the server** (Yuka brain + Rapier body) and look like normal players to clients. They fill empty lobby slots so a match always starts instantly.

## Hosting and latency

- Client files: Cloudflare Pages (static, free tier).
- Game server: a small Linux VPS. Southern Africa options exist in Johannesburg/Cape Town (one provider lists 2 GB / 1 vCPU from about $21/month; another guide cites Colyseus Cloud from $15/month; prices are third-party and change, so re-check). The server needs TLS (`wss://`), so put Caddy or Cloudflare in front.
- **Latency reality check:** a Johannesburg server gives roughly 5-30 ms inside South Africa and neighbours (a regional host lists latency up to ~40 ms for Zambia), but 140-250 ms to Europe/US (a hosting latency table lists London 140-180, US East 200-250 from SA). Portal traffic is mostly **not** African. Plan: launch with one region where most players will be (probably Europe) and add Johannesburg for Namibia/SA players later; bots hide latency for solo-style sessions.
- Before choosing a portal, check each one's rules about connecting to your own game server (allowed domains, `wss://`, SDK requirements). We have not verified this yet.

## Netcode defaults (starting point)

| Setting | Value | Why |
|---|---|---|
| Server tick (input rate) | 30 Hz | Cheap, fine for browser FPS |
| Physics sub-steps | 2 (= 60 Hz) | Same feel as the single-player demo |
| Interpolation delay | ~100 ms | Smooth remote players |
| Max lag-comp rewind | 300 ms | Stops abuse by high-ping players |
| Players per match | 16 (humans + bots) | Fits one small server comfortably, to be load-tested |

## Alternatives considered

| Option | Verdict |
|---|---|
| Socket.IO + hand-written netcode | More work, no built-in prediction/lag comp. Rejected |
| Peer-to-peer (netplayjs, rollback) | Great for 2-player games, wrong for 16-player shooters with cheating risk. Rejected |
| geckos.io (WebRTC/UDP), WebTransport | Lower latency but more moving parts; WebTransport browser support still maturing. Revisit if WebSocket lag hurts |
| Copying an open-source browser FPS | None found with a clean permissive license and production netcode (see `RESOURCES.md`). Rejected |
