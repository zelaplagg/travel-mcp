import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guardRequest } from '../src/httpGuard.ts';
import { FixedWindowLimiter } from '../src/lib/rateLimiter.ts';

const token = 'secret-token-1234567890';
const deps = () => ({ token, limiter: new FixedWindowLimiter(2, 60_000, () => 0) });
const request = (overrides: Partial<Parameters<typeof guardRequest>[0]> = {}) => ({
  method: 'POST',
  path: '/mcp',
  authorization: `Bearer ${token}`,
  clientKey: '127.0.0.1',
  ...overrides,
});

test('lets an authorized POST to /mcp through', () => {
  assert.equal(guardRequest(request(), deps()), null);
});

test('unknown path gives 404', () => {
  assert.equal(guardRequest(request({ path: '/admin' }), deps())?.status, 404);
});

test('missing or wrong token gives 401 with WWW-Authenticate', () => {
  const missing = guardRequest(request({ authorization: undefined }), deps());
  assert.equal(missing?.status, 401);
  assert.equal(missing?.headers?.['WWW-Authenticate'], 'Bearer');
  assert.equal(guardRequest(request({ authorization: 'Bearer nope' }), deps())?.status, 401);
});

test('non-POST gives 405', () => {
  assert.equal(guardRequest(request({ method: 'GET' }), deps())?.status, 405);
});

test('too many requests give 429 with Retry-After', () => {
  const d = deps();
  guardRequest(request(), d);
  guardRequest(request(), d);
  const rejected = guardRequest(request(), d);
  assert.equal(rejected?.status, 429);
  assert.equal(rejected?.headers?.['Retry-After'], '60');
});

test('unauthorized requests do not consume rate limit', () => {
  const d = deps();
  for (let i = 0; i < 5; i++) guardRequest(request({ authorization: 'Bearer nope' }), d);
  assert.equal(guardRequest(request(), d), null);
});
