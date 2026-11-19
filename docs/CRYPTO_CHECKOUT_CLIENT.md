# Client-side non-custodial ERC-20 cosmetic checkout

This branch is a dependent UI/client contribution to `feature/crypto-wallet-payments`. It expects the server-side merchant-payment intent and receipt verification routes from that branch. A successful payment grants an in-game cosmetic entitlement to the NIGHTHAWK account; **it does not mint an ERC-1155 NFT**. The separate NFT ownership-check flow remains read-only.

## Purchase flow

1. The client asks the backend for the public crypto configuration and cosmetic catalog. A closed/misconfigured gate shows no buy controls.
2. The guest account session is created or recovered using the existing account-session helper.
3. The player connects an injected EIP-1193 wallet. The client requests the account and binds the payment intent to that address.
4. The server returns the exact amount in token base units, token contract, treasury recipient, chain id, expiry and confirmation requirement.
5. The wallet is switched to the quoted network. The client re-reads the active account and then requests `eth_sendTransaction` for the standard ERC-20 `transfer(address,uint256)` call to the configured token contract.
6. The player's wallet shows the transaction. The client does not call `approve`, `permit`, `eth_sendRawTransaction`, or any NIGHTHAWK contract, and never receives a signing key.
7. The client submits only the transaction hash. The backend independently checks chain, transaction sender, token contract, recipient, exact amount, successful receipt and required confirmations before granting the cosmetic.

## Security boundaries

- No crypto purchase can change weapon damage, recoil, movement, armor or other gameplay stats. The payment-intent service only accepts ids from the server-side cosmetic catalog.
- This adapter does not deploy contracts, mint NFTs, grant token balances or provide an on-chain player marketplace.
- The browser never marks an item paid or owned without a positive server response.
- Token amounts are integers (BigInt); there is no floating-point conversion of money.
- Wallet account and network are rechecked immediately before the transaction.
- If the network is unknown to the wallet, the user must add it through the wallet's own trusted network interface. This module does not silently add RPC endpoints.
- A transaction hash awaiting confirmations can be checked again after reload. The pending hash and intent id are only stored in sessionStorage, not a secret.
- The default server gate remains closed. This branch does not modify `data/compliance.json`, live licence scope, token contract, chain, treasury or price configuration.
- This is an injected-wallet adapter. WalletConnect and native app deep-link support are separate future adapters; no claim is made that every mobile wallet injects `window.ethereum`.

## Mounting

Mount `mountCryptoCheckout(container, serverUrl)` inside the existing Economy/Quartermaster panel after the backend branch is integrated. It is not wired into the main menu here, to avoid competing with Claude's dashboard changes.
