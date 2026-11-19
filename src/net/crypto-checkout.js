// Non-custodial ERC-20 checkout client for the merchant cosmetic store.
// This module uses an injected EIP-1193 wallet. The wallet signs/sends the transfer;
// NIGHTHAWK never receives a private key, seed phrase, approval or custody permission.
import { accountApiBase, accountRequest, ensureGuestSession, getAccount } from './account-session.js';

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const UINT = /^\d{1,78}$/;
const MAX_UINT256 = (1n << 256n) - 1n;
const PENDING_KEY = 'nh_crypto_checkout_pending_v1';

const cleanError = (error) => {
  const code = Number(error?.code);
  if (code === 4001) return 'You cancelled the wallet request.';
  if (code === 4902) return 'This wallet does not know the configured network. Add the network through your wallet, then try again.';
  return String(error?.message ?? error ?? 'Wallet request failed').slice(0, 180);
};

async function readJson(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, {
    ...options,
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(options.headers ?? {}) },
  });
  let body = {};
  try { body = await response.json(); } catch { /* non-JSON proxy response */ }
  if (!response.ok) {
    const error = new Error(body.error ?? `Checkout API returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export function formatTokenUnits(amountUnits, decimals = 18) {
  if (!UINT.test(String(amountUnits ?? ''))) throw new TypeError('Token amount must be an unsigned integer');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new RangeError('Token decimals must be between 0 and 18');
  const value = BigInt(amountUnits);
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  if (decimals === 0) return whole.toString();
  const fraction = (value % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function encodeErc20Transfer(recipient, amountUnits) {
  if (typeof recipient !== 'string' || !ADDRESS.test(recipient)) throw new TypeError('Invalid ERC-20 recipient address');
  if (!UINT.test(String(amountUnits ?? ''))) throw new TypeError('Token amount must be an unsigned integer');
  const amount = BigInt(amountUnits);
  if (amount <= 0n || amount > MAX_UINT256) throw new RangeError('Token amount is outside the uint256 range');
  const addressWord = recipient.slice(2).toLowerCase().padStart(64, '0');
  const amountWord = amount.toString(16).padStart(64, '0');
  return `0xa9059cbb${addressWord}${amountWord}`; // transfer(address,uint256), not approve()
}

export function parseChainId(value) {
  try {
    const parsed = typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value) ? Number(BigInt(value)) : Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  } catch { return null; }
}

export function injectedWallet(globalObject = globalThis) {
  const provider = globalObject?.ethereum;
  return provider && typeof provider.request === 'function' ? provider : null;
}

async function walletRequest(provider, method, params = []) {
  if (!provider || typeof provider.request !== 'function') throw new Error('No compatible browser wallet was found.');
  try { return await provider.request({ method, params }); }
  catch (error) { throw new Error(cleanError(error)); }
}

export async function connectWallet(provider = injectedWallet()) {
  const accounts = await walletRequest(provider, 'eth_requestAccounts');
  const address = Array.isArray(accounts) ? accounts[0] : null;
  if (typeof address !== 'string' || !ADDRESS.test(address)) throw new Error('The wallet did not return a valid EVM account.');
  return address.toLowerCase();
}

export async function switchWalletToChain(provider, requiredChainId) {
  if (!Number.isSafeInteger(requiredChainId) || requiredChainId < 1) throw new TypeError('The merchant checkout has an invalid chain id.');
  const current = parseChainId(await walletRequest(provider, 'eth_chainId'));
  if (current !== requiredChainId) {
    await walletRequest(provider, 'wallet_switchEthereumChain', [{ chainId: `0x${requiredChainId.toString(16)}` }]);
  }
  const after = parseChainId(await walletRequest(provider, 'eth_chainId'));
  if (after !== requiredChainId) throw new Error('The wallet is still connected to the wrong network.');
  return after;
}

export async function sendErc20Transfer(provider, intent) {
  const from = typeof intent?.walletAddress === 'string' && ADDRESS.test(intent.walletAddress) ? intent.walletAddress.toLowerCase() : null;
  const tokenAddress = typeof intent?.tokenAddress === 'string' && ADDRESS.test(intent.tokenAddress) ? intent.tokenAddress.toLowerCase() : null;
  const treasuryAddress = typeof intent?.treasuryAddress === 'string' && ADDRESS.test(intent.treasuryAddress) ? intent.treasuryAddress.toLowerCase() : null;
  if (!from || !tokenAddress || !treasuryAddress) throw new Error('The server returned an invalid merchant payment address.');
  if (typeof intent.id !== 'string' || !intent.id) throw new Error('The server did not return a payment intent id.');
  if (!Number.isSafeInteger(intent.chainId) || intent.chainId < 1) throw new Error('The server returned an invalid payment network.');
  if (!UINT.test(String(intent.amountUnits ?? '')) || BigInt(intent.amountUnits) <= 0n) throw new Error('The server returned an invalid token amount.');
  if (intent.expiresAt && Number(intent.expiresAt) <= Date.now()) throw new Error('This payment quote has expired. Request a new one.');

  await switchWalletToChain(provider, intent.chainId);
  const accounts = await walletRequest(provider, 'eth_accounts');
  const active = Array.isArray(accounts) ? accounts[0]?.toLowerCase() : null;
  if (active !== from) throw new Error('The active wallet account changed. Reconnect using the account shown in the quote.');

  // The wallet displays and confirms this exact token transfer. There is no allowance,
  // approve(), permit, contract deployment, native-coin transfer or token custody.
  const data = encodeErc20Transfer(treasuryAddress, String(intent.amountUnits));
  const txHash = await walletRequest(provider, 'eth_sendTransaction', [{
    from,
    to: tokenAddress,
    data,
    value: '0x0',
  }]);
  if (typeof txHash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) throw new Error('The wallet returned an invalid transaction hash.');
  return txHash.toLowerCase();
}

export async function fetchCryptoCheckoutConfig(serverUrl, { fetchImpl = globalThis.fetch } = {}) {
  const base = accountApiBase(serverUrl);
  return readJson(fetchImpl, new URL('crypto/config', base));
}

export async function createCryptoPaymentIntent(serverUrl, cosmeticId, walletAddress, options = {}) {
  return accountRequest(serverUrl, 'crypto/intents', {
    ...options,
    method: 'POST',
    body: { cosmeticId, walletAddress },
  });
}

export async function getCryptoPaymentIntent(serverUrl, intentId, options = {}) {
  return accountRequest(serverUrl, `crypto/intents/${encodeURIComponent(intentId)}`, options);
}

export async function confirmCryptoPayment(serverUrl, intentId, txHash, options = {}) {
  return accountRequest(serverUrl, `crypto/intents/${encodeURIComponent(intentId)}/confirm`, {
    ...options,
    method: 'POST',
    body: { txHash },
  });
}

function readPending(storage) {
  try {
    const raw = storage?.getItem(PENDING_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) =>
      item && typeof item.intentId === 'string' && typeof item.cosmeticId === 'string' &&
      (item.txHash === null || typeof item.txHash === 'string')
    ).slice(-10) : [];
  } catch { return []; }
}
function writePending(storage, items) {
  try { storage?.setItem(PENDING_KEY, JSON.stringify(items.slice(-10))); } catch { /* storage may be disabled */ }
}
function upsertPending(storage, item) {
  const items = readPending(storage).filter((entry) => entry.intentId !== item.intentId);
  items.push(item);
  writePending(storage, items);
}
function removePending(storage, intentId) {
  writePending(storage, readPending(storage).filter((entry) => entry.intentId !== intentId));
}

/**
 * Buy one cosmetic using the server's exact merchant quote. The returned transaction
 * is verified by the backend; the browser never marks a cosmetic as paid/owned itself.
 */
export async function checkoutCosmetic(serverUrl, cosmeticId, {
  provider = injectedWallet(),
  fetchImpl = globalThis.fetch,
  storage = globalThis.localStorage,
  pendingStorage = globalThis.sessionStorage,
} = {}) {
  if (!provider) throw new Error('Open NIGHTHAWK in a browser wallet that supports EIP-1193.');
  await ensureGuestSession(serverUrl, { fetchImpl, storage });
  const walletAddress = await connectWallet(provider);
  const config = await fetchCryptoCheckoutConfig(serverUrl, { fetchImpl });
  if (config.enabled !== true) throw new Error(config.reason ?? 'Crypto checkout is disabled by the server.');
  const listed = Array.isArray(config.catalog) ? config.catalog.find((item) => item.id === cosmeticId) : null;
  if (!listed) throw new Error('This cosmetic is not enabled for crypto checkout.');

  const response = await createCryptoPaymentIntent(serverUrl, cosmeticId, walletAddress, { fetchImpl, storage });
  if (response.ok !== true || !response.intent) throw new Error(response.error ?? 'Could not create a payment quote.');
  const intent = response.intent;
  if (intent.walletAddress?.toLowerCase() !== walletAddress) throw new Error('The payment quote is not bound to the connected wallet.');
  if (intent.chainId !== config.chainId || intent.tokenAddress?.toLowerCase() !== config.tokenAddress?.toLowerCase() ||
      intent.treasuryAddress?.toLowerCase() !== config.treasuryAddress?.toLowerCase() ||
      String(intent.amountUnits) !== String(listed.tokenUnits) || intent.decimals !== listed.decimals) {
    throw new Error('The payment quote does not match the server catalog. No transaction was sent.');
  }
  upsertPending(pendingStorage, { intentId: intent.id, cosmeticId, txHash: null, createdAt: Date.now() });

  const txHash = await sendErc20Transfer(provider, intent);
  upsertPending(pendingStorage, { intentId: intent.id, cosmeticId, txHash, createdAt: Date.now() });
  const confirmation = await confirmCryptoPayment(serverUrl, intent.id, txHash, { fetchImpl, storage });
  if (confirmation.ok !== true) throw new Error(confirmation.error ?? 'The server could not verify this payment.');
  if (confirmation.pending === true) {
    return { paid: false, pending: true, intent, txHash, confirmations: confirmation.confirmations ?? 0, confirmationsRequired: confirmation.confirmationsRequired ?? intent.confirmations };
  }
  removePending(pendingStorage, intent.id);
  const account = await getAccount(serverUrl, { fetchImpl, storage });
  return { paid: true, pending: false, intent, txHash, account, item: confirmation.item ?? null };
}

export async function retryCryptoConfirmation(serverUrl, { intentId, txHash }, options = {}) {
  if (typeof intentId !== 'string' || typeof txHash !== 'string') throw new TypeError('A payment intent id and transaction hash are required.');
  const confirmation = await confirmCryptoPayment(serverUrl, intentId, txHash, options);
  if (confirmation.ok !== true) throw new Error(confirmation.error ?? 'The server could not verify this payment.');
  return confirmation;
}

export function pendingCryptoPayments(storage = globalThis.sessionStorage) {
  return readPending(storage).filter((entry) => typeof entry.txHash === 'string');
}

export function forgetPendingCryptoPayment(intentId, storage = globalThis.sessionStorage) {
  removePending(storage, intentId);
}
