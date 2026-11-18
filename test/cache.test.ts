import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TtlCache } from '../src/lib/cache.ts';

test('returns a value before expiry and undefined after', () => {
  let now = 0;
  const cache = new TtlCache<string>(100, { now: () => now });
  cache.set('k', 'v');
  assert.equal(cache.get('k'), 'v');
  now = 100;
  assert.equal(cache.get('k'), undefined);
});

test('evicts the oldest entry when full', () => {
  const cache = new TtlCache<number>(1000, { maxEntries: 2 });
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.get('b'), 2);
  assert.equal(cache.get('c'), 3);
});
