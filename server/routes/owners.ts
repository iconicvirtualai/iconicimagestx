/**
 * Owners Suite API.
 * The browser portal and its login redirect are gone. Missing auth, a
 * non-owner, and a staff admin all receive 404. Responses are private.
 * The owners workbook is not read or written.
 */

import type { Express, Request, Response } from "express";
import {
  resolveOwnerIdentity,
  sessionCookieHeader,
  signOwnerSession,
  ownerRuntimeEnv,
  ownerSessionSecret,
} from "../services/ownerGate";
import { loadOwnerSuite } from "../services/ownerSheets";
import { listOwnerOrders, submitOwnerOrder } from "../services/ownerOrders";
import { OWNER_WHY } from "../services/ownerWhy";

const NOT_FOUND = { error: "Not found" };

export function mountOwners(app: Express) {
  app.get("/api/owners/suite", (req, res) => {
    void handleSuite(req, res);
  });
  app.get("/api/owners/orders", (req, res) => {
    void handleOrdersGet(req, res);
  });
  app.post("/api/owners/orders", (req, res) => {
    void handleOrdersPost(req, res);
  });
  app.post("/api/owners/session", (req, res) => {
    void handleSession(req, res);
  });
  app.post("/api/owners/logout", (_req, res) => {
    setPrivate(res);
    res.setHeader("Set-Cookie", sessionCookieHeader("", ownerRuntimeEnv(), 0));
    res.status(204).end();
  });
}

async function handleSuite(req: Request, res: Response) {
  setPrivate(res);
  const owner = await resolveOwnerIdentity(req.headers);
  if (!owner) return res.status(404).json(NOT_FOUND);
  const fresh = req.query.fresh === "1";
  const payload = await loadOwnerSuite({ fresh });
  return res.status(200).json({ ...payload, why: OWNER_WHY });
}

async function handleOrdersGet(req: Request, res: Response) {
  setPrivate(res);
  const owner = await resolveOwnerIdentity(req.headers);
  if (!owner) return res.status(404).json(NOT_FOUND);
  try {
    const payload = await listOwnerOrders();
    return res.status(200).json(payload);
  } catch (error) {
    console.error(`[Owners] Orders read failed (${errorStatus(error)})`);
    return res.status(500).json({ error: "Orders could not be read." });
  }
}

async function handleOrdersPost(req: Request, res: Response) {
  setPrivate(res);
  const owner = await resolveOwnerIdentity(req.headers);
  if (!owner) return res.status(404).json(NOT_FOUND);
  try {
    const result = await submitOwnerOrder({ raw: req.body?.text, ownerEmail: owner.email });
    if ("error" in result) return res.status(result.status).json({ error: result.error });
    return res.status(201).json({ order: result.order });
  } catch (error) {
    console.error(`[Owners] Orders write failed (${errorStatus(error)})`);
    return res.status(500).json({ error: "The order could not be saved." });
  }
}

function errorStatus(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) return String((error as { code: unknown }).code);
  return "error";
}

async function handleSession(req: Request, res: Response) {
  setPrivate(res);
  const owner = await resolveOwnerIdentity(req.headers);
  const secret = ownerSessionSecret();
  if (!owner || !secret) return res.status(404).json(NOT_FOUND);
  const token = signOwnerSession(owner, secret);
  res.setHeader("Set-Cookie", sessionCookieHeader(token));
  return res.status(200).json({ ok: true });
}

function setPrivate(res: Response) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Vary", "Cookie, Authorization");
}
