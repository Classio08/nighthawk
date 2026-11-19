// Ephemeral public server directory. A production multi-region registry needs a shared datastore;
// this in-process version is intentionally for one directory/coordinator process.
import { timingSafeEqual } from 'node:crypto';

const clean = (value, max = 48) => String(value ?? '').replace(/[^a-zA-Z0-9 _.\-]/g, '').trim().slice(0, max);
const isWsUrl = (value) => {
  try { const url = new URL(value); return (url.protocol === 'wss:' || url.protocol === 'ws:') && !url.username && !url.password; }
  catch { return false; }
};

export class CommunityServerRegistry {
  constructor({ secret = process.env.NIGHTHAWK_REGISTRY_SECRET ?? '', now = () => Date.now(), ttlMs = 45000 } = {}) {
    this.secret = secret;
    this.now = now;
    this.ttlMs = ttlMs;
    this.entries = new Map();
  }

  _authorized(candidate) {
    if (!this.secret || typeof candidate !== 'string') return false;
    const a = Buffer.from(this.secret), b = Buffer.from(candidate);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  heartbeat(secret, input = {}) {
    if (!this._authorized(secret)) return { ok: false, status: 401, error: 'registry-unauthorized' };
    const id = clean(input.id, 64);
    const url = String(input.url ?? '');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,63}$/.test(id) || !isWsUrl(url)) return { ok: false, status: 400, error: 'invalid-server-record' };
    const maxPlayers = Math.max(1, Math.min(64, Math.trunc(Number(input.maxPlayers) || 16)));
    const players = Math.max(0, Math.min(maxPlayers, Math.trunc(Number(input.players) || 0)));
    const record = {
      id, name: clean(input.name, 48) || 'NIGHTHAWK Server',
      region: clean(input.region, 24) || 'unknown',
      mode: clean(input.mode, 24) || 'mixed',
      map: clean(input.map, 32) || 'Kavari Basin',
      url, players, maxPlayers,
      passwordRequired: input.passwordRequired === true,
      tags: Array.isArray(input.tags) ? [...new Set(input.tags.map((tag) => clean(tag, 16)).filter(Boolean))].slice(0, 8) : [],
      lastHeartbeat: this.now(),
    };
    this.entries.set(id, record);
    return { ok: true, server: { ...record } };
  }

  list() {
    const now = this.now();
    for (const [id, entry] of this.entries) if (now - entry.lastHeartbeat > this.ttlMs) this.entries.delete(id);
    return [...this.entries.values()].map(({ lastHeartbeat, ...publicRecord }) => ({ ...publicRecord, heartbeatAgeMs: Math.max(0, now - lastHeartbeat) }))
      .sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name));
  }

  remove(secret, id) {
    if (!this._authorized(secret)) return false;
    return this.entries.delete(String(id));
  }
}

export const communityServerRegistry = new CommunityServerRegistry();
