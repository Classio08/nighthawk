import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { WalletAuth, signPersonal, recoverSigner, addressOfPublicKey, toChecksumAddress, normalizeAddress, looksLikeSecret } from '../src/economy/wallet.js';
import { encodeBalanceOf, parseUint, ownedCosmetics, COSMETIC_TOKENS } from '../src/economy/nft.js';
import { SKINS } from '../src/sim/weapons.js';

const newKey = () => { const k = bytesToHex(secp256k1.utils.randomSecretKey()); return { k, addr: addressOfPublicKey(secp256k1.getPublicKey(hexToBytes(k), false)) }; };
const auth = (o = {}) => new WalletAuth({ domains: ['localhost', 'play.example.com'], chainIds: [11155111], secret: new Uint8Array(32).fill(9), ...o });
const NONCE = 'ab12'.repeat(8);

test('known vectors: private key -> address (ethers docs) and the EIP-55 checksum example', () => {
  assert.equal(toChecksumAddress(addressOfPublicKey(secp256k1.getPublicKey(hexToBytes('4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318'), false))), '0x2c7536E3605D9C16a7a3D7b1898e529396a65c23');
  assert.equal(toChecksumAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'), '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
});

test('sign then recover returns the signer, and nobody else', () => {
  const a = newKey(), b = newKey(), sig = signPersonal('hello', a.k);
  assert.equal(recoverSigner('hello', sig), a.addr); assert.notEqual(recoverSigner('hello!', sig), a.addr); assert.notEqual(recoverSigner('hello', signPersonal('hello', b.k)), a.addr);
  for (const bad of [null, '', '0x', '0x' + '00'.repeat(65), sig.slice(0, -2), sig.slice(0, -2) + '05', 42]) assert.equal(recoverSigner('hello', bad) === a.addr, false);
});

test('address handling: strict format, case-insensitive', () => {
  assert.equal(normalizeAddress('0x2C7536E3605D9C16A7A3D7B1898E529396A65C23'), '0x2c7536e3605d9c16a7a3d7b1898e529396a65c23');
  for (const bad of ['', '0x123', '2c7536e3605d9c16a7a3d7b1898e529396a65c23', '0xZZ7536e3605d9c16a7a3d7b1898e529396a65c23', null, {}]) assert.throws(() => normalizeAddress(bad));
});

test('login flow: challenge -> wallet signs -> token; the token names the same address and expires', () => {
  const w = auth(), a = newKey(), now = 10_000;
  const ch = w.challenge({ domain: 'localhost', address: a.addr, chainId: 11155111 }, NONCE, now);
  assert.match(ch.message, /never ask for your seed phrase/); assert.match(ch.message, new RegExp(`Nonce: ${NONCE}`)); assert.match(ch.message, /Chain ID: 11155111/);
  const v = w.verify({ nonce: NONCE, signature: signPersonal(ch.message, a.k) }, now + 5);
  assert.equal(v.ok, true); assert.equal(v.address, a.addr);
  assert.equal(w.checkToken(v.token, now + 100), a.addr); assert.equal(w.checkToken(v.token, v.tokenExp + 1), null, 'expired');
});

test('security: wrong signer, replay, expiry, attempt limit, tampered token, other server secret', () => {
  const a = newKey(), mallory = newKey(), now = 50_000;
  let w = auth(); let ch = w.challenge({ domain: 'localhost', address: a.addr, chainId: 11155111 }, NONCE, now);
  assert.equal(w.verify({ nonce: NONCE, signature: signPersonal(ch.message, mallory.k) }, now + 1).ok, false, 'signed by somebody else');
  const good = signPersonal(ch.message, a.k); assert.equal(w.verify({ nonce: NONCE, signature: good }, now + 2).ok, true);
  assert.equal(w.verify({ nonce: NONCE, signature: good }, now + 3).ok, false, 'replay of a captured signature');
  w = auth(); ch = w.challenge({ domain: 'localhost', address: a.addr, chainId: 11155111 }, NONCE, now);
  assert.equal(w.verify({ nonce: NONCE, signature: signPersonal(ch.message, a.k) }, now + 301).ok, false, 'expired');
  w = auth(); w.challenge({ domain: 'localhost', address: a.addr, chainId: 11155111 }, NONCE, now);
  for (let i = 0; i < 3; i++) w.verify({ nonce: NONCE, signature: '0x' + '11'.repeat(65) }, now + 1);
  const ch2 = [...w.pending.values()][0];
  assert.equal(w.verify({ nonce: NONCE, signature: signPersonal(ch2.message, a.k) }, now + 1).why, 'too many attempts', 'the 4th try is refused even with a CORRECT signature');
  assert.equal(w.verify({ nonce: NONCE, signature: signPersonal(ch2.message, a.k) }, now + 1).why, 'unknown or already used challenge', 'and the challenge is burned');
  w = auth(); ch = w.challenge({ domain: 'localhost', address: a.addr, chainId: 11155111 }, NONCE, now); const t = w.verify({ nonce: NONCE, signature: signPersonal(ch.message, a.k) }, now).token;
  assert.equal(w.checkToken(t.replace(/.$/, (c) => (c === '0' ? '1' : '0')), now + 1), null); assert.equal(w.checkToken(t.replace(a.addr.slice(2, 6), 'dead'), now + 1), null);
  assert.equal(auth({ secret: new Uint8Array(32).fill(1) }).checkToken(t, now + 1), null, 'a token from another secret');
  assert.equal(w.checkToken('garbage', now), null); assert.equal(w.checkToken(undefined, now), null);
});

test('challenge refuses an unlisted domain or chain, a bad address and a bad nonce; weak server secret is refused', () => {
  const w = auth(), a = newKey();
  assert.throws(() => w.challenge({ domain: 'evil.example', address: a.addr, chainId: 11155111 }, NONCE, 0), /domain/);
  assert.throws(() => w.challenge({ domain: 'localhost', address: a.addr, chainId: 1 }, NONCE, 0), /chain/);
  assert.throws(() => w.challenge({ domain: 'localhost', address: 'nope', chainId: 11155111 }, NONCE, 0));
  assert.throws(() => w.challenge({ domain: 'localhost', address: a.addr, chainId: 11155111 }, 'short', 0), /nonce/);
  assert.throws(() => new WalletAuth({ domains: ['x'], chainIds: [1], secret: new Uint8Array(4) }), /secret/);
});

test('looksLikeSecret catches pasted private keys and recovery-phrase shapes, not ordinary names or chat', () => {
  assert.equal(looksLikeSecret('0x' + 'ab'.repeat(32)), true); assert.equal(looksLikeSecret('ab'.repeat(32)), true);
  assert.equal(looksLikeSecret('abandon ability able about above absent absorb abstract absurd abuse access accident'), true);
  for (const ok of ['Operator', 'good game lads', 'meet at the compound before sunset please', '0x2c7536E3605D9C16a7a3D7b1898e529396a65c23']) assert.equal(looksLikeSecret(ok), false, ok);
});

test('NFT: ABI encoding of balanceOf, uint parsing, token ids map only to skins that exist', () => {
  assert.equal(encodeBalanceOf('0x2c7536E3605D9C16a7a3D7b1898e529396a65c23', 2), '0x00fdd58e' + '0'.repeat(24) + '2c7536e3605d9c16a7a3d7b1898e529396a65c23' + '0'.repeat(63) + '2');
  assert.equal(parseUint('0x01'), 1); assert.equal(parseUint('0x'), 0); assert.equal(parseUint('0x' + 'f'.repeat(64)), 0); assert.equal(parseUint('junk'), 0); assert.equal(parseUint(null), 0);
  assert.throws(() => encodeBalanceOf('0x1', 1)); assert.throws(() => encodeBalanceOf('0x2c7536E3605D9C16a7a3D7b1898e529396a65c23', -1));
  for (const c of Object.values(COSMETIC_TOKENS)) assert.ok(SKINS.includes(c.skin), c.skin);
});

test('NFT: read-only eth_call flow with a fake RPC; wrong chain and RPC errors are refused', async () => {
  const me = '0x2c7536E3605D9C16a7a3D7b1898e529396a65c23', contract = '0x' + 'cc'.repeat(20), calls = [];
  const rpc = (chain, owns) => async (_url, init) => {
    const q = JSON.parse(init.body); calls.push(q.method);
    const result = q.method === 'eth_chainId' ? '0x' + chain.toString(16) : (owns.includes(parseInt(q.params[0].data.slice(-64), 16)) ? '0x' + '0'.repeat(63) + '1' : '0x' + '0'.repeat(64));
    return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result }) };
  };
  const r = await ownedCosmetics({ rpcUrl: 'x', chainId: 11155111, contract, address: me }, rpc(11155111, [1, 3]));
  assert.deepEqual(r.tokens, [1, 3]); assert.deepEqual(r.skins, ['gold', 'reactive']); assert.ok(calls.every((m) => m === 'eth_chainId' || m === 'eth_call'), 'only read-only methods: ' + calls.join(','));
  await assert.rejects(ownedCosmetics({ rpcUrl: 'x', chainId: 11155111, contract, address: me }, rpc(1, [1])), /different chain/);
  await assert.rejects(ownedCosmetics({ rpcUrl: 'x', chainId: 1, contract, address: me }, async () => ({ ok: false, status: 500 })), /rpc http 500/);
});

test('a fractional clock (Date.now()/1000) still gives a token the checker accepts', () => {
  const w = auth(), a = newKey(), now = 1_795_000_000.789;
  const ch = w.challenge({ domain: 'localhost', address: a.addr, chainId: 11155111 }, NONCE, now);
  const v = w.verify({ nonce: NONCE, signature: signPersonal(ch.message, a.k) }, now + 1.3);
  assert.equal(v.ok, true); assert.equal(w.checkToken(v.token, now + 5.5), a.addr);
});
