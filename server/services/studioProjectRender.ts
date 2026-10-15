/**
 * Server-side studio render.
 * The handler keeps working after the browser navigates away and writes the
 * same projects/{projectId}/jobs/{jobId} document the editor resumes from.
 */

import {
  clampProgress,
  studioOutputStoragePath,
  type StudioProjectJob,
} from "../../shared/studioProjects";

export interface StudioRenderEdit {
  (input: {
    action: string;
    prompt: string;
    bytes: Buffer;
    contentType: string;
    fileName?: string;
  }): Promise<{ bytes: Buffer; contentType: string; downloadName: string }>;
}

export interface StudioRenderStage {
  (input: {
    job: StudioProjectJob;
    bytes: Buffer;
    onProgress: (progress: number) => void;
  }): Promise<Buffer>;
}

export async function renderStudioProjectJob(input: {
  job: StudioProjectJob;
  readInput: () => Promise<Buffer>;
  writeOutput: (path: string, bytes: Buffer) => Promise<void>;
  edit: StudioRenderEdit;
  stage?: StudioRenderStage;
  update: (patch: Partial<StudioProjectJob>) => Promise<void>;
  /** True when the browser already left. The render still finishes. */
  disconnected?: () => boolean;
}): Promise<StudioProjectJob> {
  const working: StudioProjectJob = { ...input.job, steps: input.job.steps.map((step) => ({ ...step })) };
  const publish = async (patch: Partial<StudioProjectJob>) => {
    Object.assign(working, patch, { updatedAt: Date.now() });
    if (patch.progress !== undefined) working.progress = clampProgress(patch.progress);
    await input.update({ ...patch, updatedAt: working.updatedAt, progress: working.progress });
  };

  try {
    // Touch the flag so a disconnect cannot be mistaken for a reason to stop.
    void input.disconnected?.();
    await publish({ status: "rendering", progress: 12, error: "" });
    const source = await input.readInput();
    let bytes = source;
    if (working.kind === "staging") {
      if (!input.stage) throw new Error("Virtual staging is not configured.");
      await publish({ status: "rendering", progress: 30 });
      bytes = await input.stage({
        job: working,
        bytes,
        onProgress: (progress) => {
          void publish({ status: "rendering", progress });
        },
      });
      if (working.prompt.trim().length >= 3) {
        const revised = await input.edit({
          action: "revise",
          prompt: working.prompt,
          bytes,
          contentType: "image/jpeg",
          fileName: working.fileName,
        });
        bytes = revised.bytes;
      }
    } else {
      const steps = working.steps.length
        ? working.steps
        : [{ action: working.action || "edit", prompt: working.prompt }];
      let index = 0;
      for (const step of steps) {
        index += 1;
        await publish({
          status: "rendering",
          progress: Math.min(90, 20 + Math.round((index / steps.length) * 60)),
        });
        const edited = await input.edit({
          action: step.action || "edit",
          prompt: step.prompt,
          bytes,
          contentType: "image/jpeg",
          fileName: working.fileName,
        });
        bytes = edited.bytes;
      }
    }
    const outputRef = studioOutputStoragePath(working.ownerUid, working.projectId, working.id);
    await input.writeOutput(outputRef, bytes);
    await publish({ status: "done", progress: 100, outputRef, error: "" });
    return { ...working };
  } catch (err) {
    const message = err instanceof Error ? err.message : "The render failed.";
    await publish({ status: "failed", error: message });
    return { ...working };
  }
}

const memoryObjects = new Map<string, Buffer>();
let memoryEnabled = false;

export function useStudioProjectObjects(store: Map<string, Buffer> | null): void {
  memoryObjects.clear();
  memoryEnabled = store !== null;
  if (!store) return;
  for (const [path, bytes] of store) memoryObjects.set(path, bytes);
}

export function studioProjectObjectsEnabled(): boolean {
  return memoryEnabled;
}

export function readMemoryStudioObject(path: string): Buffer {
  const bytes = memoryObjects.get(path);
  if (!bytes) throw new Error("That project file is missing.");
  return bytes;
}

export function writeMemoryStudioObject(path: string, bytes: Buffer): void {
  memoryObjects.set(path, Buffer.from(bytes));
}
