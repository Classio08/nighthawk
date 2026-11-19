// Abuse protection that does not depend on Colyseus: a token bucket per connection and a rolling tick-time recorder. Pure code, unit-tested.

/**
 * Token bucket: `burst` tokens at most, refilled at `rate` tokens per second. take() returns false when the sender is over its allowance.
 * `now` is injected (milliseconds) so tests do not need real time.
 */
export class Bucket {
  constructor(rate, burst, now = 0) { this.rate = rate; this.burst = burst; this.tokens = burst; this.t = now; }
  take(now, n = 1) {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.t) / 1000) * this.rate); this.t = now;
    if (this.tokens < n) return false;
    this.tokens -= n; return true;
  }
}

/** one client's allowances (messages per second). Normal play sends one 'c' per rendered frame (<= 144) and one ping per second. */
export const LIMITS = {
  c: { rate: 400, burst: 120 },           // input batches: one per rendered frame, so even a 360 Hz monitor stays under it
  ping: { rate: 4, burst: 6 },
  other: { rate: 5, burst: 10 },          // anything we do not know: it is never legitimate, so the allowance is tiny
};
/** how many dropped messages in a row (no allowance left) before the connection is kicked */
export const KICK_AFTER = 120;

export class ClientGuard {
  constructor(now = 0) {
    this.b = { c: new Bucket(LIMITS.c.rate, LIMITS.c.burst, now), ping: new Bucket(LIMITS.ping.rate, LIMITS.ping.burst, now), other: new Bucket(LIMITS.other.rate, LIMITS.other.burst, now) };
    this.dropped = 0; this.strikes = 0; this.total = 0;
  }
  /** @returns 'ok' | 'drop' | 'kick'   (kick = it kept going long after being told to slow down) */
  check(type, now) {
    this.total++;
    const b = this.b[type] ?? this.b.other;
    if (b.take(now)) { this.strikes = Math.max(0, this.strikes - 1); return 'ok'; }
    this.dropped++; this.strikes++;
    return this.strikes >= KICK_AFTER ? 'kick' : 'drop';
  }
}

/** keeps the last N durations (ms) and answers avg / p99 / max without sorting every time */
export class TickStats {
  constructor(n = 600) { this.n = n; this.buf = new Float32Array(n); this.i = 0; this.count = 0; this.max = 0; this.total = 0; this.slow = 0; }
  add(ms, slowMs = 16.7) { this.buf[this.i] = ms; this.i = (this.i + 1) % this.n; this.count = Math.min(this.n, this.count + 1); if (ms > this.max) this.max = ms; this.total++; if (ms > slowMs) this.slow++; }
  summary() {
    if (!this.count) return { avg: 0, p99: 0, max: 0, samples: 0, slow: this.slow };
    const a = Array.from(this.buf.subarray(0, this.count)).sort((x, y) => x - y);
    const avg = a.reduce((s, v) => s + v, 0) / a.length;
    return { avg: +avg.toFixed(3), p99: +a[Math.min(a.length - 1, Math.floor(a.length * 0.99))].toFixed(3), max: +this.max.toFixed(3), samples: a.length, slow: this.slow };
  }
}
