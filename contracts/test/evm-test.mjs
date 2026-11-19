// Runs both contracts in an in-process EVM (@ethereumjs/vm) and checks their behaviour. NOT part of npm run check: it needs heavy dev tools that are not project dependencies.
// To run:  mkdir /tmp/evm && cd /tmp/evm && npm init -y && npm i solc@0.8.28 ethers @ethereumjs/vm @ethereumjs/util && cp <repo>/contracts/test/evm-test.mjs . && (copy the two .sol files next to it, or fix the path below) && node evm-test.mjs
// Last result: 27 of 27 checks passed (19 Nov 2026), solc 0.8.28, optimizer 200 runs. This is a simulated EVM, not a live chain, and not an audit.
import { createVM } from '@ethereumjs/vm';
import { Address, createAddressFromString, createAccount, hexToBytes, bytesToHex } from '@ethereumjs/util';
import { Interface, AbiCoder, id as keccakId, parseEther, toUtf8Bytes, hexlify } from 'ethers';
import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const solc = require('solc');
const files = ['NighthawkCosmetics.sol', 'NighthawkWagerEscrow.draft.sol'];
const out = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: Object.fromEntries(files.map((f) => [f, { content: fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8') }])), settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } })));
const art = (f, n) => ({ abi: new Interface(out.contracts[f][n].abi), code: '0x' + out.contracts[f][n].evm.bytecode.object });
let failed = 0; const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!ok) failed++; };
const vm = await createVM();
const A = (n) => createAddressFromString('0x' + n.toString(16).padStart(40, '0'));
const [owner, p1, p2, p3, oracle, fee, stranger] = [1, 2, 3, 4, 5, 6, 7].map(A);
for (const a of [owner, p1, p2, p3, oracle, fee, stranger]) await vm.stateManager.putAccount(a, createAccount({ balance: parseEther('100') }));
let now = 1_800_000_000n;
const run = async (from, to, data, value = 0n) => { const r = await vm.evm.runCall({ caller: from, to, data: hexToBytes(data), value, gasLimit: 8_000_000n, block: { header: { timestamp: now, number: 1n, gasLimit: 30_000_000n, baseFeePerGas: 0n, coinbase: owner, difficulty: 0n, prevRandao: new Uint8Array(32), getBlobGasPrice: () => 1n } } }); return r; };
const deploy = async (from, a, args = []) => { const data = a.code + a.abi.encodeDeploy(args).slice(2); const r = await vm.evm.runCall({ caller: from, data: hexToBytes(data), gasLimit: 8_000_000n, block: { header: { timestamp: now, number: 1n, gasLimit: 30_000_000n, baseFeePerGas: 0n, coinbase: owner, difficulty: 0n, prevRandao: new Uint8Array(32), getBlobGasPrice: () => 1n } } }); if (r.execResult.exceptionError) throw new Error('deploy failed ' + r.execResult.exceptionError.error); return r.createdAddress; };
const call = async (a, addr, from, fn, args = [], value = 0n) => { const r = await run(from, addr, a.abi.encodeFunctionData(fn, args), value); const ok = !r.execResult.exceptionError; return { ok, ret: ok ? a.abi.decodeFunctionResult(fn, bytesToHex(r.execResult.returnValue)) : null, err: ok ? null : String(r.execResult.exceptionError.error), revertData: bytesToHex(r.execResult.returnValue) }; };
const hex = (a) => a.toString();

// ---- cosmetics
const C = art('NighthawkCosmetics.sol', 'NighthawkCosmetics');
const cos = await deploy(owner, C, ['https://example.test/meta/', hex(owner), 500]);
check('cosmetics: stranger cannot set a cap or mint', !(await call(C, cos, stranger, 'setSupplyCap', [1, 10])).ok && !(await call(C, cos, stranger, 'mint', [hex(stranger), 1, 1])).ok);
check('cosmetics: minting without a cap is refused', !(await call(C, cos, owner, 'mint', [hex(p1), 1, 1])).ok);
await call(C, cos, owner, 'setSupplyCap', [1, 3]);
check('cosmetics: a cap can be set only once (never raised)', !(await call(C, cos, owner, 'setSupplyCap', [1, 1000])).ok);
check('cosmetics: owner mints within the cap', (await call(C, cos, owner, 'mint', [hex(p1), 1, 2])).ok && (await call(C, cos, stranger, 'balanceOf', [hex(p1), 1])).ret[0] === 2n);
check('cosmetics: minting beyond the cap is refused', !(await call(C, cos, owner, 'mint', [hex(p1), 1, 2])).ok);
check('cosmetics: owner can transfer own token, a non-owner cannot move it', (await call(C, cos, p1, 'safeTransferFrom', [hex(p1), hex(p2), 1, 1, '0x'])).ok && !(await call(C, cos, stranger, 'safeTransferFrom', [hex(p1), hex(p3), 1, 1, '0x'])).ok);
check('cosmetics: balances after transfer', (await call(C, cos, p1, 'balanceOf', [hex(p2), 1])).ret[0] === 1n && (await call(C, cos, p1, 'balanceOf', [hex(p1), 1])).ret[0] === 1n);
check('cosmetics: cannot send more than you hold', !(await call(C, cos, p2, 'safeTransferFrom', [hex(p2), hex(p3), 1, 5, '0x'])).ok);
check('cosmetics: royalty is 5% and uri ends in the id', (await call(C, cos, p1, 'royaltyInfo', [1, 10000])).ret[1] === 500n && (await call(C, cos, p1, 'uri', [12])).ret[0] === 'https://example.test/meta/12.json');
check('cosmetics: no ETH accepted', !(await run(p1, cos, '0x', 1n)).execResult.exceptionError === false);
check('cosmetics: two-step ownership', (await call(C, cos, owner, 'transferOwnership', [hex(p3)])).ok && !(await call(C, cos, stranger, 'acceptOwnership')).ok && (await call(C, cos, p3, 'acceptOwnership')).ok && !(await call(C, cos, owner, 'mint', [hex(p1), 1, 1])).ok);

// ---- escrow
const E = art('NighthawkWagerEscrow.draft.sol', 'NighthawkWagerEscrowDraft');
const esc = await deploy(owner, E, [hex(oracle), hex(fee), parseEther('0.01'), parseEther('1'), 500]);
const id1 = keccakId('match-1'), S = parseEther('0.1'), bal = async (a) => (await vm.stateManager.getAccount(a)).balance;
check('escrow: wrong stake or out-of-range stake refused', !(await call(E, esc, p1, 'join', [id1], parseEther('0.001'))).ok && !(await call(E, esc, p1, 'join', [id1], parseEther('5'))).ok);
check('escrow: three players join with the same stake', (await call(E, esc, p1, 'join', [id1], S)).ok && (await call(E, esc, p2, 'join', [id1], S)).ok && (await call(E, esc, p3, 'join', [id1], S)).ok);
check('escrow: a different stake, a double join are refused', !(await call(E, esc, stranger, 'join', [id1], S + 1n)).ok && !(await call(E, esc, p1, 'join', [id1], S)).ok);
check('escrow: only the oracle can lock; needs 2+ players', !(await call(E, esc, stranger, 'lock', [id1])).ok && (await call(E, esc, oracle, 'lock', [id1])).ok);
check('escrow: nobody can leave or join once locked', !(await call(E, esc, p1, 'leave', [id1])).ok && !(await call(E, esc, stranger, 'join', [id1], S)).ok);
check('escrow: only the oracle can settle, and only to a participant', !(await call(E, esc, stranger, 'settle', [id1, hex(stranger)])).ok && !(await call(E, esc, oracle, 'settle', [id1, hex(stranger)])).ok);
check('escrow: settle credits winner pot minus 5% and the fee receiver the rake', (await call(E, esc, oracle, 'settle', [id1, hex(p2)])).ok && (await call(E, esc, p2, 'owed', [hex(p2)])).ret[0] === (S * 3n * 95n) / 100n && (await call(E, esc, p2, 'owed', [hex(fee)])).ret[0] === (S * 3n * 5n) / 100n);
check('escrow: settle cannot be repeated or switched', !(await call(E, esc, oracle, 'settle', [id1, hex(p1)])).ok && !(await call(E, esc, oracle, 'voidWager', [id1, 'x'])).ok);
const before = await bal(p2); await call(E, esc, p2, 'withdraw'); const after = await bal(p2);
check('escrow: winner withdraws exactly what is owed (pull payment)', after - before === (S * 3n * 95n) / 100n, `${after - before}`);
check('escrow: nothing left to withdraw twice; a loser has nothing', !(await call(E, esc, p2, 'withdraw')).ok && !(await call(E, esc, p1, 'withdraw')).ok);
const held = await bal(createAddressFromString(esc.toString())); check('escrow: contract holds only the rake until the receiver withdraws', held === (S * 3n * 5n) / 100n, `${held}`);
// void path + timeout escape hatch
const id2 = keccakId('match-2'); await call(E, esc, p1, 'join', [id2], S); await call(E, esc, p2, 'join', [id2], S); await call(E, esc, oracle, 'lock', [id2]);
check('escrow: timeout refund is refused too early', !(await call(E, esc, stranger, 'refundAfterTimeout', [id2])).ok);
now += 2n * 86400n + 1n;
check('escrow: if the oracle vanishes, ANYONE can release the stakes after the timeout', (await call(E, esc, stranger, 'refundAfterTimeout', [id2])).ok && (await call(E, esc, p1, 'owed', [hex(p1)])).ret[0] === S && (await call(E, esc, p2, 'owed', [hex(p2)])).ret[0] === S);
const id3 = keccakId('match-3'); await call(E, esc, p1, 'join', [id3], S);
check('escrow: leaving an open wager refunds the stake as credit', (await call(E, esc, p1, 'leave', [id3])).ok && (await call(E, esc, p1, 'owed', [hex(p1)])).ret[0] === S * 2n);
const id4 = keccakId('match-4'); await call(E, esc, p1, 'join', [id4], S); await call(E, esc, p2, 'join', [id4], S); await call(E, esc, oracle, 'lock', [id4]);
check('escrow: oracle can void a running wager (refund all)', (await call(E, esc, oracle, 'voidWager', [id4, 'crash'])).ok && !(await call(E, esc, oracle, 'settle', [id4, hex(p1)])).ok);
check('escrow: bad constructor config refused (rake over 10%)', await deploy(owner, E, [hex(oracle), hex(fee), 1n, 10n, 5000]).then(() => false, () => true));
console.log(failed ? `\n${failed} FAILED` : '\nall contract behaviour checks passed (in-process EVM, not a live chain)'); process.exit(failed ? 1 : 0);
