import { mock } from 'node:test';

export interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

/** Replaces global fetch with a handler and records every call. Restore with mock.restoreAll(). */
export function mockFetch(
  handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
): RecordedCall[] {
  const calls: RecordedCall[] = [];
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  });
  return calls;
}

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
