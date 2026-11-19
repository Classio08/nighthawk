# NIGHTHAWK — First- and Third-Person Camera Design

Status: a first-/third-person toggle is implemented on main via V, with a collision-aware third-person camera helper, local body view and first-person viewmodel. This design remains the target for polish, rigging and multiplayer fairness; it is no longer an unimplemented feature.
Owner decision (2026-11-18): support both perspectives.

## 1. Non-negotiable architecture rule

Camera mode is presentation only. It must not change the authoritative simulation, movement rules, hit validation, damage, weapon stats or multiplayer state.

- `src/sim/` remains the source of truth.
- `src/input/` continues to emit the same movement/look/fire/ADS commands.
- `src/render/` owns camera rigs, character visuals and weapon presentation.
- In online matches, the server validates shots using the same authoritative rules regardless of the player's camera mode.
- Do not allow third-person corner-peeking to reveal enemies or shoot around cover unfairly. The muzzle/aim solution and server-validated shot direction must remain consistent with the reticle and line of sight.

## 2. Modes

### First-person
- Keep the current `PerspectiveCamera` and `Viewmodel` weapon rig.
- Preserve the existing ADS, recoil, sway, reload, sprint and landing behaviour.
- Hide the local full-body head/torso/arms where they would intersect the camera; retain shadow/legs only if implemented cleanly.
- Keep the existing exact crosshair and hitscan alignment.

### Third-person
- Show the complete local operator with the same rig and equipment used by other players.
- Use an over-the-shoulder camera with adjustable shoulder side and distance.
- Use a camera boom with collision tests against world geometry; smoothly shorten the boom near walls and restore it when clear.
- Keep the character's weapon, hands, upper-body aim and muzzle direction aligned with the reticle.
- Use a subtle reticle and clear ADS transition; avoid letting the camera aim independently of the actual weapon.
- Blend movement, sprint, jump, landing, reload, hit reaction and ability animations.
- Ensure the local operator does not obscure nearby targets; add a near-camera fade only if required and tested.

## 3. Shared character rig

A single game-ready GLB/glTF operator rig should support:
- Third-person locomotion and combat animation.
- Weapon sockets for rifle, SMG, shotgun, DMR, LMG and sidearm.
- Modular head, hair, face, vest, belt, backpack, gloves, boots and optional headgear.
- Face and gear visibility in operator selection and third-person play.
- A first-person arm/weapon presentation that can share animation intent with the full-body rig.

Prefer a common skeleton and modular attachments across all eight operators. Avoid eight separate animation systems.

## 4. Camera controls

Suggested defaults (all should be configurable):
- PC: press V to toggle first/third person.
- Third-person shoulder swap: press Q or a configurable key when not conflicting with current bindings.
- Mouse wheel: existing weapon cycling must remain available; do not repurpose without checking controls.
- Controller/mobile: expose camera toggle and shoulder swap through the control layout.
- Remember the selected mode in local settings; allow server/match rules to force a mode for fair competitive playlists later.

Check current bindings in `src/input/input.js` before assigning keys. Do not silently change existing controls.

## 5. Multiplayer and fairness

- Camera mode is a client preference and is not trusted by the server.
- Remote players are rendered with the same operator rig, animation state and interpolation path in either local camera mode.
- Shot origin/direction must be reconciled with the reticle and the authoritative muzzle/aim ray.
- Third-person camera collision must not affect Rapier player collision.
- Add tests for camera toggle state, camera obstruction, shoulder swap, ADS alignment and no change to server-side hit results.
- Consider a first-person-only ranked/competitive playlist only if third-person peeking proves impossible to balance; do not split the player base prematurely.

## 6. Implementation sequence

1. Replace the box-built player/remote fighter visual with a placeholder skinned rig while preserving the current simulation.
2. Separate camera rig logic from `main.js` into a dedicated render module.
3. Add third-person shoulder camera and collision-aware boom.
4. Add upper-body aim offsets and weapon socket alignment.
5. Add smooth first/third-person transitions and local body visibility rules.
6. Test offline, two-browser online, lag simulation and low-end integrated graphics.
7. Add control settings and save preference only after core behaviour is stable.

## 7. Acceptance checklist

- [ ] V toggles both modes without resetting player state.
- [ ] Movement, jump, sprint, reload, ADS and weapon switching work in both modes.
- [ ] Reticle, weapon muzzle and actual hitscan direction agree.
- [ ] Camera cannot pass through walls or expose impossible angles.
- [ ] Local body/weapon never blocks the view unexpectedly.
- [ ] Remote operators animate and interpolate consistently.
- [ ] Server-authoritative hit tests produce the same results in both modes.
- [ ] No regressions in `npm test`, `npm run smoke`, `npm run server:test`, `npm run build` and browser E2E.

## 8. Current implementation gap

The current `src/main.js` toggles `thirdPerson` with the configured camera action (V by default), calls `thirdPersonCameraPosition()`, hides the FPP viewmodel when appropriate, and shows a local `FighterView` body. Remote/local operator visuals are still procedural/block-built rather than a finished shared GLB rig. The camera feature exists, but production animation, shoulder customization, ADS/muzzle alignment review and external online fairness tests remain open.
