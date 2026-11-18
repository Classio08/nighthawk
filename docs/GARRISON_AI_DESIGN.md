# Garrison AI: patrol, alert and search

## Design intent

The garrison should feel like a small force protecting a position, not a collection of stationary turrets. Guards patrol a local route, react to a confirmed sighting, share that contact with nearby guards, investigate the last known position, sweep nearby search points, and resume their route when the trail goes cold.

This is deliberately bounded behaviour. Guards do not receive the player's exact live position after line of sight is broken.

## Behaviour loop

1. **Routine:** walk a deterministic four-point patrol route near the outpost.
2. **Contact:** a guard that confirms a visible enemy sends a delayed radio contact to living garrison guards within 70 metres.
3. **Pursuit:** guards use the existing hunt/engage logic to approach or engage the last confirmed contact.
4. **Search:** after the immediate hunt window, guards visit nearby deterministic sweep points around the last known position. Sweep points embedded in collision geometry or outside the playable map are skipped.
5. **Reset:** after the contact memory expires, guards return to their patrol route. The existing post leash still takes priority.

## Determinism and multiplayer

- Patrol route generation uses a separate seed-derived RNG stream. Adding patrol setup must not consume the simulation's main RNG stream or change unrelated loot, combat, or zone rolls.
- Search waypoint selection is a pure deterministic function.
- All decisions use simulation state and existing server-authoritative bot updates; no renderer or client-only state is introduced.
- Guard radio is delayed and transmits a last-known coordinate, not continuous target tracking.

## Research notes

These patterns are consistent with published game-AI work:

- The University of Greenwich 2024 paper on enhanced squad behaviour discusses spatial reasoning, role assignment, and selecting positions based on cover, exposure, and team context: https://gala.gre.ac.uk/id/eprint/47528/
- The ISART Digital paper on cooperative shooter NPC decision-making describes utility-scored actions, squad roles, and adapting behaviour when members are lost: https://www.isart.fr/wp-content/uploads/2024/10/Decision-making-System-for-Cooperative-NPC-in-a-Shooter-Game_CNRS_2023.pdf
- Epic's AI Perception documentation describes sight, hearing, damage stimuli, and updating working state when perception changes: https://dev.epicgames.com/documentation/en-us/unreal-engine/ai-perception-in-unreal-engine
- The GDC talk *Believable Tactics for Squad AI* covers coordinated flanking, suppression, following, and tactical path/cover selection: https://www.gdcvault.com/play/1015665/Believable-Tactics-for-Squad

These are design references, not dependencies. NIGHTHAWK remains a lightweight JavaScript/Three.js/Rapier simulation and does not import Unreal systems.

## Validation still required

- Run `npm test` and the full `npm run check`.
- Playtest multiple map seeds and guard counts (0, 1, 4, and 8).
- Confirm patrol waypoints are reachable and routes do not bunch every guard at one point.
- Confirm radio messages do not reveal a target's current position after line of sight is lost.
- Check offline and server-authoritative matches for deterministic state and acceptable CPU cost.
