import { isAuthorized } from './lib/auth.ts';
import type { FixedWindowLimiter } from './lib/rateLimiter.ts';

export interface GuardInput {
  method: string;
  path: string;
  authorization: string | undefined;
  clientKey: string;
}

export interface GuardRejection {
  status: number;
  body: { error: string };
  headers?: Record<string, string>;
}

/** Decides whether an incoming HTTP request may reach the MCP endpoint; returns null if it may. */
export function guardRequest(
  input: GuardInput,
  deps: { token: string; limiter: FixedWindowLimiter },
): GuardRejection | null {
  if (input.path !== '/mcp') {
    return { status: 404, body: { error: 'Not found' } };
  }
  if (!isAuthorized(input.authorization, deps.token)) {
    return {
      status: 401,
      body: { error: 'Unauthorized' },
      headers: { 'WWW-Authenticate': 'Bearer' },
    };
  }
  const { allowed, retryAfterSeconds } = deps.limiter.tryConsume(input.clientKey);
  if (!allowed) {
    return {
      status: 429,
      body: { error: 'Too many requests' },
      headers: { 'Retry-After': String(retryAfterSeconds) },
    };
  }
  if (input.method !== 'POST') {
    return { status: 405, body: { error: 'Method not allowed' }, headers: { Allow: 'POST' } };
  }
  return null;
}
