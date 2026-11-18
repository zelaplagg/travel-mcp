import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FixedWindowLimiter, MinIntervalLimiter } from '../src/lib/rateLimiter.ts';

test('MinIntervalLimiter spaces consecutive calls', async () => {
  let now = 1000;
  const sleeps: number[] = [];
  const limiter = new MinIntervalLimiter(500, {
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
  });

  await limiter.wait();
  await limiter.wait();
  await limiter.wait();

  assert.deepEqual(sleeps, [500, 500]);
});

test('FixedWindowLimiter blocks after the limit and recovers in the next window', () => {
  let now = 0;
  const limiter = new FixedWindowLimiter(2, 1000, () => now);

  assert.equal(limiter.tryConsume('a').allowed, true);
  assert.equal(limiter.tryConsume('a').allowed, true);
  const blocked = limiter.tryConsume('a');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);

  now = 1000;
  assert.equal(limiter.tryConsume('a').allowed, true);
});

test('FixedWindowLimiter tracks keys independently', () => {
  const limiter = new FixedWindowLimiter(1, 1000, () => 0);
  assert.equal(limiter.tryConsume('a').allowed, true);
  assert.equal(limiter.tryConsume('a').allowed, false);
  assert.equal(limiter.tryConsume('b').allowed, true);
});
