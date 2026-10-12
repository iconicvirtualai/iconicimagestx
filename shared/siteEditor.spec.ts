import { describe, expect, it } from "vitest";
import {
  isPrivateAddress,
  normalizeSiteEditorFlags,
  prepareDropboxUrl,
  pushRevision,
  revertTo,
  siteEditorAccess,
  sniffMedia,
  stripPage,
  type StoredPage,
} from "./siteEditor.ts";
import { defaultPage } from "./siteEditorDefaults.ts";
import { mergeContent } from "./siteEditorMerge.ts";

describe("site editor permissions", () => {
  it("gives the owner and admins every permission", () => {
    expect(siteEditorAccess({ role: "admin", email: "someone@example.com", flags: { view: false, edit: false, publish: false }, ownerEmails: ["owner@example.com"] })).toMatchObject({ view: true, edit: true, publish: true, locked: true });
    expect(siteEditorAccess({ role: "coordinator", email: "owner@example.com", flags: null, ownerEmails: ["owner@example.com"] }).publish).toBe(true);
  });

  it("keeps everyone else closed until a permission is granted", () => {
    const access = siteEditorAccess({ role: "photographer", email: "pat@example.com", flags: null, ownerEmails: ["owner@example.com"] });
    expect(access).toMatchObject({ view: false, edit: false, publish: false, locked: false });
    expect(normalizeSiteEditorFlags({ publish: true })).toEqual({ view: true, edit: true, publish: true });
  });
});

describe("site editor history", () => {
  it("keeps the last 10 published versions and can revert one", () => {
    const base = defaultPage("home");
    if (!base) throw new Error("missing home");
    let stored: StoredPage | null = null;
    for (let index = 0; index < 12; index += 1) {
      const next = { ...base, seoTitle: `Version ${index}` };
      const revisions = pushRevision(stored, next, { uid: "u", name: "Cadi" }, `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`);
      stored = { ...next, revisions, publishedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`, publishedByUid: "u", publishedByName: "Cadi" };
    }
    expect(stored?.revisions).toHaveLength(10);
    const target = stored!.revisions![3];
    const restored = revertTo(stored!, target.id, { uid: "u", name: "Cadi" }, "2026-02-01T00:00:00.000Z");
    expect(restored?.seoTitle).toBe(target.snapshot.seoTitle);
    expect(restored?.revisions).toHaveLength(10);
  });
});

describe("dropbox link guard", () => {
  it("allows a file link and rejects folders, private hosts, and odd schemes", () => {
    expect(prepareDropboxUrl("https://www.dropbox.com/scl/fi/abc/photo.jpg?dl=0")?.searchParams.get("dl")).toBe("1");
    expect(prepareDropboxUrl("https://www.dropbox.com/scl/fo/folder/abc")).toBeNull();
    expect(prepareDropboxUrl("http://www.dropbox.com/s/abc/photo.jpg")).toBeNull();
    expect(prepareDropboxUrl("https://127.0.0.1/photo.jpg")).toBeNull();
    expect(prepareDropboxUrl("https://evil.com/photo.jpg")).toBeNull();
    expect(isPrivateAddress("10.1.2.3")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
  });

  it("recognizes jpeg, png, webp, and mp4 bytes", () => {
    expect(sniffMedia(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toBe("image");
    expect(sniffMedia(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe("image");
    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffMedia(webp)).toBe("image");
    const mp4 = new Uint8Array(12);
    mp4.set([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70]);
    expect(sniffMedia(mp4)).toBe("video");
  });
});

describe("published merge", () => {
  it("strips history and keeps a draft field on top of the default", () => {
    const home = defaultPage("home");
    if (!home) throw new Error("missing");
    const merged = mergeContent({ ...home, seoTitle: "Custom", blocks: home.blocks.map((block) => block.id === "hero" ? { ...block, fields: block.fields.map((field) => field.id === "title" ? { ...field, value: "HELLO" } : field) } : block) });
    expect(merged?.seoTitle).toBe("Custom");
    expect(stripPage({ ...merged!, revisions: [] }).blocks.find((block) => block.id === "hero")?.fields.find((field) => field.id === "title")?.value).toBe("HELLO");
    const dirty = mergeContent({
      ...home,
      blocks: [
        ...home.blocks,
        { id: "not-a-section", label: "Extra", fields: [{ id: "x", label: "X", kind: "text", value: "nope" }] },
      ].map((block) => block.id === "hero"
        ? { ...block, fields: [...block.fields, { id: "injected", label: "Injected", kind: "text" as const, value: "nope" }] }
        : block),
    });
    expect(dirty?.blocks.some((block) => block.id === "not-a-section")).toBe(false);
    expect(dirty?.blocks.find((block) => block.id === "hero")?.fields.some((field) => field.id === "injected")).toBe(false);
  });
});
