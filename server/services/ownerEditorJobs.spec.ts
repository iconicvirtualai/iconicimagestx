import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { OwnerEditorStore, editorTickRequest, type OwnerEditorStoreOptions } from "./ownerEditorJobs";

const files: string[] = [];

afterEach(() => {
  for (const file of files.splice(0)) fs.rmSync(file, { force: true });
});

function tempFile(): string {
  const file = path.join(os.tmpdir(), `owner-editor-spec-${process.pid}-${Math.random().toString(16).slice(2)}.json`);
  files.push(file);
  return file;
}

function clock() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 9, 13, 17, 0, tick++)).toISOString();
}

function manual() {
  const pending: Array<() => Promise<void>> = [];
  const scheduler: NonNullable<OwnerEditorStoreOptions["scheduler"]> = (run) => {
    pending.push(run);
    return {
      stop() {
        const index = pending.indexOf(run);
        if (index >= 0) pending.splice(index, 1);
      },
    };
  };
  return {
    scheduler,
    pending,
    async tick() {
      const run = pending.shift();
      if (!run) throw new Error("expected a scheduled server tick");
      await run();
    },
  };
}

function renderer(calls: { count: number }) {
  return async () => {
    calls.count += 1;
    return {
      mime: "image/svg+xml",
      base64: Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"/>").toString("base64"),
    };
  };
}

describe("owner editor server jobs", () => {
  it("keeps rendering after the client stops watching", async () => {
    const calls = { count: 0 };
    const steps = manual();
    const store = new OwnerEditorStore({
      file: tempFile(),
      scheduler: steps.scheduler,
      renderer: renderer(calls),
      now: clock(),
    });
    const started = store.start(
      { name: "Lake house twilight", mode: "render", note: "Wide frame" },
      "Cadi@IconicImagesTX.com",
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.job).toMatchObject({
      status: "queued",
      progress: 0,
      stage: "Queued on the server",
      result: null,
    });
    expect(started.job).not.toHaveProperty("ownerEmail");
    expect(steps.pending).toHaveLength(1);

    // Leaving the page is a read, not a cancel. The next tick still runs.
    expect(store.list("cadi@iconicimagestx.com")).toHaveLength(1);
    expect(steps.pending).toHaveLength(1);
    await steps.tick();
    expect(store.read("cadi@iconicimagestx.com", started.job.id)).toMatchObject({
      status: "processing",
      progress: 34,
      stage: "Rendering",
    });
    await steps.tick();
    expect(store.read("cadi@iconicimagestx.com", started.job.id)?.progress).toBe(67);
    await steps.tick();
    const ready = store.read("cadi@iconicimagestx.com", started.job.id);
    expect(ready).toMatchObject({
      status: "ready",
      progress: 100,
      stage: "Ready",
      result: {
        summary: "Lake house twilight is ready.",
        detail: "Rendered on the server.",
      },
    });
    expect(ready?.result?.imageDataUrl.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(calls.count).toBe(1);
    expect(steps.pending).toHaveLength(0);
    store.closeForTests();
  });

  it("hides another owner's jobs", () => {
    const steps = manual();
    const store = new OwnerEditorStore({
      file: tempFile(),
      scheduler: steps.scheduler,
      renderer: renderer({ count: 0 }),
      now: clock(),
    });
    const lake = store.start({ name: "Lake house", mode: "process", note: "" }, "cadi@iconicimagestx.com");
    const other = store.start({ name: "Other owner", mode: "render", note: "" }, "other@example.com");
    expect(lake.ok && other.ok).toBe(true);
    if (!lake.ok || !other.ok) return;
    expect(store.list("cadi@iconicimagestx.com").map((job) => job.name)).toEqual(["Lake house"]);
    expect(store.read("cadi@iconicimagestx.com", other.job.id)).toBeNull();
    store.closeForTests();
  });

  it("resumes a saved job in a new process", async () => {
    const file = tempFile();
    const firstSteps = manual();
    const first = new OwnerEditorStore({
      file,
      scheduler: firstSteps.scheduler,
      renderer: renderer({ count: 0 }),
      now: clock(),
    });
    const lake = first.start({ name: "Lake house", mode: "process", note: "" }, "cadi@iconicimagestx.com");
    expect(lake.ok).toBe(true);
    if (!lake.ok) return;
    await firstSteps.tick();
    expect(first.read("cadi@iconicimagestx.com", lake.job.id)?.stage).toBe("Processing");
    first.closeForTests();

    const secondSteps = manual();
    const second = new OwnerEditorStore({
      file,
      scheduler: secondSteps.scheduler,
      renderer: renderer({ count: 0 }),
      now: clock(),
    });
    expect(second.read("cadi@iconicimagestx.com", lake.job.id)?.progress).toBe(34);
    expect(secondSteps.pending).toHaveLength(1);
    await secondSteps.tick();
    await secondSteps.tick();
    expect(second.read("cadi@iconicimagestx.com", lake.job.id)).toMatchObject({
      status: "ready",
      progress: 100,
      result: { summary: "Lake house is ready.", detail: "Processed on the server." },
    });
    second.closeForTests();
  });

  it("records a failure without dropping the project", async () => {
    const steps = manual();
    const store = new OwnerEditorStore({
      file: tempFile(),
      scheduler: steps.scheduler,
      renderer: async () => {
        throw new Error("frame failed");
      },
      now: clock(),
    });
    const started = store.start({ name: "Kitchen", mode: "render", note: "" }, "cadi@iconicimagestx.com");
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    await steps.tick();
    await steps.tick();
    await steps.tick();
    expect(store.read("cadi@iconicimagestx.com", started.job.id)).toMatchObject({
      status: "failed",
      error: "The editor could not finish this job.",
      result: null,
    });
    store.closeForTests();
  });

  it("builds a follow-up tick that does not depend on the browser", () => {
    expect(editorTickRequest({}, "ed_0123456789abcdef")).toBeNull();
    expect(editorTickRequest({ APP_URL: "https://iconic.example" }, "ed_0123456789abcdef")).toBeNull();
    expect(editorTickRequest({ CRON_SECRET: "cron-secret", APP_URL: "https://iconic.example/" }, "not-an-id")).toBeNull();
    expect(editorTickRequest({ CRON_SECRET: "cron-secret", URL: "https://iconic.example" }, "ed_0123456789abcdef")).toEqual({
      url: "https://iconic.example/api/owners/editor/jobs/ed_0123456789abcdef/tick",
      init: { method: "POST", headers: { Authorization: "Bearer cron-secret" } },
    });
  });

  it("does not tie the queue to a request abort", () => {
    const source = fs.readFileSync(new URL("./ownerEditorJobs.ts", import.meta.url), "utf8");
    expect(source).not.toContain("AbortSignal");
    expect(source).not.toContain("CLIENT_NOTIFY_LIVE");
    expect(source).not.toContain("req.on(");
  });
});
