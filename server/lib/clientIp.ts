import type { Request } from "express";

/** First public client address. Trusts the platform's X-Forwarded-For. */
export function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(",")[0].trim().slice(0, 80);
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}
