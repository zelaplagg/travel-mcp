import { config } from '../config.ts';
import { UpstreamError } from './errors.ts';

export interface FetchJsonOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /** Extra attempts after the first one; only network errors, 429 and 5xx are retried. */
  retries?: number;
  backoffMs?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 10_000,
    retries = 1,
    backoffMs = 300,
  } = options;
  const host = new URL(url).host;
  let lastError: UpstreamError | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0 && backoffMs > 0) await sleep(backoffMs * attempt);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        body,
        headers: { 'User-Agent': config.userAgent, Accept: 'application/json', ...headers },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new UpstreamError(`${host} responded with HTTP ${response.status}`, {
          status: response.status,
          retryable: response.status === 429 || response.status >= 500,
        });
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError =
        error instanceof UpstreamError
          ? error
          : new UpstreamError(
              `Request to ${host} failed: ${error instanceof Error ? error.message : String(error)}`,
              { retryable: true },
            );
      if (!lastError.retryable) throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new UpstreamError(`Request to ${host} failed`, { retryable: true });
}
