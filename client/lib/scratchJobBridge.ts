import {
  scratchStatusForJob,
  type StudioProjectJob,
} from "@shared/studioProjects";

export interface ScratchPersistShape {
  id: string;
  name: string;
  beforeUrl: string;
  source: Blob;
  status: "ready" | "editing" | "done" | "failed";
  error?: string;
  afterUrl?: string;
  afterBytes?: Uint8Array;
  downloadName?: string;
  lastAction?: string;
  uploadIndex: number;
  byteSize: number;
  shotAt: number;
  editable: boolean;
}

export function reconcileScratchItems<T extends ScratchPersistShape>(
  current: T[],
  jobs: readonly StudioProjectJob[],
  outputBytes: (id: string) => Uint8Array | undefined,
  createUrl: (bytes: Uint8Array) => string,
  placeholder: (name: string) => string,
): T[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const next: T[] = [];
  for (const job of jobs) {
    seen.add(job.id);
    const existing = byId.get(job.id);
    const bytes = outputBytes(job.id);
    const status = scratchStatusForJob(job, Boolean(existing?.afterBytes) || Boolean(bytes));
    if (!existing) {
      next.push({
        id: job.id,
        name: job.fileName,
        beforeUrl: job.thumbnailDataUrl || placeholder(job.fileName),
        source: new Blob(),
        status,
        error: job.error || undefined,
        afterUrl: bytes ? createUrl(bytes) : undefined,
        afterBytes: bytes,
        lastAction: job.label || undefined,
        uploadIndex: next.length,
        byteSize: bytes?.byteLength || 0,
        shotAt: job.createdAt,
        editable: true,
      } as T);
      continue;
    }
    const replaceBytes = Boolean(bytes && bytes !== existing.afterBytes);
    next.push({
      ...existing,
      status,
      error: job.error || undefined,
      afterUrl: replaceBytes && bytes ? createUrl(bytes) : existing.afterUrl,
      afterBytes: replaceBytes && bytes ? bytes : existing.afterBytes,
      lastAction: job.label || existing.lastAction,
    });
  }
  for (const item of current) {
    if (!seen.has(item.id)) next.push(item);
  }
  return next;
}
