import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ServerEconomy } from '../server/src/economy.js';

function makeEconomy() {
  const dir = mkdtempSync(join(tmpdir(), 'nighthawk-economy-hardening-'));
  const instance = new ServerEconomy({
    env: { NIGHTHAWK_ECONOMY: 'sandbox' },
    dbFile: join(dir, 'not-created.json'),
  });
  return { instance, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('wallet challenge domains default to explicit loopback values and are never host-learned', () => {
  const { instance, cleanup } = makeEconomy();
  try {
    assert.deepEqual(instance.economy.auth.domains, ['localhost', '127.0.0.1', '::1']);
    assert.equal(Object.hasOwn(instance, 'autoDomains'), false);
  } finally { cleanup(); }
});

test('the per-IP limiter refuses new keys at capacity without clearing active buckets', () => {
  const { instance, cleanup } = makeEconomy();
  try {
    const reset = Date.now() + 60_000;
    for (let i = 0; i < 5000; i++) instance.hits.set(`ip-${i}`, { n: 1, reset });
    assert.equal(instance._limited({ ip: 'new-rotating-ip' }), true);
    assert.equal(instance.hits.size, 5000);
    assert.equal(instance.hits.has('ip-0'), true);
    assert.equal(instance.hits.has('new-rotating-ip'), false);
  } finally { cleanup(); }
});

test('expired rate-limit keys are pruned before a new key is admitted', () => {
  const { instance, cleanup } = makeEconomy();
  try {
    const reset = Date.now() - 1;
    for (let i = 0; i < 5000; i++) instance.hits.set(`old-ip-${i}`, { n: 40, reset });
    assert.equal(instance._limited({ ip: 'fresh-ip' }), false);
    assert.equal(instance.hits.size, 1);
    assert.equal(instance.hits.has('fresh-ip'), true);
  } finally { cleanup(); }
});

test('a single IP receives forty requests per window and the forty-first is limited', () => {
  const { instance, cleanup } = makeEconomy();
  try {
    for (let i = 0; i < 40; i++) assert.equal(instance._limited({ ip: 'same-ip' }), false);
    assert.equal(instance._limited({ ip: 'same-ip' }), true);
  } finally { cleanup(); }
});
