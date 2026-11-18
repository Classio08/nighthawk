// Spike test: boots the server, joins two fake players, and checks movement sync, wall blocking and server-side hits.
import { Client } from '@colyseus/sdk';
import { createServer } from '../src/index.js';
import { MoveInput } from '../src/schema.js';

const PORT = 2599;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) failed++; };

const server = createServer();
await server.listen(PORT);

const join = async (name) => {
  const client = new Client(`ws://localhost:${PORT}`);
  const room = await client.joinOrCreate('arena', { name });
  const input = room.input({ type: MoveInput });
  return { room, input, name };
};
const A = await join('Roms');
const B = await join('Shadow');
await sleep(400);

const me = (c) => c.room.state.players.get(c.room.sessionId);
const other = (c, o) => c.room.state.players.get(o.room.sessionId);
check('both players see 2 players', A.room.state.players.size === 2 && B.room.state.players.size === 2);

// drive a client's inputs at 30 Hz for `ms` milliseconds
async function drive(c, ms, cmd) {
  const end = Date.now() + ms;
  while (Date.now() < end) { Object.assign(c.input.data, { forward: 0, strafe: 0, jump: false, sprint: false, fire: false, yaw: 0, pitch: 0 }, cmd); c.input.send(); await sleep(1000 / 30); }
  Object.assign(c.input.data, { forward: 0, strafe: 0, fire: false }); c.input.send(); await sleep(150);
}
const aim = (from, to) => ({ yaw: Math.atan2(-(to.x - from.x), -(to.z - from.z)), pitch: 0 });

// 1. D key (strafe +1) moves A to the RIGHT (+X), and B sees it
const a0 = { x: other(B, A).x, z: other(B, A).z };
await drive(A, 500, { strafe: 1 });
const a1 = other(B, A);
check('D moves A right (+X) as seen by B', a1.x - a0.x > 2.5, `dx=${(a1.x - a0.x).toFixed(2)}`);

// 2. wall blocks the shot (A is at x~3.5, wall edge x=2; line to B passes through the wall)
const bp = other(A, B), ap = me(A);
await drive(A, 100, { ...aim(ap, bp), fire: true });
await sleep(150);
check('shot through the wall does no damage', other(A, B).hp === 100, `B hp=${other(A, B).hp}`);

// 3. strafe further right so the line is clear, then shoot: server applies damage
await drive(A, 500, { strafe: 1 });
const ap2 = me(A);
const fireCmd = { ...aim(ap2, other(A, B)), fire: true };
Object.assign(A.input.data, { forward: 0, strafe: 0, jump: false, sprint: false }, fireCmd); A.input.send(); await sleep(150);
Object.assign(A.input.data, { fire: false }); A.input.send(); await sleep(200);
check('clear shot hits B and server lowers HP to 66', other(A, B).hp === 66 && other(B, B).hp === 66, `B hp (A view)=${other(A, B).hp}, (B view)=${other(B, B).hp}`);

// 4. two more hits kill B (66 -> 32 -> dead) -> A gets a kill, B respawns with full health
for (let i = 0; i < 2; i++) {
  Object.assign(A.input.data, { fire: true, ...aim(me(A), other(A, B)) }); A.input.send(); await sleep(160);
  Object.assign(A.input.data, { fire: false }); A.input.send(); await sleep(60);
}
await sleep(200);
check('A has 1 kill and B respawned at 100 HP', me(A).kills === 1 && other(A, B).hp === 100, `kills=${me(A).kills}, B hp=${other(A, B).hp}`);

await A.room.leave(); await B.room.leave();
await sleep(200);
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll multiplayer spike checks passed');
await server.gracefullyShutdown?.(false).catch(() => {});
process.exit(failed ? 1 : 0);
