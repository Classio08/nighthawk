// Play-to-earn, the safe version: only the SERVER's own record of a finished match can pay out, in whole units of a play-money currency,
// with a hard per-match and per-day cap so farming is pointless. Offline operations run in the player's browser, so the server cannot vouch for
// them: they pay nothing here (they still give XP and unlocks in the normal profile).
//
// Rewards are minted from `mint:faucet` into `player:<id>`; the amount is a pure function of the result, so it is testable.

const DAY = 86400;

/** @param result {{won?:boolean, kills?:number, missionComplete?:boolean, humans?:number}}  @param rules the `earn` section of the config */
export function rewardFor(result, rules) {
  const kills = Math.max(0, Math.min(50, Math.trunc(result?.kills ?? 0)));
  let n = kills * rules.perKill;
  if (result?.won) n += rules.perWin;
  if (result?.missionComplete) n += rules.perMissionComplete;
  return Math.max(0, Math.min(n, rules.perMatchCap));
}

export class EarnBook {
  constructor({ ledger, rules }) { this.ledger = ledger; this.rules = rules; this.days = new Map(); }

  _used(playerId, t) { return this.days.get(`${playerId}:${Math.floor(t / DAY)}`) ?? 0; }

  /** @returns {{paid:number, capped:boolean, receipt:object|null}}  paid 0 if nothing earned; repeating the same (match, player) never pays twice */
  award({ playerId, matchId, source, result, t }) {
    if (source !== 'server') return { paid: 0, capped: false, receipt: null, why: 'only a server-recorded result can earn' };
    const key = `earn:${matchId}:${playerId}`, prior = this.ledger.receipts.get(key);
    if (prior) return { paid: prior.entries.find((e) => e.acct === `player:${playerId}`)?.delta ?? 0, capped: false, receipt: prior, repeat: true };
    const want = rewardFor(result, this.rules), room = Math.max(0, this.rules.dailyCap - this._used(playerId, t)), paid = Math.min(want, room);
    if (paid <= 0) return { paid: 0, capped: want > 0 && room <= 0, receipt: null };
    const receipt = this.ledger.transfer(key, 'mint:faucet', `player:${playerId}`, paid, `earn ${matchId}`, t);
    this.days.set(`${playerId}:${Math.floor(t / DAY)}`, this._used(playerId, t) + paid);
    return { paid, capped: paid < want, receipt };
  }
}
