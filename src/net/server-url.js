// Where is the game server? Normally ?online=ws://host:2567 or VITE_SERVER_URL. When the game page itself is served BY the game server
// (npm run host: one port, one link, e.g. a free Cloudflare tunnel), the server is simply the same origin.

/** ws(s):// URL of the page's own origin: https -> wss, http -> ws */
export function sameOriginWs(loc) {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}`;
}

/** true only for the NIGHTHAWK /health reply (a static host that answers every path with index.html or a 404 must not pass) */
export function isGameServerHealth(contentType, body) {
  return /json/i.test(String(contentType ?? '')) && !!body && body.ok === true && typeof body.rooms === 'number' && typeof body.players === 'number';
}

/** @returns the ws URL if this page's origin is a NIGHTHAWK server, else '' (never throws) */
export async function detectSameOriginServer(loc = globalThis.location, fetchFn = globalThis.fetch) {
  try {
    if (!loc || !fetchFn || !/^https?:$/.test(loc.protocol)) return '';
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 2500) : null;
    const res = await fetchFn(`${loc.origin}/health`, { cache: 'no-store', signal: ctrl?.signal });
    if (timer) clearTimeout(timer);
    if (!res.ok) return '';
    const body = await res.json();
    return isGameServerHealth(res.headers.get('content-type'), body) ? sameOriginWs(loc) : '';
  } catch { return ''; }
}
