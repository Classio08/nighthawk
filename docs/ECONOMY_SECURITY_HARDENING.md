# NIGHTHAWK — Economy, digital goods and security hardening

**Status:** architecture and security work plan. This document does not claim the proposed services are implemented.
**Baseline:** the existing closed-gate economy described in `docs/ECONOMY.md`.
**Non-negotiable:** default closed; sandbox is play-money only; no real-value deposits, withdrawals, wagering, staking, token rewards or creator payouts are enabled by this plan.

## 1. What already exists (do not rebuild it)

The current repository already contains:
- `src/economy/gate.js`: off / sandbox / live compliance gate, including licence scope and per-player country, age and KYC checks.
- `src/economy/ledger.js`: integer, double-entry, idempotent in-memory ledger with replay validation.
- `src/economy/wallet.js`: server-built, domain-bound, expiring, single-use EIP-191 wallet proof; no custody.
- `src/economy/nft.js`: read-only ERC-1155 ownership lookup.
- `src/economy/earn.js` and `wager.js`: capped server-result play-money earn and play-money escrow with player-protection limits.
- `server/src/economy.js`: HTTP integration and local JSON persistence.
- `contracts/`: draft ERC-1155 cosmetics and draft wager escrow contracts. They are not audited or deployed.
- `data/compliance.json`: ships with mode off and all feature flags false.

Read `docs/ECONOMY.md` before changing any of these. The old `feature/crypto-money-ecosystem` and persistent-account branches are historical work, not a reason to merge stale code. Rebase/reimplement only after comparing with current main.

## 2. Product model: four separate value domains

Never collapse these into one generic wallet balance.

| Domain | Example | Transferable? | Chain? | Purpose |
|---|---|---:|---:|---|
| XP / reputation | operator XP, faction standing | No | No | progression, non-monetary |
| Soft currency | `CREDITS` earned in missions | No initially | No | direct-purchase gameplay cosmetics |
| Premium / paid entitlement | a purchased cosmetic entitlement | No player-to-player transfer | No initially | optional direct purchase through approved payment provider |
| External digital collectible | ERC-1155 cosmetic token | only if the deployed contract and policy permit | Yes | optional proof/ownership of a cosmetic |

`PLAY` remains an isolated test currency for sandbox testing. It must never be represented as cash, a stablecoin, a redeemable balance or a real token.

No gameplay power may be bought, minted, rented, transferred or unlocked with a token. All paid goods are cosmetic or expressive: uniforms, colourways, patches, weapon finishes, banners, emotes, safehouse decoration, vehicle liveries and creator cosmetics.

## 3. Service boundaries

Introduce these as logical modules first; do not split into microservices until scale requires it.

1. **Identity service** — guest ID, account linking, passkey/OIDC identity, recovery, session revocation and privacy operations. Wallet address is an optional linked identity, never the only account recovery method.
2. **Profile and progression service** — server-validated XP, mission results, faction reputation and unlock progression. Offline/client-only mission results may grant local XP only until verified by the server.
3. **Ledger service** — append-only double-entry postings, account balances as derived/cached views, idempotency and reconciliation. No route or UI edits a balance directly.
4. **Catalog service** — canonical item IDs, item type, rarity label, price, availability window, region/platform restrictions, creator, provenance, licence, mintability and version.
5. **Inventory / entitlement service** — owns the authoritative player-to-item grant records. A blockchain token is evidence of an external asset, not the authoritative record for every game entitlement.
6. **Wallet identity service** — challenge, signature verification, wallet linking/unlinking, chain allow-list and session binding. Never custody keys or request approvals for cosmetic ownership checks.
7. **Chain adapter / indexer** — read-only chain state, confirmation depth, reorg handling, contract allow-list and event reconciliation. Keep chain-specific code behind an adapter.
8. **Mint coordinator** — queues eligible mint requests, enforces one mint per entitlement, tracks pending/submitted/confirmed/failed/reorged states and reconciles contract events.
9. **Creator service** — creator profiles, submissions, moderation, rights declarations, versioning, revenue attribution and takedowns. Creator payouts remain disabled until a compliant settlement provider and approvals exist.
10. **Trust, safety and audit service** — staff actions, suspicious activity, reports, sanctions/region decisions where applicable, immutable audit events and case review.

For the first release these can remain modules in the existing Node server. Use explicit interfaces and dependency injection so storage and chain providers can be replaced.

## 4. Ledger and inventory invariants

- Store amounts as safe integers in the smallest currency unit; never use floating-point arithmetic.
- Every posting has a globally unique idempotency key, currency, reason code, actor, subject, correlation ID, timestamp and balanced debit/credit entries.
- The database transaction must lock or atomically update all affected accounts; validate sufficient funds and post all entries or none.
- A repeated key with identical payload returns the original receipt. A repeated key with a different payload is a hard conflict and security event.
- Do not let a browser provide a balance, price, reward amount, winner, inventory grant or mint eligibility.
- Inventory grant/revoke events reference the ledger receipt or authoritative mission/purchase event. Enforce unique ownership constraints for non-stackable items.
- Refunds and reversals are compensating transactions; never edit or delete old ledger entries.
- Reconcile ledger totals, item entitlements, payment-provider records and chain events. Quarantine discrepancies rather than silently repairing them.
- Separate currencies by ledger and account namespace. No implicit conversion between `PLAY`, `CREDITS`, paid entitlements and external tokens.
- Rate-limit and cap every earn source. Use server-validated match/mission IDs, anti-replay keys, per-account and per-device velocity signals, and anomaly review.

### Persistence upgrade

The current JSON snapshot is acceptable only for a local prototype/sandbox. Before persistent public accounts or any real payment:
- move to PostgreSQL (or equivalent transactional relational storage);
- use serializable transactions or row locks for ledger posting and escrow settlement;
- add unique constraints for idempotency keys, wallet links, item ownership and mint requests;
- store append-only ledger entries and audit events separately from cached balances;
- use a transactional outbox for emails, receipts, creator notifications and chain jobs;
- encrypt secrets with a managed secret store; rotate signing/session keys with a versioned key ID;
- add backup/restore drills and deterministic ledger replay.

Do not put wallet secrets, KYC documents or payment credentials in the game database. Store provider references and the minimum compliance state needed.

## 5. Mintable items and token model

### Mintable catalogue record

Each mintable cosmetic needs:
- stable internal `itemId` and immutable `metadataVersion`;
- creator/rightsholder and signed provenance record;
- asset hashes for model, textures, thumbnail and metadata;
- platform-specific content rights and allowed distribution channels;
- cosmetic-only classification and explicit gameplay-neutral declaration;
- supply policy: unique, capped edition or unlimited edition;
- chain, contract address, token ID and metadata URI only after deployment;
- mint state and transaction/event references;
- takedown, delisting and replacement policy.

### Mint lifecycle

`draft → reviewed → approved → eligible → queued → submitted → confirmed`

Failure/reorg paths are explicit: `failed`, `reorged`, `cancelled`, `revoked-from-game-catalog`. A chain transfer must not silently transfer a game account, XP, rank or competitive entitlement. On-chain ownership can unlock the matching cosmetic only after the indexer has verified the canonical chain, contract, token ID and confirmation policy.

### Token policy

- Do not create a speculative NIGHTHAWK fungible token as a shortcut to an economy.
- Do not promise appreciation, yield, profit, revenue share or cash redemption.
- Do not reward kills, playtime or mission outcomes with a real-value token.
- Do not add staking, pooled prizes, cash-out, player-to-player trading or escrow to the live product in this workstream.
- A future cosmetic token is a collectible representation, not a currency or investment.
- Prefer account-bound off-chain cosmetic entitlements first. Minting is optional and must not be required to play, equip, trade or retain ordinary cosmetics.
- Never call an unreviewed contract audited, safe or production-ready. The current contracts are drafts.

## 6. Payment, creator revenue and refunds

First public commerce should be direct-purchase cosmetics through an approved conventional provider, if and when the owner selects a provider and the target platforms permit it. The provider owns card handling; NIGHTHAWK stores provider IDs, order state and receipts, not raw card data.

Order state: `created → provider_pending → paid → fulfilled`; exceptions: `failed`, `expired`, `refunded`, `chargeback`, `review`. Fulfilment is idempotent and only follows verified provider webhooks. Verify webhook signatures, timestamp windows and event IDs. Never trust the browser's success redirect.

Creator revenue share is a future accounting allocation, not an instant payout promise. Track gross order, tax/fees, refunds/chargebacks, platform share, creator share and payable balance as separate ledger accounts. Hold creator proceeds through a review/return window. Payouts require identity, tax, sanctions and regional checks from appropriate providers and a documented business policy. No manual wallet transfer from an admin screen.

## 7. Security threat model and controls

| Threat | Required control |
|---|---|
| Client fabricates rewards or match results | server owns result and reward calculation; signed/authoritative event source |
| Duplicate webhook, request or mint job | idempotency key + unique DB constraint + replay-safe state machine |
| Race condition / double spend | transactional ledger posting and row locks |
| Stolen session | short expiry, rotation, revocation, secure cookies where applicable, session inventory and alerts |
| Wallet challenge replay/phishing | domain-bound human-readable challenge, nonce, expiry, single-use, origin allow-list, chain binding |
| Fake RPC / wrong chain / reorg | verify chain ID, contract allow-list, confirmation depth, multiple provider strategy for high-value actions |
| Malicious creator upload | quarantine, MIME sniffing, size limits, malware scan, image/model parser sandbox, no executable scripts, moderation |
| Staff/admin abuse | least privilege, MFA, dual approval for high-risk actions, immutable audit log, break-glass expiry |
| Farming / bots / collusion | velocity signals, server-side telemetry, risk scoring, review queue, rate limits; avoid opaque automatic bans |
| Ledger/database tampering | append-only events, DB permissions, backups, replay and reconciliation alerts |
| Supply/metadata manipulation | immutable versioned metadata, asset hashes, reviewed contract/token mapping |
| Privacy breach | data minimisation, retention schedule, export/delete process, separate sensitive-provider records |

Additional hardening required before public launch:
- Use a cryptographically random, persistent server secret; fail startup if production secret is missing or too short. Do not silently generate a new session secret on every restart.
- Add CSRF protection for cookie-authenticated state changes; strict same-site/origin policy and CORS allow-list.
- Validate JSON size/content type, schema, integer bounds and unknown fields on every route.
- Use constant-time secret comparisons and timing-safe signature verification where relevant.
- Add per-IP, per-account and per-wallet rate limits with a shared store when horizontally scaled.
- Bound pending challenge maps and clean them safely; avoid clearing every limiter bucket in a way that resets all users' limits.
- Ensure persistence failures fail closed for value-changing operations; do not report a successful grant if save/commit failed.
- Keep operational logs free of signatures, bearer tokens, private keys, full payment payloads and sensitive identity data.
- Run independent contract audit and application penetration test before any real-value feature.

## 8. API contract direction

Keep current routes backwards-compatible during transition. Proposed versioned endpoints:
- `GET /api/v1/economy/status`
- `GET /api/v1/catalog/items?category=cosmetic`
- `GET /api/v1/inventory`
- `GET /api/v1/ledger/transactions?cursor=…` (redacted player view)
- `POST /api/v1/orders` (server resolves price and item)
- `GET /api/v1/orders/:id`
- `POST /api/v1/wallet/challenges`, `POST /api/v1/wallet/verifications`
- `GET /api/v1/collectibles/:itemId/ownership`
- `POST /api/v1/mints` (only after the mint feature is separately approved and gated)

Admin endpoints must be a separate protected surface with role checks, MFA, audit reason and dual control for financial or supply-changing actions. Never expose ledger posting, arbitrary grants, contract address changes or compliance config mutation to public routes.

## 9. Delivery order

1. Security review of current gate, wallet, ledger, JSON persistence and route integration; write findings before code changes.
2. Account-backed identity and server inventory, preserving guest-first play.
3. Transactional database ledger and audit/outbox.
4. Catalog and direct-purchase cosmetic entitlements (provider still off until selected).
5. Chain indexer and read-only ownership proof.
6. Mint coordinator and contract review; deploy only after independent audit and owner approval.
7. Creator attribution and payable accounting; payout provider only after separate compliance review.

**Release gates:** no live mode by default, no tests skipped in a release, no real-value functionality without documented approvals, and no claim of security based only on unit tests.
