// The DEFAULT server (no env switch, shipped data/compliance.json): the economy is closed. Nothing staked exists, every economy route refuses,
// normal matches work exactly as before. Runs as its own process because Colyseus keeps one matchmaker per process.
import { createServer } from '../src/index.js';
import { MatchRoom } from '../src/MatchRoom.js';
import { NetSim } from '../../src/net/netsim.js';

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) failed++; };
const PORT = 2595, BASE = `http://localhost:${PORT}`;
const server = createServer({ lobbySecs: 1, total: 3, loot: false, economyEnv: {} });
await server.listen(PORT);
const j = async (path, init) => { const r = await fetch(BASE + path, init); return { status: r.status, body: await r.json().catch(() => ({})) }; };

check('MatchRoom.economy is not wired when the gate is closed', MatchRoom.economy === null);
const st = await j('/economy/status');
check('/economy/status says off, no features, no currency', st.status === 200 && st.body.mode === 'off' && Object.values(st.body.features).every((v) => v === false) && st.body.currency === null, JSON.stringify(st.body));
const ch = await j('/economy/wallet/challenge', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: '0x' + '11'.repeat(20), chainId: 11155111 }) });
check('wallet challenge is refused (403 closed)', ch.status === 403 && ch.body.error === 'closed', JSON.stringify(ch.body));
check('faucet and me need a token and the gate: 401', (await j('/economy/faucet', { method: 'POST' })).status === 401 && (await j('/economy/me')).status === 401);
let staked = true; try { const n = await NetSim.join(`ws://localhost:${PORT}`, { name: 'X', room: 'staked', extra: { wallet: 'x', stake: 300 } }); n.dispose(); } catch { staked = false; }
check('there is no staked room on a default server', staked === false);
const n = await NetSim.join(`ws://localhost:${PORT}`, { name: 'Plain', operator: 'roms' });
check('a normal match starts as always', n.myId !== undefined); n.dispose();
console.log(failed ? `\n${failed} FAILED` : '\nall default-closed checks passed');
process.exit(failed ? 1 : 0);
