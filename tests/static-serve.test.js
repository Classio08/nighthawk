import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStatic } from '../server/src/static.js';
import { sameOriginWs, isGameServerHealth, detectSameOriginServer } from '../src/net/server-url.js';

test('resolveStatic: root is index.html, normal files pass through', () => {
  assert.equal(resolveStatic('/'), 'index.html');
  assert.equal(resolveStatic(''), 'index.html');
  assert.equal(resolveStatic('/assets/app-abc123.js'), 'assets/app-abc123.js');
  assert.equal(resolveStatic('/audio/voice/onKill_kestrel_1.mp3?x=1'), 'audio/voice/onKill_kestrel_1.mp3');
});

test('resolveStatic: refuses traversal in every spelling, dotfiles, null bytes and backslashes', () => {
  for (const bad of ['/../secret', '/a/../../etc/passwd', '/%2e%2e/secret', '/%2E%2E%2Fsecret', '/..%2f..%2fetc/passwd', '/.env', '/a/.git/config', '/x%00.js', '/a\\..\\b', '/%zz']) {
    assert.equal(resolveStatic(bad), null, `must refuse ${JSON.stringify(bad)}`);
  }
});

test('resolveStatic: the game server\'s own routes are never shadowed', () => {
  for (const p of ['/health', '/metrics', '/matchmake/joinOrCreate/match', '/matchmake']) assert.equal(resolveStatic(p), null, p);
  assert.equal(resolveStatic('/healthy.png'), 'healthy.png');      // only the exact route names, not a prefix
});

test('same-origin server URL follows the page protocol', () => {
  assert.equal(sameOriginWs({ protocol: 'https:', host: 'abc.trycloudflare.com' }), 'wss://abc.trycloudflare.com');
  assert.equal(sameOriginWs({ protocol: 'http:', host: '192.168.1.5:2567' }), 'ws://192.168.1.5:2567');
});

test('only the real NIGHTHAWK /health reply counts as "this origin is a game server"', () => {
  const ok = { ok: true, uptimeSecs: 3, rooms: 0, players: 0 };
  assert.equal(isGameServerHealth('application/json; charset=utf-8', ok), true);
  assert.equal(isGameServerHealth('text/html', ok), false);                       // an SPA host answering every path with index.html
  assert.equal(isGameServerHealth('application/json', { ok: true }), false);       // some other service's health check
  assert.equal(isGameServerHealth('application/json', null), false);
});

test('detectSameOriginServer: yes for a game server, empty for static hosts, 404s, junk and network errors (never throws)', async () => {
  const loc = { protocol: 'https:', host: 'g.example.com', origin: 'https://g.example.com' };
  const reply = (status, ct, body) => async () => ({ ok: status < 400, status, headers: { get: () => ct }, json: async () => { if (body === 'bad') throw new Error('not json'); return body; } });
  assert.equal(await detectSameOriginServer(loc, reply(200, 'application/json', { ok: true, rooms: 1, players: 2 })), 'wss://g.example.com');
  assert.equal(await detectSameOriginServer(loc, reply(404, 'text/html', null)), '');
  assert.equal(await detectSameOriginServer(loc, reply(200, 'text/html', 'bad')), '');
  assert.equal(await detectSameOriginServer(loc, async () => { throw new Error('offline'); }), '');
  assert.equal(await detectSameOriginServer({ protocol: 'file:', host: '', origin: 'null' }, reply(200, 'application/json', {})), '');
});
