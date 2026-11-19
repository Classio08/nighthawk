# Asset and weapon visual foundation

This branch adds a small draw-call-aware visual upgrade without replacing the current procedural art or Claude's operator field-kit work.

## Weapon details

`src/render/weapon-attachments.js` creates a single baked mesh for the default cosmetic sight, muzzle and underbarrel details. `makeGun()` uses the extra mesh while preserving the existing magazine object, muzzle helper, ADS height, skin shader and weapon simulation. A future gunsmith can pass a player-owned visual loadout to `buildWeaponAttachmentMesh`; no attachment changes damage, recoil, range, ammo or movement in this visual-only slice.

## Character pipeline

`src/render/operator-model-loader.js` loads a project-owned GLB only when a caller requests it. It clones skinned meshes safely, maps common animation clip names, blends actions and exposes `update`, `setPose` and `dispose`. It does not replace `FighterView` yet: Claude's field-kit branch owns the current operator geometry. Integrate the loader at that boundary after the GLB asset and rig are approved. The current box-built operator remains the fallback.

## Asset provenance gate

`src/assets/catalog.js` distinguishes candidate, approved and integrated assets. Candidate links are research only. To move an asset to approved/integrated, record the exact pack/file, creator, exact licence, source URL and verified dimensions. Texture dimensions above 2048 px are rejected from this web asset pipeline. A public GitHub repo or an AI search snippet is not proof of a compatible licence.

No third-party model, texture or audio file is downloaded by this branch.
