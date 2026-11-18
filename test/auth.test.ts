import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractBearer, isAuthorized } from '../src/lib/auth.ts';

test('extractBearer parses the Bearer scheme case-insensitively', () => {
  assert.equal(extractBearer('Bearer abc123'), 'abc123');
  assert.equal(extractBearer('bearer abc123'), 'abc123');
});

test('extractBearer rejects other schemes and missing headers', () => {
  assert.equal(extractBearer('Basic abc'), null);
  assert.equal(extractBearer('Bearer'), null);
  assert.equal(extractBearer(undefined), null);
});

test('isAuthorized accepts only the exact token', () => {
  const token = 'a'.repeat(32);
  assert.equal(isAuthorized(`Bearer ${token}`, token), true);
  assert.equal(isAuthorized(`Bearer ${token}x`, token), false);
  assert.equal(isAuthorized('Bearer short', token), false);
  assert.equal(isAuthorized(undefined, token), false);
});
