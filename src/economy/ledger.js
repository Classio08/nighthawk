// Double-entry ledger in whole units (integers only; no floats ever touch a balance).
// Every transaction's entries sum to ZERO, so value is only ever moved, never invented or lost: the total of all accounts stays 0 forever
// (new play-money is "minted" from the `mint` account, which goes negative by exactly what exists). Idempotency keys make a retry or a double
// call harmless: the same key returns the original receipt and moves nothing a second time.
//
// Account names:  player:<id>   escrow:<wagerId>   house:rake   mint:faucet   (player and escrow and house can never go below 0)

export class LedgerError extends Error { constructor(code, msg) { super(msg ?? code); this.code = code; } }

const MAY_GO_NEGATIVE = (acct) => acct.startsWith('mint:');
const VALID_ACCT = /^(player|escrow|house|mint):[A-Za-z0-9._:-]{1,80}$/;

export class Ledger {
  constructor(currency = 'PLAY') { this.currency = currency; this.bal = new Map(); this.receipts = new Map(); this.seq = 0; }

  balance(acct) { return this.bal.get(acct) ?? 0; }

  /**
   * @param {{key:string, memo?:string, t?:number, entries:{acct:string, delta:number}[]}} tx
   * @returns the receipt (the same object again if `key` was already posted with the same entries)
   */
  post(tx) {
    const key = String(tx?.key ?? ''); if (!key || key.length > 160) throw new LedgerError('bad-key', 'every transaction needs an idempotency key');
    const entries = (tx.entries ?? []).map((e) => ({ acct: String(e.acct), delta: e.delta }));
    const prev = this.receipts.get(key);
    if (prev) {
      if (JSON.stringify(prev.entries) !== JSON.stringify(entries)) throw new LedgerError('key-reuse', `key ${key} was already used for a different transaction`);
      return prev;
    }
    if (entries.length < 2) throw new LedgerError('bad-entries', 'a transaction needs at least two entries');
    let sum = 0;
    for (const e of entries) {
      if (!VALID_ACCT.test(e.acct)) throw new LedgerError('bad-account', `bad account name ${e.acct}`);
      if (!Number.isSafeInteger(e.delta) || e.delta === 0) throw new LedgerError('bad-amount', 'amounts are non-zero safe integers');
      sum += e.delta;
    }
    if (sum !== 0) throw new LedgerError('unbalanced', `entries sum to ${sum}, must be 0`);
    const next = new Map();
    for (const e of entries) {
      const v = (next.get(e.acct) ?? this.balance(e.acct)) + e.delta;
      if (v < 0 && !MAY_GO_NEGATIVE(e.acct)) throw new LedgerError('insufficient', `${e.acct} would go to ${v}`);
      if (!Number.isSafeInteger(v)) throw new LedgerError('overflow', 'balance out of range');
      next.set(e.acct, v);
    }
    for (const [a, v] of next) this.bal.set(a, v);                      // nothing is written unless every entry passed
    const receipt = Object.freeze({ key, seq: ++this.seq, memo: String(tx.memo ?? '').slice(0, 120), t: tx.t ?? 0, entries: Object.freeze(entries.map((e) => Object.freeze(e))) });
    this.receipts.set(key, receipt);
    return receipt;
  }

  /** move `amount` from one account to another */
  transfer(key, from, to, amount, memo = '', t = 0) { return this.post({ key, memo, t, entries: [{ acct: from, delta: -amount }, { acct: to, delta: amount }] }); }

  /** the invariant a bug cannot hide behind: all balances add up to zero, none is below zero except `mint:` */
  audit() {
    let total = 0; const problems = [];
    for (const [a, v] of this.bal) { total += v; if (v < 0 && !MAY_GO_NEGATIVE(a)) problems.push(`${a} is negative (${v})`); }
    if (total !== 0) problems.push(`balances sum to ${total}, not 0`);
    return { ok: problems.length === 0, problems, accounts: this.bal.size, transactions: this.receipts.size };
  }

  toJSON() { return { currency: this.currency, seq: this.seq, receipts: [...this.receipts.values()] }; }

  /** rebuild from a saved copy by REPLAYING every receipt through the same rules (so a tampered file that breaks the rules is rejected) */
  static fromJSON(j) {
    const l = new Ledger(j?.currency ?? 'PLAY');
    for (const r of [...(j?.receipts ?? [])].sort((a, b) => a.seq - b.seq)) l.post({ key: r.key, memo: r.memo, t: r.t, entries: r.entries });
    return l;
  }
}
