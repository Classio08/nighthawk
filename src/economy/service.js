// The Economy facade: ONE place that combines the gate, ledger, earn, wager, wallet and NFT modules, and refuses anything the gate has not opened.
// The server creates one of these; the browser only ever calls the server's HTTP routes. Nothing here touches the network, the clock or randomness
// by itself: those are injected (`now`, `nonce`, `fetchFn`) so every path is unit-tested.
//
// What is implemented per mode (honest list):
//   off      nothing
//   sandbox  wallet proof, NFT cosmetic check on TEST chains, play-money (PLAY) ledger, faucet, server-recorded earn with caps, wager escrow in PLAY
//   live     wallet proof and NFT cosmetic check on LIVE chains (if the licence scope lists them). Real-value earn and real-value wagering are NOT implemented:
//            they need a settlement rail (a licensed payment provider or an audited on-chain escrow) that does not exist yet, so those calls refuse.
import { evaluate, evaluateForPlayer, sanitizeConfig } from './gate.js';
import { Ledger } from './ledger.js';
import { EarnBook } from './earn.js';
import { WagerBook, refundOrphanedEscrows } from './wager.js';
import { WalletAuth, normalizeAddress } from './wallet.js';
import { ownedCosmetics } from './nft.js';

export class EconomyClosed extends Error { constructor(why) { super(why); this.code = 'closed'; } }

export const FAUCET_AMOUNT = 1000, FAUCET_EVERY_SECS = 86400;

export class Economy {
  /**
   * @param {{config:object, env?:object, now:()=>number, secret:Uint8Array, domains?:string[], rpc?:{url:string, chainId:number, contract:string}, fetchFn?:Function, ledger?:Ledger}} o
   *   now() returns unix SECONDS
   */
  constructor({ config, env = {}, now, secret, domains = ['localhost'], rpc = null, fetchFn = globalThis.fetch, ledger = null }) {
    this.config = sanitizeConfig(config); this.env = env; this.now = now; this.rpc = rpc; this.fetchFn = fetchFn;
    this.ledger = ledger ?? new Ledger('PLAY');
    this.earnBook = new EarnBook({ ledger: this.ledger, rules: this.config.earn });
    this.wagers = new WagerBook({ ledger: this.ledger, limits: this.config.limits });
    this.auth = new WalletAuth({ domains, chainIds: [...new Set([...this.config.chains.sandbox, ...this.config.chains.live])], secret });
    this.faucetAt = new Map(); this.profiles = new Map();        // address -> {country, verifiedAge, kycVerified} (set only by a verified provider, never by the client)
  }

  today() { return new Date(this.now() * 1000).toISOString().slice(0, 10); }
  /** the gate decision RIGHT NOW (re-evaluated every call: an expired licence closes live on the next request) */
  state() { return evaluate(this.config, this.env, this.today()); }
  status() { const s = this.state(); return { mode: s.mode, features: s.features, currency: s.currency, realValue: s.realValue, chains: s.chains, reasons: s.reasons, limits: s.limits }; }

  _need(feature, addr = null) {
    const s = this.state();
    if (!s.features[feature]) throw new EconomyClosed(`${feature} is not enabled (${s.reasons[0] ?? s.mode})`);
    if (addr) {
      const p = evaluateForPlayer(s, this.config, { ...(this.profiles.get(addr) ?? {}), selfExcluded: this.wagers.isExcluded(addr, this.now()) });
      if (!p.ok) throw new EconomyClosed(`not allowed for this player: ${p.why.join(', ')}`);
    }
    return s;
  }
  _sandboxOnly(what) { const s = this.state(); if (s.currency !== 'PLAY') throw new EconomyClosed(`${what} exists only in sandbox play-money: no real-value rail is built`); return s; }

  /* ---- wallet ---- */
  walletChallenge({ domain, address, chainId }, nonce) { const s = this._need('wallet'); if (!s.chains.includes(chainId)) throw new EconomyClosed('chain not allowed in this mode'); return this.auth.challenge({ domain, address, chainId }, nonce, this.now()); }
  walletVerify({ nonce, signature }) { this._need('wallet'); return this.auth.verify({ nonce, signature }, this.now()); }
  /** token -> lowercase address, or null (also null when the wallet feature is closed) */
  identify(token) { return this.state().features.wallet ? this.auth.checkToken(token, this.now()) : null; }

  /* ---- balances ---- */
  balance(addr) { this._need('wallet'); return this.ledger.balance(`player:${normalizeAddress(addr)}`); }
  faucet(addr) {
    this._need('wallet'); this._sandboxOnly('the faucet'); const a = normalizeAddress(addr), t = this.now();
    if (this.wagers.isExcluded(a, t)) throw new EconomyClosed('self-excluded');
    const last = this.faucetAt.get(a) ?? -Infinity;
    if (t - last < FAUCET_EVERY_SECS) return { paid: 0, nextInSecs: Math.ceil(FAUCET_EVERY_SECS - (t - last)) };
    this.ledger.transfer(`faucet:${a}:${Math.floor(t / FAUCET_EVERY_SECS)}`, 'mint:faucet', `player:${a}`, FAUCET_AMOUNT, 'faucet', t);
    this.faucetAt.set(a, t);
    return { paid: FAUCET_AMOUNT, nextInSecs: FAUCET_EVERY_SECS };
  }

  /* ---- cosmetics (read-only NFT check) ---- */
  async cosmetics(addr) {
    const s = this._need('nft', normalizeAddress(addr));
    if (!this.rpc?.url || !this.rpc.contract) return { skins: [], tokens: [], note: 'no cosmetics contract configured' };
    if (!s.chains.includes(this.rpc.chainId)) throw new EconomyClosed('the configured chain is not allowed in this mode');
    return ownedCosmetics({ rpcUrl: this.rpc.url, chainId: this.rpc.chainId, contract: this.rpc.contract, address: addr }, this.fetchFn);
  }

  /* ---- earn: server-recorded results only ---- */
  awardMatch({ address, matchId, result }) {
    const s = this._need('earn', normalizeAddress(address)); this._sandboxOnly('earning');
    return this.earnBook.award({ playerId: normalizeAddress(address), matchId, source: 'server', result, t: this.now() });
  }

  /* ---- wager (sandbox PLAY only) ---- */
  wagerOpen({ id, stake, maxPlayers }) { this._need('wager'); this._sandboxOnly('wagering'); return this.wagers.open({ id, stake, maxPlayers }, this.now()); }
  wagerJoin(id, address) { const a = normalizeAddress(address); this._need('wager', a); this._sandboxOnly('wagering'); return this.wagers.join(id, a, this.now()); }
  wagerLeave(id, address) { return this.wagers.leave(id, normalizeAddress(address), this.now()); }          // leaving always works, even if the gate closed meanwhile
  wagerStart(id) { this._need('wager'); return this.wagers.start(id, this.now()); }
  wagerSettle(id, result) { return this.wagers.settle(id, result, this.now()); }                            // settling and refunding must work even if the gate has since closed
  wagerVoid(id, reason) { return this.wagers.void(id, reason, this.now()); }
  selfExclude(address, secs) { return this.wagers.selfExclude(normalizeAddress(address), this.now() + Math.max(0, Math.min(secs, 366 * 86400)), this.now()); }
  maintenance() { this.wagers.expire(this.now()); }

  /** everything that must survive a restart, as plain JSON */
  exportState() { return { v: 1, ledger: this.ledger.toJSON(), faucetAt: [...this.faucetAt], wager: this.wagers.exportState(), earnDays: [...this.earnBook.days] }; }
  /** load a saved state (call once, right after construction). Stakes left in escrow by a crash are refunded. @returns refunds made */
  importState(j) {
    if (!j || j.v !== 1) return 0;
    this.ledger = Ledger.fromJSON(j.ledger); this.earnBook.ledger = this.ledger; this.wagers.ledger = this.ledger;
    this.faucetAt = new Map(j.faucetAt ?? []); this.wagers.importState(j.wager); this.earnBook.days = new Map(j.earnDays ?? []);
    return refundOrphanedEscrows(this.ledger, this.now());
  }
  me(address) { const a = normalizeAddress(address); return { address: a, balance: this.ledger.balance(`player:${a}`), wager: this.wagers.summary(a, this.now()), currency: this.state().currency }; }
}
