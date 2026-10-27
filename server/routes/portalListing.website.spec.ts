import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveListingCardLook } from "../../shared/listingCard";
import { buildPublicListingSite } from "../../shared/listingSite";

/**
 * Owning clients can publish /l/:slug. They cannot choose a portal tile.
 * The write does not email or text.
 */

const sendMail = vi.hoisted(() => vi.fn());
const sendSms = vi.hoisted(() => vi.fn());

const store = vi.hoisted(() => ({
  collections: {} as Record<string, Map<string, Record<string, unknown>>>,
}));

function docs(name: string) {
  if (!store.collections[name]) store.collections[name] = new Map();
  return store.collections[name];
}

vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail }) },
}));

vi.mock("twilio", () => ({
  default: () => ({ messages: { create: sendSms } }),
}));

vi.mock("firebase-admin", () => {
  function firestore() {
    return {
      collection(name: string) {
        return {
          doc(id: string) {
            return {
              collectionName: name,
              id,
              async get() {
                const data = docs(name).get(id);
                return {
                  id,
                  exists: data !== undefined,
                  data: () => (data ? { ...data } : undefined),
                };
              },
            };
          },
          where(field: string, _op: string, value: unknown) {
            const query = {
              limit() {
                return query;
              },
              async get() {
                const matches = [...docs(name).entries()]
                  .filter(([, data]) => data[field] === value)
                  .map(([id, data]) => ({
                    id,
                    exists: true,
                    data: () => ({ ...data }),
                  }));
                return { empty: matches.length === 0, docs: matches, size: matches.length };
              },
            };
            return query;
          },
        };
      },
      async runTransaction(fn: (tx: {
        get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>;
        update: (ref: { collectionName: string; id: string }, data: Record<string, unknown>) => void;
      }) => Promise<void>) {
        await fn({
          async get(ref) {
            return ref.get();
          },
          update(ref, data) {
            const current = docs(ref.collectionName).get(ref.id) || {};
            docs(ref.collectionName).set(ref.id, { ...current, ...data });
          },
        });
      },
    };
  }
  firestore.FieldValue = {
    serverTimestamp() {
      return { __serverTimestamp: true };
    },
  };
  const admin = {
    apps: [{ name: "portal-website-test" }],
    firestore,
    auth: () => ({
      async verifyIdToken(token: string) {
        if (token === "owner-token") return { uid: "owner-uid", email: "ada@example.com" };
        if (token === "other-token") return { uid: "other-uid", email: "bob@example.com" };
        throw new Error("invalid");
      },
    }),
    initializeApp() {
      return undefined;
    },
  };
  return { default: admin };
});

import { requireAuth } from "../middleware/auth";
import { handlePatchPortalWebsite } from "./portalListing";

const LISTING_ID = "listing1234";

function seedListing() {
  docs("listings").set(LISTING_ID, {
    clientId: "owner-uid",
    clientEmail: "ada@example.com",
    address: { street: "18 Oak Hollow", city: "Spring", state: "TX", zip: "77389" },
    package: "Photos Only",
    portalWebsite: {
      design: "index",
      font: "sans",
      color: "ink",
      style: "classic",
      published: false,
      showPhotos: true,
      showVideo: true,
      showTours: true,
      showFloorplans: true,
      tileLook: "showcase",
    },
  });
}

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.patch("/api/clients/me/listings/:id/website", requireAuth, handlePatchPortalWebsite);
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a port.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

beforeEach(() => {
  store.collections = {};
  sendMail.mockClear();
  sendSms.mockClear();
  seedListing();
});

function patch(body: unknown, authorization?: string) {
  return fetch(`${baseUrl}/api/clients/me/listings/${LISTING_ID}/website`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("listing site publish permissions", () => {
  it("client cannot set tileLook, and only the owning client can publish", async () => {
    const source = readFileSync(new URL("./portalListing.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/CLIENT_NOTIFY_LIVE|BOOKING_NOTIFY_LIVE|nodemailer|twilio|sendMail|sendSms/);

    const anonymous = await patch({ published: true, design: "premiere", tileLook: "legacy" });
    expect(anonymous.status).toBe(401);
    const invalid = await patch({ published: true, tileLook: "showcase" }, "Bearer nope");
    expect(invalid.status).toBe(401);

    const stranger = await patch({
      design: "premiere",
      font: "serif",
      published: true,
      tileLook: "legacy",
    }, "Bearer other-token");
    expect(stranger.status).toBe(403);
    expect(docs("listings").get(LISTING_ID)?.portalWebsite).toMatchObject({
      published: false,
      tileLook: "showcase",
      design: "index",
    });

    const owner = await patch({
      design: "premiere",
      font: "serif",
      color: "ink",
      style: "editorial",
      published: true,
      showPhotos: true,
      showVideo: true,
      showTours: true,
      showFloorplans: true,
      tileLook: "legacy",
    }, "Bearer owner-token");
    expect(owner.status).toBe(200);
    const body = await owner.json() as { website: { tileLook: string; published: boolean; design: string }; activity: Array<{ summary: string }> };
    expect(body.website.tileLook).toBe("");
    expect(body.website.published).toBe(true);
    expect(body.website.design).toBe("premiere");
    expect(body.activity.map((event) => event.summary)).toContain("Listing site published");

    const stored = docs("listings").get(LISTING_ID)!;
    const website = stored.portalWebsite as { tileLook?: string; published?: boolean; design?: string };
    expect(website.tileLook).toBe("");
    expect(website.published).toBe(true);
    expect(website.design).toBe("premiere");
    expect(stored.listingSiteSlug).toBe("18-oak-hollow-spring");
    expect(resolveListingCardLook(stored)).toBe("just-photos");
    expect(buildPublicListingSite({ id: LISTING_ID, ...stored })?.slug).toBe("18-oak-hollow-spring");
    expect(sendMail).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();

    const blocked = await patch({ published: false, tileLook: "showcase" }, "Bearer other-token");
    expect(blocked.status).toBe(403);
    expect((docs("listings").get(LISTING_ID)?.portalWebsite as { published?: boolean }).published).toBe(true);

    const unpublished = await patch({
      design: "premiere",
      font: "serif",
      color: "ink",
      style: "editorial",
      published: false,
      tileLook: "showcase",
    }, "Bearer owner-token");
    expect(unpublished.status).toBe(200);
    const after = docs("listings").get(LISTING_ID)!;
    expect((after.portalWebsite as { published?: boolean; tileLook?: string }).published).toBe(false);
    expect((after.portalWebsite as { tileLook?: string }).tileLook).toBe("");
    expect(resolveListingCardLook(after)).toBe("just-photos");
    expect(buildPublicListingSite({ id: LISTING_ID, ...after })).toBeNull();
    expect(sendMail).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
  });
});
