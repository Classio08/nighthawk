import { defineServer, defineRoom } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { MatchRoom, DEFAULTS } from './MatchRoom.js';

/** @param {{lobbySecs?:number,total?:number}} cfg  (tests use a 1 second lobby) */
export function createServer(cfg = {}) {
  MatchRoom.cfg = { ...DEFAULTS, ...cfg };
  return defineServer({
    transport: new WebSocketTransport(),
    rooms: { match: defineRoom(MatchRoom) },
  });
}

// run directly: `npm run server`
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 2567);
  await createServer({ lobbySecs: Number(process.env.LOBBY_SECS ?? 15), total: Number(process.env.MATCH_SIZE ?? 16) }).listen(port);
  console.log(`NIGHTHAWK server listening on ws://localhost:${port}  (lobby ${process.env.LOBBY_SECS ?? 15}s)`);
}
