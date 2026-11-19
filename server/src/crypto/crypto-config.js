// Crypto merchant-payment policy. This file never holds private keys, seed phrases or wallet custody.
import { COSMETIC_CATALOG } from '../account-service.js';

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const UINT = /^\d{1,78}$/;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const split = (value) => String(value ?? '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
const safeInt = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
};
const normalizeAddress = (value) => ADDRESS.test(String(value ?? '')) ? String(value).toLowerCase() : null;

function parsePrices(raw) {
  let parsed = {};
  try { parsed = JSON.parse(String(raw ?? '{}')); } catch { parsed = {}; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const known = new Set(COSMETIC_CATALOG.map((item) => item.id));
  return Object.fromEntries(Object.entries(parsed).filter(([id, amount]) =>
    known.has(id) && UINT.test(String(amount)) && BigInt(amount) > 0n
  ).map(([id, amount]) => [id, String(amount)]));
}

function rpcUrlAllowed(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch { return false; }
}

export function readCryptoPaymentConfig(env = process.env) {
  const licensedClasses = split(env.NIGHTHAWK_VASP_LICENSE_CLASSES);
  const transferClassListed = licensedClasses.includes('O');
  const enabled = env.NIGHTHAWK_CRYPTO_PAYMENTS_ENABLED === 'true' && transferClassListed;
  const chainId = safeInt(env.NIGHTHAWK_CRYPTO_CHAIN_ID, 0, 1, 0x7fffffff);
  const tokenAddress = normalizeAddress(env.NIGHTHAWK_CRYPTO_TOKEN_ADDRESS);
  const treasuryAddress = normalizeAddress(env.NIGHTHAWK_CRYPTO_TREASURY_ADDRESS);
  const rpcUrl = String(env.NIGHTHAWK_CRYPTO_RPC_URL ?? '').trim();
  const decimals = safeInt(env.NIGHTHAWK_CRYPTO_TOKEN_DECIMALS, 6, 0, 18);
  const confirmations = safeInt(env.NIGHTHAWK_CRYPTO_CONFIRMATIONS, 12, 1, 256);
  const prices = parsePrices(env.NIGHTHAWK_CRYPTO_PRICE_UNITS);
  const symbol = String(env.NIGHTHAWK_CRYPTO_TOKEN_SYMBOL ?? 'USDC').replace(/[^A-Z0-9]/gi, '').slice(0, 12).toUpperCase() || 'TOKEN';
  const ttlMs = safeInt(env.NIGHTHAWK_CRYPTO_INTENT_TTL_MS, 10 * 60_000, 60_000, 30 * 60_000);

  const configured = chainId > 0 && tokenAddress && treasuryAddress && rpcUrlAllowed(rpcUrl) &&
    Object.keys(prices).length > 0;

  return {
    enabled: Boolean(enabled && configured),
    reason: !env.NIGHTHAWK_CRYPTO_PAYMENTS_ENABLED || env.NIGHTHAWK_CRYPTO_PAYMENTS_ENABLED !== 'true'
      ? 'payments-disabled'
      : !transferClassListed ? 'required-vasp-class-not-declared'
      : !configured ? 'merchant-chain-configuration-incomplete' : null,
    licensedClasses,
    chainId, tokenAddress, treasuryAddress, rpcUrlAllowed: rpcUrlAllowed(rpcUrl),
    rpcUrl, decimals, confirmations, prices, symbol, ttlMs,
  };
}

export function publicCryptoConfig(config) {
  return {
    enabled: config.enabled,
    reason: config.reason,
    chainId: config.chainId,
    tokenAddress: config.tokenAddress,
    treasuryAddress: config.treasuryAddress,
    tokenSymbol: config.symbol,
    decimals: config.decimals,
    confirmations: config.confirmations,
    catalog: COSMETIC_CATALOG.filter((item) => config.prices[item.id]).map((item) => ({
      id: item.id, name: item.name, type: item.type, tokenUnits: config.prices[item.id],
      symbol: config.symbol, decimals: config.decimals, cosmeticOnly: true,
    })),
    custody: false,
    exchange: false,
    tokenIssuance: false,
    staking: false,
    playerWagering: false,
  };
}

export const ERC20_TRANSFER_TOPIC = TRANSFER_TOPIC;
export const isEvmAddress = (value) => !!normalizeAddress(value);
export const normalizeEvmAddress = normalizeAddress;
