import assert from 'node:assert/strict';
import { test } from 'node:test';
import { haversineM } from '../src/lib/geo.ts';

test('Vienna to Bratislava is roughly 55 km', () => {
  const distance = haversineM(48.2082, 16.3738, 48.1486, 17.1077);
  assert.ok(distance > 53_000 && distance < 57_000, `got ${distance}`);
});

test('distance from a point to itself is zero', () => {
  assert.equal(haversineM(48.2, 16.4, 48.2, 16.4), 0);
});
