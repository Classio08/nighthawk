# Ballistic projectile foundation

**Status:** implementation added on `feature/ballistic-projectile-foundation`. It has not been tested, built or playtested. The owner asked to finish the feature work before running checks.

## What changed

- Each weapon profile now contains a tuned projectile muzzle speed and small drag coefficient. The values are game-tuning estimates for NIGHTHAWK's fictional weapons, not claimed real-world specifications.
- The shared 60 Hz Simulation launches bullets as bounded, deterministic projectile records. The integrator applies gravity and velocity drag with a fixed timestep.
- Collision uses a swept segment against existing Rapier world colliders and the same fighter capsule helper used by the hitscan system. The server decides fighter damage, props, vehicles and hit outcomes.
- Fighter samples use the shooter's rewind tick plus projectile flight ticks. This keeps lag compensation tied to the time the shooter saw, while allowing damage to arrive after flight time.
- Thin wood and glass can transmit one reduced-energy projectile using the existing material response table. Metal can cause one energy-reduced ricochet. Solid concrete, rock and sand stop the shot.
- A projectile emits compact tracer-segment events rather than a high-frequency position snapshot. The existing event buffer forwards those segments with normal match snapshots; the renderer adds each segment to the existing pooled tracer system.
- Prediction tags projectiles with the input sequence. During server reconciliation, already-acknowledged in-flight rounds are kept and only unacknowledged rounds are discarded before input replay.
- A fixed 512-projectile cap bounds work. If the cap is reached, the firing path falls back to the previous ray-based path rather than allowing unbounded projectile growth.

## Preserved behavior and limits

- Rapier remains the only world physics engine. These bullets are fixed-step swept projectiles, not individual dynamic Rapier rigid bodies.
- Existing recoil, weapon spread, damage falloff, hit zones, armor, prop damage, vehicle damage, material effects, and lag compensation remain in the shared simulation.
- Deadeye's existing multi-target piercing path deliberately stays hitscan for now, and the bounded-overflow fallback stays hitscan. These cases are called out rather than silently changing the ability.
- Shotgun pellets are separate short-lived ballistic traces. The same cap bounds their total work.
- The client sees projectile paths as tracer segments from the event stream. It does not own bullet collision or health state.
- Physical shrapnel debris, articulated living characters, wall/door destruction, water-volume forces, full drag/wind by weather and audio filtering remain separate follow-up work.
- The test file is a specification only. No tests, build, browser play, CI, VPS or deployment checks have been run.

## Tuning values

Muzzle velocities are authored in `src/sim/weapons.js` in metres per second. Gravity is 9.81 m/s². The per-weapon drag coefficient is intentionally small; tune it only after repeatable range/drop measurements from a real play session. Do not use client-only random wind or physics.
