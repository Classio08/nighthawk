// Server side of the economy: loads the compliance gate, keeps the play-money ledger on disk, exposes a few small JSON routes, and hooks match results.
// Default build = economy OFF: no route does anything but report "off", no staked room exists, and MatchRoom behaves exactly as before.
// Turn on the play-money sandbox for testing:  NIGHTHAWK_ECONOMY=sandbox npm run server   (or  npm run host -- --economy=sandbox)
// Real value: only data/compliance.json can ask for it and only a recorded licence can open it (src/economy/gate.js), and even then no real-value
// earn/wager rail exists (see docs/ECONOMY.md).
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Economy, EconomyClosed } from '../../src/economy/service.js';
import { sanitizeConfig, FEATURES } from '../../src/economy/gate.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MAX_BODY = 4096;

function readJson(req) {
  const contentType = String(req.headers?.['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') return Promise.reject(new Error('content type must be application/json'));
  return new Promise((resolveBody, reject) => {
    let n = 0, settled = false; const chunks = [];
    req.on('data', (chunk) => {
      if (settled) return;
      n += chunk.length;
      if (n > MAX_BODY) { settled = true; reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      try {
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('body must be an object');
        settled = true; resolveBody(body);
      } catch { settled = true; reject(new Error('bad json')); }
    });
    req.on('error', (error) => { if (!settled) { settled = true; reject(error); } });
  });
}

export class ServerEconomy {
  /** @param {{env?:object, configFile?:string, dbFile?:string, now?:()=>number, fetchFn?:Function}} o */
  constructor({ env = process.env, configFile, dbFile, now = () => Date.now() / 1000, fetchFn } = {}) {
    let raw = {}; const file = configFile ?? env.COMPLIANCE_FILE ?? resolve(ROOT, 'data/compliance.json');
    try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch { raw = {}; }                         // unreadable config = closed
    let cfg = sanitizeConfig(raw);
    if (env.NIGHTHAWK_ECONOMY === 'sandbox' && cfg.mode === 'off') cfg = { ...cfg, mode: 'sandbox', features: Object.fromEntries(FEATURES.map((k) => [k, true])) };   // a quick switch for testing; it can NEVER request live
    this.env = env; this.cfg = cfg; this.now = now;
    let rpc = null;
    if (env.ECONOMY_RPC_URL && env.ECONOMY_NFT_CONTRACT) {
      try {
        const endpoint = new URL(env.ECONOMY_RPC_URL);
        const loopback = ['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname.toLowerCase());
        const secure = endpoint.protocol === 'https:' || (cfg.mode === 'sandbox' && endpoint.protocol === 'http:' && loopback);
        const chainId = Number(env.ECONOMY_CHAIN_ID ?? 11155111);
        if (secure && !endpoint.username && !endpoint.password && /^0x[0-9a-f]{40}$/i.test(env.ECONOMY_NFT_CONTRACT) && Number.isSafeInteger(chainId) && chainId > 0) {
          rpc = { url: endpoint.toString(), chainId, contract: env.ECONOMY_NFT_CONTRACT };
        } else console.error('economy: ignored unsafe or malformed NFT RPC configuration');
      } catch { console.error('economy: ignored malformed NFT RPC URL'); }
    }
    const domains = (env.ECONOMY_DOMAINS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const secret = env.ECONOMY_SECRET && /^(?:[0-9a-f]{2}){32,}$/i.test(env.ECONOMY_SECRET) ? Uint8Array.from(Buffer.from(env.ECONOMY_SECRET, 'hex')) : randomBytes(32);
    this.economy = new Economy({ config: cfg, env, now, secret, domains: domains.length ? domains : ['localhost', '127.0.0.1', '::1'], rpc, fetchFn });
    this.dbFile = dbFile ?? env.ECONOMY_DB ?? resolve(ROOT, 'data/economy-sandbox.json');
    this.hits = new Map(); this.timer = null; this.dirty = false;
    if (this.enabled) this._load();
  }

  get enabled() { return this.economy.state().mode !== 'off'; }
  status() { return this.economy.status(); }
  identify(token) { try { return this.economy.identify(token); } catch { return null; } }

  _load() {
    try {
      if (existsSync(this.dbFile)) { const n = this.economy.importState(JSON.parse(readFileSync(this.dbFile, 'utf8'))); if (n) console.log(`economy: refunded ${n} stake(s) left in escrow by the last run`); }
    } catch (e) { console.error(`economy: could not read ${this.dbFile} (${e.message}); starting with an empty sandbox ledger`); }
  }
  save() {
    if (!this.enabled) return;
    try { mkdirSync(dirname(this.dbFile), { recursive: true }); const tmp = `${this.dbFile}.tmp`; writeFileSync(tmp, JSON.stringify(this.economy.exportState())); renameSync(tmp, this.dbFile); this.dirty = false; }
    catch (e) { console.error(`economy: save failed: ${e.message}`); }
  }
  saveSoon() { this.dirty = true; }
  start() {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => { try { this.economy.maintenance(); } catch { /* ignore */ } if (this.dirty) this.save(); }, 10000); this.timer.unref?.();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.save(); }

  _limited(req) {
    const ip = String(req.ip ?? req.socket?.remoteAddress ?? '?').slice(0, 128), now = Date.now();
    let bucket = this.hits.get(ip);
    if (bucket && bucket.reset <= now) { this.hits.delete(ip); bucket = null; }
    if (!bucket) {
      if (this.hits.size >= 5000) {
        for (const [key, entry] of this.hits) if (entry.reset <= now) this.hits.delete(key);
        // Do not clear every user's bucket when an attacker rotates source addresses.
        if (this.hits.size >= 5000) return true;
      }
      bucket = { n: 0, reset: now + 60000 };
      this.hits.set(ip, bucket);
    }
    return ++bucket.n > 40;
  }

  /** mounts /economy/* on the game server's express app */
  attach(app) {
    const send = (res, code, body) => res.status(code).set('Cache-Control', 'no-store').json(body);
    const guard = (fn) => async (req, res) => {
      if (this._limited(req)) return send(res, 429, { error: 'slow down' });
      try { await fn(req, res); }
      catch (e) {
        if (e instanceof EconomyClosed) return send(res, 403, { error: 'closed', why: e.message });
        return send(res, 400, { error: 'bad request' });                                               // never leak internals
      }
    };
    const who = (req) => { const m = /^Bearer (\S+)$/.exec(req.get('authorization') ?? ''); const a = m ? this.identify(m[1]) : null; if (!a) throw Object.assign(new Error('auth'), { code: 'auth' }); return a; };
    const authed = (fn) => guard(async (req, res) => { let a; try { a = who(req); } catch { return send(res, 401, { error: 'sign in with your wallet first' }); } await fn(req, res, a); });

    app.get('/economy/status', (_req, res) => send(res, 200, this.status()));
    app.post('/economy/wallet/challenge', guard(async (req, res) => {
      const b = await readJson(req), host = String(req.hostname ?? '').toLowerCase();
      const origin = req.get?.('origin');
      if (origin) {
        let parsed;
        try { parsed = new URL(origin); } catch { throw new Error('invalid origin'); }
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.hostname.toLowerCase() !== host || parsed.username || parsed.password) {
          throw new Error('origin does not match request host');
        }
      }
      // The domain must already be explicitly configured; never learn/trust domains from Host headers.
      send(res, 200, this.economy.walletChallenge({ domain: host, address: String(b.address ?? ''), chainId: Number(b.chainId) }, randomBytes(16).toString('hex')));
    }));
    app.post('/economy/wallet/verify', guard(async (req, res) => {
      const b = await readJson(req), v = this.economy.walletVerify({ nonce: String(b.nonce ?? ''), signature: String(b.signature ?? '') });
      if (!v.ok) return send(res, 401, { error: v.why });
      send(res, 200, { address: v.address, token: v.token, tokenExp: v.tokenExp, ...this.economy.me(v.address) });
    }));
    app.get('/economy/me', authed(async (_req, res, a) => {
      let skins = []; try { skins = (await this.economy.cosmetics(a)).skins; } catch { /* nft feature off or RPC down: no extra cosmetics */ }
      send(res, 200, { ...this.economy.me(a), skins, status: this.status() });
    }));
    app.post('/economy/faucet', authed(async (_req, res, a) => { const r = this.economy.faucet(a); this.saveSoon(); send(res, 200, { ...r, ...this.economy.me(a) }); }));
    app.post('/economy/exclude', authed(async (req, res, a) => { const b = await readJson(req); const days = Math.max(1, Math.min(366, Math.trunc(Number(b.days) || 1))); this.economy.selfExclude(a, days * 86400); this.saveSoon(); send(res, 200, this.economy.me(a)); }));
  }

  /** match finished (called by MatchRoom): pay play-money for each wallet-linked human, and settle a staked room */
  onOver(room) {
    if (!this.enabled || !room.sim) return;
    try {
      const sim = room.sim;
      if (room.stake && room.stakers) {
        const eligible = [];
        for (const f of sim.humans) {
          const addr = room.stakers.get(f.sessionId);
          if (addr && room.byClient.has(f.sessionId) && f.result) eligible.push({ addr, placement: f.result.placement });       // someone who left the match forfeits
        }
        eligible.sort((x, y) => x.placement - y.placement);
        this.economy.wagerSettle(room.roomId, { winnerId: eligible[0]?.addr ?? null });                                       // nobody eligible -> refund
      }
      for (const f of sim.humans) {
        const wallet = room.lobby.get(f.sessionId)?.wallet; if (!wallet || !f.result) continue;
        try { this.economy.awardMatch({ address: wallet, matchId: room.roomId, result: { won: !!f.result.won, kills: f.result.kills } }); } catch { /* earn closed or capped */ }
      }
    } catch (e) { console.error(`economy: onOver failed (${e.message}); refunding the staked room`); try { if (room.stake) this.economy.wagerVoid(room.roomId, 'error'); } catch { /* ignore */ } }
    this.saveSoon();
  }
}
