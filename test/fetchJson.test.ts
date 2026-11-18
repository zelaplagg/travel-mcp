import assert from 'node:assert/strict';
import { afterEach, test, mock } from 'node:test';
import { UpstreamError } from '../src/lib/errors.ts';
import { fetchJson } from '../src/lib/http.ts';
import { jsonResponse, mockFetch } from './helpers.ts';

afterEach(() => mock.restoreAll());

test('returns parsed JSON and sends a User-Agent', async () => {
  const calls = mockFetch(() => jsonResponse({ ok: true }));
  const result = await fetchJson<{ ok: boolean }>('https://example.test/data');
  assert.deepEqual(result, { ok: true });
  const headers = calls[0]?.init?.headers as Record<string, string>;
  assert.match(headers['User-Agent'] ?? '', /travel-mcp/);
});

test('retries once on a 503 and then succeeds', async () => {
  let attempt = 0;
  const calls = mockFetch(() => (++attempt === 1 ? new Response('', { status: 503 }) : jsonResponse({ n: 2 })));
  const result = await fetchJson<{ n: number }>('https://example.test/data', { backoffMs: 0 });
  assert.deepEqual(result, { n: 2 });
  assert.equal(calls.length, 2);
});

test('does not retry a 404', async () => {
  const calls = mockFetch(() => new Response('', { status: 404 }));
  await assert.rejects(
    fetchJson('https://example.test/data', { backoffMs: 0 }),
    (error: unknown) => error instanceof UpstreamError && error.status === 404 && !error.retryable,
  );
  assert.equal(calls.length, 1);
});

test('gives up after the configured retries', async () => {
  const calls = mockFetch(() => new Response('', { status: 500 }));
  await assert.rejects(
    fetchJson('https://example.test/data', { retries: 2, backoffMs: 0 }),
    UpstreamError,
  );
  assert.equal(calls.length, 3);
});

test('wraps network failures in UpstreamError', async () => {
  mockFetch(() => {
    throw new TypeError('fetch failed');
  });
  await assert.rejects(
    fetchJson('https://example.test/data', { retries: 0 }),
    (error: unknown) => error instanceof UpstreamError && /fetch failed/.test(error.message),
  );
});
