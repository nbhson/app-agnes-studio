import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string comparison (HMAC wrapper so different lengths can be
 * compared without leaking length via timingSafeEqual's length check).
 */
export function tokensMatch(presented: string, expected: string): boolean {
  const mac = (s: string) => createHmac('sha256', 'proxy-token').update(s).digest();
  return timingSafeEqual(mac(presented), mac(expected));
}
