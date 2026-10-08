/**
 * Order-edit jobs the photographer upload flow used to finish in Iconic Studio.
 * The photo editor shows this tray for the open listing: process the queue,
 * then approve or reject the result. Scratch-pad edits stay separate.
 */

export interface StudioOrderTrayJob {
  id: string;
  listingId: string;
  status: string;
  origin: string;
  sourcePath: string;
  resultPath: string;
  label: string;
  note: string;
  afterUrl: string;
  placeholder: boolean;
  canApprove: boolean;
  canReject: boolean;
}

const VISIBLE = new Set(["pending", "processing", "review", "failed", "rejected"]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function studioOrderTrayJobs(jobs: unknown, listingId: string): StudioOrderTrayJob[] {
  const id = listingId.trim();
  if (!id || !Array.isArray(jobs)) return [];
  const rows: StudioOrderTrayJob[] = [];
  for (const raw of jobs) {
    if (!raw || typeof raw !== "object") continue;
    const job = raw as Record<string, unknown>;
    const jobId = text(job.id);
    const jobListing = text(job.listingId);
    const status = text(job.status).toLowerCase();
    if (!jobId || jobListing !== id || !VISIBLE.has(status)) continue;
    const afterUrl = text(job.afterUrl);
    const placeholder = job.placeholder === true;
    const sourcePath = text(job.sourcePath);
    rows.push({
      id: jobId,
      listingId: jobListing,
      status,
      origin: text(job.origin),
      sourcePath,
      resultPath: text(job.resultPath),
      label: text(job.label) || text(job.type) || "edit",
      note: text(job.note),
      afterUrl,
      placeholder,
      canApprove: status === "review" && !placeholder && Boolean(afterUrl),
      canReject: status !== "pending",
    });
  }
  return rows;
}

/** Same gate the old job editor used before it advanced the order queue. */
export function listingOrderQueuePending(jobs: readonly StudioOrderTrayJob[]): boolean {
  return jobs.some((job) => job.origin === "order" && job.status === "pending" && Boolean(job.sourcePath));
}
