import { defineServer, defineRoom } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { MatchRoom, DEFAULTS } from './MatchRoom.js';
import { attachStatic } from './static.js';

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
  const staticDir = cfg.staticDir ?? process.env.STATIC_DIR ?? '';        // folder with the built game (npm run build -> dist): serve it from the same port
  return defineServer({
    transport: new WebSocketTransport({ maxPayload: 4096, pingInterval: 5000, pingMaxRetries: 3, perMessageDeflate: MatchRoom.cfg.compress === false ? false : { threshold: 512, zlibDeflateOptions: { level: 3 }, serverNoContextTakeover: true, clientNoContextTakeover: true } }),     // a real input batch is under 1 KB: anything bigger is not from our client
    rooms: { match: defineRoom(MatchRoom) },
    express: (app) => {
      app.disable('x-powered-by');
      if (staticDir) attachStatic(app, staticDir);
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
  await createServer({ lobbySecs: Number(process.env.LOBBY_SECS ?? 15), total: Number(process.env.MATCH_SIZE ?? 16), vehicles: process.env.VEHICLES !== '0', loot: process.env.LOOT !== '0', drop: process.env.DROP !== '0', compress: process.env.COMPRESS !== '0', difficulty: process.env.DIFFICULTY ?? 'normal', maxRooms: Number(process.env.MAX_ROOMS ?? 40), reconnectSecs: Number(process.env.RECONNECT_SECS ?? 12), staticDir: process.env.STATIC_DIR }).listen(port);
  console.log(`NIGHTHAWK server listening on ws://localhost:${port}  (lobby ${process.env.LOBBY_SECS ?? 15}s)${process.env.STATIC_DIR ? `  - also serving the game from ${process.env.STATIC_DIR}: open http://localhost:${port}/` : ''}`);
}
