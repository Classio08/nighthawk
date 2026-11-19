# Multiplayer

Decision: **multiplayer comes early, not at the end.** Retro-fitting networking into a finished single-player game is how these projects die. The game rules (`src/sim/`) contain no graphics, so the **same file** runs in the browser (solo mode) and on the server (online mode).

## What is built (Milestone 1, tested)

```
Browser (three.js)  --keys, 60/s-->  Node server (Colyseus room)  --snapshots, 20/s-->  Browsers
 - predicts YOUR movement + weapon    - runs the real Simulation at a fixed 60 Hz         - interpolate OTHERS 100 ms behind
 - draws everything                   - Rapier physics, Yuka bots, zone
                                      - judges every shot (lag compensated)
```

| Piece | File | What it does |
|---|---|---|
| Rules | `src/sim/world.js` | `Simulation.step(dt, cmds)` takes one input per human fighter. Bots are just fighters without a human |
| Hits | `src/sim/geom.js`, `world.js _fire` | Bullets vs players = exact ray-capsule maths on **rewound** positions (64-tick history). Walls/crates = Rapier ray |
| Input | `src/sim/cmd.js` | `sanitizeCmd`: the server never trusts the network (clamps numbers, forces booleans) |
| Wire format | `src/net/protocol.js` | Inputs as small arrays; snapshots as JSON-able arrays (Colyseus packs them) |
| Server | `server/src/MatchRoom.js` | Lobby countdown, bots fill empty slots, input queue + jitter buffer, 20 Hz snapshots, a leaver is replaced by a bot |
| Client | `src/net/netsim.js` | `NetSim` looks like the offline `Simulation` to the renderer. Prediction + reconciliation + interpolation + clock estimate |

### How it feels instant and stays fair
1. **Prediction**: your keys move you at once on a tiny local copy of the rules (`predictor`: same seed, same walls, only you).
2. **Reconciliation**: each snapshot carries your own state *as of the last input the server processed* (`ack`). The browser rewinds to it and replays the inputs the server has not seen yet. Any difference is blended away over ~10 frames; a gap above 2.5 m snaps (teleport/respawn).
3. **Same dice**: bullet spread is a pure function of (seed, fighter, shot number), so your screen and the server roll the same spread and "what I aimed at" is what is judged.
4. **Interpolation**: everyone else is drawn 100 ms in the past, blended between two snapshots, so 20 snapshots/s looks smooth.
5. **Lag compensation**: every fire input carries `vt`, the server tick of the world you were looking at. The server judges the shot against fighters' positions *at that tick* (history of 64 ticks, never more than 30 ticks = 0.5 s back, never the future).
6. **Crates are fixed in online mode** (`propsFixed`) so every browser has the identical world. Free-flying physics props come back later as server-owned, replicated objects.

### Test results (run `npm run server:test`, `npm test`, `node scripts/e2e-online.mjs`)
- Real server + two real clients, **120 ms artificial round-trip lag**: prediction ends within 0.00-0.15 m of the server, max error while running 0.06-0.09 m, and **97 % of shots at a running target hit** (7 % with lag compensation switched off: `NO_LAGCOMP=1 npm run server:test`).
- Reconciliation unit test: a client shoved 4 m off, rewound and replayed 60 inputs, ends within 2 cm of the truth.
- Two headless Chrome windows against the server: join, see each other, move, shoot, die (ELIMINATED #6), win (WINNER #1) with no console errors.

## Honest limits (not done yet)
- **Not load-tested with real players or real internet.** CPU per 16-fighter match: about 0.5 ms per tick on average (p99 about 6 ms), measured in `scripts/bench-sim.mjs`. Network cost is not measured.
- Snapshots are JSON-style arrays and always list all 16 fighters; no interest management or delta compression yet (fine for 16 players).
- Grenades are replicated as positions only (they pop up 100-200 ms late for other players' throws). Vehicles are server-driven: the driver's own view follows the server (no prediction), so a driver on a very bad connection will feel steering delay.
- No reconnection: closing the tab hands your fighter to a bot.
- No anti-cheat beyond input sanitising and server authority (aimbots are possible).
- Death = spectate is minimal (death camera, then the result screen).

## Research notes (earlier, still true)
- Colyseus 0.18 (MIT) has built-in prediction/rewind helpers, but they target schema state; we use **our own message protocol** instead, because our rules engine is a physics simulation (Rapier + Yuka), not a schema. Source: https://docs.colyseus.io/netcode
- Engine-internal physics state is not rolled back on reconcile, so we only predict the **kinematic player controller** (stateless, cheap to replay). Bots, grenades and (later) vehicles stay server-only.
- ColyStrike (Colyseus' FPS demo) is sponsor-only code: not used.

## Hosting and latency
See `DEPLOY.md` for the step-by-step. Latency reality: a Johannesburg server gives roughly 5-30 ms inside southern Africa but 140-250 ms to Europe/US (third-party figures, re-check). Portal traffic is mostly not African, so launch near where most players are and add a Johannesburg server for Namibia/SA later.

## Netcode numbers
| Setting | Value |
|---|---|
| Server tick | 60 Hz (fixed step with accumulator, max 5 catch-up steps) |
| Snapshot rate | 20 Hz |
| Interpolation delay | 6 ticks (100 ms) |
| Input buffer on the server | waits for 2 inputs, skips ahead if more than 6 are queued, repeats the last input for at most 3 ticks if one is late |
| Max lag-comp rewind | 30 ticks (500 ms) |
| Players per match | 16 (humans + bots) |

## The drop-in over the network (Stage 14)
- The `welcome` message carries `drop: true`; the browser's predictor then builds the same transport plane (`makePlane(seed)`), so the plane is never sent. `NetSim.planeT()` (the estimated server clock) places the plane model.
- Your own `air` state (0 foot, 1 plane, 2 free fall, 3 parachute), `airT` and the air velocity are part of the private self-state; everyone else's air state rides bits 9-10 of the fighter flags (`FF.airShift`). Jumping is the normal `jump` command flag (a fresh press), so no new message exists.
- The server validates everything: it ejects a passenger who never jumps, ignores damage on anyone airborne and starts the zone clock only after the last possible landing (`zoneStart`). Prediction ignores other fighters' bodies in the air, so the client and server stay within about 2 m during a dive (checked at 80 ms lag in `server/test/match.mjs`, section 6).
- `DROP=0` on the server (or `createServer({ drop: false })`) skips the plane.

## Loot over the network (Stage 8)
- Same seed => same 120 starting items in every browser, so they are never sent. Snapshots carry `lt = { g: [ids of starting items taken], d: [[id, type, sub, x, z, qty, qty2], ...] }` (dropped items in full) **only when something changed**, plus a refresh every 120 ticks.
- The server alone decides who takes what (a predicting browser never picks anything up). Your own guns, armor, medkits and heal timer travel in your private self-state (`hv`, `ar`, `al`, `md`, `hl`), so reconciliation rebuilds them exactly.
- `H` is the `heal` command flag (bit 256). The `pickup` and `heal` events are server events; they are not in `OWN_EVENTS`, so you see each once.
- `LOOT=0` on the server (or `createServer({ loot: false })`) gives the classic all-guns loadout; the `welcome` message carries `loot` so the browser's predictor matches.

## Abilities, crouch and falls over the network (Stage 9)
- `Q` is the `ability` command flag (bit 512), `C` is the `crouch` flag (bit 1024, held). The server runs `useAbility()` and decides everything about other fighters (EMP, blasts, strikes, healing); a predicting browser only keeps its OWN timers (cooldown, effect, dash, stun) so Q feels instant and a dash does not rubber-band.
- Private self-state gets `ab: [abCd, abT, dashT, dashVx, dashVz, stunT]` and `cr`. Everyone else sees snapshot flags `FF.ab`, `FF.cloak`, `FF.stun`, `FF.dash`, `FF.crouch` on each fighter record (so a Cloak or a stun is visible without sending timers).
- `ability` and `stun` are server events (not in `OWN_EVENTS`). Fall damage is server-only. Lag compensation stores a crouch bit per tick (`hist` value 2 = alive and crouching).

## Hardening and reconnect (Stage 12)
- **Limits** (`server/src/limits.js`): a token bucket per connection and message type (`c` 400/s burst 120, `ping` 4/s, unknown 5/s). Over the limit = dropped; 120 dropped in a row = `client.leave(4003)`. WebSocket payloads over 4 KB are refused by the transport. Unknown message types hit the `'*'` handler and only count.
- **Room cap**: `MAX_ROOMS` (default 40); `onCreate` throws `server busy` beyond it.
- **Reconnect** (Colyseus 0.18 `onDrop` / `allowReconnection` / `onReconnect`): an abnormal close during a running match keeps the human fighter alive and standing (`q.offline = true`, no snapshots sent, queued inputs cleared) for `RECONNECT_SECS` (12). The SDK client retries by itself (`NetSim` sets minUptime 1 s, up to 10 tries, max 2 s apart, no queued messages), shows RECONNECTING and keeps predicting locally; on `onReconnect` the server clears the queue and the very next snapshot carries the full state. When the window ends the normal `onLeave` path runs (`botify`). A consented leave (menu, `NetSim.leave()`) or a dead / finished player is replaced at once. A page refresh is a new page and cannot rejoin (a later task: store the reconnection token in `sessionStorage`).
- **Observability**: `MatchRoom.metrics()`; `GET /health`, `GET /metrics[?format=prom]` (see `docs/DEPLOY.md` section C2). Tick times are measured around `sim.step` of every match.
- Tests: `tests/limits.test.js` (buckets, kick rule, stats, Prometheus text) and section 6 of `server/test/match.mjs` (endpoints and token, junk, flood kick, oversized payload, room cap, a dropped connection that returns and walks on, a drop that does not return and gets a bot).

## Vehicles over the network (Stage 7)
- The server drives the vehicles. Snapshots carry them as `vh` (id, kind, x, z, yaw, speed, hp, driver, passenger, dead, steering).
- Every client has the same vehicles (same seed) inside its predictor. Their poses come from the snapshots; their colliders move with them, so your predicted walking bumps into the same things the server sees.
- While you are seated your client does **not** predict: it skips the predictor step, your body follows the smoothed vehicle, and your own shot/reload events come from the server (they are normally skipped because they were predicted).
- `E` is a one-shot command flag (`use`, bit 128 in the packed command). The server decides who gets which seat.
- `VEHICLES=0` on the server (or `createServer({ vehicles: false })`) turns them off; the `welcome` message tells clients so their predictor matches.

## Audit: Colyseus 0.18 `Rewind` / `Predict` vs our own netcode (19 Nov 2026)
Asked for by `docs/CHATGPT_CLAUDE_COORDINATION.md` (P0.4). **Read from the installed packages' type definitions and our code; no A/B test was run, so this is a design decision, not a measurement.**
- What exists: `@colyseus/core` has `Rewind` (per-entity history ring, `at(time)` / `lastSeenBy(shooter)` views, `maxRewindMs`, snapshot or reckon timelines) and an `input/InputBuffer`; `@colyseus/sdk` has `Predict` (lerp / damped smoothing), `Reconciler` / `SimReconciler` (replay inputs on top of the acknowledged server state) and predicted event channels.
- Why they do not drop in: `Rewind` and `Predict.attachAll` track **numeric fields of `@colyseus/schema` collections** (`MapSchema` / `ArraySchema`). NIGHTHAWK has no Schema state: the server sends packed message snapshots (`src/net/protocol.js`) and the shared graphics-free `Simulation` is the single rules engine. Using them would mean mirroring every fighter's position into Schema objects only to feed the history ring, or rewriting the snapshot path around Schema.
- What we already have for the same jobs: lag compensation = `Simulation.posAt(t, tick)` (server rewinds the target to the tick the shooter saw, also used by melee) with tests; client prediction + reconciliation = `src/net/netsim.js` replaying inputs through the very same `Simulation` (`opts.predictor`), so there is no second implementation of movement to drift; remote smoothing = snapshot interpolation in `netsim.js`.
- **Decision**: keep the custom path; do not migrate. Revisit only if (a) a measured defect appears in a moving-target / high-latency test that the custom code cannot fix cheaply, or (b) fighter state moves to Schema for another reason. If revisited, start with a side-by-side lag-compensation test (same recorded inputs, our `posAt` vs `Rewind`) and never rip out `netsim.js` wholesale.
- What would still be worth doing regardless: a moving-target hit test at 100 / 200 / 300 ms of real network latency on the staging server, and a virtual-clock rewrite of `server/test/match.mjs` (currently real-time and flaky about 2 runs in 5, hence the retry wrapper).
