# NIGHTHAWK — Character Visual Bible

Status: owner-approved direction — realistic, modern, fictional African special operations unit; first- and third-person play. Character likeness references received for Roms, Cleiseis, Shadow, Rampol and Maetja. Proposed roles/personality concepts remain unapproved.
Branch: `art/character-visual-foundation`

## Approved overall visual direction

**Realistic African special operations unit.** Grounded human proportions, recognisable faces, believable equipment, physically based materials, cinematic presentation and browser-game performance.

Visual language:
- A fictional African special operations unit operating in Southern African dryland, semi-urban and industrial environments.
- Practical modern kit with locally grounded colour palettes: charcoal, olive, faded khaki, earth brown and restrained character identifiers.
- Modular carriers, radios, pouches, gloves, boots and optional headgear.
- Natural facial anatomy, skin detail, hairlines and facial hair.
- Realistic wear and dust without obscuring character readability.
- Cinematic menu presentation; optimised meshes, materials, LODs and texture sizes in gameplay.
- Avoid sci-fi armour, generic stock-soldier faces and unsupported real-world insignia.

The supplied photos are likeness references for original fictional game characters. Preserve the real facial appearance as closely as the available image quality allows. Do not reproduce Instagram UI, captions, watermarks, clothing logos or unrelated people.

## Character design principles

1. Likeness and silhouette come before armour.
2. Give every operator a distinct personality, combat role, visual silhouette and gameplay purpose.
3. Roles and personalities must be owner-approved before they become canon.
4. Equipment should support the approved role and remain modular.
5. Do not infer personality, biography, exact height, weight or military history from a photograph.
6. Keep helmets, eyewear, scarves, carriers and packs modular; preserve face visibility in character selection and story scenes.
7. No gameplay abilities or operator definitions should be changed based only on this visual document.

## Character roster and reference notes

### Roms — first reference batch
Reference: outdoor full-body photo. Visible cues include short dark hair, sunglasses and moustache/goatee-style facial hair. Sports shirt and shorts are reference clothing only.
Status: likeness reference received; redesign open.

### Cleiseis — first reference batch
References: mirror/full-body selfie and clearer portrait. Visible cues include short/buzzed hair and distinctive facial proportions. Small ear jewellery is visible and may be an optional cosmetic. Black T-shirt is reference clothing only.
Status: likeness references received; redesign open.

### Shadow — reference batch 02
Reference: full-body photo wearing a black button-up outfit, dark trousers and light-coloured shoes.
Visible cues: short dark hair, moustache/beard facial hair, lean-looking silhouette in the photograph.
Status: likeness reference received. Preserve face and general silhouette; redesign clothing as tactical kit. The black outfit in the photo is not a required uniform.

### Rampol — reference batch 02
Reference: photo wearing a dark green work overall with high-visibility bands and a respirator hanging around the neck.
Visible cues: short hair, clean-shaven appearance in the supplied photo, youthful facial expression.
Status: likeness reference received. The work overall and respirator are reference clothing/equipment only, not a final operator loadout.

### Maetja — reference batch 02
Reference: close portrait wearing a blue shirt.
Visible cues: short hair, prominent beard and moustache, broad smile in the reference.
Status: likeness reference received. Blue shirt is reference clothing only, not a final uniform.

### Douglas, Cliffhanger and Navy Blue
No likeness references supplied in this batch. Keep their facial appearance undefined until references or owner-approved descriptions arrive.

## Role and personality proposals — not canon

The existing operator data already defines gameplay classes and ability names. The table below uses those existing roles as the starting point and proposes a personality/visual direction around them. These are still proposals for owner review; no gameplay stats or abilities are changed here.

| Character | Existing gameplay role | Personality direction (proposal) | Visual silhouette direction (proposal) |
|---|---|---|---|
| Roms | Heavy Gunner | Dependable, calm under pressure, protective of the squad | Sturdy carrier, extra ammunition, reinforced gloves; keep sunglasses optional |
| Shadow | Infiltrator | Reserved, patient, observant | Low-profile dark/earth-tone kit, compact pack, minimal loose equipment |
| Douglas | Combat Medic | Empathetic, steady, decisive when others panic | Medical pouch, trauma shears, compact pack; keep medical markings fictional |
| Cliffhanger | Demolitions | Bold, humorous, improvisational | Utility harness, protected tools and clearly fictional demolition equipment |
| Navy Blue | Marksman | Analytical, disciplined, deliberate | Streamlined rig, optics support, rangefinder pouch; restrained blue identifier |
| Rampol | Breacher | Practical, stubborn, physically confident | Reinforced workwear-inspired trousers, breaching tools, gloves and robust carrier |
| Maetja | Hacker | Curious, quick-thinking, technically inventive | Communications/electronic kit, compact antenna, rugged tablet or field terminal |
| Cleiseis | Assassin | Quiet, fast, controlled and direct | Lean low-profile kit, compact belt, minimal bulk; preserve recognisable face |

The existing game data supplies the role labels and short backstories; the personality language above is a creative interpretation for review, not a fact inferred from the reference photographs. Keep all abilities, weapon assignments and balance unchanged until separately approved.

## Standard deliverables per approved operator

1. Neutral face portrait, front and 3/4 views.
2. Full-body front, side and back views on a neutral background.
3. Headgear-off and headgear-on variants.
4. Approved base uniform and alternate palette.
5. Gear breakdown: vest, belt, backpack, gloves, boots, radio and pouches.
6. Expression set: neutral, focused, injured and radio-call.
7. PBR textures: base colour, normal and roughness; optional AO/height where useful.
8. Game-ready GLB model, separate texture maps, source project and thumbnail.
9. LODs and texture budgets suitable for the NIGHTHAWK browser game.
10. In-engine preview under actual game lighting.

## Production and rights rules

- Preserve identity-defining facial features from supplied references; do not beautify or alter likeness.
- Do not commit original identifiable reference photos or social-media screenshots to the public repository without explicit rights and consent. Keep source photos private; commit only approved derived game assets and provenance metadata.
- Make gear modular and reuse rigs/materials where appropriate.
- Maintain consistent scale, rig naming, material naming and export settings.
- Validate in the actual Three.js renderer and on modest hardware.

## Current reference status

| Character | Reference status | Design status |
|---|---|---|
| Roms | Supplied | Redesign open |
| Cleiseis | Supplied | Redesign open |
| Shadow | Supplied | Redesign open |
| Rampol | Supplied | Redesign open |
| Maetja | Supplied | Redesign open |
| Douglas | Not supplied | Awaiting reference |
| Cliffhanger | Not supplied | Awaiting reference |
| Navy Blue | Not supplied | Awaiting reference |

## Next approval gate

Approve or revise each proposed personality and role. Then approve face likeness, body silhouette, uniform, gear and colour before detailed modelling.

## Existing lore/data conflict to resolve

The original `data/operators.json` contains NDF affiliation wording in its note and Douglas's backstory. This conflicts with the newly approved fictional faction identity. The art branch updates only those affiliation references to a fictional unit while preserving the existing eight names, role labels, weapon assignments, abilities, stats and other story details. Any broader lore rewrite remains subject to owner review.

The visual direction is a target, not a claim that realistic character models or third-person camera are implemented. Current box-built rendering and first-person gameplay remain a separate implementation milestone.
