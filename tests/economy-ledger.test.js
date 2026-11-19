import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ledger, LedgerError } from '../src/economy/ledger.js';
import { rewardFor, EarnBook } from '../src/economy/earn.js';

const mint = (l, to, n, key = `m:${to}:${n}:${l.seq}`) => l.transfer(key, 'mint:faucet', `player:${to}`, n);

test('ledger: every transaction must balance to zero, use integers and valid account names', () => {
  const l = new Ledger();
  for (const entries of [[{ acct: 'player:a', delta: 5 }], [{ acct: 'mint:faucet', delta: -5 }, { acct: 'player:a', delta: 4 }], [{ acct: 'mint:faucet', delta: -1.5 }, { acct: 'player:a', delta: 1.5 }], [{ acct: 'mint:faucet', delta: 0 }, { acct: 'player:a', delta: 0 }], [{ acct: 'mint:faucet', delta: -5 }, { acct: 'bank:evil', delta: 5 }], [{ acct: 'mint:faucet', delta: -Number.MAX_SAFE_INTEGER }, { acct: 'player:a', delta: Number.MAX_SAFE_INTEGER }, { acct: 'player:b', delta: 1 }, { acct: 'mint:faucet', delta: -1 }]])
    assert.throws(() => l.post({ key: 'k' + Math.random(), entries }), LedgerError);
  assert.equal(l.audit().ok, true); assert.equal(l.seq, 0);
});

test('ledger: players, escrow and house can never go negative; only mint can; a failed transaction changes nothing', () => {
  const l = new Ledger(); mint(l, 'a', 100);
  assert.throws(() => l.transfer('t1', 'player:a', 'player:b', 101), (e) => e.code === 'insufficient');
  assert.equal(l.balance('player:a'), 100); assert.equal(l.balance('player:b'), 0);
  assert.throws(() => l.post({ key: 't2', entries: [{ acct: 'player:a', delta: -50 }, { acct: 'player:b', delta: 20 }, { acct: 'house:rake', delta: 30 }, { acct: 'player:c', delta: -1 }, { acct: 'player:d', delta: 1 }] }), (e) => e.code === 'insufficient');
  assert.equal(l.balance('player:a'), 100, 'a half-applied transaction would show up here');
  assert.equal(l.balance('mint:faucet'), -100); assert.equal(l.audit().ok, true);
});

test('ledger: idempotency key returns the same receipt and moves nothing twice; reusing a key for something else is refused', () => {
  const l = new Ledger(); mint(l, 'a', 100, 'k1');
  const r2 = mint(l, 'a', 100, 'k1'); assert.equal(l.balance('player:a'), 100); assert.equal(r2.seq, 1);
  assert.throws(() => l.transfer('k1', 'mint:faucet', 'player:a', 999), (e) => e.code === 'key-reuse');
});

test('ledger: save and restore replays every rule; a tampered save is rejected', () => {
  const l = new Ledger(); mint(l, 'a', 100); l.transfer('t', 'player:a', 'player:b', 40);
  const l2 = Ledger.fromJSON(JSON.parse(JSON.stringify(l)));
  assert.equal(l2.balance('player:a'), 60); assert.equal(l2.balance('player:b'), 40); assert.equal(l2.audit().ok, true);
  const bad = JSON.parse(JSON.stringify(l)); bad.receipts[1].entries[1].delta = 400;
  assert.throws(() => Ledger.fromJSON(bad), LedgerError);
});

test('ledger: conservation holds under a long random sequence of valid and invalid transfers', () => {
  const l = new Ledger(); let s = 12345; const rnd = (n) => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % n; };
  const who = ['a', 'b', 'c', 'd'];
  for (let i = 0; i < 2000; i++) {
    const from = rnd(5) === 0 ? 'mint:faucet' : `player:${who[rnd(4)]}`, to = `player:${who[rnd(4)]}`, amt = 1 + rnd(300);
    if (from === to) continue;
    try { l.transfer(`r${i}`, from, to, amt); } catch (e) { assert.ok(e instanceof LedgerError); }
  }
  assert.equal(l.audit().ok, true, JSON.stringify(l.audit()));
});

const RULES = { dailyCap: 100, perMatchCap: 60, perKill: 5, perWin: 40, perMissionComplete: 50 };

test('earn: pure reward function, capped per match, kills clamped', () => {
  assert.equal(rewardFor({ kills: 3 }, RULES), 15); assert.equal(rewardFor({ kills: 3, won: true }, RULES), 55);
  assert.equal(rewardFor({ kills: 99, won: true, missionComplete: true }, RULES), 60); assert.equal(rewardFor({ kills: -5 }, RULES), 0); assert.equal(rewardFor(null, RULES), 0);
});

test('earn: only server-recorded results pay; the same match never pays twice; the daily cap holds and resets next day', () => {
  const l = new Ledger(), e = new EarnBook({ ledger: l, rules: RULES }), t = 1_000_000;
  assert.equal(e.award({ playerId: 'a', matchId: 'm1', source: 'client', result: { won: true }, t }).paid, 0);
  assert.equal(e.award({ playerId: 'a', matchId: 'm1', source: 'server', result: { won: true, kills: 4 }, t }).paid, 60);
  assert.equal(e.award({ playerId: 'a', matchId: 'm1', source: 'server', result: { won: true, kills: 4 }, t }).paid, 60, 'same receipt again');
  assert.equal(l.balance('player:a'), 60, 'but only paid once');
  const r2 = e.award({ playerId: 'a', matchId: 'm2', source: 'server', result: { won: true, kills: 4 }, t: t + 10 });
  assert.equal(r2.paid, 40); assert.equal(r2.capped, true);
  assert.equal(e.award({ playerId: 'a', matchId: 'm3', source: 'server', result: { won: true }, t: t + 20 }).paid, 0, 'daily cap reached');
  assert.equal(e.award({ playerId: 'a', matchId: 'm4', source: 'server', result: { won: true }, t: t + 86400 }).paid, 40, 'next day');
  assert.equal(l.audit().ok, true);
});
