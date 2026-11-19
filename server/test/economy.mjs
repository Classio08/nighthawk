// Economy end to end over a REAL server and REAL clients (no browser): the gate, wallet sign-in with a real secp256k1 signature, faucet, a staked room that
// settles from the server's own match result, refunds for every failure path, and the default-closed behaviour. Sandbox play-money only.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { createServer } from '../src/index.js';
import { MatchRoom } from '../src/MatchRoom.js';
import { NetSim } from '../../src/net/netsim.js';
import { signPersonal, addressOfPublicKey } from '../../src/economy/wallet.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) failed++; };
const tmp = mkdtempSync(join(tmpdir(), 'nh-eco-')), DB = join(tmp, 'economy.json');
const PORT = 2596, BASE = `http://localhost:${PORT}`, WS = `ws://localhost:${PORT}`;

const server = createServer({ lobbySecs: 1, stakedLobbySecs: 2, total: 4, loot: false, economyEnv: { NIGHTHAWK_ECONOMY: 'sandbox', ECONOMY_DB: DB } });
await server.listen(PORT);
const se = MatchRoom.economy;
const call = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};
const newWallet = () => { const k = bytesToHex(secp256k1.utils.randomSecretKey()); return { k, addr: addressOfPublicKey(secp256k1.getPublicKey(hexToBytes(k), false)) }; };
async function signIn(w) {
  const ch = await call('/economy/wallet/challenge', { method: 'POST', body: { address: w.addr, chainId: 11155111 } });
  const v = await call('/economy/wallet/verify', { method: 'POST', body: { nonce: ch.json.nonce, signature: signPersonal(ch.json.message, w.k) } });
  return { ch, v };
}

// ---- 1. gate and sign-in
const st = await call('/economy/status');
check('status: sandbox, play money, no real value, test chain only', st.json.mode === 'sandbox' && st.json.currency === 'PLAY' && st.json.realValue === false && st.json.chains.every((c) => [11155111, 84532, 80002].includes(c)) && !st.json.chains.includes(1), JSON.stringify(st.json));
const A = newWallet(), B = newWallet(), C = newWallet();
const sa = await signIn(A), sb = await signIn(B);
check('wallet sign-in with a real signature works and names the right address', sa.v.status === 200 && sa.v.json.address === A.addr, JSON.stringify(sa.v.json).slice(0, 120));
check('the challenge text says it costs nothing and never asks for a seed phrase', /never ask for your seed phrase/.test(sa.ch.json.message) && /not a transaction/.test(sa.ch.json.message));
const wrongSig = await call('/economy/wallet/verify', { method: 'POST', body: { nonce: (await call('/economy/wallet/challenge', { method: 'POST', body: { address: A.addr, chainId: 11155111 } })).json.nonce, signature: signPersonal('something else', B.k) } });
check('a signature from the wrong wallet is refused', wrongSig.status === 401, JSON.stringify(wrongSig.json));
const replay = await call('/economy/wallet/verify', { method: 'POST', body: { nonce: sa.ch.json.nonce, signature: signPersonal(sa.ch.json.message, A.k) } });
check('replaying an already used challenge is refused', replay.status === 401);
check('mainnet is refused in sandbox', (await call('/economy/wallet/challenge', { method: 'POST', body: { address: A.addr, chainId: 1 } })).status === 403);
check('/economy/me without a token is 401, with a junk token 401', (await call('/economy/me')).status === 401 && (await call('/economy/me', { token: 'x' })).status === 401);
const tokA = sa.v.json.token, tokB = sb.v.json.token;
check('faucet pays once a day', (await call('/economy/faucet', { method: 'POST', token: tokA })).json.paid === 1000 && (await call('/economy/faucet', { method: 'POST', token: tokA })).json.paid === 0);
await call('/economy/faucet', { method: 'POST', token: tokB });
check('balance shows through /economy/me', (await call('/economy/me', { token: tokA })).json.balance === 1000);

// ---- 2. a staked match, settled by the server's own result
const STAKE = 300;
const [nA, nB] = await Promise.all([
  NetSim.join(WS, { name: 'Alpha', operator: 'roms', room: 'staked', extra: { wallet: tokA, stake: STAKE } }),
  NetSim.join(WS, { name: 'Bravo', operator: 'shadow', room: 'staked', extra: { wallet: tokB, stake: STAKE } }),
]);
check('both stakes are locked in escrow while the match runs', se.economy.ledger.balance(`player:${A.addr}`) === 700 && se.economy.ledger.balance(`player:${B.addr}`) === 700, `A=${se.economy.ledger.balance(`player:${A.addr}`)}`);
const room = [...MatchRoom.instances].find((r) => r.stake === STAKE), sim = room.sim;
check('one staked room with both players', !!room && room.stakers.size === 2 && sim.humans.length === 2);
const keep = setInterval(() => { for (const h of sim.humans) if (h.alive) h.hp = h.maxHp; }, 40);
const fA = sim.fighters[nA.myId], fB = sim.fighters[nB.myId];
check('escrow holds the whole pot', se.economy.ledger.balance(`escrow:${room.roomId}`) === 600);
await sleep(300);
clearInterval(keep);
sim.damage(fB, 9999, fA, { cause: 'bullet', w: 'ar' });                                // B dies first: worse placement
for (const f of sim.fighters) if (f !== fA && f !== fB && !f.npc && f.alive) sim.damage(f, 9999, fA, { cause: 'bullet', w: 'ar' });
await sleep(1200);
const L = se.economy.ledger, wag = se.economy.wagers.wagers.get(room.roomId);
check('the match ended and the wager settled from the server result', sim.state === 'over' && wag.state === 'settled' && wag.winner === A.addr, `sim=${sim.state} wager=${wag.state} winner=${wag.winner}`);
check('winner got the pot (plus capped play-money earn), loser lost exactly the stake', L.balance(`player:${A.addr}`) >= 1300 && L.balance(`player:${A.addr}`) <= 1300 + 150 && L.balance(`player:${B.addr}`) === 700, `A=${L.balance(`player:${A.addr}`)} B=${L.balance(`player:${B.addr}`)}`);
check('escrow is empty and the ledger audit passes', L.balance(`escrow:${room.roomId}`) === 0 && L.audit().ok, JSON.stringify(L.audit()));
nA.dispose(); nB.dispose();

// ---- 3. refusals: no token, wrong stake, not enough play money, a stake outside the limits (raw SDK joins: these never reach a match)
const { Client } = await import('@colyseus/sdk');
const rawJoin = (opts) => new Client(WS).joinOrCreate('staked', { name: 'X', operator: 'roms', ...opts });
const joinErr = async (opts) => { try { const r = await rawJoin(opts); await r.leave(); return ''; } catch (e) { return String(e.message ?? e); } };
const D = newWallet(), sd = await signIn(D), tokD = sd.v.json.token; await call('/economy/faucet', { method: 'POST', token: tokD });        // D: fresh, 1000 PLAY, no losses
check('staked room: no wallet token -> refused', /sign in/.test(await joinErr({ stake: 300 })));
check('staked room: junk token -> refused', /sign in/.test(await joinErr({ stake: 300, wallet: 'nope' })));
check('staked room: stake below the minimum -> refused', /stake must be/.test(await joinErr({ stake: 10, wallet: tokD })));
check('staked room: not enough play money -> refused', /not enough play money/.test(await joinErr({ stake: 5000, wallet: tokD })));
check('the loser of the earlier match is in the cooldown (responsible-play limit)', /wait \d+ s after a loss/.test(await joinErr({ stake: 300, wallet: tokB })));
check('refused joins moved no money', L.balance(`player:${D.addr}`) === 1000 && L.audit().ok);

// ---- 4. a lone staker is refunded when the lobby ends
const voidMsg = []; const lone = await rawJoin({ stake: 400, wallet: tokD });
lone.onMessage('wagervoid', (m) => voidMsg.push(m)); lone.onMessage('*', () => {});
check('stake is held while waiting', L.balance(`player:${D.addr}`) === 600);
await sleep(3200);
check('with fewer than two stakers the room voids and the stake comes back', voidMsg.length === 1 && L.balance(`player:${D.addr}`) === 1000, `msgs=${voidMsg.length} bal=${L.balance(`player:${D.addr}`)}`);

// ---- 5. leaving before the start refunds
const leaver = await rawJoin({ stake: 200, wallet: tokD }); leaver.onMessage('*', () => {});
check('stake locked on join', L.balance(`player:${D.addr}`) === 800);
await leaver.leave(); await sleep(400);
check('leaving the lobby refunds in full', L.balance(`player:${D.addr}`) === 1000, `${L.balance(`player:${D.addr}`)}`);

// ---- 6. self-exclusion blocks staking
await call('/economy/exclude', { method: 'POST', token: tokD, body: { days: 1 } });
check('a self-excluded player cannot join a staked room', /self-exclu/.test(await joinErr({ stake: 200, wallet: tokD })));

// ---- 7. money survives a restart, and a normal (unstaked) join still works
se.save(); const saved = JSON.parse(readFileSync(DB, 'utf8'));
await sleep(200);
check('the ledger was saved to disk and is valid JSON with receipts', saved.v === 1 && saved.ledger.receipts.length > 5);
const plain = await NetSim.join(WS, { name: 'Plain', operator: 'roms', extra: { wallet: tokA } }); check('a normal unstaked room still works with a wallet linked', plain.myId !== undefined); plain.dispose();

se.stop();
rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : '\nall economy server checks passed');
process.exit(failed ? 1 : 0);
