/** Host token and player token handling. Source: REQ-CONN-3, REQ-RECON-1, 02-design §8. */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function newHostToken(): string {
  return randomBytes(24).toString('base64url');
}

export function newPlayerId(): string {
  return randomBytes(6).toString('base64url');
}

/** Player tokens are random strings the phone keeps in localStorage. We only store a hash. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

export function isValidPlayerToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(token);
}

export function tokensEqual(a: unknown, b: string): boolean {
  if (typeof a !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
