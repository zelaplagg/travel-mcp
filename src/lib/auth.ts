import { createHash, timingSafeEqual } from 'node:crypto';

/** Returns the token from an `Authorization: Bearer <token>` header, or null. */
export function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

const sha256 = (value: string): Buffer => createHash('sha256').update(value).digest();

/** Constant-time comparison (hashing first makes both buffers equal length). */
export function isAuthorized(header: string | undefined, expectedToken: string): boolean {
  const provided = extractBearer(header);
  if (provided === null) return false;
  return timingSafeEqual(sha256(provided), sha256(expectedToken));
}
