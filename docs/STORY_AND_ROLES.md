# Story, roles, villains and set pieces

Status: **proposals only** unless a line says "built". The owner has not approved any of this as canon. It extends `docs/WORLD_AND_FACTION_BIBLE.md` (the Kavari Exclusion Zone premise) and the eight operators in `data/operators.json`. All names are fictional and original; nothing here depicts a real unit, place or person. Scenes are written as **genre beats** (an ambush, a hostage rescue, a heist), not copies of any film's scenes, characters or dialogue.

## 1. What exists today
| Thing | State |
|---|---|
| Eight operators with a role, a backstory and one active ability each | built (`data/operators.json`, `src/sim/abilities.js`) |
| Battle royale in the Kavari Basin (plane drop, zone, loot, contracts, vehicles, weather) | built |
| Operation DUST LANTERN: recon, rescue a technician, extract | built, offline |
| Operation SIGNAL BLACKOUT: jam three relays before a trace locks, extract | built, offline |
| Movement: slide, mantle, crouch, sprint, melee | built |
| Everything below | **planned** |

## 2. Campaign spine (planned)
A short chain of operations that share the same map and cast, each one playable on its own:

1. **DUST LANTERN** (built): a signals technician is held at one of two sites. The evidence you recover says someone *inside* the recovery contract sold the unit's schedule.
2. **SIGNAL BLACKOUT** (built): the people who bought it are tracing your unit through its own relays. You go dark.
3. **BLACK GLASS** (planned): a night infiltration of the buyer's data vault. Stealth first; every alarm raises the garrison the way the alert director already does. Rewards a quiet approach, allows a loud one.
4. **LAST LIGHT** (planned): the unit defends the Extraction Pad while a convoy arrives. A hold-the-line mission using the vehicles and mortar that already exist.
5. **THE BROKER** (planned): a final contract to take the buyer alive. Choice at the end: hand them over, or the evidence.

Each mission ends with a one-screen debrief card (it already exists) carrying a line of story. Writing, not tech, is the cost.

## 3. Factions and villains (planned)
- **Kavari Recovery Group (KRG)**: the contractor behind the "recovery contract" framing. Professional, well funded, deniable. The garrison guards already stand in for them.
- **The Broker**: a faceless buyer who sells the unit's movements. Never fights; appears as voice, forged documents and an offer.
- **Salt Road Crew**: smugglers who run buggies and bikes across the dry river. Hostile to KRG, not friendly to the unit. Useful as a third force in battle royale contracts.
- **Wildlife as terrain, not enemy**: oryx, jackals and vultures are ambient. Vultures circling mark a body or a drop. A startled herd gives away a position (planned as a sound-and-movement cue for stealth).

## 4. Roles (planned)
The eight operators already have a role. "More roles" can mean two different things:

- **New operators.** Candidates with a gap to fill: a **Scout / Drone Pilot** (marks enemies for the team, fragile, no heavy gun), a **Signals / Spy** (plants a fake relay that pulls the garrison away; pairs with SIGNAL BLACKOUT), a **Mechanic / Driver** (repairs buggies, boosts a vehicle). Each needs an ability, a backstory, a model and an art pass; none exists.
- **Squad roles** in co-op operations (planned, needs online missions): **Breacher** (opens routes), **Tech** (does relay tasks faster), **Overwatch** (marksman cover), **Medic**. They are labels over the existing operators and a small bonus each, not new classes.

Passive traits per operator (small, never pay-to-win) are also planned: for example Roms carries one more magazine, Douglas heals a little faster. These would touch authoritative state and need tests and netcode work.

## 5. Spy and stealth play (planned)
A stealth layer is mostly built already: the garrison has a vision cone, hearing, a last-seen memory and the alert ladder (routine, uneasy, searching, alert, crisis). Missing pieces: a **disguise** (a stolen uniform that lowers suspicion at range), **silent takedown** from behind (melee already kills from behind), **distractions** (throw an object to make noise) and **hiding** (a locker or tall grass). Each is a small, separate, testable feature.

## 6. Set pieces (planned)
Written as reusable beats a mission can use:
- **The convoy ambush**: mine the road, take the lead vehicle, hold the crossing.
- **The vault**: a timed door; the longer you take, the more guards arrive.
- **Night extraction under searchlights**: light sweeps force you to move between cover.
- **The sandstorm**: weather already exists; a storm that cuts sight and sound for both sides for a minute.
- **Rooftop relay**: a task on a roof that needs a mantle to reach (mantle is built).
- **The empty village**: a hold-position scene where nothing happens until it does.

## 7. VFX list (planned; all client-side)
Muzzle smoke and heat shimmer, dust kicked up by a slide, a shock ring on a hard landing, spark showers on metal hits, a pulse ring when a relay is jammed, searchlight cones, a trace-lock vignette that grows as the countdown shrinks. Each must stay inside the draw-call budget (`scripts/e2e-perf.mjs`, 280 per view) and be switchable in settings.

## 8. Rules for writing more of this
1. Keep it fictional, original and respectful of real people, units and places.
2. Do not copy scenes, characters, dialogue or music from films or games.
3. Nothing is "canon" until the owner approves it in `docs/PROJECT_DIRECTION_AND_CHAT_NOTES.md`.
4. A new mission is a code task (`docs/MISSION_SIGNAL_BLACKOUT.md`, "To add the next operation"), not just a document.
