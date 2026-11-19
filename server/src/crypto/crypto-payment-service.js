// Direct, non-custodial ERC-20 merchant checkout.
// The player wallet signs a transfer directly to the merchant treasury.
// The server reads chain data and grants the item only after receipt verification.
import { randomUUID } from 'node:crypto';
import { AccountService } from '../account-service.js';
import { ERC20_TRANSFER_TOPIC, readCryptoPaymentConfig, normalizeEvmAddress } from './crypto-config.js';

const MAX_HASH = /^0x[a-fA-F0-9]{64}$/;
const asBigInt = (value) => {
  try { return BigInt(value); } catch { return null; }
};
const topicAddress = (topic) => {
  if (typeof topic !== 'string' || !/^0x0{24}[a-fA-F0-9]{40}$/.test(topic)) return null;
  return `0x${topic.slice(-40)}`.toLowerCase();
};
const hex = (value) => typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value);
const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

export class CryptoPaymentService {
  constructor({ accounts = new AccountService(), env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
    this.accounts = accounts;
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.config = readCryptoPaymentConfig(env);
    this.rpcId = 0;
  }

  refreshConfig() { this.config = readCryptoPaymentConfig(this.env); return this.config; }
  publicConfig() { return publicCryptoConfigSafe(this.config); }

  _requireEnabled() {
    this.refreshConfig();
    if (!this.config.enabled) {
      const error = new Error(this.config.reason ?? 'crypto-payments-disabled');
      error.status = 503;
      throw error;
    }
    return this.config;
  }

  async _rpc(method, params) {
    const config = this._requireEnabled();
    if (typeof this.fetchImpl !== 'function') throw new Error('Server fetch is unavailable');
    const response = await this.fetchImpl(config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++this.rpcId, method, params }),
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) throw new Error(`rpc-http-${response.status}`);
    const body = await response.json();
    if (body?.error) throw new Error(`rpc-${String(body.error.message ?? 'error').slice(0, 160)}`);
    if (!Object.prototype.hasOwnProperty.call(body ?? {}, 'result')) throw new Error('rpc-invalid-response');
    return body.result;
  }

  createIntent(sessionToken, { cosmeticId, walletAddress } = {}) {
    const config = this._requireEnabled();
    const wallet = normalizeEvmAddress(walletAddress);
    if (!wallet) {
      const error = new Error('invalid-wallet-address'); error.status = 400; throw error;
    }
    const amountUnits = config.prices[cosmeticId];
    if (!amountUnits) {
      const error = new Error('cosmetic-not-enabled-for-crypto-checkout'); error.status = 404; throw error;
    }
    return this.accounts.createCryptoIntent(sessionToken, {
      cosmeticId,
      walletAddress: wallet,
      chainId: config.chainId,
      tokenAddress: config.tokenAddress,
      treasuryAddress: config.treasuryAddress,
      amountUnits,
      symbol: config.symbol,
      decimals: config.decimals,
      confirmations: config.confirmations,
      ttlMs: config.ttlMs,
    });
  }

  async _verifyTransfer(txHash, intent) {
    const config = this._requireEnabled();
    if (!MAX_HASH.test(String(txHash ?? ''))) return { ok: false, status: 400, error: 'invalid-transaction-hash' };
    const hash = txHash.toLowerCase();
    const [chainHex, tx, receipt] = await Promise.all([
      this._rpc('eth_chainId', []),
      this._rpc('eth_getTransactionByHash', [hash]),
      this._rpc('eth_getTransactionReceipt', [hash]),
    ]);
    const chainId = hex(chainHex) ? Number(BigInt(chainHex)) : 0;
    if (chainId !== config.chainId || chainId !== intent.chainId) return { ok: false, status: 409, error: 'wrong-chain' };
    if (!receipt || !tx) return { ok: true, pending: true, confirmations: 0 };

    if (!same(receipt.transactionHash, hash) || receipt.status !== '0x1') {
      return { ok: false, status: 409, error: 'transaction-not-successful' };
    }
    if (!same(tx.from, intent.walletAddress) || !same(tx.to, intent.tokenAddress)) {
      return { ok: false, status: 409, error: 'transaction-sender-or-contract-mismatch' };
    }

    const matching = (Array.isArray(receipt.logs) ? receipt.logs : []).filter((log) =>
      same(log.address, intent.tokenAddress) &&
      Array.isArray(log.topics) && log.topics.length >= 3 &&
      same(log.topics[0], ERC20_TRANSFER_TOPIC) &&
      same(topicAddress(log.topics[1]), intent.walletAddress) &&
      same(topicAddress(log.topics[2]), intent.treasuryAddress) &&
      hex(log.data) && asBigInt(log.data) === BigInt(intent.amountUnits)
    );
    if (matching.length !== 1) return { ok: false, status: 409, error: 'matching-token-transfer-not-found' };

    const blockNumberBig = asBigInt(receipt.blockNumber);
    if (blockNumberBig === null) return { ok: false, status: 409, error: 'invalid-receipt-block' };
    const latestHex = await this._rpc('eth_blockNumber', []);
    const latest = asBigInt(latestHex);
    if (latest === null || latest < blockNumberBig) return { ok: true, pending: true, confirmations: 0 };
    const confirmations = Number(latest - blockNumberBig + 1n);
    if (confirmations < intent.confirmations) return { ok: true, pending: true, confirmations };
    return {
      ok: true,
      pending: false,
      verified: {
        success: true,
        chainId,
        from: intent.walletAddress,
        tokenAddress: intent.tokenAddress,
        recipient: intent.treasuryAddress,
        amountUnits: intent.amountUnits,
        confirmations,
        blockNumber: Number(blockNumberBig),
      },
    };
  }

  async confirmIntent(sessionToken, intentId, txHash) {
    const config = this._requireEnabled();
    const intent = await this.accounts.getCryptoIntent(sessionToken, intentId);
    if (!intent) return { ok: false, status: 404, error: 'payment-intent-not-found' };
    if (intent.status === 'paid') return { ok: true, duplicate: true, intent };
    if (intent.status !== 'pending') return { ok: false, status: 409, error: 'payment-intent-not-pending' };
    if (intent.expiresAt <= this.now()) return { ok: false, status: 410, error: 'payment-intent-expired' };

    let checked;
    try { checked = await this._verifyTransfer(txHash, intent); }
    catch (error) {
      // RPC outages are retryable. A provider outage must not mark an order paid or failed.
      return { ok: false, status: 503, error: 'chain-verification-unavailable', detail: String(error?.message ?? error).slice(0, 120) };
    }
    if (!checked.ok) return checked;
    if (checked.pending) {
      return {
        ok: true, pending: true,
        intent: { id: intent.id, status: 'pending', txHash: String(txHash ?? '').toLowerCase() },
        confirmations: checked.confirmations,
        confirmationsRequired: config.confirmations,
      };
    }
    return this.accounts.confirmCryptoIntent(sessionToken, intentId, txHash, checked.verified);
  }
}

function publicCryptoConfigSafe(config) {
  return {
    enabled: config.enabled,
    reason: config.reason,
    chainId: config.chainId,
    tokenAddress: config.tokenAddress,
    treasuryAddress: config.treasuryAddress,
    tokenSymbol: config.symbol,
    decimals: config.decimals,
    confirmations: config.confirmations,
    catalog: Object.entries(config.prices).map(([id, tokenUnits]) => ({ id, tokenUnits, symbol: config.symbol, decimals: config.decimals })),
    custody: false, exchange: false, tokenIssuance: false, staking: false, playerWagering: false,
  };
}

export const makePaymentReference = () => randomUUID();
