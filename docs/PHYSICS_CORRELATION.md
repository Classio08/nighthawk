# Physics correlation and combat response foundation

**Status:** implementation foundation added on `feature/physics-correlation-foundation`. The branch has not been run through tests or browser play yet, at the owner's request. Do not describe the work as fully validated.

## Architecture rule

NIGHTHAWK already uses Rapier 3D, a fixed 60 Hz shared simulation, authoritative Colyseus matches and client prediction. This work extends those systems. It does **not** add a second homemade rigid-body engine, replace Rapier, create a parallel weapon simulator, or let the client decide hits / damage.

`src/sim/physics-correlation.js` is a deterministic rules module for physical material identity and response curves. `src/sim/world.js` remains the gameplay integration point. `src/fx/*` remains presentation-only.

## Implemented in this branch

- Map colliders and props now have material identifiers: sand, concrete, rock, metal and wood.
- Dynamic crate density/restitution/friction are adjusted toward a roughly 20 kg loose crate.
- Weapons have per-weapon recoil kick, horizontal variation and recovery settings. Recoil changes actual shot direction in the shared simulation and is also represented in the local camera / weapon view. The previous duplicate client-only aim kick was removed.
- Player shot randomness is derived from the match seed, fighter key and shot counter; material ricochet decisions use a separate per-shot stream so they do not perturb the shared AI / world RNG.
- Head / torso / leg hit zones are classified; limb zones use a damage multiplier. Leg hits cause a short movement limp. Body hits and blast damage add a small, decaying movement impulse to the kinematic capsule rather than teleporting it.
- Wood and glass can transmit one reduced-energy ray through the first surface. Concrete / rock / sand stop the ray; metal has a low-probability ricochet response with a short reflected ray and reduced energy. Ricochet and penetration remain authoritative and are evaluated against the same server-side colliders and lag-compensated fighter capsules.
- Jump input is buffered for 150 ms and coyote time is 120 ms. The timers are included in private self-state so prediction can reconcile them.
- Hard landings emit a physical landing event and retain server-side fall damage. The renderer adds dust and local camera impulse.
- Explosions apply a distance-squared, upward-biased impulse to dynamic props with mass scaling. Existing blast LOS protection, armour rules, vehicle damage and barrel chaining remain in place.
- NPCs hear explosions through the existing weather-adjusted hearing path.
- Material-specific hit effects use the existing pooled particles and decals: sparks, splinters, shatter/dust effects, blood spray and existing death ragdolls.
- Remote gunshot audio is delayed by source-listener distance / 343 m/s. Hit registration remains instant hitscan; the audio delay is cosmetic and does not alter server timing.

## Important existing systems retained

- Rapier character controller, ground snapping, collision and fixed-step gravity.
- Existing bouncing Rapier grenade bodies, grenade fuse and smoke fuse.
- Existing grenade / mortar / barrel blast damage and line-of-sight protection.
- Existing destructible crates and explosive barrels.
- Existing vehicle damage, wrecks and chain reactions.
- Existing instanced blood, sparks, dust, fire and smoke particles; blood particles fall under gravity and can leave stains.
- Existing client ragdoll presentation on death and 30-second decals.
- Existing hitmarker / damage feedback, camera trauma, weapon viewmodel springs, reload animation and suppression.

## Not yet implemented (do not claim otherwise)

1. Full ballistic projectile travel with flight-time damage and curved trajectories. The current weapon simulation is still hitscan; the new material and recoil rules apply to the shared hitscan resolution. A future projectile system needs bounded server-side projectile objects, lag-compensation decisions, collision/material response and a compact snapshot/event representation before going online.
2. Shrapnel / pellet debris from frag, mortar and barrel explosions. Explosions currently use radial damage and Rapier impulses plus existing chain reactions; no hidden corner-killing fragments have been added.
3. Fully articulated character rigid-body physics while alive. Fighters still use the existing kinematic capsule for fair multiplayer movement; the death ragdoll is a client-side visual/physical presentation.
4. Persistent bleeding, bandage inventory, armour plates with separate hit zones, blood pools that grow under bodies, wall blood decals with surface alignment, door hinges, destructible glass shards, water volume forces, sand projectile drag, and moving sandbag cover. The materials table defines room for these responses, but not all are connected to world geometry yet.
5. Footstep / explosion / gunshot wall occlusion and interior reverb. Distant shot timing is in place; propagation through geometry still needs an audio design pass.
6. Mobile haptic patterns, controller vibration, and input buffering for every interaction (reload / grenade / revive). Only jump buffering is implemented here.
7. Visual tuning by ear / feel and target-device performance measurements.

## Integration / handoff for Claude

- Preserve `src/sim/physics-correlation.js` as a graphics-free pure module.
- Preserve the new private state fields in `Fighter.exportSelf/importSelf` and `NetSim.DELEGATED`.
- If changing network state, extend private self-state only when necessary; avoid sending per-frame physics data for every remote fighter.
- Do not introduce unseeded randomness or wall-clock time in `src/sim`.
- The project owner explicitly asked not to run tests yet. Do not run test, smoke, build, E2E, or browser play checks until the owner asks.
- Keep this branch separate until reviewed against Claude's concurrent work. Never merge without owner permission.
