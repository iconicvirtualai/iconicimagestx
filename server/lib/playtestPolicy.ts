import crypto from "crypto";

export function secretsMatch(provided: unknown, expected: unknown): boolean {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  if (!provided || !expected) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    crypto.timingSafeEqual(right, right);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

export function readSetupSecret(headerValue: unknown): string {
  if (typeof headerValue === "string") return headerValue.trim();
  if (Array.isArray(headerValue) && typeof headerValue[0] === "string") return headerValue[0].trim();
  return "";
}
