# Operation DUST LANTERN — First Playable Mission Blueprint

**Status:** proposed first mission; names and story are not canon until owner approval.  
**Mode:** solo/co-op PvE first; later adapted into PvPvE extraction.  
**Target session:** 5–8 minutes for a clean run, longer if players investigate optional intel.  
**Map:** one compact Kavari Basin sector assembled from existing greybox geometry.

## Premise

A civilian communications technician and a field recorder disappeared during a storm near a remote relay site. Conflicting radio reports suggest a local security faction has detained the technician, while a rival contractor team is also searching for the recorder. NIGHTHAWK is hired to locate the missing person, verify what happened and bring them out.

This is a rescue/recovery mission, not a mission to harm a captive. The player can finish without killing anyone. All groups and agencies are fictional.

## Mission flow

```text
INSERT
  |
  v
RECON: locate 2 evidence clues
  |
  v
IDENTIFY: confirm which compound holds the technician
  |
  v
RECOVER: reach the captive and interact to secure them
  |
  v
EXTRACT: escort the technician to one of 2 extraction points
  |
  v
DEBRIEF: grade outcome, intel and collateral
```

### Objective 0 — Insertion
- Spawn at one of two authored insertion points selected by the mission seed.
- Briefing shows primary objective, optional intel and extraction conditions.
- A short tutorial hint introduces interact, objective marker and radio status.
- Player begins with a modest mission loadout; no account or economy dependency.

### Objective 1 — Recon
- Search a small set of clue locations: a damaged field radio, vehicle tracks, a dropped access card or a witness NPC.
- Require any two of three clues to unlock the next step.
- Clues reveal *confidence bands* rather than exact coordinates: "north compound likely", "vehicle seen heading east".
- If the player fires near the site, the defenders can become suspicious before the location is confirmed.

### Objective 2 — Identify
- The mission director selects one of two compounds as the actual holding location.
- The other compound contains a decoy clue, a small cache or a patrol; it is not a pointless empty room.
- Selection is seeded and recorded for replayable tests.
- The player can identify the correct site through clues or by observing NPC behaviour.

### Objective 3 — Recover
- The captive is a protected mission NPC with a clear escort state and health budget.
- Interact to reassure and secure the technician; do not require a combat takedown.
- Nearby guards may surrender, investigate, call for help, flee or defend based on morale, evidence and alert state.
- The captive follows at a safe distance and uses cover-aware movement; if separated, they wait or move to a nearby safe anchor rather than running blindly into danger.
- If the player leaves the captive behind, the mission pauses and gives a clear recovery prompt; the captive cannot silently despawn.

### Objective 4 — Extract
- Two possible extraction zones exist: a short exposed route and a longer covered route.
- The mission director chooses which is safe based on the alert state; the other may become available if the player disables a fictional communications relay or avoids raising an alarm.
- Extraction requires the player and captive to reach the zone and hold for a short, readable timer.
- A final patrol can arrive only if the alarm state warrants it; do not spawn enemies without a roster/replication design.
- Completion records whether the captive survived, how much intel was recovered and whether unnecessary collateral occurred.

## NPC behaviour for this mission

### Guard roles
- **Routine patrol:** follows a waypoint route, checks in periodically, responds to visible anomalies.
- **Gate/security guard:** stays near an entry point, watches a defined sector, calls another guard if suspicious.
- **Search pair:** investigates a reported location with uncertainty; may search the wrong building if the report is weak.
- **Supervisor:** coordinates retreat/reinforcement decisions and can order a search to stop if the situation is unclear.
- **Witness/worker:** avoids combat, may hide, flee or provide partial information depending on trust and what they observed.

### Alert ladder
| Level | Trigger | Response |
|---|---|---|
| 0 — Routine | No evidence of intrusion | Normal patrol and ambient activity |
| 1 — Uneasy | Strange sound, missing object, uncertain witness report | Local investigation, no omniscient tracking |
| 2 — Searching | Confirmed disturbance or credible sighting | Nearby guards search last-known area and share confidence-rated report |
| 3 — Alert | Player positively identified or alarm triggered | Guards defend key routes, supervisor coordinates response |
| 4 — Crisis | Captive recovered or prolonged firefight | Guards may withdraw, surrender, pursue or attempt to block extraction depending on traits and mission rules |

Alert should decay when evidence goes cold. NPCs should not retain a perfect live player marker after losing line of sight. Radio reports have a timestamp, source, location estimate and confidence.

## Variation that creates replay value

Use a mission seed to vary:
- Which compound contains the captive.
- Which two clues are required and which clue is optional.
- Patrol route and check-in timing within safe authored bounds.
- Which extraction zone starts as available.
- One secondary event: power outage, storm gust, false alarm, witness hiding or rival contractor arrival.

Do not randomise objective completion rules, captive safety rules or competitive hit outcomes. Variations must be testable and explainable.

## Rewards and consequences

Use mission XP and a non-premium soft-currency reward only after the server-side ledger exists. For the prototype, show a debrief score without granting persistent currency.

Debrief dimensions:
- Mission completion.
- Captive safely extracted.
- Evidence gathered.
- Time / optional objective.
- Collateral and alarm escalation.
- Team contribution in co-op.

Do not reward player harm to civilians or the captive. Avoid scoring that encourages farming protected NPCs.

## Technical implementation map

| Concern | Proposed owner |
|---|---|
| Mission definition and seeded variation | New pure module under `src/sim/missions/` |
| Objective graph and state transitions | Server-authoritative simulation module |
| Captive / witness / guard role data | Simulation entities, not renderer-only objects |
| NPC perception and alert propagation | Existing bot utility AI + squad radio; add confidence/timestamp fields |
| Mission event replication | Extend snapshot protocol with a versioned, bounded mission state |
| Mission briefing/debrief | HUD/menu layer; render from replicated mission state |
| Visual clues and extraction zones | Three.js scene layer; collision/interaction anchors from map data |
| Tests | Deterministic unit tests, server protocol tests, browser E2E for full mission |

## Acceptance tests

1. Same seed produces the same captive location, clue layout and extraction availability.
2. Two valid clues unlock identification; one clue does not.
3. Wrong compound investigation remains recoverable and does not soft-lock the mission.
4. NPCs only know player locations from their own perception or received reports.
5. Losing line of sight causes target confidence to decay; no permanent wall tracking.
6. Captive can be secured, escorted, separated, recovered and extracted.
7. Mission cannot complete while captive is outside extraction bounds.
8. Alert escalation is server-authoritative and cannot be forged by the client.
9. Every objective state survives snapshot/reconnect without duplication.
10. Mission can be completed with zero kills.
11. Failed extraction produces a clear failure/debrief state, not a frozen match.
12. The mission runs with optional language-model dialogue disabled.

## Explicit non-goals for the first slice

- Open-world persistent NPC simulation.
- Fully autonomous LLM-controlled combatants.
- Realistic breaching or real-world tactical instruction.
- Crypto wallet, token rewards, betting or cash-out.
- Large-scale destructible buildings or full vehicle convoy physics.
- A large content drop before the one mission is fun and stable.
