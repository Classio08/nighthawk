import { defineServer, defineRoom } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ArenaRoom } from './ArenaRoom.js';

export function createServer() {
  return defineServer({
    transport: new WebSocketTransport(),
    rooms: { arena: defineRoom(ArenaRoom) },
  });
}

// run directly: `npm start`
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 2567);
  await createServer().listen(port);
  console.log(`NIGHTHAWK server listening on ws://localhost:${port}`);
}
