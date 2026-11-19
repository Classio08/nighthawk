# NIGHTHAWK economy security audit — 19 November 2026

**Branch:** `feature/economy-security-hardening`  
**Base:** `main` at `2960e50206cc2911277e475ceb007bb65c11989f`  
**Status:** source review and targeted hardening changes. No tests, builds, browser sessions, CI, live-chain calls, contract deployment or penetration test were run in this workstream.

## Scope inspected

- `src/economy/gate.js`
- `src/economy/service.js`
- `src/economy/ledger.js`
- `src/economy/wallet.js`
- `src/economy/nft.js`
- `src/economy/earn.js`
- `src/economy/wager.js`
- `server/src/economy.js`
- `server/src/index.js`
- `data/compliance.json`
- `contracts/NighthawkCosmetics.sol`
- `contracts/NighthawkWagerEscrow.draft.sol`
- existing economy test specifications and `server/test/economy.mjs`

The codebase already has a default-closed gate, sandbox PLAY ledger, wallet proof, read-only NFT check and unaudited draft contracts. This work extends those components rather than introducing another ledger or wallet.

## Changes made on this branch

### Compliance gate

- ISO date validation now rejects impossible calendar dates instead of only checking whether a date string parses.
- Live mode now requires a persistent `ECONOMY_SECRET` of at least 32 bytes in hex form. The previous random fallback is still available for non-live local development, but cannot satisfy the live gate.
- Licence approval cannot be in the future and its expiry cannot precede approval.
- If NFT ownership checking is enabled for live mode, the gate requires an HTTPS RPC endpoint without embedded username/password, a valid contract address, and a configured chain ID included in the live chain allow-list.
- Live `earn` and `wager` are refused by the gate. The repository has no real-value earn or wagering settlement rail, so a config must not present those features as enabled.

### HTTP boundary and wallet challenge

- Mutating economy requests now require `application/json` and a JSON object body, retaining the existing small request-body limit.
- Wallet challenge domains are no longer dynamically learned from request Host headers. Only the explicitly configured `ECONOMY_DOMAINS` values (or loopback development defaults) are accepted.
- When an Origin header is present, it must be HTTP(S), have no embedded credentials and match the request hostname.
- The per-IP in-memory limiter no longer clears every active bucket when its map grows beyond 5,000 keys. It removes expired keys and refuses new keys while at capacity.

### NFT RPC reader

- RPC calls have an eight-second abort timeout and are not cached.
- HTTP failures, malformed JSON, malformed JSON-RPC envelopes, mismatched response IDs, RPC errors, invalid chain IDs and malformed balance results fail closed.
- Ownership is evaluated using the full returned integer, avoiding a lossy safe-integer parse for the boolean ownership decision.

### ERC-1155 contract draft

- The single-token safe-transfer callback now receives the exact `bytes data` supplied by the caller, as required by ERC-1155 receiver semantics.
- A non-zero royalty rate now requires a non-zero royalty receiver.

The contract remains an unaudited, undeployed draft. These small changes are not a security audit of the contract.

## Test coverage added or amended (not executed)

- `tests/economy-gate.test.js`: strict calendar dates, persistent secret, HTTPS RPC, RPC chain allow-list and deliberate live earn/wager refusal.
- `tests/economy-server-hardening.test.js`: explicit loopback domains, rate-limit map capacity, expired-key cleanup and 40-per-minute boundary.
- `tests/economy-wallet.test.js`: RPC timeout signal, malformed JSON-RPC envelope and malformed balance result.
- `server/test/economy.mjs`: request without JSON content type is rejected.

**No test result is claimed.** These specifications must be executed and reviewed by the project owner when the repository is ready for the testing stage.

## Remaining risks — not release-ready

### Critical before any real-value feature

1. **Persistence is not production-grade.** The current ledger is in memory and snapshots to a local JSON file. It has no transactional database isolation, distributed locking, durable outbox, robust crash-safe commit protocol or reconciliation against external payment/chain state. Keep it sandbox-only. Migrate to a transactional database before persistent public value or payments.
2. **No real-value settlement rail exists.** Do not enable deposits, withdrawals, token rewards, staking, wagering, player-to-player transfers, creator payouts or redemption. The present live-capable scope is limited to optional wallet proof and read-only cosmetic ownership, subject to all necessary licensing, legal and operational review.
3. **No KYC/age/sanctions provider is wired.** The gate has profile hooks, not a verified identity integration. Do not treat client-submitted age, location or compliance flags as proof.
4. **No independent smart-contract audit.** The ERC-1155 contract and draft wagering escrow must not receive real assets or be described as audited/safe.
5. **No production penetration test.** In-memory tests and fake RPC tests do not establish real-world security.

### Important engineering gaps

- Session revocation and device/session management are not implemented. HMAC sessions expire after a short period; a future account service should persist session IDs, support revocation and rotate keys with versioned key IDs.
- Wallet challenges are held in process memory. A multi-instance service needs shared storage, one-time atomic consumption, bounded cleanup and per-wallet/per-account throttling.
- The current limiter is per-process and in-memory. It is not a distributed rate limiter and its IP attribution depends on a carefully configured trusted reverse proxy. Do not trust arbitrary forwarded headers.
- The NFT reader checks the chain ID and response shape, but does not independently pin the RPC provider host, verify contract bytecode/code hash, check an ERC-1155 interface response, or cross-check multiple providers. Production use needs an admin-controlled endpoint allow-list, egress restrictions, a known contract address/code hash, confirmation policy and monitoring.
- Admin roles, MFA, dual control, signed operational change records and immutable audit storage are not present.
- The JSON save path catches persistence errors and logs them; it is not an atomic financial commit contract. No real-value operation should depend on it.
- No creator upload pipeline, moderation, provenance attestation, malware scanning or content-rights verification exists yet.
- No payment-provider webhook verification, refunds, chargeback handling, tax accounting or creator payout operations exist.
- No privacy export/delete or sensitive-data retention implementation is complete.

## Safe economic boundary

Keep these value classes separate:

- XP, level and faction reputation: non-transferable game progression.
- `CREDITS`: proposed off-chain, non-redeemable cosmetic currency.
- Paid cosmetic entitlements: account-bound purchase records from a future approved provider.
- External collectibles: optional proofs of cosmetic ownership, never account identity, XP, currency, combat power or guaranteed value.
- `PLAY`: sandbox-only test units, never exchangeable or redeemable.

Do not launch a NIGHTHAWK fungible meme coin as the game economy. If a digital collectible chain is chosen, start with account-bound off-chain cosmetics and offer chain minting only as an optional collectible path after a separate platform/legal/security decision.

## Required next gate

Before enabling any live wallet/NFT surface: review this branch diff, run the added tests, perform a real-wallet challenge test on the approved domain, verify the exact production RPC and chain, independently verify the deployed contract address/code, review logs and secrets handling, complete an application penetration test, and get written legal/licensing sign-off for the precise activity and target countries.
