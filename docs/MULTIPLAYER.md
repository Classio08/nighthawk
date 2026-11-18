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

## Vehicles over the network (Stage 7)
- The server drives the vehicles. Snapshots carry them as `vh` (id, kind, x, z, yaw, speed, hp, driver, passenger, dead, steering).
- Every client has the same vehicles (same seed) inside its predictor. Their poses come from the snapshots; their colliders move with them, so your predicted walking bumps into the same things the server sees.
- While you are seated your client does **not** predict: it skips the predictor step, your body follows the smoothed vehicle, and your own shot/reload events come from the server (they are normally skipped because they were predicted).
- `E` is a one-shot command flag (`use`, bit 128 in the packed command). The server decides who gets which seat.
- `VEHICLES=0` on the server (or `createServer({ vehicles: false })`) turns them off; the `welcome` message tells clients so their predictor matches.
