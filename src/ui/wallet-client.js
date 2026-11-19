// Browser side of the sandbox wallet flow. It only ever asks the wallet to SIGN a text message the server built; it never sees or stores a seed phrase or a
// private key, and it never sends a transaction. The token lives in sessionStorage (gone when the tab closes), not localStorage.
// Every function takes its dependencies (fetch, the wallet provider, storage) so the whole flow is unit-tested with fakes. NOT tested here with a real
// MetaMask or a real chain: that needs a person with a wallet.
export const TOKEN_KEY = 'nh_econ_session';
const ADDR = /^0x[0-9a-fA-F]{40}$/;

async function call(fetchFn, base, path, { method = 'GET', token, body } = {}) {
  const res = await fetchFn(`${base}${path}`, {
    method, cache: 'no-store',
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null; try { json = await res.json(); } catch { /* not json */ }
  if (!res.ok) { const e = new Error(String(json?.why ?? json?.error ?? `server said ${res.status}`).slice(0, 160)); e.status = res.status; throw e; }
  return json ?? {};
}

/** the gate status the server reports; null when this page has no game server behind it (never throws) */
export async function fetchStatus(base, fetchFn = globalThis.fetch) {
  try {
    const s = await call(fetchFn, base, '/economy/status');
    return s && typeof s === 'object' && typeof s.mode === 'string' && s.features && typeof s.features === 'object' ? s : null;
  } catch { return null; }
}

export function loadSession(storage = globalThis.sessionStorage, nowSecs = Date.now() / 1000) {
  try {
    const s = JSON.parse(storage?.getItem(TOKEN_KEY) ?? 'null');
    return s && typeof s.token === 'string' && ADDR.test(s.address ?? '') && Number.isFinite(s.exp) && s.exp > nowSecs + 5 ? s : null;
  } catch { return null; }
}
export function saveSession(s, storage = globalThis.sessionStorage) { try { storage?.setItem(TOKEN_KEY, JSON.stringify({ token: s.token, address: s.address, exp: s.exp })); return true; } catch { return false; } }
export function clearSession(storage = globalThis.sessionStorage) { try { storage?.removeItem(TOKEN_KEY); } catch { /* ignore */ } }

/**
 * connect = ask the wallet for an account, get a server-built message, have the wallet sign it, send the signature back.
 * @param {{ethereum:{request:Function}, base:string, fetchFn?:Function}} o
 * @returns {{address:string, token:string, exp:number}}
 */
export async function connectWallet({ ethereum, base, fetchFn = globalThis.fetch }) {
  if (!ethereum?.request) throw new Error('No browser wallet found (install MetaMask or another EIP-1193 wallet)');
  const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
  const address = Array.isArray(accounts) ? accounts[0] : null;
  if (!ADDR.test(address ?? '')) throw new Error('The wallet did not return an account');
  const chainId = Number.parseInt(await ethereum.request({ method: 'eth_chainId' }), 16);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error('The wallet did not report a network');
  const ch = await call(fetchFn, base, '/economy/wallet/challenge', { method: 'POST', body: { address, chainId } });
  if (typeof ch.message !== 'string' || typeof ch.nonce !== 'string') throw new Error('The server sent an unusable challenge');
  const signature = await ethereum.request({ method: 'personal_sign', params: [ch.message, address] });
  if (typeof signature !== 'string') throw new Error('The wallet did not sign');
  const v = await call(fetchFn, base, '/economy/wallet/verify', { method: 'POST', body: { nonce: ch.nonce, signature } });
  if (typeof v.token !== 'string' || !ADDR.test(v.address ?? '')) throw new Error('The server did not accept the signature');
  return { address: v.address, token: v.token, exp: Number(v.tokenExp) };
}

export const fetchMe = (base, token, fetchFn = globalThis.fetch) => call(fetchFn, base, '/economy/me', { token });
export const claimFaucet = (base, token, fetchFn = globalThis.fetch) => call(fetchFn, base, '/economy/faucet', { method: 'POST', token, body: {} });
export const selfExclude = (base, token, days, fetchFn = globalThis.fetch) => call(fetchFn, base, '/economy/exclude', { method: 'POST', token, body: { days } });
