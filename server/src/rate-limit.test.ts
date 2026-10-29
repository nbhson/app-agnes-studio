import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from './rate-limit.js';

test('allows up to max requests in window', () => {
  const rl = createRateLimiter({ windowMs: 1000, max: 3 });
  assert.equal(rl.check('a').ok, true);
  assert.equal(rl.check('a').ok, true);
  assert.equal(rl.check('a').ok, true);
  const blocked = rl.check('a');
  assert.equal(blocked.ok, false);
  assert.ok((blocked as { retryAfterSec: number }).retryAfterSec >= 1);
});

test('separate keys are independent', () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  assert.equal(limiter.check('a').ok, true);
  assert.equal(limiter.check('a').ok, false);
  assert.equal(limiter.check('b').ok, true);
  assert.equal(limiter.size(), 2);
});

test('window reset allows again after expiry', async () => {
  const limiter = createRateLimiter({ windowMs: 20, max: 1 });
  assert.equal(limiter.check('a').ok, true);
  assert.equal(limiter.check('a').ok, false);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(limiter.check('a').ok, true);
});

test('evicts expired keys when hitting the tracking cap', () => {
  const limiter = createRateLimiter({ windowMs: 10, max: 1 });
  for (let i = 0; i < 10_001; i++) {
    limiter.check(`ip-${i}`);
  }
  assert.ok(limiter.size() <= 10_000);
});
