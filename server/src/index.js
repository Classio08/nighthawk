import { defineServer, defineRoom } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { MatchRoom, DEFAULTS } from './MatchRoom.js';
import { accountService, COSMETIC_CATALOG, SAFEHOUSE_CATALOG } from './account-service.js';
import { communityServerRegistry } from './community-registry.js';
import express from 'express';

/** Prometheus text format of /metrics (counters and gauges), for a scraper or Grafana */
export function toPrometheus(m) {
  const L = [], g = (name, v, help, type = 'gauge') => { L.push(`# HELP nighthawk_${name} ${help}`, `# TYPE nighthawk_${name} ${type}`, `nighthawk_${name} ${v}`); };
  g('uptime_seconds', m.uptimeSecs, 'process uptime'); g('rooms', m.rooms.total, 'open rooms'); g('rooms_playing', m.rooms.playing, 'rooms with a running match'); g('humans', m.players.humans, 'connected human players'); g('players_offline', m.players.offline, 'players inside the reconnect window');
  g('tick_ms_avg', m.tick.avg, 'average match tick time (ms)'); g('tick_ms_p99', m.tick.p99, '99th percentile tick time (ms)'); g('tick_ms_max', m.tick.max, 'worst tick time (ms)'); g('ticks_slow_total', m.tick.slow, 'ticks slower than 16.7 ms', 'counter');
  for (const [k, v] of Object.entries(m.counters)) g(`${k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())}_total`, v, k, 'counter');
  g('memory_rss_mb', m.memoryMB.rss, 'resident memory (MB)');
  return L.join('\n') + '\n';
}

/** @param {{lobbySecs?:number,total?:number}} cfg  (tests use a 1 second lobby) */
export function createServer(cfg = {}) {
  MatchRoom.cfg = { ...DEFAULTS, ...cfg };
  return defineServer({
    transport: new WebSocketTransport({ maxPayload: 4096, pingInterval: 5000, pingMaxRetries: 3, perMessageDeflate: MatchRoom.cfg.compress === false ? false : { threshold: 512, zlibDeflateOptions: { level: 3 }, serverNoContextTakeover: true, clientNoContextTakeover: true } }),     // a real input batch is under 1 KB: anything bigger is not from our client
    rooms: { match: defineRoom(MatchRoom) },
    express: (app) => {
      app.disable('x-powered-by');
      // Account/economy API: bearer tokens are opaque random values; only hashes are stored server-side.
      // Cross-origin browser access is disabled unless the owner explicitly configures NIGHTHAWK_WEB_ORIGIN.
      const allowedOrigins = new Set(String(process.env.NIGHTHAWK_WEB_ORIGIN ?? '').split(',').map((x) => x.trim()).filter(Boolean));
      app.use('/api/v1', (req, res, next) => {
        const origin = req.get('origin');
        if (origin && allowedOrigins.has(origin)) {
          res.set('Access-Control-Allow-Origin', origin);
          res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-NH-Registry-Key');
          res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
          res.set('Vary', 'Origin');
        }
        if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
        next();
      });
      app.use('/api/v1', express.json({ limit: '12kb', strict: true }));

      const bearer = (req) => {
        const value = String(req.get('authorization') ?? '');
        return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
      };
      const apiError = (res, status, error) => res.status(status).json({ ok: false, error });
      const guestAttempts = new Map();
      app.post('/api/v1/guest', async (req, res) => {
        const ip = String(req.ip ?? req.socket?.remoteAddress ?? 'unknown');
        const now = Date.now(), recent = (guestAttempts.get(ip) ?? []).filter((time) => now - time < 60_000);
        if (recent.length >= 6) { apiError(res, 429, 'guest-rate-limit'); return; }
        recent.push(now); guestAttempts.set(ip, recent);
        try {
          const result = await accountService.createGuest({ displayName: req.body?.displayName });
          res.set('Cache-Control', 'no-store').status(201).json({ ok: true, ...result });
        } catch (error) { apiError(res, 500, 'account-create-failed'); }
      });
      app.post('/api/v1/room-ticket', async (req, res) => {
        try {
          const ticket = await accountService.createRoomTicket(bearer(req));
          if (!ticket) { apiError(res, 401, 'session-expired'); return; }
          res.set('Cache-Control', 'no-store').json({ ok: true, ticket, expiresInSeconds: 60 });
        } catch { apiError(res, 500, 'ticket-create-failed'); }
      });
      app.get('/api/v1/account', async (req, res) => {
        try {
          const account = await accountService.getAccount(bearer(req));
          if (!account) { apiError(res, 401, 'session-expired'); return; }
          res.set('Cache-Control', 'no-store').json({ ok: true, account });
        } catch { apiError(res, 500, 'account-read-failed'); }
      });
      app.delete('/api/v1/session', async (req, res) => {
        try { await accountService.revokeSession(bearer(req)); res.status(204).end(); }
        catch { apiError(res, 500, 'session-revoke-failed'); }
      });
      app.get('/api/v1/store/catalog', (_req, res) => res.json({ ok: true, items: COSMETIC_CATALOG }));
      app.post('/api/v1/store/purchase', async (req, res) => {
        try {
          const result = await accountService.purchaseCosmetic(bearer(req), req.body?.itemId, req.body?.requestId);
          if (!result.ok) { apiError(res, result.status ?? 400, result.error); return; }
          res.json(result);
        } catch { apiError(res, 500, 'purchase-failed'); }
      });
      app.get('/api/v1/safehouses/catalog', (_req, res) => res.json({ ok: true, safehouses: SAFEHOUSE_CATALOG }));
      app.post('/api/v1/safehouses/purchase', async (req, res) => {
        try {
          const result = await accountService.purchaseSafehouse(bearer(req), req.body?.safehouseId, req.body?.requestId);
          if (!result.ok) { apiError(res, result.status ?? 400, result.error); return; }
          res.json(result);
        } catch { apiError(res, 500, 'safehouse-purchase-failed'); }
      });
      app.get('/api/v1/community/servers', (_req, res) => res.set('Cache-Control', 'no-store').json({ ok: true, servers: communityServerRegistry.list() }));
      app.post('/api/v1/community/heartbeat', (req, res) => {
        const secret = String(req.get('x-nh-registry-key') ?? '');
        const result = communityServerRegistry.heartbeat(secret, req.body ?? {});
        if (!result.ok) { apiError(res, result.status ?? 400, result.error); return; }
        res.json(result);
      });

      // /health: for a load balancer or uptime monitor (no player data). /metrics: JSON, or ?format=prom; set METRICS_TOKEN to require "Authorization: Bearer <token>" (or ?token=)
      app.get('/health', (_req, res) => { const m = MatchRoom.metrics(); res.set('Cache-Control', 'no-store').json({ ok: true, uptimeSecs: m.uptimeSecs, rooms: m.rooms.total, players: m.players.humans }); });
      app.get('/metrics', (req, res) => {
        const need = process.env.METRICS_TOKEN, got = (req.get('authorization') ?? '').replace(/^Bearer /, '') || String(req.query.token ?? '');
        if (need && got !== need) { res.status(401).json({ ok: false, error: 'unauthorized' }); return; }
        const m = MatchRoom.metrics();
        if (req.query.format === 'prom') res.type('text/plain').send(toPrometheus(m)); else res.set('Cache-Control', 'no-store').json(m);
      });
    },
  });
}

// run directly: `npm run server`
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 2567);
  await createServer({ lobbySecs: Number(process.env.LOBBY_SECS ?? 15), total: Number(process.env.MATCH_SIZE ?? 16), vehicles: process.env.VEHICLES !== '0', loot: process.env.LOOT !== '0', drop: process.env.DROP !== '0', compress: process.env.COMPRESS !== '0', difficulty: process.env.DIFFICULTY ?? 'normal', maxRooms: Number(process.env.MAX_ROOMS ?? 40), reconnectSecs: Number(process.env.RECONNECT_SECS ?? 12) }).listen(port);
  console.log(`NIGHTHAWK server listening on ws://localhost:${port}  (lobby ${process.env.LOBBY_SECS ?? 15}s)`);
}
