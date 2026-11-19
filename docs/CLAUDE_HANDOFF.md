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

## Non-custodial ERC-20 cosmetic checkout client — 19 November 2026

Dependent branch: `feature/crypto-cosmetic-checkout-client`, based on Claude's `feature/crypto-wallet-payments` branch. Keep the dependency explicit; do not cherry-pick into or rewrite the backend branch.

- `src/net/crypto-checkout.js` supplies an EIP-1193 injected-wallet client. It requests account access, checks/switches to the server-quoted chain, re-checks the active account, encodes ERC-20 `transfer(address,uint256)` and asks the wallet to send it directly to the configured merchant treasury. It never requests `approve`, `permit`, a private key or a seed phrase.
- The client submits only the transaction hash. `CryptoPaymentService` independently verifies chain id, sender, token contract, successful receipt, exact `Transfer` event recipient/amount and required confirmations before the account service grants a cosmetic entitlement.
- `src/ui/crypto-checkout-view.js` is a mountable component for the existing Economy tab. It is intentionally not mounted into the dashboard yet, to avoid conflicting with concurrent dashboard work. It reads display names from the normal store catalog and token amounts only from the crypto quote.
- A confirmed purchase currently grants an off-chain NIGHTHAWK cosmetic entitlement. This branch does **not** mint ERC-1155 NFTs, deploy contracts, issue tokens, custody assets, operate an exchange or enable wagers/staking/cash-out.
- The crypto config remains server-controlled and closed unless a valid environment and licence gate permit it. Do not fill in licence identifiers/scope, chain, token, treasury, prices or jurisdiction settings based on assumptions.
- Pending transaction hashes/intent ids live in session storage. The long-lived guest token continues to live in the existing account-session store.
- Test specs are present in `tests/crypto-checkout.test.js`, but the owner has asked to finish building before running tests/builds. Do not claim validation or a real-wallet transaction has been tested.
- Integration order: review/merge the backend branch only when the owner approves; then review this dependent branch and mount `mountCryptoCheckout(container, serverUrl)` in the Economy view. No merge has been performed.


## Multi-wallet checkout follow-on — 19 November 2026

Dependent branch: `feature/wallet-discovery-eip6963`, based on `feature/crypto-cosmetic-checkout-client`.

- Checkout now discovers injected wallets with EIP-6963 and presents a name-based wallet selector only when multiple providers respond.
- The registry deduplicates announced UUIDv4 values and retains the EIP-6963 announce listener for the page lifetime. UI subscriptions can be removed when the view closes; the standard window listener remains.
- Legacy `window.ethereum` is used only when no EIP-6963 provider responds. No WalletConnect / QR / native deep-link support is claimed.
- The browser does not render wallet-supplied SVG icons or persist provider identities. Re-check active account and chain immediately before sending the exact ERC-20 transfer.
- Wallet discovery and the lifetime listener are only activated once the server says crypto checkout is enabled. Do not weaken or bypass the server-side payment gate.
- Tests have been added as specifications but have not been run. No wallet transaction was sent.
