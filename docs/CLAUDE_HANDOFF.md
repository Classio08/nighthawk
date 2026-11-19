# Claude Code Handoff — NIGHTHAWK next sprint

Use this after pulling the latest `main`. The owner is running Claude Code in the same repository, so keep changes on a new feature branch and never overwrite another agent's branch.

## Owner-approved direction
- Realistic art direction; redesign, not low-poly.
- Fictional African-inspired special-operations unit; modern equipment.
- Support FPP and TPP.
- Five likeness references are approved as design inputs: Roms, Cleiseis, Shadow (black shirt), Rampol (green work overall), Maetja (blue shirt). Do not copy social-media UI, captions, watermarks, logos or reference clothing as the final uniform. Douglas, Cliffhanger and Navy Blue still need references or approved visual descriptions.

## First: reconcile reality before coding
1. Pull latest `main` and read `docs/ROADMAP.md`, `docs/MASTER_SYSTEMS.md` (engineering log, what is built), `docs/MASTER_PRODUCT_PLAN.md` (product plan), `docs/ASSET_CATALOG.md`, `docs/CHARACTER_VISUAL_BIBLE.md`, `docs/MULTIPLAYER.md`.
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

## Owner-approved implementation ticket
- Track the first realistic operator + PBR environment vertical slice in GitHub issue #4: https://github.com/Classio08/nighthawk/issues/4
- Use `docs/PRODUCTION_READINESS.md`, `docs/PERFORMANCE_BUDGET.md` and `docs/VISUAL_ASSET_REVIEW.md` as acceptance gates.
- The issue is a task brief, not permission to overwrite another agent's work. Branch from latest `main` and report actual tests and measurements.

---

## Owner direction update — 19 November 2026

The owner has expanded the product vision beyond the older art-only sprint. Read `/CLAUDE.md` and `docs/PROJECT_DIRECTION_AND_CHAT_NOTES.md` before planning further work. The project direction note is the authoritative record of the latest conversation and supersedes conflicting older sprint restrictions below.

**Immediate priority:** first offline playable operation, Operation DUST LANTERN. The owner explicitly approved this work. Build a compact, complete insertion → recon → identify → rescue/recover → extraction → debrief loop, with deterministic mission variation and tests. Keep it isolated from online multiplayer until the mission state has a versioned snapshot and server validation.

The owner also wants the long-term product to include:
- African/Namibian-rooted fictional military, intelligence, police tactical and other factions with global appeal.
- Co-op/PvP/PvPvE, extraction, bounty hunting, target contracts, kidnap-response/rescue, covert operations and campaign missions.
- NPCs with bounded agency, memory, morale, suspicion, relationships and evidence-based knowledge.
- Stronger movement, weapon feel, vehicles, explosions, physics, lighting, shadows, PBR, spatial audio, haptics and responsive accessible UX.
- Guest-first accounts, persistent progression and fair cosmetics economy.
- Optional wallet proof for cosmetics only as a later, legally reviewed feature. No wagering, staking, pooled pots, cash-out or token rewards without written legal/licensing approval. See the Namibia compliance section in the project notes.

Do not attempt all systems in one sprint. Preserve the existing Three.js/Rapier/Colyseus architecture until profiling demonstrates a reason to change it. Keep LLM reasoning out of authoritative combat, movement, hit detection and physics.

### Current parallel implementation
- ChatGPT is contributing the first offline DUST LANTERN mission on `feature/dust-lantern-first-playable`, draft PR #20. Do not edit or overwrite that branch; inspect its diff/CI and coordinate any follow-up on a fresh branch.
- The full owner direction and acceptance criteria are in `docs/PROJECT_DIRECTION_AND_CHAT_NOTES.md` and root `CLAUDE.md`.


## Mission alert director — 19 November 2026

A follow-on branch `feature/dust-lantern-alert-director` (draft PR #22) builds on the first playable DUST LANTERN branch. It adds `MissionAlertDirector` which derives a compact operation-wide threat level from evidence already held by living guard NPC brains: direct visual contact, recent sound investigation, and recent last-known-position reports. The pressure rises faster than it cools, and the HUD reports routine / uneasy / searching / alert / crisis. This system must never reveal hidden player coordinates or grant guards omniscient tracking. Tests cover escalation, observer counts, decay, and exclusion of dead/non-guard NPCs.

Do not merge this follow-on before PR #20 is reviewed; it is based on the PR #20 branch to keep the dependency explicit. The alert director is an initial aggregate signal, not yet a full witness/body discovery, radio network or branching mission director.

## Parallel platform workstream — 19 November 2026

A separate documentation-only branch, `design/economy-creator-cinematic-platform`, defines three adjacent workstreams while the gameplay/asset work proceeds elsewhere:

- `docs/ECONOMY_SECURITY_HARDENING.md`: current economy inventory, service boundaries, double-entry ledger invariants, mintable cosmetic lifecycle, token policy, payment/creator accounting and security threat model.
- `docs/CREATOR_STREAMER_PLATFORM.md`: streamer privacy mode, replay/clip pipeline, OBS overlay contract, template-based mission creator, moderation and creator programme.
- `docs/CINEMATICS_CHARACTERS_ROLEPLAY.md`: data-driven in-engine timeline, camera/animation rules, character memory and dialogue model, mission-story template and CGI/VFX budgets.

These documents are proposals and hardening plans, not claims that the described systems exist. The existing economy implementation is already documented in `docs/ECONOMY.md`; inspect it before coding and do not duplicate it. Keep `data/compliance.json` closed by default. No real-value token issuance, deposits, withdrawals, creator payouts, wagering or staking are enabled by this workstream. The draft contracts remain unaudited and undeployed.

The branch is isolated from Claude's work. Do not merge it automatically. No tests, builds, browser sessions, CI, deployment or VPS work were run for this documentation contribution.
