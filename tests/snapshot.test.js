import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotLines } from '../src/ui/snapshot.js';

test('snapshot caption: battle royale win, loss with a killer, loss to the zone', () => {
  const w = snapshotLines({ won: true, kills: 7, time: 412, placement: 1 }, { name: 'cleis' });
  assert.deepEqual([w.title, w.sub, w.who, w.stats], ['WINNER WINNER', 'last one standing', 'CLEIS', '7 KILLS · 6:52 · #1']);
  assert.equal(w.file, 'nighthawk-win-412s.png');
  const l = snapshotLines({ won: false, kills: 1, time: 65, placement: 9 }, { killerName: 'Garrison-03' });
  assert.deepEqual([l.title, l.sub, l.stats], ['ELIMINATED', 'taken out by Garrison-03', '1 KILL · 1:05 · #9']);
  assert.equal(l.file, 'nighthawk-down-65s.png');
  assert.equal(snapshotLines({ won: false, kills: 0, time: 5, placement: 20 }).sub, 'the zone got you');
});

test('snapshot caption: operations name the mission and never show a placement; a trace lock reads as such', () => {
  const ok = snapshotLines({ won: true, mission: true, kills: 2, time: 301 }, { opName: 'OPERATION GHOST FREQUENCY' });
  assert.deepEqual([ok.title, ok.where, ok.sub, ok.stats], ['OPERATION COMPLETE', 'GHOST FREQUENCY', 'extracted', '2 KILLS · 5:01']);
  const trace = snapshotLines({ won: false, mission: true, reason: 'trace', kills: 0, time: 480 }, { opName: 'OPERATION GHOST FREQUENCY' });
  assert.deepEqual([trace.title, trace.sub, trace.stats], ['OPERATION FAILED', 'the trace locked on', '0 KILLS · 8:00']);
  assert.equal(snapshotLines({ won: false, mission: true, kills: 0, time: 9 }).sub, 'operator lost');
});

test('snapshot caption: missing fields and long callsigns are handled', () => {
  const x = snapshotLines({}, { name: 'a'.repeat(40) });
  assert.equal(x.who.length, 16); assert.equal(x.stats, '0 KILLS · 0:00'); assert.equal(x.title, 'ELIMINATED');
});
