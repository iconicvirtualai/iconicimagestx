/**
 * Server-side aICON editor queue.
 * The HTTP handler stores the job and returns. Later ticks are timers on this
 * process, not the browser request, so leaving the Owners Suite does not
 * cancel a render or a process. The same file is read when she comes back.
 */

import { randomBytes } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {
  OWNER_EDITOR_JOB_CAP,
  ownerEditorFrameSvg,
  parseOwnerEditorStart,
  type OwnerEditorJob,
  type OwnerEditorMode,
  type OwnerEditorResult,
  type OwnerEditorStart,
} from "../../shared/ownerEditor";

const DEFAULT_STEP_MS = 600;

type Timer = { stop: () => void };
type Scheduler = (run: () => Promise<void>, ms: number) => Timer;
type FrameRenderer = (job: OwnerEditorJob) => Promise<{ mime: string; base64: string }>;

interface StoredJob extends OwnerEditorJob {
  ownerEmail: string;
}

interface StoreFile {
  jobs: StoredJob[];
}

export interface OwnerEditorStoreOptions {
  file?: string;
  stepMs?: number;
  scheduler?: Scheduler;
  renderer?: FrameRenderer;
  now?: () => string;
  /** When false, steps stay on the in-process timer. Tests use this. */
  followUp?: boolean;
}

export class OwnerEditorStore {
  private readonly file: string;
  private readonly stepMs: number;
  private readonly scheduler: Scheduler;
  private readonly renderer: FrameRenderer;
  private readonly now: () => string;
  private readonly followUp: boolean;
  private readonly jobs = new Map<string, StoredJob>();
  private readonly timers = new Map<string, Timer>();
  private closed = false;

  constructor(options: OwnerEditorStoreOptions = {}) {
    const env = optionsFromEnv();
    this.file = options.file || env.file;
    this.stepMs = options.stepMs ?? env.stepMs;
    this.scheduler = options.scheduler || timeoutScheduler;
    this.renderer = options.renderer || renderFrame;
    this.now = options.now || (() => new Date().toISOString());
    this.followUp = options.followUp !== false;
    this.readFile();
  }

  start(input: unknown, ownerEmail: string): { ok: true; job: OwnerEditorJob } | { ok: false; status: number; error: string } {
    const parsed = parseOwnerEditorStart(input);
    if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
    const email = ownerEmail.trim().toLowerCase();
    if (this.owned(email).length >= OWNER_EDITOR_JOB_CAP) {
      return { ok: false, status: 400, error: "My Projects already has 24 jobs." };
    }
    const job = this.record(parsed.value, email);
    this.jobs.set(job.id, job);
    this.writeFile();
    this.arm(job.id);
    return { ok: true, job: publish(job) };
  }

  list(ownerEmail: string): OwnerEditorJob[] {
    return this.owned(ownerEmail.trim().toLowerCase()).map(publish);
  }

  read(ownerEmail: string, id: string): OwnerEditorJob | null {
    const job = this.jobs.get(id);
    if (!job || job.ownerEmail !== ownerEmail.trim().toLowerCase()) return null;
    return publish(job);
  }

  /** One server step. Used by the follow-up request after the browser has gone. */
  async step(id: string): Promise<OwnerEditorJob | null> {
    await this.advance(id);
    const job = this.jobs.get(id);
    return job ? publish(job) : null;
  }

  /** Test teardown. This is not a client cancel. */
  closeForTests() {
    this.closed = true;
    for (const timer of this.timers.values()) timer.stop();
    this.timers.clear();
  }

  private record(value: OwnerEditorStart, ownerEmail: string): StoredJob {
    const stamp = this.now();
    return {
      id: newId(this.jobs),
      name: value.name,
      mode: value.mode,
      note: value.note,
      status: "queued",
      progress: 0,
      stage: "Queued on the server",
      result: null,
      error: null,
      createdAt: stamp,
      updatedAt: stamp,
      ownerEmail,
    };
  }

  private owned(email: string): StoredJob[] {
    return [...this.jobs.values()]
      .filter((job) => job.ownerEmail === email)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }

  private arm(id: string) {
    if (this.closed) return;
    this.timers.get(id)?.stop();
    const request = this.followUp && this.scheduler === timeoutScheduler ? editorTickRequest(process.env, id) : null;
    if (request) {
      const timer = setTimeout(() => {
        this.timers.delete(id);
        void fetch(request.url, request.init).then(async (response) => {
          if (!response.ok && !this.closed) await this.advance(id);
        }).catch((err) => {
          console.error("[Owners] aICON editor follow-up failed:", err instanceof Error ? err.message : err);
          if (!this.closed) void this.advance(id);
        });
      }, this.stepMs);
      this.timers.set(id, { stop: () => clearTimeout(timer) });
      return;
    }
    const timer = this.scheduler(() => this.advance(id), this.stepMs);
    this.timers.set(id, timer);
  }

  private async advance(id: string) {
    this.timers.delete(id);
    const job = this.jobs.get(id);
    if (this.closed || !job || job.status === "ready" || job.status === "failed") return;
    if (job.progress < 34) {
      this.mark(job, 34, "processing", job.mode === "render" ? "Rendering" : "Processing");
      this.arm(id);
      return;
    }
    if (job.progress < 67) {
      this.mark(job, 67, "processing", job.mode === "render" ? "Still rendering" : "Still processing");
      this.arm(id);
      return;
    }
    this.mark(job, 67, "processing", job.mode === "render" ? "Finishing the render" : "Finishing the process");
    try {
      const image = await this.renderer(publish(job));
      const current = this.jobs.get(id);
      if (this.closed || !current || current.status === "failed") return;
      current.result = resultFor(current, image);
      current.status = "ready";
      current.progress = 100;
      current.stage = "Ready";
      current.error = null;
      current.updatedAt = this.now();
      this.writeFile();
    } catch (err) {
      const current = this.jobs.get(id);
      if (!current || this.closed) return;
      current.status = "failed";
      current.stage = "Failed";
      current.error = "The editor could not finish this job.";
      current.updatedAt = this.now();
      this.writeFile();
      console.error("[Owners] aICON editor job failed:", err instanceof Error ? err.message : err);
    }
  }

  private mark(job: StoredJob, progress: number, status: StoredJob["status"], stage: string) {
    job.progress = progress;
    job.status = status;
    job.stage = stage;
    job.updatedAt = this.now();
    this.writeFile();
  }

  private readFile() {
    let parsed: StoreFile | null = null;
    try {
      parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as StoreFile;
    } catch {
      return;
    }
    if (!parsed || !Array.isArray(parsed.jobs)) return;
    for (const job of parsed.jobs) {
      if (!job || typeof job.id !== "string" || typeof job.ownerEmail !== "string") continue;
      this.jobs.set(job.id, job);
      if (job.status === "queued" || job.status === "processing") this.arm(job.id);
    }
  }

  private writeFile() {
    const payload = JSON.stringify({ jobs: [...this.jobs.values()] });
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, payload);
    fs.renameSync(temp, this.file);
  }
}

let singleton: OwnerEditorStore | null = null;

export function ownerEditorJobs(): OwnerEditorStore {
  if (!singleton) singleton = new OwnerEditorStore();
  return singleton;
}

export function resetOwnerEditorJobsForTests(options: OwnerEditorStoreOptions = {}): OwnerEditorStore {
  singleton?.closeForTests();
  singleton = new OwnerEditorStore(options);
  return singleton;
}

export function startOwnerEditorJob(input: unknown, ownerEmail: string) {
  return ownerEditorJobs().start(input, ownerEmail);
}

export function listOwnerEditorJobs(ownerEmail: string) {
  return ownerEditorJobs().list(ownerEmail);
}

export function readOwnerEditorJob(ownerEmail: string, id: string) {
  return ownerEditorJobs().read(ownerEmail, id);
}

export function stepOwnerEditorJob(id: string) {
  return ownerEditorJobs().step(id);
}

/** A follow-up request of its own, so a render keeps going after the browser leaves. */
export function editorTickRequest(
  env: Record<string, string | undefined>,
  id: string,
): { url: string; init: { method: "POST"; headers: Record<string, string> } } | null {
  const secret = typeof env.CRON_SECRET === "string" ? env.CRON_SECRET.trim() : "";
  const base = String(env.APP_URL || env.URL || "").trim().replace(/\/$/, "");
  if (!secret || !base || !/^ed_[a-f0-9]{16}$/.test(id)) return null;
  return {
    url: `${base}/api/owners/editor/jobs/${id}/tick`,
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    },
  };
}

function optionsFromEnv(): { file: string; stepMs: number } {
  const raw = Number(process.env.OWNER_EDITOR_STEP_MS);
  const stepMs = Number.isFinite(raw) && raw >= 20 && raw <= 10_000 ? raw : DEFAULT_STEP_MS;
  const configured = process.env.OWNER_EDITOR_STORE?.trim();
  const file = configured || path.join(os.tmpdir(), "iconic-owner-editor-jobs.json");
  return { file, stepMs };
}

function timeoutScheduler(run: () => Promise<void>, ms: number): Timer {
  const timer = setTimeout(() => {
    void run();
  }, ms);
  return { stop: () => clearTimeout(timer) };
}

function newId(jobs: Map<string, StoredJob>): string {
  let id = "";
  do {
    id = `ed_${randomBytes(8).toString("hex")}`;
  } while (jobs.has(id));
  return id;
}

function publish(job: StoredJob): OwnerEditorJob {
  return {
    id: job.id,
    name: job.name,
    mode: job.mode,
    note: job.note,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function resultFor(job: StoredJob, image: { mime: string; base64: string }): OwnerEditorResult {
  return {
    summary: `${job.name} is ready.`,
    detail: job.mode === "render" ? "Rendered on the server." : "Processed on the server.",
    imageDataUrl: `data:${image.mime};base64,${image.base64}`,
  };
}

async function renderFrame(job: OwnerEditorJob): Promise<{ mime: string; base64: string }> {
  const svg = ownerEditorFrameSvg({ name: job.name, mode: job.mode as OwnerEditorMode });
  try {
    const sharp = (await import("sharp")).default;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return { mime: "image/png", base64: png.toString("base64") };
  } catch (err) {
    console.error("[Owners] aICON frame used SVG:", err instanceof Error ? err.message : err);
    return { mime: "image/svg+xml", base64: Buffer.from(svg).toString("base64") };
  }
}
