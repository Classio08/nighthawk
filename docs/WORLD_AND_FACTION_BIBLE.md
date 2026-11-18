# NIGHTHAWK — World and Faction Bible

Status: owner-approved direction, with story details below marked as proposals.
Owner decisions (2026-11-18): fictional African special operations unit; modern equipment; realistic visual style; first- and third-person play.

## 1. Core identity

NIGHTHAWK is a fictional, African-inspired tactical battle-royale shooter. Its operators belong to a fictional special operations detachment. It is not affiliated with the Namibian Defence Force, any real military, police service, government or private military company.

The world should feel recognisably Southern African without depicting a real base or claiming real-world military authenticity. Use original names, insignia, unit patches, map layouts and fictional institutions.

**Tone:** grounded, tense, resourceful and cinematic. The operators are skilled people, not superheroes. Their equipment is modern and practical. The setting should feel harsh, beautiful and lived-in.

## 2. Story premise — proposal, not canon

A remote proving ground known as the **Kavari Exclusion Zone** has become the centre of a high-value recovery and intelligence contest. Small teams are deployed into a sealed operational area to recover encrypted data, equipment caches and mission objectives while a hazardous perimeter closes in.

This premise gives the battle royale loop an in-world reason:
- Teams enter the zone by insertion.
- Scattered supply caches provide weapons, armour and field equipment.
- The closing danger perimeter forces encounters and movement.
- The last surviving operator or squad extracts with the objective.

The name Kavari Exclusion Zone, its history and the recovery-contract framing are proposals. The owner should approve or rename them before story, UI or map signage is treated as canon.

## 3. Visual environment identity

Build a fictional landscape inspired by Southern African dryland, semi-urban and industrial environments. Avoid generic European forests or a permanently sandy, featureless desert.

### First playable map: Kavari Basin (proposed)

A compact, readable battle-royale arena with a few distinct sectors:

1. **Dry river channel** — winding sandy depression, exposed rock, scrub and natural crossing points; provides low-ground movement and ambush routes.
2. **Relay station** — fenced communications compound, antenna masts, generator shed and small control building; strong vertical landmark.
3. **Freight yard** — shipping containers, loading platform, forklifts and stacked cargo; close-range cover and multiple sightlines.
4. **Quarry edge** — cut rock faces, gravel piles, service road and machinery; long sightlines with hard cover.
5. **Outpost** — fictional checkpoint buildings, watchtower, vehicle barriers and a small maintenance yard; central navigation landmark.
6. **Solar field** — panel rows, inverter cabinets and access tracks; repeating geometry with deliberate lanes and gaps.
7. **Abandoned airstrip** — runway strip, hangar shell and fuel storage; high-risk open ground with valuable loot.

Do not try to build every sector at once. For the first art pass, choose three sectors that fit the current arena footprint and prove the visual language.

### Materials and environmental storytelling

Prioritise real surface references and PBR sets for:
- Warm red/pale sand, compacted soil, gravel and weathered rock.
- Sun-faded concrete, chipped paint, asphalt and road markings.
- Galvanised/corrugated sheet metal, rust, painted steel and container paint.
- Dusty glass, rubber, nylon, canvas, webbing and worn plastics.
- Sparse dry grasses, thorny scrub and hardy low vegetation.

Use decals for fictional warning labels, unit markings, faded numbers and directional signage. Keep text sparse and legible at gameplay distance. No real company logos or copied military insignia.

## 4. Lighting, weather and atmosphere

The current project already has a weather/atmosphere system. Treat it as a foundation and evolve it carefully:
- **Clear late afternoon:** warm sun, long shadows, dusty horizon; default art benchmark.
- **Overcast:** flatter contrast and cooler fill light; useful for silhouette and material testing.
- **Dust haze:** reduced distant visibility, subtle wind-blown particles; preserve fair combat visibility.
- **Light rain / wet ground:** optional later variant, with restrained roughness changes and puddles.
- **Night operation:** later high-impact mode, requiring readable silhouettes, restrained artificial lights and clear UI.

Do not stack expensive real-time lights, dense particles and high-resolution shadows everywhere. Establish a stable clear-weather baseline first, then add one weather variant at a time.

## 5. Faction and operator presentation

- The operator roster is the eight original characters: Roms, Shadow, Douglas, Cliffhanger, Navy Blue, Rampol, Maetja and Cleiseis.
- Give the fictional unit one original insignia and a consistent base uniform system.
- Differentiate operators through face, body silhouette, kit layout, small colour accents and animation/personality — not eight unrelated camouflage patterns.
- Avoid national flags, real unit badges or real military rank insignia unless the owner explicitly chooses a licensed/appropriate fictional treatment.
- The specific detachment name, insignia, rival faction names and story are not yet approved.

## 6. Gameplay readability rules

- Keep the current small-map, short-match battle-royale structure.
- Every sector needs a landmark visible from at least one neighbouring sector.
- Balance open lanes with hard cover, alternate routes and safe rotations.
- Use colour and silhouette to distinguish loot tiers, interactables, hazards and operators.
- Never let decorative clutter block player movement, weapon visibility or server collision.
- Keep visual cover aligned with Rapier collision geometry; no fake cover that bullets or players pass through.

## 7. Production order

1. Approve the fictional setting and first map sectors.
2. Capture or create reference photos for sand, gravel, rock, concrete, metal, fabric and vegetation.
3. Produce a small PBR material library and compare it under the current Three.js lighting.
4. Build one hero landmark and one modular cover kit.
5. Replace the current box-built arena sector-by-sector while keeping collision and simulation separate.
6. Profile performance before adding more detail.
7. Add optional weather/time-of-day variants after the clear baseline is stable.

## 8. Canon status

Owner-approved: fictional African special operations identity; modern equipment; realistic visuals; both camera perspectives.

Proposals awaiting approval: Kavari Exclusion Zone, Kavari Basin, story premise, map sector names, unit/detachment name, insignia, rival factions and any named events or history.
