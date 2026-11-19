// THE COMPLIANCE GATE. Every economy feature (wallet proof, NFT ownership, token earn, wagering) asks this module "may I run?" and does what it says.
//
//   off      nothing runs                                                                  (the default, and what any mistake falls back to)
//   sandbox  play-money ("PLAY") and test networks only: nothing can be bought, sold, cashed out or won in real value
//   live     real value. Needs ALL of: mode "live" in data/compliance.json, a recorded licence (reference, issuer, approver, dates, scope covering the
//            feature), the server started with NIGHTHAWK_ECONOMY_LIVE=1, a live chain list, and per player: allowed country + verified age (+ KYC if required).
//
// Pure functions: the clock and the environment are passed in. The browser never evaluates this; it only displays what the server reports.
// This is software enforcement of the owner's decision. It is NOT legal advice and does not make anything lawful by itself (docs/ECONOMY.md).

export const MODES = ['off', 'sandbox', 'live'];
export const FEATURES = ['wallet', 'nft', 'earn', 'wager'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s) => {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const ms = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === s;
};
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const intIn = (v, lo, hi, d) => (Number.isSafeInteger(v) && v >= lo && v <= hi ? v : d);

/** make any parsed JSON safe: unknown or malformed values fall back to the CLOSED setting */
export function sanitizeConfig(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const f = r.features && typeof r.features === 'object' ? r.features : {};
  const l = r.licence && typeof r.licence === 'object' ? r.licence : {};
  const j = r.jurisdictions && typeof r.jurisdictions === 'object' ? r.jurisdictions : {};
  const p = r.players && typeof r.players === 'object' ? r.players : {};
  const c = r.chains && typeof r.chains === 'object' ? r.chains : {};
  const lim = r.limits && typeof r.limits === 'object' ? r.limits : {};
  const e = r.earn && typeof r.earn === 'object' ? r.earn : {};
  const ids = (a) => (Array.isArray(a) ? a.filter((x) => Number.isSafeInteger(x) && x > 0) : []);
  return {
    mode: MODES.includes(r.mode) ? r.mode : 'off',
    features: Object.fromEntries(FEATURES.map((k) => [k, f[k] === true])),
    licence: { reference: str(l.reference), issuer: str(l.issuer), approvedBy: str(l.approvedBy), approvedOn: str(l.approvedOn), expiresOn: str(l.expiresOn), scope: Array.isArray(l.scope) ? l.scope.filter((s) => FEATURES.includes(s)) : [] },
    jurisdictions: { allow: Array.isArray(j.allow) ? j.allow.map((s) => str(s).toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s)) : [], geoHeader: str(j.geoHeader).toLowerCase() || 'cf-ipcountry' },
    players: { minAge: intIn(p.minAge, 18, 99, 18), requireKyc: p.requireKyc !== false },       // can only be relaxed by writing an explicit false; never below 18
    chains: { sandbox: ids(c.sandbox), live: ids(c.live) },
    limits: {
      minStake: intIn(lim.minStake, 1, 1e9, 100), maxStake: intIn(lim.maxStake, 1, 1e9, 10000), maxPlayers: intIn(lim.maxPlayers, 2, 16, 8),
      dailyLossLimit: intIn(lim.dailyLossLimit, 1, 1e12, 20000), sessionLossLimit: intIn(lim.sessionLossLimit, 1, 1e12, 10000),
      cooldownAfterLossSecs: intIn(lim.cooldownAfterLossSecs, 0, 86400, 60), rakeBps: intIn(lim.rakeBps, 0, 2000, 0),
    },
    earn: { dailyCap: intIn(e.dailyCap, 0, 1e9, 600), perMatchCap: intIn(e.perMatchCap, 0, 1e9, 150), perKill: intIn(e.perKill, 0, 1e6, 5), perWin: intIn(e.perWin, 0, 1e6, 60), perMissionComplete: intIn(e.perMissionComplete, 0, 1e6, 80) },
  };
}

/** Everything that stops "live" right now, as plain sentences for the operator. Empty list = live is permitted for this server. */
export function liveBlockers(cfg, env = {}, today = '1970-01-01') {
  const b = [], L = cfg.licence;
  if (cfg.mode !== 'live') b.push('compliance.json mode is not "live"');
  if (cfg.features.earn) b.push('real-value earn is not implemented; keep the earn feature off');
  if (cfg.features.wager) b.push('real-value wagering is not implemented; keep the wager feature off');
  if (env.NIGHTHAWK_ECONOMY_LIVE !== '1') b.push('server was not started with NIGHTHAWK_ECONOMY_LIVE=1');
  const secret = typeof env.ECONOMY_SECRET === 'string' ? env.ECONOMY_SECRET : '';
  if (!/^(?:[0-9a-f]{2}){32,}$/i.test(secret)) b.push('ECONOMY_SECRET must be a persistent hex secret of at least 32 bytes');
  if (!L.reference) b.push('no licence reference recorded');
  if (!L.issuer) b.push('no licence issuer recorded');
  if (!L.approvedBy) b.push('no named approver recorded');
  if (!isDate(L.approvedOn)) b.push('licence approvedOn is missing or not YYYY-MM-DD');
  if (!isDate(L.expiresOn)) b.push('licence expiresOn is missing or not a real YYYY-MM-DD date');
  else if (L.expiresOn < today) b.push(`licence expired on ${L.expiresOn}`);
  if (isDate(L.approvedOn) && isDate(today) && L.approvedOn > today) b.push('licence approval date is in the future');
  if (isDate(L.approvedOn) && isDate(L.expiresOn) && L.expiresOn < L.approvedOn) b.push('licence expires before its approval date');
  if (!FEATURES.some((k) => cfg.features[k] && L.scope.includes(k))) b.push('licence scope covers none of the enabled features');
  if (!cfg.jurisdictions.allow.length) b.push('no allowed jurisdictions listed');
  if (!cfg.chains.live.length) b.push('no live chain ids listed');
  if (cfg.features.nft) {
    let rpc = null;
    try { rpc = new URL(str(env.ECONOMY_RPC_URL)); } catch { /* invalid or missing */ }
    if (!rpc || rpc.protocol !== 'https:' || rpc.username || rpc.password) b.push('NFT live mode requires an HTTPS RPC URL without embedded credentials');
    if (!/^0x[0-9a-f]{40}$/i.test(str(env.ECONOMY_NFT_CONTRACT))) b.push('NFT live mode requires a valid contract address');
    const rpcChain = Number(env.ECONOMY_CHAIN_ID ?? 0);
    if (!Number.isSafeInteger(rpcChain) || !cfg.chains.live.includes(rpcChain)) b.push('NFT RPC chain id must be included in the live chain allow-list');
  }
  return b;
}

/**
 * What may run on this server today.
 * @returns {{mode:'off'|'sandbox'|'live', features:Record<string,boolean>, currency:string|null, realValue:boolean, chains:number[], reasons:string[], limits:object, earn:object}}
 */
export function evaluate(rawCfg, env = {}, today = '1970-01-01') {
  const cfg = sanitizeConfig(rawCfg), none = Object.fromEntries(FEATURES.map((k) => [k, false]));
  const closed = (reasons) => ({ mode: 'off', features: none, currency: null, realValue: false, chains: [], reasons, limits: cfg.limits, earn: cfg.earn });
  if (cfg.mode === 'off') return closed(['economy is off (the default)']);
  if (cfg.mode === 'sandbox') {
    return { mode: 'sandbox', features: { ...cfg.features }, currency: 'PLAY', realValue: false, chains: cfg.chains.sandbox, reasons: ['sandbox: play money and test networks only, nothing has real value'], limits: cfg.limits, earn: cfg.earn };
  }
  const blockers = liveBlockers(cfg, env, today);
  if (blockers.length) return closed(['live was requested but is blocked:', ...blockers]);        // misconfigured live fails CLOSED, not into sandbox and not into live
  return {
    mode: 'live', features: Object.fromEntries(FEATURES.map((k) => [k, cfg.features[k] && cfg.licence.scope.includes(k)])), currency: 'LIVE', realValue: true,
    chains: cfg.chains.live, reasons: [`live under licence ${cfg.licence.reference} (${cfg.licence.issuer}), valid to ${cfg.licence.expiresOn}`], limits: cfg.limits, earn: cfg.earn,
  };
}

/** per-player check on top of evaluate(): country, age and KYC for real-value play; sandbox needs nothing about the person */
export function evaluateForPlayer(state, cfgRaw, player = {}) {
  const cfg = sanitizeConfig(cfgRaw), why = [];
  if (state.mode === 'off') return { ok: false, why: ['economy is off'] };
  if (state.mode === 'sandbox') return { ok: !player.selfExcluded, why: player.selfExcluded ? ['player is self-excluded'] : [] };
  if (player.selfExcluded) why.push('player is self-excluded');
  const cc = str(player.country).toUpperCase();
  if (!cc) why.push('country unknown');
  else if (!cfg.jurisdictions.allow.includes(cc)) why.push(`country ${cc} is not allowed`);
  if (!(Number.isSafeInteger(player.verifiedAge) && player.verifiedAge >= cfg.players.minAge)) why.push(`age not verified as ${cfg.players.minAge}+`);
  if (cfg.players.requireKyc && player.kycVerified !== true) why.push('KYC not completed');
  return { ok: why.length === 0, why };
}
