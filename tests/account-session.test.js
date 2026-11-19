import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accountApiBase, createGuestSession, createRoomTicket, getAccount,
} from '../src/net/account-session.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test('account API base follows ws/wss origin but never carries WebSocket paths', () => {
  assert.equal(accountApiBase('ws://localhost:2567'), 'http://localhost:2567/api/v1/');
  assert.equal(accountApiBase('wss://game.example.com/matchmaking'), 'https://game.example.com/api/v1/');
  assert.throws(() => accountApiBase('file:///tmp/game.html'));
});

test('guest session creation stores opaque token and room ticket requests use it', async () => {
  const storage = memoryStorage(), calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/guest')) return { ok: true, status: 201, json: async () => ({ sessionToken: 'opaque-session-token-0123456789abcdef0123456789abcdef', account: { id: 'acct' } }) };
    if (String(url).endsWith('/room-ticket')) return { ok: true, status: 200, json: async () => ({ ticket: 'one-use-room-ticket' }) };
    return { ok: true, status: 200, json: async () => ({ account: { id: 'acct' } }) };
  };
  const guest = await createGuestSession('ws://localhost:2567', { fetchImpl, storage });
  assert.equal(guest.id, 'acct');
  const ticket = await createRoomTicket('ws://localhost:2567', { fetchImpl, storage });
  assert.equal(ticket, 'one-use-room-ticket');
  assert.ok(calls.some((call) => call.url.endsWith('/room-ticket') && call.options.headers.Authorization.startsWith('Bearer ')));
});

test('account profile fetch keeps authentication in the Authorization header', async () => {
  const storage = memoryStorage();
  storage.setItem('nh_guest_session_v1', 'opaque-session-token-0123456789abcdef0123456789abcdef');
  const response = await getAccount('wss://game.example.com', {
    storage,
    fetchImpl: async (_url, options) => ({ ok: true, status: 200, json: async () => ({ account: { id: 'acct-1' }, authorization: options.headers.Authorization }) }),
  });
  assert.equal(response.id, 'acct-1');
});
