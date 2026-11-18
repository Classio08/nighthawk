# KAVARI BASIN — First NIGHTHAWK Map Vertical Slice

Status: approved direction, detailed proposal. "Kavari Basin" is a working fictional name; it is not a real Namibian place and is not final canon until the owner approves it.

## Creative direction
A fictional Southern African dry-basin test zone with a decommissioned logistics facility, a dry river channel, rocky ridges, a communications relay and a controlled extraction pad. The tone is grounded military thriller, not science fiction spectacle. Architecture and signage are fictional; do not reproduce real military insignia or private-company marks.

## Play-space layout
Keep the existing 230 x 230 m playable bounds for the first pass. The first vertical slice should use the current simulation map footprint and avoid changing spawn/zone logic until gameplay tests prove it is necessary.

### Five landmarks
1. **Basin Yard (central landmark):** logistics yard with two shipping containers, a low loading shed, stacked crates and a central traversable lane. Strong close-range cover; no long straight firing lane through the entire yard.
2. **Dry River (south-west route):** shallow winding wash, gravel banks and occasional scrub. Fast but exposed in the bends; one culvert/underpass creates a risky covered crossing.
3. **Relay Ridge (north-east high ground):** communications mast, small generator hut and rock outcrops. Strong sightline over one approach, but multiple climb routes and hard cover prevent a dominant sniper nest.
4. **Forward Outpost (north-west):** sandbagged checkpoint, two modular shelters, water tank, antenna and vehicle barrier. Close-quarter combat with multiple exits.
5. **Extraction Pad (south-east):** fenced helicopter/ground extraction area, floodlights, service container and a visible approach road. Use as a contract/event location first; do not add a vehicle until vehicle physics exists.

## Route and balance requirements
- Three meaningful paths between each pair of major POIs where practical: exposed fast route, covered slower route, vertical/flank route.
- Avoid a single uninterrupted sightline longer than 50 m in the central combat lanes.
- Every high point has at least two counter-approaches and nearby hard cover.
- No spawn should have direct line of sight into another spawn.
- Avoid placing high-value loot directly on the safest head-glitch or strongest roof.
- Test zone circles for every seed; no POI should be excluded from every late circle.
- Preserve deterministic seeded map generation and identical server/client geometry.
- All collision-critical structures must be represented in simulation data; visual decoration alone must never become invisible gameplay cover.

## Art and material palette
- Ground: warm pale sand, compacted ochre dirt, coarse river gravel, scattered dark stone.
- Built surfaces: sun-bleached concrete, dusty painted steel, weathered corrugated metal, faded canvas, timber pallets.
- Accent: restrained faded safety orange, dark olive and muted blue for navigation/functional markings.
- Vegetation: sparse dry scrub and grass tufts used as silhouette/cover cues; never use dense cosmetic vegetation that blocks visibility without collision.
- Lighting: high clear midday baseline first; add golden-hour and dust presets only after the baseline is readable.

## Production order
1. Greybox POIs with simple shapes and collision.
2. Verify routes, cover, spawns, loot and zone behaviour.
3. Add material pass and lighting.
4. Add modular props, decals and ambient dressing.
5. Add audio zones and objective interactions.
6. Profile low-end integrated GPU and mobile browser before adding more detail.

## Acceptance checklist
- All five landmarks are recognisable from ground level and the map overview.
- Every POI has multiple entry/exit routes.
- No invisible collision or cosmetic-only cover exploit.
- Server/client seeded map hashes match.
- Bot navigation reaches all POIs and does not become stuck.
- No material/prop causes a large frame-time spike.
- Map is still fun with placeholder characters and weapons.
