// Lightweight rolling frame-time sampler for development profiling.
// Stores only a bounded window and never allocates during percentile reads beyond one copy.
export class FrameMetrics {
  constructor(capacity = 240) {
    if (!Number.isInteger(capacity) || capacity < 2) throw new RangeError('capacity must be an integer >= 2');
    this.samples = new Float32Array(capacity);
    this.capacity = capacity;
    this.count = 0;
    this.cursor = 0;
  }

  record(frameMs) {
    if (!Number.isFinite(frameMs) || frameMs < 0) return;
    this.samples[this.cursor] = frameMs;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.count = Math.min(this.capacity, this.count + 1);
  }

  percentile(sorted, p) {
    if (!sorted.length) return 0;
    const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[index];
  }

  snapshot() {
    const values = Array.from(this.samples.subarray(0, this.count)).sort((a, b) => a - b);
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    return {
      samples: this.count,
      window: this.capacity,
      frameMs: {
        mean: +mean.toFixed(2),
        p50: +this.percentile(values, 50).toFixed(2),
        p95: +this.percentile(values, 95).toFixed(2),
        p99: +this.percentile(values, 99).toFixed(2),
      },
      fpsFromMean: mean > 0 ? +(1000 / mean).toFixed(1) : 0,
    };
  }
}
