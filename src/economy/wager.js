// Wager escrow on top of the ledger: every player puts the same stake into an escrow account, the SERVER's own match result names one winner,
// the winner gets the pot minus the configured rake (default 0). Anything unclear (no winner, crash, timeout, restart) REFUNDS everybody in full.
//
//   open -> (players join, stakes locked in escrow) -> locked (match running, nobody can join or leave) -> settled | void
//
// Only code that holds the server's authoritative result may call settle(); there is no client-facing path to it. In sandbox the currency is play
// money. This module also enforces the player-protection limits: stake range, one open wager per player, loss limits per session and per rolling
// day (counting stakes still at risk), a cooldown after a loss, and self-exclusion that can only be extended, never shortened.

const DAY = 86400, SESSION_GAP = 2 * 3600;

export class WagerError extends Error { constructor(code, msg) { super(msg ?? code); this.code = code; } }

export const WAGER_DEFAULTS = { minStake: 100, maxStake: 10000, maxPlayers: 8, dailyLossLimit: 20000, sessionLossLimit: 10000, cooldownAfterLossSecs: 60, rakeBps: 0, openTimeoutSecs: 300, lockedTimeoutSecs: 3600 };

export class WagerBook {
  constructor({ ledger, limits = {} }) {
    this.ledger = ledger; this.lim = { ...WAGER_DEFAULTS, ...limits };
    this.wagers = new Map(); this.inWager = new Map();                   // playerId -> wagerId (open or locked)
    this.history = new Map();                                            // playerId -> [{t, net}] settled results (for loss limits)
    this.excludedUntil = new Map(); this.lastLossAt = new Map(); this.session = new Map();     // playerId -> {start, last}
    this.audit = [];                                                     // append-only decision log (what was allowed or refused, and why)
  }

  _log(t, event, data) { this.audit.push({ t, event, ...data }); if (this.audit.length > 5000) this.audit.splice(0, 1000); }

  /** realised losses (positive number) in the last `win` seconds */
  _lossIn(pid, t, win) { return (this.history.get(pid) ?? []).filter((h) => h.t > t - win && h.net < 0).reduce((s, h) => s - h.net, 0); }
  /** stakes of this player still at risk in open or locked wagers */
  _atRisk(pid) { const w = this.wagers.get(this.inWager.get(pid)); return w && (w.state === 'open' || w.state === 'locked') ? w.stake : 0; }

  selfExclude(pid, untilT, t = 0) {
    const cur = this.excludedUntil.get(pid) ?? 0;
    if (untilT > cur) this.excludedUntil.set(pid, untilT);                // extend only: asking for less than what is already set changes nothing
    this._log(t, 'self-exclude', { pid, until: Math.max(cur, untilT) });
    return this.excludedUntil.get(pid);
  }
  isExcluded(pid, t) { return (this.excludedUntil.get(pid) ?? 0) > t; }

  open({ id, stake, maxPlayers }, t) {
    const sid = String(id ?? ''); if (!/^[A-Za-z0-9._-]{1,60}$/.test(sid)) throw new WagerError('bad-id');
    if (this.wagers.has(sid)) throw new WagerError('exists', 'wager id already used');
    if (!Number.isSafeInteger(stake) || stake < this.lim.minStake || stake > this.lim.maxStake) throw new WagerError('stake-range', `stake must be ${this.lim.minStake} to ${this.lim.maxStake}`);
    const mp = Math.min(this.lim.maxPlayers, Number.isSafeInteger(maxPlayers) && maxPlayers >= 2 ? maxPlayers : 2);
    const w = { id: sid, stake, maxPlayers: mp, players: [], state: 'open', createdAt: t, lockedAt: null, closedAt: null, pot: 0, winner: null, rake: 0, payout: 0, reason: '' };
    this.wagers.set(sid, w); this._log(t, 'open', { id: sid, stake, maxPlayers: mp });
    return w;
  }

  _w(id) { const w = this.wagers.get(id); if (!w) throw new WagerError('unknown-wager'); return w; }

  join(id, pid, t) {
    const w = this._w(id), refuse = (code, msg) => { this._log(t, 'join-refused', { id, pid, code }); throw new WagerError(code, msg); };
    if (w.state !== 'open') refuse('not-open', 'this wager is no longer open');
    if (w.players.includes(pid)) refuse('already-in');
    if (w.players.length >= w.maxPlayers) refuse('full');
    if (this.inWager.has(pid) && ['open', 'locked'].includes(this.wagers.get(this.inWager.get(pid))?.state)) refuse('busy', 'finish your other wager first');
    if (this.isExcluded(pid, t)) refuse('excluded', 'self-exclusion is active');
    const since = t - (this.lastLossAt.get(pid) ?? -Infinity);
    if (since < this.lim.cooldownAfterLossSecs) refuse('cooldown', `wait ${Math.ceil(this.lim.cooldownAfterLossSecs - since)} s after a loss`);
    let s = this.session.get(pid); if (!s || t - s.last > SESSION_GAP) { s = { start: t, last: t }; this.session.set(pid, s); } s.last = t;
    if (this._lossIn(pid, t, DAY) + w.stake > this.lim.dailyLossLimit) refuse('daily-limit', 'daily loss limit would be exceeded');
    if (this._lossIn(pid, t, t - s.start + 1) + w.stake > this.lim.sessionLossLimit) refuse('session-limit', 'session loss limit would be exceeded');
    try { this.ledger.transfer(`wager:${id}:join:${pid}`, `player:${pid}`, `escrow:${id}`, w.stake, `stake ${id}`, t); }
    catch (e) { if (e.code === 'insufficient') refuse('insufficient', 'not enough play money for this stake'); refuse('ledger', 'could not lock the stake'); }
    w.players.push(pid); w.pot += w.stake; this.inWager.set(pid, id); this._log(t, 'join', { id, pid });
    return w;
  }

  /** leave BEFORE the match starts: full refund */
  leave(id, pid, t) {
    const w = this._w(id); if (w.state !== 'open' || !w.players.includes(pid)) throw new WagerError('cannot-leave');
    this._refund(w, pid, t); w.players = w.players.filter((p) => p !== pid); w.pot -= w.stake; this.inWager.delete(pid); this._log(t, 'leave', { id, pid });
    return w;
  }

  /** lock the stakes and start the match: from here nobody joins or leaves */
  start(id, t) {
    const w = this._w(id); if (w.state !== 'open') throw new WagerError('not-open');
    if (w.players.length < 2) throw new WagerError('need-two', 'a wager needs at least two players');
    w.state = 'locked'; w.lockedAt = t; this._log(t, 'start', { id, players: w.players.length, pot: w.pot });
    return w;
  }

  /** the server's authoritative result: {winnerId}. No winner (draw, nobody finished) refunds everybody. Safe to call twice. */
  settle(id, result, t) {
    const w = this._w(id);
    if (w.state === 'settled' || w.state === 'void') return w;                            // idempotent: never pays a second time
    if (w.state !== 'locked') throw new WagerError('not-started', 'only a started wager can be settled');
    const winner = result?.winnerId;
    if (winner === undefined || winner === null || !w.players.includes(winner)) return this.void(id, 'no-valid-winner', t);
    w.rake = Math.floor((w.pot * this.lim.rakeBps) / 10000); w.payout = w.pot - w.rake; w.winner = winner;
    this.ledger.transfer(`wager:${id}:payout:${winner}`, `escrow:${id}`, `player:${winner}`, w.payout, `win ${id}`, t);
    if (w.rake > 0) this.ledger.transfer(`wager:${id}:rake`, `escrow:${id}`, 'house:rake', w.rake, `rake ${id}`, t);
    this._close(w, 'settled', 'settled', t);
    for (const p of w.players) { this._record(p, t, p === winner ? w.payout - w.stake : -w.stake); if (p !== winner) this.lastLossAt.set(p, t); }
    this._log(t, 'settle', { id, winner, payout: w.payout, rake: w.rake });
    return w;
  }

  /** refund every player in full (draw, crash, timeout, restart, operator decision) */
  void(id, reason, t) {
    const w = this._w(id); if (w.state === 'settled' || w.state === 'void') return w;
    for (const p of w.players) this._refund(w, p, t);
    this._close(w, 'void', reason, t); this._log(t, 'void', { id, reason });
    return w;
  }

  _refund(w, pid, t) { this.ledger.transfer(`wager:${w.id}:refund:${pid}`, `escrow:${w.id}`, `player:${pid}`, w.stake, `refund ${w.id}`, t); }
  _record(pid, t, net) { const h = this.history.get(pid) ?? []; h.push({ t, net }); this.history.set(pid, h.filter((x) => x.t > t - 2 * DAY)); }
  _close(w, state, reason, t) { w.state = state; w.reason = reason; w.closedAt = t; for (const p of w.players) if (this.inWager.get(p) === w.id) this.inWager.delete(p); }

  /** call regularly and on boot: stale wagers are refunded, never left holding people's stakes */
  expire(t) {
    for (const w of this.wagers.values()) {
      if (w.state === 'open' && t - w.createdAt > this.lim.openTimeoutSecs) this.void(w.id, 'open-timeout', t);
      else if (w.state === 'locked' && t - w.lockedAt > this.lim.lockedTimeoutSecs) this.void(w.id, 'locked-timeout', t);
    }
  }
  /** after a restart the match that was running is gone: refund every wager that was not finished */
  recover(t) { for (const w of this.wagers.values()) if (w.state === 'open' || w.state === 'locked') this.void(w.id, 'server-restart', t); }

  /** what must survive a restart so the limits keep working: loss history and self-exclusions (the ledger is saved separately) */
  exportState() { return { history: [...this.history], excludedUntil: [...this.excludedUntil], lastLossAt: [...this.lastLossAt] }; }
  importState(j) { this.history = new Map(j?.history ?? []); this.excludedUntil = new Map(j?.excludedUntil ?? []); this.lastLossAt = new Map(j?.lastLossAt ?? []); }

  summary(pid, t) {
    return { dayLoss: this._lossIn(pid, t, DAY), dayLimit: this.lim.dailyLossLimit, atRisk: this._atRisk(pid), excludedUntil: this.excludedUntil.get(pid) ?? 0,
      cooldownLeft: Math.max(0, Math.ceil(this.lim.cooldownAfterLossSecs - (t - (this.lastLossAt.get(pid) ?? -Infinity)))) };
  }
}

/**
 * After a crash or restart the in-memory wagers are gone but the ledger still shows stakes sitting in `escrow:*`. Give every such stake back
 * (and move a stranded rake remainder to the house). Reads only the ledger, so it needs nothing else to have survived.
 * @returns {number} how many refunds were made
 */
export function refundOrphanedEscrows(ledger, t) {
  let n = 0;
  for (const [acct, bal] of [...ledger.bal]) {
    if (!acct.startsWith('escrow:') || bal <= 0) continue;
    const id = acct.slice('escrow:'.length), joinPrefix = `wager:${id}:join:`;
    const paid = [...ledger.receipts.keys()].some((k) => k.startsWith(`wager:${id}:payout:`));
    if (paid) { ledger.transfer(`wager:${id}:rake`, acct, 'house:rake', ledger.balance(acct), `rake ${id}`, t); continue; }
    for (const [k, r] of ledger.receipts) {
      if (!k.startsWith(joinPrefix)) continue;
      const pid = k.slice(joinPrefix.length);
      if (ledger.receipts.has(`wager:${id}:refund:${pid}`)) continue;
      const stake = r.entries.find((e) => e.acct === `player:${pid}`)?.delta; if (!stake || ledger.balance(acct) < -stake) continue;
      ledger.transfer(`wager:${id}:refund:${pid}`, acct, `player:${pid}`, -stake, `refund ${id} (restart)`, t); n++;
    }
  }
  return n;
}
