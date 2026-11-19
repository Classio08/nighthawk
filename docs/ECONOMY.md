# Economy: wallets, NFT cosmetics, play-to-earn and wagering (behind a closed gate)

**Owner decision, 19 Nov 2026:** the owner asked for NFTs, tokens, wallets, play-to-earn and wagering to be built, said the audio and everything in the project is his, and said his company has been selected for the crypto licences, which are in the works. They are therefore **built**, but they sit behind a gate that ships **closed** and that only a recorded licence can open for real value. This document says exactly what exists, what is only a draft and what is deliberately missing. It is engineering documentation, **not legal advice**, and nothing here makes any activity lawful. See `docs/PROJECT_DIRECTION_AND_CHAT_NOTES.md` section 10 and `docs/RESEARCH_NOTES.md` section 6 for the legal and platform reasons.

## Status at a glance

| Piece | Status | Where | Verified by |
|---|---|---|---|
| Compliance gate (`off` / `sandbox` / `live`), fails closed | **Shipped** | `src/economy/gate.js`, `data/compliance.json` | `tests/economy-gate.test.js` |
| Integer double-entry ledger, idempotent, replay-checked saves | **Shipped** | `src/economy/ledger.js` | `tests/economy-ledger.test.js` (incl. 2000-step conservation run) |
| Wallet proof (signed, expiring, single-use, domain-bound); no custody | **Shipped** | `src/economy/wallet.js` | `tests/economy-wallet.test.js`; real signatures over HTTP in `server/test/economy.mjs` |
| NFT cosmetic ownership check (read-only `eth_call`) | **Shipped** (needs a deployed contract + RPC to be useful) | `src/economy/nft.js` | unit tests with a fake RPC; **never run against a real chain** |
| Play-money earn with caps (server results only) | **Shipped, sandbox only** | `src/economy/earn.js` | unit + server test |
| Wager escrow in play money, with player-protection limits | **Shipped, sandbox only** | `src/economy/wager.js`, `server/src/staked-room.js` | `tests/economy-wager.test.js` (incl. crash recovery) + `server/test/economy.mjs` (real clients, staked match settled from the sim) |
| HTTP routes and persistence | **Shipped** | `server/src/economy.js` | `server/test/economy.mjs`, `economy-off.mjs` |
| `NighthawkCosmetics.sol` (ERC-1155 + ERC-2981) | **Draft, compiled, simulated** | `contracts/` | solc 0.8.28 clean; 27 checks in an in-process EVM (`contracts/test/evm-test.mjs`). **Not audited, not deployed, never run on a testnet.** |
| `NighthawkWagerEscrow.draft.sol` | **Draft, compiled, simulated, TESTNET ONLY** | `contracts/` | same as above. **Not audited.** |
| Real-value earn, real-value wagering, deposits/withdrawals, KYC provider, payment rail | **NOT BUILT** | | refuses in code (`Economy._sandboxOnly`) |
| In-game UI for wallet/staked play | **Prototype** (see "UI") | | e2e where noted |

## The gate

`data/compliance.json` ships as `"mode": "off"` with every feature off and an empty licence. `src/economy/gate.js` is the only thing that decides what may run.

- **off**: nothing runs. Routes answer `403 closed`, no staked room exists, `MatchRoom` behaves as before.
- **sandbox**: play money (`PLAY`) and test chains only (Sepolia, Base Sepolia, Amoy by default). Nothing can be bought, sold, withdrawn or won in real value. Turn it on for testing with `NIGHTHAWK_ECONOMY=sandbox npm run server` (or `npm run host -- --economy=sandbox`). That switch can never request live.
- **live**: needs all of: `mode: "live"` in `compliance.json`, licence reference + issuer + named approver + `approvedOn` + `expiresOn` (not expired) + a `scope` naming the feature, an allow-list of countries, at least one live chain id, and the server started with `NIGHTHAWK_ECONOMY_LIVE=1`. If any item is missing the gate answers **off** (not sandbox, not live) and lists what is missing. The licence expiring closes it on the very next request. Per player in live: allowed country (from `cf-ipcountry`, so the server must sit behind Cloudflare and not be reachable directly), verified age 18+ and KYC when `requireKyc`.
- The browser can never change any of this. It can only read `/economy/status`.

**What "live" can do today, honestly:** wallet sign-in and the read-only NFT cosmetic check on live chains. Real-value earn and real-value wagering are refused in code because the required rail does not exist yet (see "What you still need").

## Wallets (no custody)

The server builds a plain-language message (what it is, that it costs no gas and gives no access to funds, that NIGHTHAWK never asks for a seed phrase or private key), stores it with a random nonce bound to one address, one domain and one chain, and the wallet signs it with `personal_sign`. A challenge lasts 5 minutes, allows 3 tries and dies on first success. The result is a stateless HMAC session token (1 hour). Nothing else about the wallet is requested. `looksLikeSecret()` also keeps any pasted private key or recovery phrase out of the player-name field. Address derivation and EIP-55 checksums are checked against known vectors; sign/recover is round-tripped. **Not yet tested against a real MetaMask/Rabby popup** (needs a browser with an extension).

Dependency added: `@noble/curves` and `@noble/hashes` (audited, zero-dependency, used on the server and in tests). Measured need: Node's `crypto` cannot recover an Ethereum signer or compute keccak-256.

## NFTs

An NFT is a cosmetic ownership proof and nothing else: token 1/2/3 of the cosmetics contract unlocks the `gold` / `damascus` / `reactive` weapon skin. No combat advantage, no currency, no rewards. The check asks one public RPC `balanceOf(address,id)` after verifying the RPC reports the expected chain id. It never sends a transaction or asks for an approval. Configure with `ECONOMY_RPC_URL`, `ECONOMY_CHAIN_ID`, `ECONOMY_NFT_CONTRACT`. Platform note: Steam bans games that issue or trade NFTs; the browser/itch route and your own site are fine, but check each store's current rules before listing anywhere.

## Play-to-earn (play money only)

`earn.js` pays `PLAY` from a faucet account for **server-recorded** results only: per kill, per win, per mission, capped per match (150) and per day (600), once per match per player. Offline operations run in the player's own browser and the server cannot vouch for them, so they pay nothing (they still give XP and unlocks). A faucet gives 1000 `PLAY` per day for testing wagers. In live mode `earn` refuses: a real-value reward token would be exactly the "token rewards" the legal notes warn about and needs its own licence analysis and rail.

## Wagering

- **Rules:** same stake for everyone (100 to 10 000 `PLAY`), stakes lock in escrow when you join, leaving before the match starts refunds, leaving after forfeits, fewer than two stakers refunds, any error or restart refunds. The winner is the staker with the best placement who stayed to the end, decided by `ServerEconomy.onOver` from the finished simulation. Clients have no message that settles anything. Winner takes the pot minus a rake (default 0%).
- **Player protection built in:** one wager at a time, session loss limit (10 000), rolling 24 h loss limit (20 000, counting stakes at risk), 60 s cooldown after a loss, self-exclusion that can only be extended (`POST /economy/exclude`). Every refused join is written to an audit log.
- **Crash safety:** the ledger is the source of truth. After a restart `refundOrphanedEscrows` returns any stake left in escrow.
- **Known limits (not solved):** collusion and multi-accounting between friends, bots in staked matches (staked rooms are human-vs-human-with-bot-fillers), smurfing, chargebacks, sanctions screening, tax reporting. A real launch needs a policy and tooling for each.

## HTTP routes (all JSON, rate limited, same origin)

`GET /economy/status` | `POST /economy/wallet/challenge {address, chainId}` | `POST /economy/wallet/verify {nonce, signature}` -> `{token}` | `GET /economy/me` (Bearer) | `POST /economy/faucet` (Bearer, sandbox) | `POST /economy/exclude {days}` (Bearer). Staked play: join room `staked` with `{wallet: token, stake}`; normal rooms accept `{wallet}` to earn.

## UI

See the end of `docs/FREE_FRIEND_TEST.md` and the menu: the dashboard shows the gate state truthfully ("ECONOMY OFF" by default). Wallet connect, balance, faucet and staked quick-play appear only when the server reports sandbox. This UI is a **prototype** and has been exercised only through the scripts listed in the test section, not with a real browser wallet.

## What you still need before anything real (owner checklist)

1. The licence(s), recorded in `data/compliance.json` (reference, issuer, approver, dates, scope) and a lawyer's written view on skill-based pooled stakes, token issuance, custody and your player countries. Namibia's Gaming and Entertainment Control Act and Virtual Assets Act, plus every target country.
2. A **settlement rail**: either a licensed payment/custody provider, or an audited on-chain escrow (the draft in `contracts/` is the starting point, not the finished article).
3. KYC/age verification provider and sanctions screening; the gate has the hooks (`profiles`), no provider is wired.
4. Independent audit of the contracts and a penetration test of the server routes.
5. Responsible-gambling policy: help links, deposit limits, reality checks, complaint process.
6. Platform and payment-processor terms (Steam, Apple, Google, Stripe and most card processors restrict or ban real-money wagering and token sales).
7. Terms of service, privacy policy and records retention for the ledger and audit log.
8. Running behind Cloudflare (or similar) so the country header can be trusted.

## Testing it

`npm test` (economy unit tests), `npm run server:test` (includes `server/test/economy.mjs` and `economy-off.mjs`), contracts: `contracts/test/evm-test.mjs` (instructions inside; needs extra dev tools, not part of `npm run check`).

## Menu (ECONOMY tab) - prototype

The start screen has an ECONOMY tab (`src/ui/dashboard.js`, `src/ui/wallet-client.js`). It reads `/economy/status` from the server that served the page and shows exactly what that says:

| Server says | The tab shows | Buttons |
|---|---|---|
| no game server on this page (static build) | NO GAME SERVER ON THIS PAGE | none |
| `off` (the shipped default) | ECONOMY CLOSED | none |
| `sandbox` | SANDBOX, PLAY MONEY ONLY, plus a "not yet tried with a real wallet" note | CONNECT WALLET; after sign-in: CLAIM FREE PLAY MONEY, STAKED QUICK PLAY (PLAY MONEY), SELF-EXCLUDE 7 DAYS |
| `live` | LIVE (LICENSED), plus the statement that no real-value rail is built | CONNECT WALLET only (no faucet, no staking UI) |

Wallet sign-in only asks the wallet for an account, the chain id and a signature of a server-built message (`personal_sign`). The client never sees a seed phrase or private key and never sends a transaction. The session token lives in `sessionStorage` (gone when the tab closes).

Verified: unit tests with fake wallets (`tests/wallet-client.test.js`, `tests/dashboard.test.js`) and `scripts/e2e-dashboard.mjs` (headless Chrome against a real server; the wallet is a stub that makes genuine secp256k1 signatures from a throwaway key): closed by default, sandbox sign-in, faucet, balance, the stake locking in the lobby and refunding after a dropped connection (after the server's 12 s reconnect window), self-exclusion. **Not verified:** a real MetaMask or other wallet app, a real chain, a phone.

PLAY AGAIN after a staked match returns to the menu; it never re-stakes by itself.
