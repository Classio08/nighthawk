import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/economy/ledger.js';
import { WagerBook, WagerError } from '../src/economy/wager.js';

const make = (limits = {}) => {
  const ledger = new Ledger(), book = new WagerBook({ ledger, limits: { rakeBps: 0, cooldownAfterLossSecs: 0, ...limits } });
  const fund = (p, n) => ledger.transfer(`fund:${p}:${ledger.seq}`, 'mint:faucet', `player:${p}`, n);
  return { ledger, book, fund };
};
const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('happy path: stakes lock in escrow, the winner gets the whole pot, losers lose exactly their stake, ledger stays balanced', () => {
  const { ledger, book, fund } = make(); fund('a', 1000); fund('b', 1000); fund('c', 1000);
  book.open({ id: 'w1', stake: 200, maxPlayers: 3 }, 0); for (const p of ['a', 'b', 'c']) book.join('w1', p, 1);
  assert.equal(ledger.balance('escrow:w1'), 600); assert.equal(ledger.balance('player:a'), 800);
  book.start('w1', 2); const w = book.settle('w1', { winnerId: 'b' }, 100);
  assert.equal(w.state, 'settled'); assert.equal(ledger.balance('player:b'), 1400); assert.equal(ledger.balance('player:a'), 800); assert.equal(ledger.balance('escrow:w1'), 0);
  assert.equal(ledger.audit().ok, true);
});

test('settle is idempotent and cannot be repeated or switched to another winner', () => {
  const { ledger, book, fund } = make(); fund('a', 500); fund('b', 500);
  book.open({ id: 'w', stake: 100 }, 0); book.join('w', 'a', 1); book.join('w', 'b', 1); book.start('w', 2);
  book.settle('w', { winnerId: 'a' }, 10); book.settle('w', { winnerId: 'a' }, 11); book.settle('w', { winnerId: 'b' }, 12);
  assert.equal(ledger.balance('player:a'), 600); assert.equal(ledger.balance('player:b'), 400); assert.equal(book.wagers.get('w').winner, 'a');
});

test('no valid winner (draw, unknown id, outsider) refunds everybody in full', () => {
  for (const result of [{}, { winnerId: null }, { winnerId: 'zed' }, undefined]) {
    const { ledger, book, fund } = make(); fund('a', 300); fund('b', 300);
    book.open({ id: 'w', stake: 100 }, 0); book.join('w', 'a', 1); book.join('w', 'b', 1); book.start('w', 2);
    assert.equal(book.settle('w', result, 5).state, 'void');
    assert.equal(ledger.balance('player:a'), 300); assert.equal(ledger.balance('player:b'), 300); assert.equal(ledger.balance('escrow:w'), 0);
  }
});

test('rake goes to the house account and the payout is exactly pot minus rake (rounding favours the winner, nothing lost)', () => {
  const { ledger, book, fund } = make({ rakeBps: 500 }); fund('a', 1000); fund('b', 1000);
  book.open({ id: 'w', stake: 333 }, 0); book.join('w', 'a', 1); book.join('w', 'b', 1); book.start('w', 2); const w = book.settle('w', { winnerId: 'a' }, 3);
  assert.equal(w.rake, 33); assert.equal(w.payout, 633); assert.equal(ledger.balance('house:rake'), 33); assert.equal(ledger.balance('player:a'), 1000 - 333 + 633);
  assert.equal(ledger.audit().ok, true);
});

test('joining: stake range, funds, no double join, one wager at a time, full wager, closed wager', () => {
  const { book, fund, ledger } = make(); fund('a', 150); fund('b', 5000);
  assert.equal(code(() => book.open({ id: 'x', stake: 99 }, 0)), 'stake-range'); assert.equal(code(() => book.open({ id: 'x', stake: 10001 }, 0)), 'stake-range'); assert.equal(code(() => book.open({ id: 'x', stake: 1.5 }, 0)), 'stake-range');
  assert.equal(code(() => book.open({ id: '../x', stake: 100 }, 0)), 'bad-id');
  book.open({ id: 'w', stake: 200, maxPlayers: 2 }, 0);
  assert.equal(code(() => book.join('w', 'a', 1)), 'insufficient'); assert.equal(ledger.balance('player:a'), 150);
  book.join('w', 'b', 1); assert.equal(code(() => book.join('w', 'b', 2)), 'already-in');
  book.open({ id: 'w2', stake: 100 }, 0); assert.equal(code(() => book.join('w2', 'b', 3)), 'busy');
  fund('c', 500); fund('d', 500); book.join('w', 'c', 3); assert.equal(code(() => book.join('w', 'd', 4)), 'full');
  book.start('w', 5); assert.equal(code(() => book.join('w2', 'b', 6)), 'busy'); assert.equal(code(() => book.leave('w', 'c', 6)), 'cannot-leave', 'no leaving once the match started');
});

test('one player cannot start a wager alone, and leaving before the start refunds', () => {
  const { book, fund, ledger } = make(); fund('a', 500);
  book.open({ id: 'w', stake: 200 }, 0); book.join('w', 'a', 1); assert.equal(code(() => book.start('w', 2)), 'need-two');
  book.leave('w', 'a', 3); assert.equal(ledger.balance('player:a'), 500); assert.equal(ledger.balance('escrow:w'), 0); book.open({ id: 'w3', stake: 100 }, 4); book.join('w3', 'a', 5);
});

test('responsible-play limits: daily loss limit counts stakes at risk, cooldown after a loss, session limit', () => {
  const { book, fund } = make({ dailyLossLimit: 500, sessionLossLimit: 1e9, cooldownAfterLossSecs: 60 }); fund('a', 5000); fund('b', 5000);
  const play = (id, t, winner) => { book.open({ id, stake: 300 }, t); book.join(id, 'a', t); book.join(id, 'b', t); book.start(id, t + 1); book.settle(id, { winnerId: winner }, t + 2); };
  play('g1', 0, 'b');                                                                   // a lost 300
  assert.equal(code(() => { book.open({ id: 'g2', stake: 300 }, 10); book.join('g2', 'a', 10); }), 'cooldown');
  assert.equal(code(() => book.join('g2', 'a', 100)), 'daily-limit', '300 lost + 300 at risk > 500');
  book.open({ id: 'g3', stake: 150 }, 100); book.join('g3', 'a', 100);                 // 300 + 150 <= 500 is fine
  book.void('g3', 'test', 101);
  assert.equal(code(() => book.join('g2', 'a', 86400 + 3)), null, 'a day later the loss no longer counts');
});

test('session loss limit stops a losing streak inside one sitting', () => {
  const { book, fund } = make({ dailyLossLimit: 1e9, sessionLossLimit: 400, cooldownAfterLossSecs: 0 }); fund('a', 5000); fund('b', 5000);
  const play = (id, t) => { book.open({ id, stake: 300 }, t); book.join(id, 'a', t); book.join(id, 'b', t); book.start(id, t + 1); book.settle(id, { winnerId: 'b' }, t + 2); };
  play('s1', 0); book.open({ id: 's2', stake: 300 }, 10);
  assert.equal(code(() => book.join('s2', 'a', 10)), 'session-limit');
  assert.equal(code(() => book.join('s2', 'a', 10 + 3 * 3600)), null, 'a new session after a 2 hour break');
});

test('self-exclusion blocks joining and can only be extended, never shortened', () => {
  const { book, fund } = make(); fund('a', 1000); book.open({ id: 'w', stake: 100 }, 0);
  book.selfExclude('a', 1000, 0); book.selfExclude('a', 10, 1);
  assert.equal(book.isExcluded('a', 500), true); assert.equal(code(() => book.join('w', 'a', 500)), 'excluded'); assert.equal(code(() => book.join('w', 'a', 1001)), null);
});

test('stale wagers are refunded by expire(), and after a restart recover() refunds everything unfinished', () => {
  const { ledger, book, fund } = make(); fund('a', 500); fund('b', 500);
  book.open({ id: 'w1', stake: 100 }, 0); book.join('w1', 'a', 1); book.expire(1000);
  assert.equal(book.wagers.get('w1').state, 'void'); assert.equal(ledger.balance('player:a'), 500);
  book.open({ id: 'w2', stake: 100 }, 2000); book.join('w2', 'a', 2000); book.join('w2', 'b', 2000); book.start('w2', 2001); book.recover(3000);
  assert.equal(book.wagers.get('w2').state, 'void'); assert.equal(ledger.balance('player:a'), 500); assert.equal(ledger.balance('player:b'), 500); assert.equal(ledger.audit().ok, true);
});

test('a refused join leaves a reason in the audit log and moves no money', () => {
  const { book, ledger, fund } = make(); fund('a', 10); book.open({ id: 'w', stake: 100 }, 0); assert.equal(code(() => book.join('w', 'a', 1)), 'insufficient');
  assert.ok(book.audit.some((e) => e.event === 'join-refused' && e.code === 'insufficient')); assert.equal(ledger.balance('player:a'), 10);
});

test('conservation under random play of many wagers', () => {
  const { ledger, book, fund } = make({ cooldownAfterLossSecs: 0, dailyLossLimit: 1e9, sessionLossLimit: 1e9, rakeBps: 250 });
  const P = ['a', 'b', 'c', 'd']; for (const p of P) fund(p, 100000); let s = 99; const rnd = (n) => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % n; };
  for (let g = 0; g < 200; g++) {
    const id = 'g' + g, t = g * 10, stake = 100 + rnd(400); book.open({ id, stake, maxPlayers: 4 }, t);
    for (const p of P) if (rnd(3) > 0) { try { book.join(id, p, t); } catch (e) { assert.ok(e instanceof WagerError); } }
    const w = book.wagers.get(id); if (w.players.length < 2) { book.void(id, 'small', t + 1); continue; }
    book.start(id, t + 1); const r = rnd(5); if (r === 4) book.void(id, 'crash', t + 2); else book.settle(id, { winnerId: w.players[r % w.players.length] }, t + 2);
  }
  assert.equal(ledger.audit().ok, true, JSON.stringify(ledger.audit())); assert.ok([...book.wagers.values()].every((w) => w.state !== 'open' && w.state !== 'locked'));
  for (const k of ledger.bal.keys()) if (k.startsWith('escrow:')) assert.equal(ledger.balance(k), 0, k);
});

import { refundOrphanedEscrows } from '../src/economy/wager.js';
import { Economy } from '../src/economy/service.js';

test('crash recovery: stakes stranded in escrow are refunded from the ledger alone, once', () => {
  const { ledger, book, fund } = make(); fund('a', 500); fund('b', 500);
  book.open({ id: 'w', stake: 200 }, 0); book.join('w', 'a', 1); book.join('w', 'b', 1); book.start('w', 2);
  const saved = JSON.parse(JSON.stringify(ledger));                                   // the server dies here: only the ledger file survives
  const l2 = Ledger.fromJSON(saved); assert.equal(l2.balance('escrow:w'), 400);
  assert.equal(refundOrphanedEscrows(l2, 100), 2); assert.equal(l2.balance('player:a'), 500); assert.equal(l2.balance('player:b'), 500); assert.equal(l2.balance('escrow:w'), 0);
  assert.equal(refundOrphanedEscrows(l2, 101), 0, 'running it again changes nothing'); assert.equal(l2.audit().ok, true);
});

test('crash between payout and rake: the stranded rake goes to the house, nobody is paid twice', () => {
  const { ledger, fund } = make(); fund('a', 500); fund('b', 500);
  ledger.transfer('wager:w:join:a', 'player:a', 'escrow:w', 200); ledger.transfer('wager:w:join:b', 'player:b', 'escrow:w', 200);
  ledger.transfer('wager:w:payout:a', 'escrow:w', 'player:a', 380);                 // the 20 left over is the rake that was never moved
  assert.equal(refundOrphanedEscrows(ledger, 5), 0); assert.equal(ledger.balance('house:rake'), 20); assert.equal(ledger.balance('escrow:w'), 0); assert.equal(ledger.balance('player:a'), 680);
});

test('a saved Economy comes back with balances, limits and self-exclusion intact, and refunds a match that was running', () => {
  const cfg = { mode: 'sandbox', features: { wallet: true, wager: true } }, c = { t: 1_800_000_000 }, mk = () => new Economy({ config: cfg, now: () => c.t, secret: new Uint8Array(32).fill(5), domains: ['localhost'] });
  const e = mk(), A = '0x' + 'a1'.repeat(20), B = '0x' + 'b2'.repeat(20); e.faucet(A); e.faucet(B);
  e.wagerOpen({ id: 'r1', stake: 400 }); e.wagerJoin('r1', A); e.wagerJoin('r1', B); e.wagerStart('r1'); e.selfExclude(B, 3 * 86400);
  const e2 = mk(); const refunds = e2.importState(JSON.parse(JSON.stringify(e.exportState())));
  assert.equal(refunds, 2); assert.equal(e2.ledger.balance(`player:${A}`), 1000); assert.equal(e2.wagers.isExcluded(B, c.t + 10), true); assert.equal(e2.faucet(A).paid, 0, 'faucet cooldown survived the restart');
});
