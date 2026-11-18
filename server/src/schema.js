// Shapes of data that travel over the network. Shared by server and client.
import { schema, t } from '@colyseus/schema';

// What a player sends every tick (keys + where they look). Tiny and flat on purpose.
export const MoveInput = schema({
  forward: t.int8(),   // -1, 0, 1
  strafe: t.int8(),    // -1 (A), 0, 1 (D)
  jump: t.boolean(),
  sprint: t.boolean(),
  fire: t.boolean(),
  yaw: t.float32(),
  pitch: t.float32(),
});

// What everybody sees about a player.
export const Player = schema({
  name: t.string(),
  x: t.float32(),
  y: t.float32(),
  z: t.float32(),
  yaw: t.float32(),
  pitch: t.float32(),
  hp: t.int16(),
  kills: t.int16(),
});

export const ArenaState = schema({
  players: t.map(Player),
});
