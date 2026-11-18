# Claude Code Handoff — NIGHTHAWK next sprint

Use this after pulling the latest `main`. The owner is running Claude Code in the same repository, so keep changes on a new feature branch and never overwrite another agent's branch.

## Owner-approved direction
- Realistic art direction; redesign, not low-poly.
- Fictional African-inspired special-operations unit; modern equipment.
- Support FPP and TPP.
- Five likeness references are approved as design inputs: Roms, Cleiseis, Shadow (black shirt), Rampol (green work overall), Maetja (blue shirt). Do not copy social-media UI, captions, watermarks, logos or reference clothing as the final uniform. Douglas, Cliffhanger and Navy Blue still need references or approved visual descriptions.

## First: reconcile reality before coding
1. Pull latest `main` and read `docs/ROADMAP.md`, `docs/MASTER_SYSTEMS.md`, `docs/ASSET_CATALOG.md`, `docs/CHARACTER_VISUAL_BIBLE.md`, `docs/MULTIPLAYER.md`.
2. Inspect actual code and tests; do not assume pasted chat progress is current.
3. Run `npm run check` and record the exact result. Do not change unrelated simulation code while doing the art slice.
4. Check whether PR #2 is still open or superseded before touching it.

## Sprint A — production multiplayer validation
- Add a concise deployment / external-network test checklist.
- Add reconnect/session recovery design and tests before multi-region complexity.
- Measure real server tick p50/p95/p99, memory and room CPU at 2/8/16 clients; do not invent results.
- Keep current 60 Hz authoritative simulation / 20 Hz snapshot settings until measurements justify a change.
- Add input rate limits and server validation for movement, fire rate, ammo, ability cooldowns and objective interactions.
- Do not add voice chat yet.

## Sprint B — first visual slice (the next creative deliverable)
- Download official 1K PBR archives for Ground 087 and Ground 064 from ambientCG; retain licence and provenance in `ASSETS.md`.
- Keep source maps out of the initial critical path; lazy-load them for the arena.
- Integrate one PBR material into the current Three.js scene and prove correct color space, repeat, normal orientation, roughness, mipmaps and seam quality.
- Use a single reusable GLB humanoid rig. Prototype one operator first; keep gameplay hit capsules and physics separate from visual mesh.
- Do not invent or replace the likenesses of Douglas, Cliffhanger or Navy Blue.
- Add a visual fallback so missing assets never prevent a match from starting.

## Sprint C — FPP/TPP prototype
- First inspect the current camera and viewmodel implementation.
- Implement V toggle with shoulder swap, collision-safe spring arm and stable camera smoothing.
- Do not let TPP camera peek around cover unfairly; consider separate FPP/TPP queues if needed.
- Keep authoritative hit origin and server validation consistent across camera modes.
- Add browser tests for camera switching, wall collision, ADS and online aim consistency.

## Hard engineering constraints
- Server authoritative for gameplay state and outcomes.
- Cosmetic-only local VFX can be client side; damage and objective state cannot.
- Avoid huge feature batches. One vertical slice at a time.
- No dependency additions without a measured need.
- No Web Worker physics rewrite, tick-rate change, blockchain, marketplace, voice chat, or vehicles in this sprint.
- Every asset must have a licence record; no GTA/Vice City game data.
- Run unit tests, server tests, browser E2E and build before calling a stage done.

## Completion report
Report: branch name, commit SHA, files changed, tests actually run and results, performance measurements (if any), known gaps, and a browser screenshot/playtest result if available.
