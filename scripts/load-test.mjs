// Load test: ONE server, N real network clients (the same NetSim code the game uses) playing one match for a while.
// Measures what a host has to pay for: server tick time (p50/p99/max against the 16.7 ms budget at 60 Hz), memory, and the bytes per second
// each player receives and sends (counted on the client's real WebSocket). The clients run, shoot and move (random walks + bursts), so snapshots are not empty.
//   node scripts/load-test.mjs [humans=16] [seconds=40] [rooms=1]
import { createServer } from '../server/src/index.js';
import { MatchRoom } from '../server/src/MatchRoom.js';
import { NetSim } from '../src/net/netsim.js';
import { idleCmd } from '../src/sim/cmd.js';
import { OPERATORS } from '../src/sim/world.js';

const HUMANS = +process.argv[2] || 16, SECS = +process.argv[3] || 40, ROOMS = +process.argv[4] || 1, PORT = 2650, STEP = 1 / 60;
const server = createServer({ lobbySecs: 2, total: 16, maxClients: HUMANS, loot: true, vehicles: true, drop: false, maxRooms: 8, compress: process.env.COMPRESS !== '0' });
await server.listen(PORT);
const URL = `ws://localhost:${PORT}`;
const ops = OPERATORS.map((o) => o.id);

const clients = [];
for (let r = 0; r < ROOMS; r++) {
  const batch = await Promise.all(Array.from({ length: HUMANS }, (_, i) => NetSim.join(URL, { name: `P${r}-${i}`, operator: ops[i % ops.length], lag: 40 })));
  clients.push(...batch);
}
// byte counters on the real sockets: read on the SERVER side of each connection (a Node client has no raw socket to look at), so they are what really crossed the
// wire, WebSocket framing and permessage-deflate included. 'rx' = what the player downloads, 'tx' = what the player uploads.
const io = [];
for (const room of MatchRoom.instances) for (const c of Array.from(room.clients)) {
  const s = c.ref?._socket; io.push({ s, w0: s?.bytesWritten ?? 0, r0: s?.bytesRead ?? 0, msgs: 0, get rx() { return (s?.bytesWritten ?? 0) - this.w0; }, get tx() { return (s?.bytesRead ?? 0) - this.r0; } });
}
clients.forEach((ns, i) => ns.room.onMessage('s', () => { if (io[i]) io[i].msgs++; }));
if (!io.length || !io[0].s) console.log('(could not hook the sockets: byte counts will be zero)');
console.log(`server compression: ${process.env.COMPRESS === '0' ? 'OFF' : 'ON (permessage-deflate)'}`);

/** each client: a random walk with bursts of fire, jumps and turns, driven at 60 Hz in real time */
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const drivers = clients.map((ns) => {
  let acc = 0, last = performance.now(), t = 0, dir = rnd() * 6.28, yawT = 0, fireT = 0;
  return setInterval(() => {
    const now = performance.now(); acc += Math.min(0.1, (now - last) / 1000); last = now;
    while (acc >= STEP) {
      t += STEP; acc -= STEP;
      if (t > yawT) { yawT = t + 0.8 + rnd() * 2; dir += (rnd() - 0.5) * 3; fireT = rnd() < 0.4 ? t + 0.6 : 0; }
      ns.step(STEP, { ...idleCmd(), yaw: dir, forward: 1, sprint: rnd() < 0.002, jump: rnd() < 0.01, fire: t < fireT, reload: rnd() < 0.003, grenade: rnd() < 0.0008, smoke: rnd() < 0.0004, melee: rnd() < 0.0008 });
    }
    ns.update(1 / 60);
  }, 8);
});

const m0 = MatchRoom.metrics(), t0 = Date.now(), samples = [];
const sampler = setInterval(() => { const m = MatchRoom.metrics(); samples.push({ avg: m.tick.avg, p99: m.tick.p99, max: m.tick.max, rss: m.memoryMB.rss, heap: m.memoryMB.heapUsed }); }, 2000);
await new Promise((r) => setTimeout(r, SECS * 1000));
clearInterval(sampler); drivers.forEach(clearInterval);
const secs = (Date.now() - t0) / 1000, m = MatchRoom.metrics();
const rx = io.map((c) => c.rx / secs), tx = io.map((c) => c.tx / secs), msgs = io.map((c) => c.msgs / secs);
const avg = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1), mx = (a) => Math.max(...a, 0);
const kb = (b) => (b / 1024).toFixed(1);
const alive = clients.filter((c) => c.me?.alive).length;
console.log(`\nLOAD TEST: ${HUMANS} humans x ${ROOMS} room(s) + bots, ${secs.toFixed(0)} s, one server process`);
console.log(`  rooms playing: ${m.rooms.playing}, humans connected: ${m.players.humans}, still alive at the end: ${alive}, rate-limited drops: ${m.counters.rateLimited}, kicks: ${m.counters.kicks}`);
console.log(`  server tick (60 Hz budget 16.7 ms): avg ${m.tick.avg} ms, p99 ${m.tick.p99} ms, max ${m.tick.max} ms; worst 2 s sample p99 ${mx(samples.map((s) => s.p99))} ms`);
console.log(`  memory: rss ${m.memoryMB.rss} MB, heap ${m.memoryMB.heapUsed} MB (start ${m0.memoryMB.rss} MB)`);
console.log(`  per player download: avg ${kb(avg(rx))} KB/s (max ${kb(mx(rx))}), ${avg(msgs).toFixed(1)} messages/s; upload: avg ${kb(avg(tx))} KB/s`);
const totalGBh = (avg(rx) * HUMANS * ROOMS * 3600) / 1024 ** 3;
console.log(`  whole server: ${kb(avg(rx) * HUMANS * ROOMS)} KB/s out = ${totalGBh.toFixed(2)} GB per hour of play`);
const budget = m.tick.p99 < 16.7 ? 'OK' : 'OVER the frame budget';
console.log(`  verdict: tick p99 ${budget}`);
clients.forEach((c) => c.leave());
await new Promise((r) => setTimeout(r, 300));
await server.gracefullyShutdown?.(false).catch?.(() => {});
process.exit(0);
