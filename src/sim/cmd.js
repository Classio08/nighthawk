// A "cmd" is ONE tick of a player's input. The client builds one every 1/60 s, the server runs them in order.
// Movement keys are held-state; slot/reload/grenade are one-shot flags that are true for exactly one cmd.
export const idleCmd = () => ({ seq: 0, yaw: 0, pitch: 0, forward: 0, strafe: 0, jump: false, sprint: false, fire: false, ads: false, reload: false, slot: 0, grenade: false, mortar: false, vt: 0 });

const num = (v, lo, hi, d = 0) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

/** Never trust a network cmd: clamp numbers, force booleans, drop unknown fields. */
export function sanitizeCmd(c) {
  return {
    seq: num(c.seq, 0, 2 ** 31, 0) | 0,
    yaw: num(c.yaw, -1e4, 1e4), pitch: num(c.pitch, -1.5, 1.5),
    forward: num(c.forward, -1, 1), strafe: num(c.strafe, -1, 1),
    jump: !!c.jump, sprint: !!c.sprint, fire: !!c.fire, ads: !!c.ads, reload: !!c.reload,
    slot: num(c.slot, 0, 6) | 0, grenade: !!c.grenade, mortar: !!c.mortar, vt: num(c.vt, 0, 2 ** 31, 0),
  };
}

/** the same cmd again but with the one-shot flags cleared (used when the server has no new input and repeats the last one) */
export function repeatCmd(c) { return { ...c, reload: false, slot: 0, grenade: false, mortar: false, jump: c.jump }; }
