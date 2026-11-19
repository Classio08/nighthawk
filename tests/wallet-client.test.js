import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchStatus, connectWallet, loadSession, saveSession, clearSession, fetchMe, claimFaucet, selfExclude, TOKEN_KEY } from '../src/ui/wallet-client.js';

const ADDR = '0x' + 'ab'.repeat(20);
const jsonRes = (code, body) => ({ ok: code >= 200 && code < 300, status: code, json: async () => body });
const memStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const fakeEthereum = (over = {}) => { const calls = []; return { calls, request: async ({ method, params }) => { calls.push({ method, params }); if (over[method]) return over[method](params); return { eth_requestAccounts: [ADDR], eth_chainId: '0xaa36a7', personal_sign: '0x' + '11'.repeat(65) }[method]; } }; };

test('fetchStatus: a real status passes, everything else is null and never throws', async () => {
  assert.deepEqual(await fetchStatus('', async () => jsonRes(200, { mode: 'off', features: { wallet: false } })), { mode: 'off', features: { wallet: false } });
  for (const bad of [jsonRes(404, { error: 'x' }), jsonRes(200, { hello: 1 }), jsonRes(200, null), { ok: true, status: 200, json: async () => { throw new Error('not json'); } }]) assert.equal(await fetchStatus('', async () => bad), null);
  assert.equal(await fetchStatus('', async () => { throw new Error('offline'); }), null);
});

test('connect: asks the wallet for an account and a SIGNATURE only, sends the server\'s own message back, returns the session', async () => {
  const eth = fakeEthereum(), seen = [];
  const fetchFn = async (url, init) => {
    seen.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
    if (url.endsWith('/economy/wallet/challenge')) return jsonRes(200, { nonce: 'abc123', message: 'localhost wants you to sign in', expiresAt: 'x' });
    if (url.endsWith('/economy/wallet/verify')) return jsonRes(200, { address: ADDR, token: 'tok.en', tokenExp: 4102444800 });
    return jsonRes(404, {});
  };
  const s = await connectWallet({ ethereum: eth, base: 'http://h', fetchFn });
  assert.deepEqual(s, { address: ADDR, token: 'tok.en', exp: 4102444800 });
  assert.deepEqual(eth.calls.map((c) => c.method), ['eth_requestAccounts', 'eth_chainId', 'personal_sign'], 'no transaction, no key export, no other wallet method');
  assert.deepEqual(eth.calls[2].params, ['localhost wants you to sign in', ADDR], 'it signs exactly the message the server built');
  assert.deepEqual(seen[0].body, { address: ADDR, chainId: 11155111 });
  assert.equal(seen[1].body.nonce, 'abc123'); assert.match(seen[1].body.signature, /^0x[0-9a-f]{130}$/);
});

test('connect: every failure is a plain error (no wallet, refused, bad chain, closed economy, bad signature)', async () => {
  const ok = async (url) => (url.endsWith('challenge') ? jsonRes(200, { nonce: 'n', message: 'm' }) : jsonRes(200, { address: ADDR, token: 't', tokenExp: 4102444800 }));
  await assert.rejects(() => connectWallet({ ethereum: undefined, base: '', fetchFn: ok }), /No browser wallet/);
  await assert.rejects(() => connectWallet({ ethereum: fakeEthereum({ eth_requestAccounts: () => { throw new Error('User rejected'); } }), base: '', fetchFn: ok }), /User rejected/);
  await assert.rejects(() => connectWallet({ ethereum: fakeEthereum({ eth_requestAccounts: () => [] }), base: '', fetchFn: ok }), /did not return an account/);
  await assert.rejects(() => connectWallet({ ethereum: fakeEthereum({ eth_requestAccounts: () => ['not-an-address'] }), base: '', fetchFn: ok }), /did not return an account/);
  await assert.rejects(() => connectWallet({ ethereum: fakeEthereum({ eth_chainId: () => 'zzz' }), base: '', fetchFn: ok }), /network/);
  await assert.rejects(() => connectWallet({ ethereum: fakeEthereum(), base: '', fetchFn: async () => jsonRes(403, { error: 'closed', why: 'wallet is not enabled (compliance.json mode is "off")' }) }), /not enabled/);
  await assert.rejects(() => connectWallet({ ethereum: fakeEthereum({ personal_sign: () => { throw new Error('User denied message signature'); } }), base: '', fetchFn: ok }), /denied/);
  await assert.rejects(() => connectWallet({ ethereum: fakeEthereum(), base: '', fetchFn: async (u) => (u.endsWith('challenge') ? jsonRes(200, { nonce: 'n', message: 'm' }) : jsonRes(401, { error: 'bad signature' })) }), /bad signature/);
  await assert.rejects(() => connectWallet({ ethereum: fakeEthereum(), base: '', fetchFn: async () => jsonRes(200, { weird: true }) }), /unusable challenge/);
});

test('session: kept in sessionStorage only, expired or tampered entries are ignored', () => {
  const st = memStore(), now = 1_000_000;
  assert.equal(loadSession(st, now), null);
  assert.equal(saveSession({ token: 't', address: ADDR, exp: now + 600 }, st), true);
  assert.deepEqual(loadSession(st, now), { token: 't', address: ADDR, exp: now + 600 });
  assert.equal(loadSession(st, now + 700), null, 'expired');
  st.setItem(TOKEN_KEY, JSON.stringify({ token: 't', address: 'nope', exp: now + 600 })); assert.equal(loadSession(st, now), null);
  st.setItem(TOKEN_KEY, '{bad'); assert.equal(loadSession(st, now), null);
  saveSession({ token: 't', address: ADDR, exp: now + 600 }, st); clearSession(st); assert.equal(loadSession(st, now), null);
  const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
  assert.equal(loadSession(broken), null); assert.equal(saveSession({ token: 't', address: ADDR, exp: 1 }, broken), false); assert.doesNotThrow(() => clearSession(broken));
});

test('authed calls send the bearer token and surface the server\'s own reason', async () => {
  const seen = [];
  const f = async (url, init) => { seen.push({ url, method: init.method, auth: init.headers.authorization, body: init.body }); return jsonRes(200, { balance: 500, currency: 'PLAY' }); };
  assert.equal((await fetchMe('http://h', 'TOK', f)).balance, 500);
  await claimFaucet('http://h', 'TOK', f); await selfExclude('http://h', 'TOK', 7, f);
  assert.deepEqual(seen.map((s) => [s.method, s.url.replace('http://h', ''), s.auth]), [['GET', '/economy/me', 'Bearer TOK'], ['POST', '/economy/faucet', 'Bearer TOK'], ['POST', '/economy/exclude', 'Bearer TOK']]);
  assert.deepEqual(JSON.parse(seen[2].body), { days: 7 });
  await assert.rejects(() => fetchMe('', 'x', async () => jsonRes(401, { error: 'sign in with your wallet first' })), /sign in/);
  await assert.rejects(() => fetchMe('', 'x', async () => jsonRes(500, null)), /server said 500/);
});
