// Server-only guest accounts, verified match rewards, cosmetic purchases and safehouse deeds.
// No passwords, email addresses, payment credentials or raw session tokens are written to disk.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultProfile, recordMatch, sanitizeProfile } from '../../src/profile.js';

const DAY = 24 * 60 * 60 * 1000;
const hash = (token) => createHash('sha256').update(String(token)).digest('hex');
const token = (bytes = 32) => randomBytes(bytes).toString('base64url');
const clampInt = (value, min, max) => Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : min;
const cleanName = (value) => String(value ?? '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 20);

export const COSMETIC_CATALOG = Object.freeze([
  { id: 'skin-carbon', name: 'Carbon Weave', type: 'weapon-skin', cost: 250, cosmeticOnly: true },
  { id: 'skin-damascus', name: 'Damascus', type: 'weapon-skin', cost: 450, cosmeticOnly: true },
  { id: 'skin-gold', name: 'Gold Finish', type: 'weapon-skin', cost: 650, cosmeticOnly: true },
  { id: 'skin-magma', name: 'Magma Reactive', type: 'weapon-skin', cost: 900, cosmeticOnly: true },
  { id: 'uniform-desert', name: 'Kavari Sand Uniform', type: 'uniform', cost: 500, cosmeticOnly: true },
  { id: 'uniform-night', name: 'Night Patrol Uniform', type: 'uniform', cost: 500, cosmeticOnly: true },
  { id: 'callsign-foil', name: 'Foil Callsign Plate', type: 'identity', cost: 300, cosmeticOnly: true },
]);

export const SAFEHOUSE_CATALOG = Object.freeze([
  { id: 'basin-yard', name: 'Basin Yard Safehouse', district: 'Basin Yard', cost: 1200, tier: 1 },
  { id: 'dry-river', name: 'Dry River Safehouse', district: 'Dry River', cost: 1500, tier: 1 },
  { id: 'relay-ridge', name: 'Relay Ridge Safehouse', district: 'Relay Ridge', cost: 1800, tier: 2 },
]);

function blankDatabase() {
  return { version: 1, accounts: {}, sessions: {}, roomTickets: {}, ledger: [], processedMatchIds: [], cryptoIntents: {}, processedCryptoTxs: [] };
}

function safeDatabase(raw) {
  const db = blankDatabase();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return db;
  if (raw.accounts && typeof raw.accounts === 'object' && !Array.isArray(raw.accounts)) {
    for (const [id, item] of Object.entries(raw.accounts)) {
      if (!item || typeof item !== 'object' || !/^[0-9a-f-]{36}$/i.test(id)) continue;
      db.accounts[id] = {
        id,
        displayName: cleanName(item.displayName) || `Operator-${id.slice(0, 4).toUpperCase()}`,
        createdAt: clampInt(item.createdAt, 0, 4e12),
        updatedAt: clampInt(item.updatedAt, 0, 4e12),
        profile: sanitizeProfile(item.profile),
        intelCredits: clampInt(item.intelCredits, 0, 1e9),
        cosmetics: [...new Set((Array.isArray(item.cosmetics) ? item.cosmetics : []).filter((x) => typeof x === 'string' && /^[a-z0-9-]{2,48}$/.test(x)))].slice(0, 100),
        equipped: item.equipped && typeof item.equipped === 'object' ? {
          weaponSkin: typeof item.equipped.weaponSkin === 'string' ? item.equipped.weaponSkin : null,
          uniform: typeof item.equipped.uniform === 'string' ? item.equipped.uniform : null,
          identity: typeof item.equipped.identity === 'string' ? item.equipped.identity : null,
        } : { weaponSkin: null, uniform: null, identity: null },
        safehouses: Array.isArray(item.safehouses) ? [...new Set(item.safehouses.filter((x) => SAFEHOUSE_CATALOG.some((b) => b.id === x)))].slice(0, 3) : [],
        wallets: Array.isArray(item.wallets) ? [...new Set(item.wallets.filter((x) => typeof x === 'string' && /^0x[a-f0-9]{40}$/i.test(x)).map((x) => x.toLowerCase()))].slice(0, 8) : [],
        campaign: item.campaign && typeof item.campaign === 'object' && !Array.isArray(item.campaign) ? item.campaign : { completed: [], reputation: {} },
        purchaseRequests: Array.isArray(item.purchaseRequests) ? [...new Set(item.purchaseRequests.filter((x) => typeof x === 'string'))].slice(-200) : [],
      };
    }
  }
  if (raw.sessions && typeof raw.sessions === 'object' && !Array.isArray(raw.sessions)) {
    for (const [key, value] of Object.entries(raw.sessions)) {
      if (/^[a-f0-9]{64}$/.test(key) && value && db.accounts[value.accountId]) {
        db.sessions[key] = { accountId: value.accountId, expiresAt: clampInt(value.expiresAt, 0, 4e12) };
      }
    }
  }
  if (raw.roomTickets && typeof raw.roomTickets === 'object' && !Array.isArray(raw.roomTickets)) {
    for (const [key, value] of Object.entries(raw.roomTickets)) {
      if (/^[a-f0-9]{64}$/.test(key) && value && db.accounts[value.accountId]) {
        db.roomTickets[key] = { accountId: value.accountId, expiresAt: clampInt(value.expiresAt, 0, 4e12) };
      }
    }
  }
  db.ledger = Array.isArray(raw.ledger) ? raw.ledger.slice(-2000).filter((entry) => entry && typeof entry === 'object').map((entry) => ({
    id: String(entry.id ?? '').slice(0, 80), accountId: String(entry.accountId ?? '').slice(0, 64),
    kind: String(entry.kind ?? '').slice(0, 32), amount: clampInt(entry.amount, -1e7, 1e7),
    reference: String(entry.reference ?? '').slice(0, 80), at: clampInt(entry.at, 0, 4e12),
    asset: typeof entry.asset === 'string' ? entry.asset.slice(0, 12) : undefined,
    tokenUnits: typeof entry.tokenUnits === 'string' && /^\d{1,78}$/.test(entry.tokenUnits) ? entry.tokenUnits : undefined,
    txHash: typeof entry.txHash === 'string' && /^0x[a-f0-9]{64}$/i.test(entry.txHash) ? entry.txHash.toLowerCase() : undefined,
  })) : [];
  db.processedMatchIds = Array.isArray(raw.processedMatchIds) ? [...new Set(raw.processedMatchIds.filter((x) => typeof x === 'string'))].slice(-10000) : [];
  db.processedCryptoTxs = Array.isArray(raw.processedCryptoTxs) ? [...new Set(raw.processedCryptoTxs.filter((x) => typeof x === 'string' && /^0x[a-f0-9]{64}$/i.test(x)).map((x) => x.toLowerCase()))].slice(-10000) : [];
  if (raw.cryptoIntents && typeof raw.cryptoIntents === 'object' && !Array.isArray(raw.cryptoIntents)) {
    for (const [id, row] of Object.entries(raw.cryptoIntents)) {
      if (!/^[0-9a-f-]{36}$/i.test(id) || !row || typeof row !== 'object' || !db.accounts[row.accountId]) continue;
      if (!COSMETIC_CATALOG.some((item) => item.id === row.cosmeticId)) continue;
      if (!/^0x[a-f0-9]{40}$/i.test(row.walletAddress ?? '') || !/^0x[a-f0-9]{40}$/i.test(row.tokenAddress ?? '') || !/^0x[a-f0-9]{40}$/i.test(row.treasuryAddress ?? '')) continue;
      if (!/^\d{1,78}$/.test(String(row.amountUnits ?? '')) || !Number.isInteger(row.chainId) || row.chainId < 1) continue;
      db.cryptoIntents[id] = {
        id, accountId: row.accountId, cosmeticId: row.cosmeticId,
        walletAddress: row.walletAddress.toLowerCase(), tokenAddress: row.tokenAddress.toLowerCase(), treasuryAddress: row.treasuryAddress.toLowerCase(),
        amountUnits: String(row.amountUnits), symbol: String(row.symbol ?? 'TOKEN').slice(0, 12), decimals: clampInt(row.decimals, 0, 18),
        chainId: row.chainId, confirmations: clampInt(row.confirmations, 1, 256),
        createdAt: clampInt(row.createdAt, 0, 4e12), expiresAt: clampInt(row.expiresAt, 0, 4e12),
        status: ['pending', 'paid', 'expired'].includes(row.status) ? row.status : 'pending',
        txHash: /^0x[a-f0-9]{64}$/i.test(row.txHash ?? '') ? row.txHash.toLowerCase() : null,
        blockNumber: Number.isInteger(row.blockNumber) ? clampInt(row.blockNumber, 0, 1e12) : null,
        confirmedAt: clampInt(row.confirmedAt, 0, 4e12),
      };
    }
  }
  return db;
}

function publicAccount(account) {
  return {
    id: account.id,
    displayName: account.displayName,
    createdAt: account.createdAt,
    profile: account.profile,
    intelCredits: account.intelCredits,
    cosmetics: account.cosmetics,
    equipped: account.equipped,
    safehouses: account.safehouses.map((id) => SAFEHOUSE_CATALOG.find((base) => base.id === id)).filter(Boolean),
    wallets: [...account.wallets],
    campaign: account.campaign,
  };
}

export class AccountService {
  constructor({ dataDir = process.env.NIGHTHAWK_DATA_DIR || path.resolve('var/nighthawk'), now = () => Date.now() } = {}) {
    this.file = path.join(dataDir, 'accounts.json');
    this.now = now;
    this.state = blankDatabase();
    this.loadPromise = null;
    this.queue = Promise.resolve();
  }

  async _load() {
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        try { this.state = safeDatabase(JSON.parse(await readFile(this.file, 'utf8'))); }
        catch (error) { if (error.code !== 'ENOENT') throw error; this.state = blankDatabase(); }
      })();
    }
    return this.loadPromise;
  }

  async _flush() {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(this.state), { mode: 0o600 });
    await rename(temporary, this.file);
  }

  _mutate(operation) {
    const current = this.queue.then(async () => {
      await this._load();
      const result = await operation(this.state);
      await this._flush();
      return result;
    });
    this.queue = current.then(() => undefined, () => undefined);
    return current;
  }

  async _read(operation) {
    await this.queue;
    await this._load();
    return operation(this.state);
  }

  _session(state, sessionToken) {
    if (typeof sessionToken !== 'string' || sessionToken.length < 32 || sessionToken.length > 256) return null;
    const key = hash(sessionToken), row = state.sessions[key];
    if (!row || row.expiresAt <= this.now() || !state.accounts[row.accountId]) return null;
    return state.accounts[row.accountId];
  }

  async createGuest({ displayName } = {}) {
    const sessionToken = token();
    const now = this.now();
    return this._mutate((state) => {
      const id = randomUUID();
      const account = {
        id, displayName: cleanName(displayName) || `Operator-${id.slice(0, 4).toUpperCase()}`,
        createdAt: now, updatedAt: now, profile: defaultProfile(now), intelCredits: 0,
        cosmetics: [], equipped: { weaponSkin: null, uniform: null, identity: null },
        safehouses: [], wallets: [], campaign: { completed: [], reputation: {} }, purchaseRequests: [],
      };
      state.accounts[id] = account;
      state.sessions[hash(sessionToken)] = { accountId: id, expiresAt: now + 365 * DAY };
      return { sessionToken, account: publicAccount(account) };
    });
  }

  async getAccount(sessionToken) {
    return this._read((state) => {
      const account = this._session(state, sessionToken);
      return account ? publicAccount(account) : null;
    });
  }

  async revokeSession(sessionToken) {
    return this._mutate((state) => {
      if (typeof sessionToken !== 'string') return false;
      return delete state.sessions[hash(sessionToken)];
    });
  }

  async createRoomTicket(sessionToken) {
    const roomTicket = token(24), now = this.now();
    return this._mutate((state) => {
      const account = this._session(state, sessionToken);
      if (!account) return null;
      state.roomTickets[hash(roomTicket)] = { accountId: account.id, expiresAt: now + 60 * 1000 };
      return roomTicket;
    });
  }

  async consumeRoomTicket(roomTicket) {
    return this._mutate((state) => {
      if (typeof roomTicket !== 'string' || roomTicket.length < 24 || roomTicket.length > 256) return null;
      const key = hash(roomTicket), row = state.roomTickets[key];
      delete state.roomTickets[key];
      if (!row || row.expiresAt <= this.now() || !state.accounts[row.accountId]) return null;
      return { accountId: row.accountId };
    });
  }

  // Called only by MatchRoom after the shared server Simulation emits an authoritative result.
  async recordServerMatch(accountId, result, matchId) {
    const now = this.now();
    return this._mutate((state) => {
      const account = state.accounts[accountId];
      if (!account || typeof matchId !== 'string' || matchId.length < 4 || matchId.length > 100) return null;
      if (state.processedMatchIds.includes(matchId)) return { applied: false, reason: 'duplicate-match', account: publicAccount(account) };
      const summary = {
        placement: clampInt(result?.placement, 1, 64),
        total: clampInt(result?.total, 2, 64),
        kills: clampInt(result?.kills, 0, 64),
        time: clampInt(result?.time, 0, 86400),
        won: result?.won === true,
      };
      const recorded = recordMatch(account.profile, summary, now);
      account.profile = recorded.profile;
      const placementReward = Math.max(0, summary.total - summary.placement) * 3;
      const creditReward = Math.min(80, 15 + placementReward + Math.min(20, summary.kills * 2) + (summary.won ? 25 : 0));
      account.intelCredits = clampInt(account.intelCredits + creditReward, 0, 1e9);
      account.updatedAt = now;
      state.processedMatchIds.push(matchId);
      state.processedMatchIds = state.processedMatchIds.slice(-10000);
      state.ledger.push({ id: randomUUID(), accountId, kind: 'match-reward', amount: creditReward, reference: matchId, at: now });
      state.ledger = state.ledger.slice(-2000);
      return { applied: true, xp: recorded.gain.xp, creditsEarned: creditReward, account: publicAccount(account) };
    });
  }

  async purchaseCosmetic(sessionToken, cosmeticId, requestId) {
    const now = this.now();
    return this._mutate((state) => {
      const account = this._session(state, sessionToken);
      const item = COSMETIC_CATALOG.find((entry) => entry.id === cosmeticId);
      if (!account) return { ok: false, status: 401, error: 'session-expired' };
      if (!item) return { ok: false, status: 404, error: 'unknown-cosmetic' };
      if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) return { ok: false, status: 400, error: 'invalid-request-id' };
      if (account.purchaseRequests.includes(requestId)) return { ok: true, duplicate: true, account: publicAccount(account) };
      if (account.cosmetics.includes(cosmeticId)) return { ok: false, status: 409, error: 'already-owned' };
      if (Object.values(state.cryptoIntents).some((intent) => intent.accountId === account.id && intent.cosmeticId === cosmeticId && intent.status === 'pending' && intent.expiresAt > now)) return { ok: false, status: 409, error: 'crypto-checkout-pending' };
      if (account.intelCredits < item.cost) return { ok: false, status: 409, error: 'not-enough-intel-credits' };
      account.intelCredits -= item.cost;
      account.cosmetics.push(cosmeticId);
      account.purchaseRequests.push(requestId);
      account.purchaseRequests = account.purchaseRequests.slice(-200);
      if (item.type === 'weapon-skin') account.equipped.weaponSkin = cosmeticId;
      if (item.type === 'uniform') account.equipped.uniform = cosmeticId;
      if (item.type === 'identity') account.equipped.identity = cosmeticId;
      account.updatedAt = now;
      state.ledger.push({ id: randomUUID(), accountId: account.id, kind: 'cosmetic-purchase', amount: -item.cost, reference: cosmeticId, at: now });
      state.ledger = state.ledger.slice(-2000);
      return { ok: true, item, account: publicAccount(account) };
    });
  }

  async purchaseSafehouse(sessionToken, safehouseId, requestId) {
    const now = this.now();
    return this._mutate((state) => {
      const account = this._session(state, sessionToken);
      const base = SAFEHOUSE_CATALOG.find((entry) => entry.id === safehouseId);
      if (!account) return { ok: false, status: 401, error: 'session-expired' };
      if (!base) return { ok: false, status: 404, error: 'unknown-safehouse' };
      if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) return { ok: false, status: 400, error: 'invalid-request-id' };
      if (account.purchaseRequests.includes(requestId)) return { ok: true, duplicate: true, account: publicAccount(account) };
      if (account.safehouses.includes(safehouseId)) return { ok: false, status: 409, error: 'already-owned' };
      if (account.safehouses.length >= 1) return { ok: false, status: 409, error: 'safehouse-slot-full' };
      if (account.intelCredits < base.cost) return { ok: false, status: 409, error: 'not-enough-intel-credits' };
      account.intelCredits -= base.cost;
      account.safehouses.push(safehouseId);
      account.purchaseRequests.push(requestId);
      account.purchaseRequests = account.purchaseRequests.slice(-200);
      account.updatedAt = now;
      state.ledger.push({ id: randomUUID(), accountId: account.id, kind: 'safehouse-deed', amount: -base.cost, reference: safehouseId, at: now });
      state.ledger = state.ledger.slice(-2000);
      return { ok: true, safehouse: base, account: publicAccount(account) };
    });
  }

  async createCryptoIntent(sessionToken, quote) {
    const now = this.now();
    return this._mutate((state) => {
      const account = this._session(state, sessionToken);
      const item = COSMETIC_CATALOG.find((entry) => entry.id === quote?.cosmeticId);
      if (!account) return { ok: false, status: 401, error: 'session-expired' };
      if (!item) return { ok: false, status: 404, error: 'unknown-cosmetic' };
      if (account.cosmetics.includes(item.id)) return { ok: false, status: 409, error: 'already-owned' };
      if (Object.values(state.cryptoIntents).some((intent) => intent.accountId === account.id && intent.cosmeticId === item.id && intent.status === 'pending' && intent.expiresAt > now)) {
        return { ok: false, status: 409, error: 'crypto-checkout-pending' };
      }
      const address = (value) => typeof value === 'string' && /^0x[a-f0-9]{40}$/i.test(value);
      if (!address(quote.walletAddress) || !address(quote.tokenAddress) || !address(quote.treasuryAddress)) return { ok: false, status: 400, error: 'invalid-wallet-quote' };
      if (!/^\d{1,78}$/.test(String(quote.amountUnits ?? '')) || BigInt(quote.amountUnits) <= 0n) return { ok: false, status: 400, error: 'invalid-payment-amount' };
      if (!Number.isInteger(quote.chainId) || quote.chainId < 1) return { ok: false, status: 400, error: 'invalid-payment-chain' };
      const id = randomUUID();
      const intent = {
        id, accountId: account.id, cosmeticId: item.id,
        walletAddress: quote.walletAddress.toLowerCase(),
        tokenAddress: quote.tokenAddress.toLowerCase(),
        treasuryAddress: quote.treasuryAddress.toLowerCase(),
        amountUnits: String(quote.amountUnits),
        symbol: String(quote.symbol ?? 'TOKEN').slice(0, 12),
        decimals: clampInt(quote.decimals, 0, 18),
        chainId: quote.chainId,
        confirmations: clampInt(quote.confirmations, 1, 256),
        createdAt: now,
        expiresAt: now + clampInt(quote.ttlMs, 60_000, 30 * 60_000),
        status: 'pending', txHash: null, blockNumber: null, confirmedAt: 0,
      };
      state.cryptoIntents[id] = intent;
      return {
        ok: true,
        intent: {
          id, cosmetic: { id: item.id, name: item.name },
          chainId: intent.chainId, tokenAddress: intent.tokenAddress,
          treasuryAddress: intent.treasuryAddress, walletAddress: intent.walletAddress,
          amountUnits: intent.amountUnits, symbol: intent.symbol, decimals: intent.decimals,
          confirmations: intent.confirmations, expiresAt: intent.expiresAt,
        },
      };
    });
  }

  async getCryptoIntent(sessionToken, intentId) {
    return this._read((state) => {
      const account = this._session(state, sessionToken);
      if (!account) return null;
      const intent = state.cryptoIntents[intentId];
      if (!intent || intent.accountId !== account.id) return null;
      return {
        id: intent.id, cosmeticId: intent.cosmeticId, status: intent.status,
        amountUnits: intent.amountUnits, symbol: intent.symbol, decimals: intent.decimals,
        txHash: intent.txHash, blockNumber: intent.blockNumber,
        confirmations: intent.confirmations, expiresAt: intent.expiresAt,
      };
    });
  }

  async confirmCryptoIntent(sessionToken, intentId, txHash, verified) {
    const now = this.now();
    return this._mutate((state) => {
      const account = this._session(state, sessionToken);
      if (!account) return { ok: false, status: 401, error: 'session-expired' };
      const intent = state.cryptoIntents[intentId];
      if (!intent || intent.accountId !== account.id) return { ok: false, status: 404, error: 'payment-intent-not-found' };
      const hashValue = String(txHash ?? '').toLowerCase();
      if (!/^0x[a-f0-9]{64}$/.test(hashValue)) return { ok: false, status: 400, error: 'invalid-transaction-hash' };
      if (intent.status === 'paid' && intent.txHash === hashValue) return { ok: true, duplicate: true, account: publicAccount(account), intent: { id: intent.id, status: intent.status, txHash: intent.txHash } };
      if (intent.status !== 'pending') return { ok: false, status: 409, error: 'payment-intent-not-pending' };
      if (intent.expiresAt <= now) { intent.status = 'expired'; return { ok: false, status: 410, error: 'payment-intent-expired' }; }
      if (state.processedCryptoTxs.includes(hashValue)) return { ok: false, status: 409, error: 'transaction-already-used' };
      const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
      if (!verified || verified.success !== true || verified.chainId !== intent.chainId ||
          !same(verified.from, intent.walletAddress) || !same(verified.tokenAddress, intent.tokenAddress) ||
          !same(verified.recipient, intent.treasuryAddress) || String(verified.amountUnits) !== intent.amountUnits ||
          !Number.isInteger(verified.confirmations) || verified.confirmations < intent.confirmations) {
        return { ok: false, status: 409, error: 'payment-verification-mismatch' };
      }
      const item = COSMETIC_CATALOG.find((entry) => entry.id === intent.cosmeticId);
      if (!item) return { ok: false, status: 409, error: 'cosmetic-no-longer-available' };
      if (!account.cosmetics.includes(item.id)) account.cosmetics.push(item.id);
      if (item.type === 'weapon-skin') account.equipped.weaponSkin = item.id;
      if (item.type === 'uniform') account.equipped.uniform = item.id;
      if (item.type === 'identity') account.equipped.identity = item.id;
      if (!account.wallets.includes(intent.walletAddress)) account.wallets.push(intent.walletAddress);
      account.wallets = account.wallets.slice(0, 8);
      account.updatedAt = now;
      intent.status = 'paid'; intent.txHash = hashValue; intent.blockNumber = verified.blockNumber ?? null; intent.confirmedAt = now;
      state.processedCryptoTxs.push(hashValue); state.processedCryptoTxs = state.processedCryptoTxs.slice(-10000);
      state.ledger.push({
        id: randomUUID(), accountId: account.id, kind: 'crypto-cosmetic-purchase', amount: 0,
        reference: item.id, at: now, asset: intent.symbol, tokenUnits: intent.amountUnits, txHash: hashValue,
      });
      state.ledger = state.ledger.slice(-2000);
      return { ok: true, duplicate: false, item, account: publicAccount(account), intent: { id: intent.id, status: intent.status, txHash: intent.txHash } };
    });
  }

  async snapshot() {
    return this._read((state) => ({ accounts: Object.keys(state.accounts).length, ledgerEntries: state.ledger.length, activeSessions: Object.keys(state.sessions).length }));
  }
}

export const accountService = new AccountService();
