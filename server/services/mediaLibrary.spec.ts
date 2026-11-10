import { describe, expect, it } from "vitest";
import { TRASH_RETENTION_MS } from "../../shared/mediaLibrary";
import { StorageError, type B2Storage, type SignedPut } from "./b2Storage";
import { MemoryLibraryRepo } from "./memoryLibraryRepo";
import { LibraryError, MediaLibrary, type LibraryActor } from "./mediaLibrary";

class FakeB2 implements B2Storage {
  objects = new Map<string, { size: number; contentType: string }>();
  uploads = new Map<string, { key: string; contentType: string }>();
  removed: string[] = [];

  async presignPut(key: string, contentType: string): Promise<SignedPut> {
    return { url: `https://b2.test/${encodeURIComponent(key)}`, headers: { "Content-Type": contentType } };
  }
  async presignGet(key: string, filename: string): Promise<string> {
    return `https://b2.test/get/${encodeURIComponent(key)}?name=${encodeURIComponent(filename)}`;
  }
  async createMultipart(key: string, contentType: string) {
    const uploadId = `up-${this.uploads.size + 1}`;
    this.uploads.set(uploadId, { key, contentType });
    return { uploadId };
  }
  async presignPart(key: string, uploadId: string, partNumber: number): Promise<SignedPut> {
    return { url: `https://b2.test/part/${uploadId}/${partNumber}/${encodeURIComponent(key)}`, headers: {} };
  }
  async completeMultipart(key: string, uploadId: string) {
    const upload = this.uploads.get(uploadId);
    if (!upload || upload.key !== key) throw new Error("missing upload");
    this.objects.set(key, { size: 6 * 1024 * 1024, contentType: upload.contentType });
  }
  async abortMultipart(_key: string, uploadId: string) { this.uploads.delete(uploadId); }
  async head(key: string) { return this.objects.get(key) ?? null; }
  async move(from: string, to: string) {
    const current = this.objects.get(from);
    if (!current) throw new StorageError(404, "missing");
    if (this.objects.has(to)) throw new StorageError(409, "exists");
    this.objects.set(to, current);
    this.objects.delete(from);
  }
  async remove(key: string) {
    this.removed.push(key);
    this.objects.delete(key);
  }
  put(key: string, size: number, contentType: string) {
    this.objects.set(key, { size, contentType });
  }
}

function harness(role = "admin") {
  let clock = 1_700_000_000_000;
  const repo = new MemoryLibraryRepo();
  const storage = new FakeB2();
  const library = new MediaLibrary(repo, storage, () => clock);
  const actor: LibraryActor = { uid: "staff-1", name: "Cadi Owner", email: "cadi@iconicimagestx.com", role };
  return {
    repo,
    storage,
    library,
    actor,
    setTime(value: number) { clock = value; },
    advance(ms: number) { clock += ms; },
  };
}

async function storePhoto(env: ReturnType<typeof harness>, name = "front.jpg", extra: Record<string, unknown> = {}) {
  const signed = await env.library.signUpload(env.actor, {
    folder: "Inbox",
    name,
    contentType: "image/jpeg",
    size: 2048,
    clientName: "Ada Homes",
    orderNumber: "88",
    listingAddress: "9 Oak St",
    tags: ["twilight"],
    ...extra,
  });
  env.storage.put(signed.key, 2048, "image/jpeg");
  return env.library.commit(env.actor, signed.key);
}

describe("media library", () => {
  it("seeds the drawers and refuses a path that leaves the library", async () => {
    const env = harness();
    const root = await env.library.list(env.actor, "", false);
    expect(root.folders.map((folder) => folder.name)).toEqual(expect.arrayContaining([
      "Admin", "Clients", "Inbox", "Marketing", "Podcast", "Studio 105",
    ]));
    await expect(env.library.signUpload(env.actor, {
      folder: "../etc",
      name: "x.jpg",
      size: 20,
      contentType: "image/jpeg",
    })).rejects.toBeInstanceOf(LibraryError);
    await expect(env.library.signUpload(env.actor, {
      folder: "Inbox",
      relativePath: "../../secret.jpg",
      size: 20,
      contentType: "image/jpeg",
    })).rejects.toMatchObject({ status: 400 });
    await expect(env.library.importObject(env.actor, { key: ".trash/secret.jpg" })).rejects.toMatchObject({ status: 400 });
  });

  it("keeps Admin limited to owners and coordinators when signing a download", async () => {
    const env = harness();
    const photo = { ...env.actor, role: "photographer", name: "Pat" };
    await expect(env.library.signUpload(photo, {
      folder: "Admin",
      name: "payroll.pdf",
      size: 30,
      contentType: "application/pdf",
    })).rejects.toMatchObject({ status: 403 });
    const signed = await env.library.signUpload(env.actor, {
      folder: "Admin",
      name: "payroll.pdf",
      size: 30,
      contentType: "application/pdf",
    });
    env.storage.put(signed.key, 30, "application/pdf");
    const saved = await env.library.commit(env.actor, signed.key);
    await expect(env.library.signDownloads(photo, [saved.file.id])).rejects.toMatchObject({ status: 403 });
    const allowed = await env.library.signDownloads(env.actor, [saved.file.id]);
    expect(allowed.files[0].url).toContain("b2.test");
    expect(allowed.files[0]).not.toHaveProperty("b2Key");
  });

  it("saves searchable metadata, then moves, renames, trashes, and restores", async () => {
    const env = harness();
    const saved = await storePhoto(env);
    expect(saved.file).not.toHaveProperty("b2Key");
    expect(saved.file.uploadedByName).toBe("Cadi Owner");
    const found = await env.library.search(env.actor, "ada oak twilight", false);
    expect(found.files.map((file) => file.id)).toContain(saved.file.id);

    await env.library.move(env.actor, [saved.file.id], [], "Marketing");
    const marketing = await env.library.list(env.actor, "Marketing", false);
    expect(marketing.files.map((file) => file.name)).toEqual(["front.jpg"]);
    expect(env.storage.objects.has("Marketing/front.jpg")).toBe(true);
    expect(env.storage.objects.has("Inbox/front.jpg")).toBe(false);

    await env.library.rename(env.actor, "file", saved.file.id, "porch.jpg");
    expect(env.storage.objects.has("Marketing/porch.jpg")).toBe(true);

    await env.library.trash(env.actor, [saved.file.id], []);
    const live = await env.library.list(env.actor, "Marketing", false);
    expect(live.files).toHaveLength(0);
    const trashed = await env.library.list(env.actor, "", true);
    expect(trashed.files.map((file) => file.name)).toEqual(["porch.jpg"]);
    expect([...env.storage.objects.keys()][0]).toMatch(/^\.trash\//);

    await env.library.restore(env.actor, [saved.file.id], []);
    const restored = await env.library.list(env.actor, "Marketing", false);
    expect(restored.files.map((file) => file.name)).toEqual(["porch.jpg"]);
    expect(env.storage.objects.has("Marketing/porch.jpg")).toBe(true);

    await env.library.trash(env.actor, [saved.file.id], []);
    env.advance(TRASH_RETENTION_MS + 1000);
    const expired = await env.library.list(env.actor, "", true);
    expect(expired.files).toHaveLength(0);
    expect(env.storage.objects.size).toBe(0);
  });

  it("signs multipart parts for video and registers an imported object in the same shape", async () => {
    const env = harness();
    const photo = { ...env.actor, role: "photographer" };
    const created = await env.library.createMultipart(env.actor, {
      folder: "Inbox",
      name: "walkthrough.mp4",
      contentType: "video/mp4",
      size: 6 * 1024 * 1024,
    });
    expect(created.partCount).toBe(1);
    const part = await env.library.signPart(env.actor, { key: created.key, uploadId: created.uploadId, partNumber: 1 });
    expect(part.url).toContain("/part/");
    await expect(env.library.signPart(env.actor, { key: created.key, uploadId: created.uploadId, partNumber: 9 })).rejects.toMatchObject({ status: 400 });
    await env.library.completeMultipart(env.actor, { key: created.key, uploadId: created.uploadId, parts: [{ partNumber: 1, eTag: "\"etag\"" }] });
    const committed = await env.library.commit(env.actor, created.key);
    expect(committed.file.contentType).toBe("video/mp4");
    expect(committed.file.source).toBe("upload");

    env.storage.put("Inbox/from-dropbox.jpg", 80, "image/jpeg");
    await expect(env.library.importObject(photo, { key: "Inbox/from-dropbox.jpg", importSource: "dropbox:/Inbox/from-dropbox.jpg" })).rejects.toMatchObject({ status: 403 });
    const imported = await env.library.importObject(env.actor, { key: "Inbox/from-dropbox.jpg", importSource: "dropbox:/Inbox/from-dropbox.jpg" });
    expect(imported.file.source).toBe("import");
    expect(imported.file.folder).toBe("Inbox");
    const again = await env.library.search(env.actor, "dropbox", false);
    expect(again.files.map((file) => file.name)).toContain("from-dropbox.jpg");
  });

  it("files an order into Clients / name / address / media folders", async () => {
    const env = harness();
    env.repo.orders.push({ id: "ord1", clientName: "Ada Homes", address: "9 Oak St", orderNumber: "88", clientId: "client-1" });
    const filed = await env.library.orderFolder(env.actor, "ord1", "Video");
    expect(filed.folder).toBe("Clients/Ada Homes/9 Oak St/Video");
    const parent = await env.library.list(env.actor, "Clients/Ada Homes/9 Oak St", false);
    expect(parent.folders.map((folder) => folder.name).sort()).toEqual(["3D", "Floorplans", "Photos", "Raw", "Video"]);
  });
});
