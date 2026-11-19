// Server abuse protection (server/src/limits.js): token buckets, kick rule, tick statistics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Bucket, ClientGuard, TickStats, LIMITS, KICK_AFTER } from '../server/src/limits.js';
import { toPrometheus } from '../server/src/index.js';

test('bucket: a burst is allowed, then the sender is held to the refill rate, and quiet time earns tokens back', () => {
  const b = new Bucket(10, 5, 0);                                        // 10 per second, burst 5
  let ok = 0; for (let i = 0; i < 20; i++) if (b.take(0)) ok++;
  assert.equal(ok, 5, 'the burst');
  assert.equal(b.take(50), false, '50 ms later only half a token has come back');
  assert.equal(b.take(110), true, 'one token after 100 ms');
  assert.equal(b.take(110), false);
  let later = 0; for (let i = 0; i < 20; i++) if (b.take(10_000)) later++;
  assert.equal(later, 5, 'a long pause refills to the burst and never beyond it');
});

test('a normal player never trips the limits: a 240 fps monitor sends 240 input batches a second, plus a ping per second, for a minute', () => {
  const g = new ClientGuard(0); let bad = 0;
  for (let ms = 0; ms < 60_000; ms += 1000 / 240) { if (g.check('c', ms) !== 'ok') bad++; }
  for (let ms = 0; ms < 60_000; ms += 1000) if (g.check('ping', ms) !== 'ok') bad++;
  assert.equal(bad, 0);
});

test('a flooder is dropped first and kicked only after a long unbroken run of excess messages', () => {
  const g = new ClientGuard(0); const out = [];
  for (let i = 0; i < 600; i++) out.push(g.check('c', 0));               // 600 messages in the same millisecond
  assert.equal(out.filter((r) => r === 'ok').length, LIMITS.c.burst);
  assert.equal(out.indexOf('kick'), LIMITS.c.burst + KICK_AFTER - 1, 'kicked exactly when the strike counter fills');
  assert.ok(g.dropped >= KICK_AFTER);
  // somebody who only briefly exceeds the rate recovers (a good message pays a strike back)
  const h = new ClientGuard(0); for (let i = 0; i < LIMITS.c.burst + 50; i++) h.check('c', 0);
  for (let i = 0; i < 60; i++) assert.notEqual(h.check('c', 5000 + i * 7), 'kick');
});

test('unknown message types get a tiny allowance, and unknown buckets are separate from input', () => {
  const g = new ClientGuard(0); let ok = 0; for (let i = 0; i < 100; i++) if (g.check('hax', 0) === 'ok') ok++;
  assert.equal(ok, LIMITS.other.burst);
  assert.equal(g.check('c', 0), 'ok', 'junk does not use up the input allowance');
});

test('tick stats: average, p99 and max over the last window, slow-tick counter', () => {
  const t = new TickStats(100); assert.deepEqual(t.summary(), { avg: 0, p99: 0, max: 0, samples: 0, slow: 0 });
  for (let i = 0; i < 99; i++) t.add(1); t.add(30);
  const s = t.summary(); assert.equal(s.samples, 100); assert.equal(s.max, 30); assert.equal(s.slow, 1); assert.ok(s.avg > 1.2 && s.avg < 1.4, String(s.avg)); assert.equal(s.p99, 30);
  for (let i = 0; i < 200; i++) t.add(2);
  assert.equal(t.summary().p99, 2, 'old samples fall out of the window'); assert.equal(t.summary().max, 30, 'but max remembers the worst ever');
});

test('prometheus text has a HELP, TYPE and value line per metric and no NaN', () => {
  const m = { uptimeSecs: 5, rooms: { total: 2, playing: 1, lobby: 1, max: 40 }, players: { humans: 3, botsAlive: 10, offline: 1 }, tick: { avg: 0.9, p99: 3, max: 8, samples: 600, slow: 2 }, counters: { roomsCreated: 2, joins: 5, kicks: 1, reconnectsFailed: 0 }, memoryMB: { rss: 120, heapUsed: 60 } };
  const txt = toPrometheus(m); const lines = txt.trim().split('\n');
  assert.ok(txt.includes('nighthawk_rooms 2') && txt.includes('nighthawk_reconnects_failed_total 0') && txt.includes('nighthawk_tick_ms_p99 3'));
  assert.equal(lines.length % 3, 0); assert.ok(!/NaN|undefined/.test(txt));
});
