// Browser client for guest identity and one-use Colyseus join tickets.
// The long-lived opaque session is stored locally; never put passwords or payment data here.
const STORAGE_KEY = 'nh_guest_session_v1';

export function accountApiBase(serverUrl) {
  const url = new URL(serverUrl);
  if (url.protocol === 'ws:') url.protocol = 'http:';
  else if (url.protocol === 'wss:') url.protocol = 'https:';
  else if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new TypeError('Unsupported game server URL');
  return new URL('/api/v1/', url).toString();
}

function storageOrNull(storage) {
  try { return storage ?? globalThis.localStorage ?? null; } catch { return null; }
}
function readToken(storage) {
  try { return storageOrNull(storage)?.getItem(STORAGE_KEY) ?? null; } catch { return null; }
}
function saveToken(storage, value) {
  try { storageOrNull(storage)?.setItem(STORAGE_KEY, value); return true; } catch { return false; }
}

async function requestJson(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, { ...options, cache: 'no-store', headers: { Accept: 'application/json', ...(options.headers ?? {}) } });
  let body = {};
  try { body = await response.json(); } catch { /* server/proxy returned no JSON */ }
  if (!response.ok) {
    const error = new Error(body.error ?? `Account API returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function createGuestSession(serverUrl, { fetchImpl = globalThis.fetch, storage } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable');
  const base = accountApiBase(serverUrl);
  const response = await requestJson(fetchImpl, new URL('guest', base), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!response.sessionToken || typeof response.sessionToken !== 'string') throw new Error('Guest session response did not contain a session token');
  saveToken(storage, response.sessionToken);
  return response.account ?? null;
}

export async function ensureGuestSession(serverUrl, { fetchImpl = globalThis.fetch, storage } = {}) {
  const current = readToken(storage);
  if (current) {
    try { return await getAccount(serverUrl, { fetchImpl, storage }); }
    catch (error) {
      if (error.status !== 401) throw error;
      try { storageOrNull(storage)?.removeItem(STORAGE_KEY); } catch { /* ignore disabled storage */ }
    }
  }
  return createGuestSession(serverUrl, { fetchImpl, storage });
}

export async function createRoomTicket(serverUrl, { fetchImpl = globalThis.fetch, storage } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable');
  const base = accountApiBase(serverUrl);
  let sessionToken = readToken(storage);
  if (!sessionToken) {
    await createGuestSession(serverUrl, { fetchImpl, storage });
    sessionToken = readToken(storage);
  }
  const request = () => requestJson(fetchImpl, new URL('room-ticket', base), {
    method: 'POST',
    headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  try {
    const response = await request();
    return response.ticket;
  } catch (error) {
    if (error.status !== 401) throw error;
    try { storageOrNull(storage)?.removeItem(STORAGE_KEY); } catch { /* storage may be disabled */ }
    await createGuestSession(serverUrl, { fetchImpl, storage });
    sessionToken = readToken(storage);
    return (await requestJson(fetchImpl, new URL('room-ticket', base), {
      method: 'POST', headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' }, body: '{}',
    })).ticket;
  }
}

export async function accountRequest(serverUrl, route, { method = 'GET', body, fetchImpl = globalThis.fetch, storage } = {}) {
  const sessionToken = readToken(storage);
  if (!sessionToken) throw new Error('No guest account session exists');
  const base = accountApiBase(serverUrl);
  return requestJson(fetchImpl, new URL(route.replace(/^\//, ''), base), {
    method,
    headers: { Authorization: `Bearer ${sessionToken}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export async function getAccount(serverUrl, options) {
  return (await accountRequest(serverUrl, 'account', options)).account;
}
export async function getStoreCatalog(serverUrl, options) {
  return (await accountRequest(serverUrl, 'store/catalog', { ...options, method: 'GET' })).items;
}
export async function buyCosmetic(serverUrl, itemId, requestId, options) {
  return accountRequest(serverUrl, 'store/purchase', { ...options, method: 'POST', body: { itemId, requestId } });
}
export async function getSafehouseCatalog(serverUrl, options) {
  return (await accountRequest(serverUrl, 'safehouses/catalog', { ...options, method: 'GET' })).safehouses;
}
export async function buySafehouse(serverUrl, safehouseId, requestId, options) {
  return accountRequest(serverUrl, 'safehouses/purchase', { ...options, method: 'POST', body: { safehouseId, requestId } });
}
export async function getCommunityServers(serverUrl, { fetchImpl = globalThis.fetch } = {}) {
  const base = accountApiBase(serverUrl);
  const response = await requestJson(fetchImpl, new URL('community/servers', base));
  return response.servers ?? [];
}
export async function logout(serverUrl, options) {
  const result = await accountRequest(serverUrl, 'session', { ...options, method: 'DELETE' });
  try { storageOrNull(options?.storage)?.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  return result;
}
