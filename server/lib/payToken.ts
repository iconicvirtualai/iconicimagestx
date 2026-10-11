/**
 * Constant-time pay token check. Used only on the server.
 * A length mismatch still compares equal-length buffers so the token's
 * bytes are not rejected on the first differing character.
 */

import { timingSafeEqual } from "node:crypto";

export function payTokenMatches(
  stored: unknown,
  presented: unknown,
  equal: (left: Buffer, right: Buffer) => boolean = timingSafeEqual,
): boolean {
  const left = Buffer.from(typeof stored === "string" ? stored : "");
  const right = Buffer.from(typeof presented === "string" ? presented : "");
  if (left.length === 0) return false;
  const candidate = Buffer.alloc(left.length);
  if (right.length > 0) right.copy(candidate, 0, 0, Math.min(right.length, left.length));
  const same = equal(left, candidate);
  return same && right.length === left.length;
}
