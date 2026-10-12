import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../index";
import { resetSiteContentMemory } from "../services/siteContentStore";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  process.env.ENABLE_TEMP_ADMIN = "true";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  const app = createServer();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  resetSiteContentMemory();
});

describe("site content API", () => {
  it("keeps drafts off the public payload until an owner publishes", async () => {
    const empty = await fetch(`${baseUrl}/api/site-content`);
    expect(await empty.json()).toEqual({ pages: [] });

    const draft = await fetch(`${baseUrl}/api/site-content/home`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer temp-admin-token",
        "Content-Type": "application/json",
        "x-test-staff": JSON.stringify({ uid: "editor-1", email: "editor@example.com", role: "coordinator", flags: { view: true, edit: true, publish: false } }),
      },
      body: JSON.stringify({ id: "home", seoTitle: "Draft title", blocks: [] }),
    });
    expect(draft.status).toBe(200);
    const afterDraft = await fetch(`${baseUrl}/api/site-content`);
    expect(await afterDraft.json()).toEqual({ pages: [] });

    const refused = await fetch(`${baseUrl}/api/site-content/home/release`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-staff": JSON.stringify({ uid: "editor-1", email: "editor@example.com", role: "coordinator", flags: { view: true, edit: true, publish: false } }),
      },
      body: "{}",
    });
    expect(refused.status).toBe(403);

    const published = await fetch(`${baseUrl}/api/site-content/home/release`, {
      method: "POST",
      headers: { Authorization: "Bearer temp-admin-token", "Content-Type": "application/json" },
      body: "{}",
    });
    expect(published.status).toBe(200);
    const live = await (await fetch(`${baseUrl}/api/site-content`)).json() as { pages: Array<{ seoTitle: string; revisions?: unknown }> };
    expect(live.pages).toHaveLength(1);
    expect(live.pages[0].seoTitle).toBe("Draft title");
    expect(live.pages[0].revisions).toBeUndefined();

    const unknown = await fetch(`${baseUrl}/api/site-content/not-a-page/revert`, {
      method: "POST",
      headers: { Authorization: "Bearer temp-admin-token", "Content-Type": "application/json" },
      body: JSON.stringify({ revisionId: "rev_x" }),
    });
    expect(unknown.status).toBe(404);
  });

  it("rejects a folder link and a non-dropbox host before fetching", async () => {
    const folder = await fetch(`${baseUrl}/api/site-content/dropbox`, {
      method: "POST",
      headers: { Authorization: "Bearer temp-admin-token", "Content-Type": "application/json" },
      body: JSON.stringify({ pageId: "home", url: "https://www.dropbox.com/scl/fo/abc/folder" }),
    });
    expect(folder.status).toBe(400);
    const foreign = await fetch(`${baseUrl}/api/site-content/dropbox`, {
      method: "POST",
      headers: { Authorization: "Bearer temp-admin-token", "Content-Type": "application/json" },
      body: JSON.stringify({ pageId: "home", url: "https://127.0.0.1/secret.jpg" }),
    });
    expect(foreign.status).toBe(400);
  });
});
