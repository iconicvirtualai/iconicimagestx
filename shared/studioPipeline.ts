/**
 * Order status as a shoot moves through Studio.
 * Upload, export, and deliver only move forward. Cancelled work stays put.
 */

export type StudioPipelineStep = "upload" | "export" | "deliver";

const STOPPED = new Set(["cancelled", "canceled", "archived", "declined", "no_show"]);

function rank(status: string): number {
  if (status === "delivered" || status === "delivered_paid" || status === "delivered_unpaid" || status === "completed") {
    return 3;
  }
  if (status === "approved" || status === "ready_for_review") return 2;
  if (status === "editing" || status === "uploaded" || status === "raw_uploaded") return 1;
  return 0;
}

function targetFor(step: StudioPipelineStep): { status: string; rank: number } {
  if (step === "upload") return { status: "editing", rank: 1 };
  if (step === "export") return { status: "ready_for_review", rank: 2 };
  return { status: "delivered", rank: 3 };
}

/** Next status for an order or listing. A later status is left alone. */
export function nextOrderPipelineStatus(current: unknown, step: StudioPipelineStep): string {
  const now = typeof current === "string" ? current.trim() : "";
  if (STOPPED.has(now)) return now;
  const target = targetFor(step);
  if (rank(now) >= target.rank) return now;
  return target.status;
}

export interface StudioExportFrameInput {
  id?: string;
  path?: string;
  name?: string;
  bytesBase64?: string;
}

const FRAME_LIMIT = 24;
const BYTE_LIMIT = 4_500_000;

export function parseStudioExportFrames(body: unknown):
  | { ok: true; frames: StudioExportFrameInput[] }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Say which photos to export." };
  const frames = (body as { frames?: unknown }).frames;
  if (!Array.isArray(frames) || frames.length === 0) {
    return { ok: false, error: "Select the photos to export." };
  }
  if (frames.length > FRAME_LIMIT) {
    return { ok: false, error: `Export up to ${FRAME_LIMIT} photos at a time.` };
  }
  const parsed: StudioExportFrameInput[] = [];
  for (const row of frames) {
    if (!row || typeof row !== "object") return { ok: false, error: "A photo in this export is incomplete." };
    const item = row as Record<string, unknown>;
    const path = typeof item.path === "string" ? item.path.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim().slice(0, 180) : "";
    const id = typeof item.id === "string" ? item.id.trim().slice(0, 240) : "";
    const bytesBase64 = typeof item.bytesBase64 === "string" ? item.bytesBase64.trim() : "";
    if (!path && !bytesBase64) return { ok: false, error: "Each export photo needs a file or an edited JPEG." };
    if (bytesBase64) {
      const bytes = Math.floor((bytesBase64.length * 3) / 4);
      if (bytes > BYTE_LIMIT) return { ok: false, error: "An edited photo is too large to export." };
    }
    parsed.push({
      ...(id ? { id } : {}),
      ...(path ? { path } : {}),
      ...(name ? { name } : {}),
      ...(bytesBase64 ? { bytesBase64 } : {}),
    });
  }
  return { ok: true, frames: parsed };
}
