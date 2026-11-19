import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Economy, EconomyClosed, FAUCET_AMOUNT } from '../src/economy/service.js';
import { signPersonal, addressOfPublicKey } from '../src/economy/wallet.js';

const shipped = JSON.parse(readFileSync(new URL('../data/compliance.json', import.meta.url), 'utf8'));
const key = () => { const k = bytesToHex(secp256k1.utils.randomSecretKey()); return { k, addr: addressOfPublicKey(secp256k1.getPublicKey(hexToBytes(k), false)) }; };
const clock = (t0 = Date.parse('2026-11-19T12:00:00Z') / 1000) => { const c = { t: t0, now: () => c.t }; return c; };
const sandbox = (over = {}) => ({ ...shipped, mode: 'sandbox', features: { wallet: true, nft: true, earn: true, wager: true }, ...over });
const eco = (config, c = clock(), extra = {}) => new Economy({ config, now: c.now, secret: new Uint8Array(32).fill(3), domains: ['localhost'], ...extra });
const closed = (fn) => { try { fn(); } catch (e) { return e instanceof EconomyClosed; } return false; };
async function login(e, who, c) {
  const ch = e.walletChallenge({ domain: 'localhost', address: who.addr, chainId: 11155111 }, 'cd34'.repeat(8) + String(c.t).slice(-4).padStart(4, '0').slice(0, 0));
  return e.walletVerify({ nonce: ch.nonce, signature: signPersonal(ch.message, who.k) });
}

test('with the SHIPPED config every economy call refuses', async () => {
  const e = eco(shipped), a = key();
  assert.equal(e.status().mode, 'off');
  assert.ok(closed(() => e.walletChallenge({ domain: 'localhost', address: a.addr, chainId: 11155111 }, 'ab'.repeat(8))));
  assert.ok(closed(() => e.faucet(a.addr))); assert.ok(closed(() => e.balance(a.addr))); assert.ok(closed(() => e.wagerOpen({ id: 'x', stake: 100 }))); assert.ok(closed(() => e.awardMatch({ address: a.addr, matchId: 'm', result: { won: true } })));
  await assert.rejects(e.cosmetics(a.addr), EconomyClosed);
  assert.equal(e.identify('anything'), null);
});

test('sandbox: login, faucet once a day, balances, earn from a server result, wager end to end', async () => {
  const c = clock(), e = eco(sandbox(), c), a = key(), b = key();
  const va = await login(e, a, c); assert.equal(va.ok, true); assert.equal(e.identify(va.token), a.addr);
  c.t += 1; const vb = await login(e, b, c); assert.equal(vb.ok, true);
  assert.equal(e.faucet(a.addr).paid, FAUCET_AMOUNT); assert.equal(e.faucet(a.addr).paid, 0, 'second claim the same day'); e.faucet(b.addr);
  assert.equal(e.balance(a.addr), FAUCET_AMOUNT);
  e.wagerOpen({ id: 'w1', stake: 500, maxPlayers: 2 }); e.wagerJoin('w1', a.addr); e.wagerJoin('w1', b.addr); e.wagerStart('w1');
  e.wagerSettle('w1', { winnerId: b.addr });
  assert.equal(e.balance(b.addr), FAUCET_AMOUNT + 500); assert.equal(e.balance(a.addr), FAUCET_AMOUNT - 500);
  assert.equal(e.awardMatch({ address: a.addr, matchId: 'm9', result: { won: true, kills: 2 } }).paid, 70);
  assert.equal(e.ledger.audit().ok, true);
  c.t += 86400; assert.equal(e.faucet(a.addr).paid, FAUCET_AMOUNT, 'next day');
});

test('each feature flag is enforced separately', () => {
  const a = key();
  const noWager = eco(sandbox({ features: { wallet: true, nft: true, earn: true, wager: false } })); assert.ok(closed(() => noWager.wagerOpen({ id: 'x', stake: 100 })));
  const noEarn = eco(sandbox({ features: { wallet: true, nft: true, earn: false, wager: true } })); assert.ok(closed(() => noEarn.awardMatch({ address: a.addr, matchId: 'm', result: { won: true } })));
  const noWallet = eco(sandbox({ features: { wallet: false, nft: true, earn: true, wager: true } })); assert.ok(closed(() => noWallet.walletChallenge({ domain: 'localhost', address: a.addr, chainId: 11155111 }, 'ab'.repeat(8))));
});

test('sandbox refuses a chain that is not on the sandbox list (mainnet)', () => {
  const e = eco(sandbox({ chains: { sandbox: [11155111], live: [8453] } })), a = key();
  assert.ok(closed(() => e.walletChallenge({ domain: 'localhost', address: a.addr, chainId: 8453 }, 'ab'.repeat(8))));
});

test('self-excluded players cannot wager or use the faucet; excluding is permanent for the period', async () => {
  const c = clock(), e = eco(sandbox(), c), a = key(), b = key(); await login(e, a, c); e.faucet(a.addr); e.faucet(b.addr);
  e.selfExclude(a.addr, 7 * 86400);
  e.wagerOpen({ id: 'w', stake: 100 }); assert.ok(closed(() => e.wagerJoin('w', a.addr))); c.t += 86400; assert.ok(closed(() => e.faucet(a.addr)));
  e.selfExclude(a.addr, 1); assert.ok(closed(() => e.wagerJoin('w', a.addr)), 'asking for a shorter exclusion changes nothing');
});

test('LIVE with a valid licence: wallet and NFT work, but earning and wagering REFUSE because no real-value rail exists', async () => {
  const cfg = { ...shipped, mode: 'live', features: { wallet: true, nft: true, earn: true, wager: true }, licence: { reference: 'REF-1', issuer: 'Board', approvedBy: 'Owner', approvedOn: '2026-11-01', expiresOn: '2027-01-01', scope: ['wallet', 'nft', 'earn', 'wager'] }, jurisdictions: { allow: ['NA'] }, chains: { sandbox: [], live: [8453] } };
  const c = clock(), e = eco(cfg, c, { env: { NIGHTHAWK_ECONOMY_LIVE: '1' } }), a = key();
  assert.equal(e.status().mode, 'live'); assert.equal(e.status().realValue, true);
  const ch = e.walletChallenge({ domain: 'localhost', address: a.addr, chainId: 8453 }, 'ef56'.repeat(8)); assert.equal(e.walletVerify({ nonce: ch.nonce, signature: signPersonal(ch.message, a.k) }).ok, true);
  assert.throws(() => e.faucet(a.addr), /sandbox play-money|not enabled|exists only/);
  assert.ok(closed(() => e.wagerOpen({ id: 'w', stake: 100 })));
  assert.ok(closed(() => e.awardMatch({ address: a.addr, matchId: 'm', result: { won: true } })));
});

test('LIVE: the licence expiring closes everything on the next call; refunds and leaving still work', async () => {
  const cfg = { ...shipped, mode: 'live', features: { wallet: true, wager: true }, licence: { reference: 'R', issuer: 'B', approvedBy: 'O', approvedOn: '2026-11-01', expiresOn: '2026-11-20', scope: ['wallet', 'wager'] }, jurisdictions: { allow: ['NA'] }, chains: { live: [8453] } };
  const c = clock(), e = eco(cfg, c, { env: { NIGHTHAWK_ECONOMY_LIVE: '1' } }); assert.equal(e.status().mode, 'live');
  c.t = Date.parse('2026-11-21T00:00:00Z') / 1000; assert.equal(e.status().mode, 'off'); assert.ok(closed(() => e.walletChallenge({ domain: 'localhost', address: key().addr, chainId: 8453 }, 'ab'.repeat(8))));
});

test('sandbox: closing the gate mid-match does not trap stakes: settle and void still work', async () => {
  const c = clock(), cfg = sandbox(), e = eco(cfg, c), a = key(), b = key(); e.faucet(a.addr); e.faucet(b.addr);
  e.wagerOpen({ id: 'w', stake: 300 }); e.wagerJoin('w', a.addr); e.wagerJoin('w', b.addr); e.wagerStart('w');
  e.config = { ...e.config, mode: 'off' };                                                              // operator switches the economy off while a match runs
  assert.ok(closed(() => e.wagerOpen({ id: 'w2', stake: 100 })));
  e.wagerVoid('w', 'operator'); assert.equal(e.balance === undefined, false); assert.equal(e.ledger.balance(`player:${a.addr}`), FAUCET_AMOUNT); assert.equal(e.ledger.balance(`player:${b.addr}`), FAUCET_AMOUNT);
});

test('cosmetics: the NFT check runs through the gate and the configured chain', async () => {
  const contract = '0x' + 'cc'.repeat(20), a = key();
  const fetchFn = async (_u, init) => { const q = JSON.parse(init.body); return { ok: true, json: async () => ({ result: q.method === 'eth_chainId' ? '0xaa36a7' : '0x' + '0'.repeat(63) + (parseInt(q.params[0].data.slice(-64), 16) === 2 ? '1' : '0') }) }; };
  const e = eco(sandbox(), clock(), { rpc: { url: 'https://rpc.example', chainId: 11155111, contract }, fetchFn });
  assert.deepEqual((await e.cosmetics(a.addr)).skins, ['damascus']);
  const e2 = eco(sandbox(), clock(), { rpc: { url: 'https://rpc.example', chainId: 1, contract }, fetchFn }); await assert.rejects(e2.cosmetics(a.addr), EconomyClosed);
  assert.deepEqual((await eco(sandbox()).cosmetics(a.addr)).skins, []);
});
