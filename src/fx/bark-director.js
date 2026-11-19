// BarkDirector: decides WHICH radio line plays WHEN during an offline operation. Pure logic (no audio, no DOM, no timers): it is fed sim events
// plus the sim clock and returns the line to play, so it is fully unit-tested. Presentation only: it never changes the simulation.
//
// Rules: one voice at a time. A line holds the channel for its own length plus a short gap; a request of higher priority may cut in, an equal or
// lower one is dropped. Each category has a cooldown so combat chatter cannot spam, variants rotate round-robin, "once" lines play once per operation.
import { VOICE, VOICE_CATEGORIES } from './voice-data.js';

export const SPEAKERS = {
  kestrel: { label: 'KESTREL', color: '#ffcf4d' },
  sable: { label: 'SABLE', color: '#5be37a' },
  dust: { label: 'DUST', color: '#e67e22' },
  echo: { label: 'ECHO', color: '#58a6ff' },
  control: { label: 'CONTROL', color: '#ff6b5e' },
  amara: { label: 'LANTERN', color: '#f1c40f' },
  jackal: { label: 'JACKAL', color: '#d64541' },
  viper: { label: 'VIPER', color: '#b565d9' },
};

/** category -> priority (0 chatter .. 5 operation result), cooldown in sim seconds, once per operation */
export const RULES = {
  onSpawn: { prio: 3, cd: 0, once: true },
  onFirstBlood: { prio: 3, cd: 0, once: true },
  onKill: { prio: 1, cd: 7 }, onHeadshot: { prio: 2, cd: 7 }, onMultiKill: { prio: 3, cd: 10 },
  onLowHP: { prio: 3, cd: 20 }, onHeal: { prio: 1, cd: 15 }, onReload: { prio: 0, cd: 40 },
  onContact: { prio: 2, cd: 20 }, onSpotted: { prio: 3, cd: 25 }, onEnemyTaunt: { prio: 3, cd: 90 },
  onMortar: { prio: 4, cd: 12 },
  onHackStart: { prio: 3, cd: 0 }, onHackHalf: { prio: 3, cd: 0 }, onHackComplete: { prio: 4, cd: 0 },
  onGhostHot: { prio: 3, cd: 0 }, onHostageFound: { prio: 4, cd: 0 },
  onMissionComplete: { prio: 5, cd: 0 }, onMissionFailed: { prio: 5, cd: 0 },
};
const GAP = 0.9;                                         // quiet seconds after a line before a same-or-lower priority one may start

export class BarkDirector {
  constructor() { this.reset(); }
  reset() {
    this.busyUntil = 0; this.curPrio = -1; this.lastAt = {}; this.rr = {}; this.done = new Set();
    this.kills = []; this.killsTotal = 0; this.reloads = 0; this.level = 'routine';
  }

  /** the line for `category` (optionally a specific variant id), or null if the channel is busy / on cooldown / unknown */
  say(category, t, variant = null) {
    const rule = RULES[category], ids = VOICE_CATEGORIES[category];
    if (!rule || !ids?.length) return null;
    if (rule.once && this.done.has(category)) return null;
    if (t < this.busyUntil && rule.prio <= this.curPrio) return null;                      // somebody is talking and this is not more important
    if (rule.cd > 0 && category in this.lastAt && t - this.lastAt[category] < rule.cd) return null;
    let id = variant && ids.includes(variant) ? variant : null;
    if (!id) { const i = (this.rr[category] ?? 0) % ids.length; this.rr[category] = i + 1; id = ids[i]; }
    const v = VOICE[id], sp = SPEAKERS[v.s] ?? SPEAKERS.control;
    this.lastAt[category] = t; this.busyUntil = t + v.d + GAP; this.curPrio = rule.prio;
    if (rule.once) this.done.add(category);
    return { id, category, speaker: v.s, label: sp.label, color: sp.color, text: v.t, dur: v.d, prio: rule.prio };
  }

  /** the operation just began */
  start(t) { return this.say('onSpawn', t); }

  /**
   * @param e   a sim event
   * @param ctx { t: sim seconds, id: the local player's fighter id, hp, maxHp, x, z }
   */
  event(e, ctx) {
    const t = ctx.t;
    switch (e.t) {
      case 'kill': {
        if (e.by !== ctx.id || e.target === ctx.id) return null;
        this.kills = this.kills.filter((k) => t - k < 6); this.kills.push(t); this.killsTotal++;
        if (this.killsTotal === 1) { const r = this.say('onFirstBlood', t); if (r) return r; }
        if (this.kills.length >= 2) { const r = this.say('onMultiKill', t); if (r) return r; }
        return this.say(e.head ? 'onHeadshot' : 'onKill', t);
      }
      case 'hit':
        if (e.target === ctx.id && ctx.maxHp > 0 && ctx.hp > 0 && ctx.hp / ctx.maxHp < 0.35) return this.say('onLowHP', t);
        return null;
      case 'heal': return e.phase === 'end' && e.by === ctx.id ? this.say('onHeal', t) : null;
      case 'reload': return e.phase === 'start' && e.by === ctx.id && ++this.reloads % 6 === 0 ? this.say('onReload', t) : null;
      case 'shell': return Math.hypot(e.x - ctx.x, e.z - ctx.z) < 35 ? this.say('onMortar', t) : null;
      case 'end': return e.to !== undefined && e.to !== ctx.id ? null : this.say(e.won ? 'onMissionComplete' : 'onMissionFailed', t);
      case 'mission': return this._mission(e, t);
      default: return null;
    }
  }

  _mission(e, t) {
    switch (e.phase) {
      case 'task': return this.say('onHackStart', t);
      case 'taskdone': return e.count === 2 ? this.say('onHackHalf', t) : null;
      case 'unlocked': return this.say('onHackComplete', t);
      case 'taskfail': return e.reason === 'hit' ? this.say('onSpotted', t) : null;
      case 'identified': return this.say('onGhostHot', t, 'onGhostHot_echo');          // "Close. Very close."
      case 'rescued': return this.say('onHostageFound', t, 'onHostageFound_amara');    // "You came. I knew you would."
      default: return null;
    }
  }

  /** call every frame with the mission's alert level: guards searching -> contact call, alerted -> spotted, full crisis -> the villain taunts */
  alert(level, t) {
    if (level === this.level) return null;
    const prev = this.level; this.level = level;
    const order = ['routine', 'uneasy', 'searching', 'alert', 'crisis'];
    if (order.indexOf(level) <= order.indexOf(prev)) return null;                        // only escalation talks
    if (level === 'searching') return this.say('onContact', t);
    if (level === 'alert') return this.say('onSpotted', t);
    if (level === 'crisis') return this.say('onEnemyTaunt', t) ?? this.say('onSpotted', t);
    return null;
  }
}

/** every voice file an operation can need (so the game can preload them once, after the first click) */
export function operationVoiceIds() {
  return Object.keys(RULES).flatMap((c) => VOICE_CATEGORIES[c] ?? []);
}
