// How much CPU does ONE 16-fighter match cost the server? (60 ticks = 1 second of game)
import { Simulation } from '../src/sim/world.js';
const sim = await Simulation.create({ seed: 9, bots: 14, humans: [{ operator: 'roms' }, { operator: 'shadow' }], propsFixed: true });
for (let i = 0; i < 120; i++) { sim.step(1 / 60, new Map()); sim.drainEvents(); }       // warm-up (JIT, wasm)
const N = 1800; const times = [];
for (let i = 0; i < N; i++) { const a = performance.now(); sim.step(1 / 60, new Map()); sim.drainEvents(); times.push(performance.now() - a); }
times.sort((x, y) => x - y);
const per = times.reduce((x, y) => x + y, 0) / N, worst = times[N - 1], p99 = times[Math.floor(N * 0.99)];
console.log(`16 fighters: ${per.toFixed(2)} ms per tick average, p99 ${p99.toFixed(1)} ms, worst ${worst.toFixed(1)} ms  =>  one match uses about ${(per * 60 / 10).toFixed(1)}% of one CPU core (60 ticks/s)`);
console.log(`so one core can host roughly ${Math.floor(1000 / 60 / per * 0.7)} matches at 70% load`);
