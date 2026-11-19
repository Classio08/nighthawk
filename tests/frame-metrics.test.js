import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameMetrics } from '../src/perf/frame-metrics.js';

test('FrameMetrics reports empty samples safely', () => {
  const metrics = new FrameMetrics(4);
  assert.deepEqual(metrics.snapshot(), {
    samples: 0, window: 4,
    frameMs: { mean: 0, p50: 0, p95: 0, p99: 0 },
    fpsFromMean: 0,
  });
});

test('FrameMetrics computes rolling percentiles and discards old samples', () => {
  const metrics = new FrameMetrics(4);
  [10, 20, 30, 40, 50].forEach((n) => metrics.record(n));
  const result = metrics.snapshot();
  assert.equal(result.samples, 4);
  assert.equal(result.frameMs.mean, 35);
  assert.equal(result.frameMs.p50, 30);
  assert.equal(result.frameMs.p95, 50);
  assert.equal(result.frameMs.p99, 50);
  assert.equal(result.fpsFromMean, 28.6);
});

test('FrameMetrics ignores invalid values and validates its capacity', () => {
  assert.throws(() => new FrameMetrics(1), RangeError);
  const metrics = new FrameMetrics(3);
  metrics.record(Number.NaN); metrics.record(Infinity); metrics.record(-1);
  assert.equal(metrics.snapshot().samples, 0);
});
