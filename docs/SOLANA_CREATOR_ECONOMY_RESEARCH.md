# NIGHTHAWK — Solana launchpads, creator economics and a fair digital-goods ecosystem

**Research date:** 19 November 2026  
**Purpose:** compare the mechanics used by current Solana token-launch platforms, distinguish useful creator-economy ideas from speculative memecoin mechanics, and recommend a safer model for NIGHTHAWK.  
**Not financial, legal, tax or investment advice. Fee schedules and platform rules change; re-check the live on-chain configuration and published terms before integrating anything.

## Executive recommendation

**Do not make a NIGHTHAWK fungible meme coin the centre of the game economy.** Build a game and creator marketplace with real utility first. Use ordinary cosmetic sales, off-chain creator entitlements and transparent accounting to pay creators. Keep blockchain collectibles optional and cosmetic-only.

Solana launchpads demonstrate useful patterns:
- reusable launch configurations and staged release;
- visible fee breakdowns;
- creator attribution and claimable revenue counters;
- explicit liquidity/migration rules;
- on-chain ownership and auditable settlement.

But their fee model is based on trading volume and token launch speculation. That is not the same as recurring value creation in a game. A NIGHTHAWK creator should earn because players buy or play an approved piece of content, not because a token price rises or people churn through trades.

## 1. Platform comparison

### Pump.fun

**Mechanics:** permissionless token creation, a bonding-curve trading phase and graduation to PumpSwap. The creator can receive a portion of trading fees; the protocol and liquidity pool receive separate portions. Fees are collected in the quote asset, not the new token.

**Current published fee example (16 November 2026):** the SOL-pair schedule is tiered by market capitalisation. In its 0–420 SOL tier, the published curve total is 1.25% (0.300% creator, 0.930% protocol, 0.020% LP). Higher tiers change the composition and lower the total; the schedule reaches 0.30% at 98,240 SOL and above. A separate platform fee is published for trades (0.45% without a referral code, 0.40% with one). Creating a coin has no platform fee, but account rent and network transaction fees apply. Graduation lists a 0.015 SOL migration fee. These are dated examples, not permanent assumptions or recommended NIGHTHAWK fee rates.

**Useful lesson:** show every fee bucket and beneficiary separately; do not display a single vague “creator royalty” number. Creator fees and protocol fees should have explicit accounting sources and claim status.

**What not to copy:** reward trading volume, encourage speculative launches, or let the same token become game currency and a financial instrument. The variable fee schedule adds complexity and creates incentives around market-cap tiers rather than content quality.

Official: [Pump.fun fee schedule](https://pump.fun/docs/fees).

### Raydium LaunchLab

**Mechanics:** bonding-curve creator fees accrue in a per-creator, per-quote-mint vault before graduation. After graduation to a CPMM, creator fees accrue in a separate pool counter. These are distinct from locked-LP fee rights.

**Important upgrade detail:** Raydium's current creator-fee documentation says migrations after the 17 August 2026 upgrade allocate the combined `platform_scale + creator_scale` locked-LP share to the platform's Fee Key NFT. Do not interpret an old `creator_scale` value as a creator-owned LP share. Integrators are instructed to read `platform_cp_creator` to identify the post-graduation CPMM creator-fee beneficiary and to track pre-graduation and post-graduation fee counters separately.

**Useful lesson:** revenue can have separate lifecycle phases. Keep accrual, claimability, ownership and migration states explicit; preserve the historical accounting rules for older launches rather than reinterpreting them with a newer configuration.

Official: [LaunchLab creator fees](https://github.com/raydium-io/raydium-docs-v1/blob/main/products/launchlab/creator-fees.mdx).

### Meteora Dynamic Bonding Curve (DBC)

**Mechanics:** a partner/launchpad defines a reusable config: quote mint, curve shape, fees, token settings, migration threshold and liquidity distribution. A launch begins against a virtual reserve pool. It can use one curve segment or as many as 16. When the quote-reserve threshold is reached, the pool graduates into DAMM v2 liquidity.

**Fee design:** the official formula splits total trading fees into protocol and non-protocol portions. The protocol share is 20%; a referral may receive a share of that protocol portion. The remaining fee is shared between the partner and creator according to the launch config. Migration fees and surplus can have separately configured partner/creator allocations; a separate 0.2% protocol liquidity migration fee is documented.

**Useful lesson:** reusable policy templates, a clear split between platform partner and creator, staged launch lifecycle and explicit migration/locked-liquidity rules.

**Risk:** this is still a speculative-token launch architecture. A complex curve, dynamic fee or transfer hook does not by itself make a launch fair or protect buyers. NIGHTHAWK does not need a bonding curve for a cosmetic item.

Official: [What is DBC?](https://github.com/MeteoraAg/docs/blob/main/core-products/dbc/what-is-dbc.mdx), [fee formulas](https://github.com/MeteoraAg/docs/blob/main/core-products/dbc/formulas.mdx), [launch configuration](https://github.com/MeteoraAg/docs/blob/main/core-products/dbc/launch-configurations.mdx).

### Jupiter Studio

Jupiter Studio is a Solana token-launch surface associated with Jupiter's broader trading/discovery ecosystem. Its launch page was accessible, but did not return readable product terms to this review. I therefore do **not** claim a verified current creator split, trading-fee schedule, graduation threshold or token lock rule for it. Treat it as a platform to re-evaluate from its current signing screen and official terms before considering any integration.

Official entry point: [Jupiter Studio launch](https://studio.jup.ag/launch).

### Bags / Moonit and other launch frontends

Public search surfaced Bags as a launch frontend using shared Solana launch infrastructure, including Meteora DBC in third-party on-chain data documentation. The current official Bags creator-fee and payout terms were not verified from first-party documentation during this review. Moonit/Moonshot current creator-fee and graduation terms were also not verified from authoritative first-party documentation. Avoid copying numbers from comparison blogs or old launch pages.

The right integration question is not “which launchpad pays the highest fee?” It is “which protocol's current on-chain program, fee claim paths, upgrade controls, liquidity rules and creator-change rules can we independently verify?”

## 2. What the on-chain market data says about launchpad risk

Bitquery analysed observed Solana launch cohorts. These are third-party on-chain analytics, not a complete census of all token holders or a guarantee about future launches:

- In 10 sampled launch weeks between November 2025 and August 2026, it tracked about 2.9 million ordinary wallets buying newly launched Solana memecoins. It reported that 74% ended the following two weeks with less SOL after fees; the best 1% captured 56% of gains. The report also discusses sandwich bots.
- In a separate analysis of 11.5 million tokens that traded from 1 November 2025 to 7 October 2026, Bitquery reports that 79% of Pump.fun launches did not trade after launch day and 1 in 58 graduated to a full trading pool.

The data sets use Bitquery's specific definitions and observation windows; they should not be read as “every memecoin investor loses” or as a measure of all Solana activity. But they are a strong warning against assuming that launch count, market cap, volume or graduation rate equals a healthy community.

Sources: [Bitquery buyer outcomes](https://bitquery.io/investigations/solana-memecoin-traders-lose-money) (verified 15 October 2026); [Bitquery launchpad cohort analysis](https://www.bitquery.io/investigations/solana-launchpad-year) (verified 10 October 2026).

## 3. NIGHTHAWK should have four separate economic layers

Do not collapse these into one wallet or one token.

| Layer | Recommended implementation | Transfer / cash-out |
|---|---|---|
| XP, rank, faction reputation | Server-validated game progression | No transfer, no cash value |
| `CREDITS` (soft currency) | Earned through validated missions, season objectives and creator/community activities | Non-transferable, non-redeemable |
| Cosmetic entitlements | Account-bound purchases or unlocks; catalogued by stable item ID | No player-to-player transfer at first |
| Optional collectible | Optional on-chain cosmetic certificate / ownership proof after legal and platform review | No effect on account, rank, credits or combat; no guaranteed value |

Keep existing `PLAY` completely isolated as test currency. It is not a mainnet token, stablecoin, cash balance or convertible reward.

### Player value

Free players must be able to play all core modes and earn meaningful cosmetics through play. A player can buy optional cosmetic items, but must not buy weapon damage, accuracy, extra health, matchmaking advantage, easier mission completion or hidden information. Avoid paid randomised loot boxes. Publish all prices and item terms before purchase.

### Creator value

Creators should earn from actual use and purchase of their approved work:
- mission/story pack purchases;
- cosmetic sales;
- themed event or commissioned content;
- optional subscriptions only if there is a real recurring content service;
- editorial exposure and free in-game recognition for creators who contribute useful free work.

A creator's revenue should not rise merely because an asset's token is being traded. Use verifiable sale receipts, completion/quality signals and audit-ready attribution.

### Community value

Set aside a transparent community-content grant pool from platform revenue after costs. Use it to commission maps, mission writing, animation, sound, translation and accessibility work. Publish applications, award criteria, approved grants, deliverables and payment status. Do not give the grant pool to token holders pro rata.

### Platform value

NIGHTHAWK earns from optional direct-purchase cosmetics, approved content sales, platform services and sponsorships that fit the game. Reinvest in hosting, moderation, security, creator grants and new content. A platform does not need a speculative coin to have a functioning economy.

## 4. Provisional creator revenue waterfall (illustrative, not approved)

Use a clear waterfall calculated from **net receipts**, not gross listed price:

1. Gross paid order.
2. Subtract collected taxes/VAT and mandated deductions.
3. Subtract payment-provider and store/platform fees.
4. Subtract refunds, chargebacks and a disclosed dispute reserve.
5. Allocate the remaining distributable amount.

A starting discussion model could allocate the remainder as:
- **70% creator/rightsholder pool**;
- **20% NIGHTHAWK operating pool** (hosting, support, moderation, security and product development);
- **10% community production grants**.

These percentages are placeholders for discussion, not a promise or an adopted commercial term. The contract should state the meaning of net receipts, eligible sales, payout timing, minimum payout, returns, taxes, currency conversion, creator eligibility and what happens if content is removed. Creator payouts stay disabled until the business/legal/payment-provider path is approved.

For a multi-author work, the creator pool can split among up to a small fixed number of credited contributors with a signed contribution agreement. Never change a creator's split after sales without their consent and an auditable record.

## 5. A NIGHTHAWK creator marketplace should sell content, not coins

A healthy loop:

1. A player or creator makes a mission using approved templates and original licensed assets.
2. The mission passes automated schema/resource checks and human moderation.
3. Players discover it, preview the briefing, see content rating, creator identity, price (if paid) and version.
4. Match servers pin the approved immutable content version.
5. Completion, replay, rating and report events are server-recorded and anti-abuse checked.
6. The creator receives transparent attribution and a sales statement. A community grant is paid from the separately disclosed pool.
7. Proven successful missions can become official operations, with the creator credited and compensated under a separate signed agreement.

Creators should not be allowed to upload arbitrary executable scripts, hidden network calls, custom shaders or unrestricted models in the first version. Use declarative mission data, approved actions and strict budgets. The moderation, copyright/takedown and appeal system must exist before public submissions are enabled.

## 6. Optional Solana collectible route

NIGHTHAWK's current wallet code is EVM/EIP-191 and the existing cosmetics contract is an ERC-1155 draft. A Solana adapter is a separate integration, not an automatic replacement. Do not build Ethereum and Solana support simultaneously without player demand and an operational reason.

If Solana is selected for optional cosmetic certificates:
- Evaluate **Metaplex Core** first. Its single-account asset/collection model and plugin system are suitable for collectible cosmetics; official documentation describes collection-level operations and a Royalties plugin.
- Use the royalty plugin carefully. The current docs allow basis-point fees and up to five creator splits; allowlists/denylists can restrict transfer programs. With no transfer rule set, royalties are advisory, and marketplaces handle actual royalty collection/distribution. Do not promise royalties across all secondary markets.
- Avoid the legacy Token Metadata standard for a new collection unless a concrete compatibility need justifies it.
- Avoid Token-2022's `PermanentDelegate` for player-owned collectibles unless there is a documented, explicitly disclosed product requirement: the Solana docs say this authority can transfer/burn any holder's token account and cannot be revoked by the account owner.
- Decide Token-2022 extensions before mint creation. Most are initialized at mint/account creation and generally cannot be added afterwards; extensions can be incompatible.
- Keep metadata and asset URIs versioned and content-addressed where practical. Record asset hashes and provenance.
- Do not allow a collectible transfer to transfer the player's game account, XP, reputation, mission history or purchases.
- Prefer off-chain entitlements first, and make minting optional, with a clear no-wallet path.

Sources: [Metaplex Core](https://www.metaplex.com/docs/smart-contracts/core), [Royalties plugin](https://www.metaplex.com/docs/smart-contracts/core/plugins/royalties), [Solana Token Extensions](https://solana.com/docs/tokens/extensions), [Permanent Delegate](https://solana.com/docs/tokens/extensions/permanent-delegate).

## 7. If a fungible community token is ever considered

This is a separate regulated financial-product decision, not a game feature. The safest recommendation today is **do not issue one**. If the owner later wants to investigate it, require a written decision pack before any code or promotion:

- legal opinion covering token issuance, public offering, virtual asset services, secondary trading, marketing, consumer protection and target jurisdictions;
- confirmed company and licence scope for the exact issuer/service activity;
- audited contract and launch configuration;
- disclosed supply, treasury, allocation, vesting, unlocks, insider wallets and admin powers;
- independent liquidity custody and lock terms;
- market-abuse and wash-trading controls;
- no buyback, price floor, profit, yield or appreciation promises;
- clear conflict-of-interest controls for employees, creators and moderators;
- consumer complaint/refund process and tax/accounting treatment;
- platform distribution policies.

No launchpad's “creator fee” should be presented as guaranteed income. It depends on volume, configuration, program upgrades, claims and possibly market/venue behavior.

## 8. Namibia legal gate

The Namibian Virtual Assets Act, 2023 (Act 10 of 2023), section 7 says a person may not operate as a virtual-asset service provider unless the applicable registration, place-of-business and licence conditions are met; it also says a token issuer must be a company. The Act specifies significant criminal penalties for contravening the licensing requirement.

This does not classify every game cosmetic, off-chain credit or optional NFT in advance. A Namibian legal practitioner and the competent regulator must map each planned activity to the law and to the actual licence classes/scope held by the entity. A licence application, selection or pending process does not by itself establish that a specific activity is currently authorised. Confirm every target country too.

Official source: [Namibia Financial Intelligence Centre — Virtual Assets Act, 2023](https://www.fic.na/uploads/Acts/Virtual%20Assets%20Act/Virtual%20Assets%20Act.pdf). [NamibLII consolidated Act text](https://namiblii.org/akn/na/act/2023/10/eng%402023-07-21).

## 9. Recommended delivery order

1. Finish the current EVM economy security review and keep all real-value features closed.
2. Add a server-authoritative cosmetic catalog and account inventory, with no token or purchase required.
3. Migrate persistent ledger/account state to transactional storage before any public sale.
4. Add direct purchase of cosmetic entitlements using a provider/platform explicitly approved for the business and target countries.
5. Build creator attribution, approved content publishing, moderation, takedowns and a transparent statement/payout ledger (payouts remain disabled).
6. Run a creator pilot using free missions and cosmetics; measure completion, repeat play, creator retention and moderation burden.
7. Only then test optional wallet ownership proof and a small Solana collectible collection, if there is player demand.
8. Revisit a fungible token only with a separate written legal, platform, security and business case. Do not make it a prerequisite for access, play, creator participation or rewards.

## 10. Success measures

Prefer:
- percentage of players who can progress without paying;
- mission completion, repeat-play and quality signals;
- creator retention and the share of creators who publish a second approved work;
- creator net receipts and payout timeliness when enabled;
- refunds, chargebacks, fraud and moderation/takedown rates;
- platform operating cost per active player;
- community-grant value and delivery quality;
- cosmetic ownership and transfer-support incidents.

Do not optimise for token launches, wallet connections, trading volume, market cap, speculation, holder count or price appreciation.
