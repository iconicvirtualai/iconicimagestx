/**
 * aICON editor jobs for the Owners Suite.
 * A job is started on the server and keeps running after the page closes.
 * My Projects reads the same record when the owner comes back.
 */

export const OWNER_EDITOR_NAME_MAX = 80;
export const OWNER_EDITOR_NOTE_MAX = 400;
export const OWNER_EDITOR_JOB_CAP = 24;

export const OWNER_EDITOR_MODES = ["render", "process"] as const;
export type OwnerEditorMode = (typeof OWNER_EDITOR_MODES)[number];

export const OWNER_EDITOR_STATUSES = ["queued", "processing", "ready", "failed"] as const;
export type OwnerEditorStatus = (typeof OWNER_EDITOR_STATUSES)[number];

export interface OwnerEditorStart {
  name: string;
  mode: OwnerEditorMode;
  note: string;
}

export interface OwnerEditorResult {
  summary: string;
  detail: string;
  imageDataUrl: string;
}

export interface OwnerEditorJob {
  id: string;
  name: string;
  mode: OwnerEditorMode;
  note: string;
  status: OwnerEditorStatus;
  progress: number;
  stage: string;
  result: OwnerEditorResult | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OwnerEditorJobsResponse {
  jobs: OwnerEditorJob[];
}

export function ownerEditorModeLabel(mode: OwnerEditorMode): string {
  return mode === "render" ? "Render" : "Process";
}

export function ownerEditorStatusLabel(job: { status: OwnerEditorStatus; mode: OwnerEditorMode }): string {
  if (job.status === "queued") return "Queued";
  if (job.status === "ready") return "Ready";
  if (job.status === "failed") return "Failed";
  return job.mode === "render" ? "Rendering" : "Processing";
}

export function ownerEditorActive(status: OwnerEditorStatus): boolean {
  return status === "queued" || status === "processing";
}

export function parseOwnerEditorStart(
  input: unknown,
): { ok: true; value: OwnerEditorStart } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Enter a project name." };
  const body = input as { name?: unknown; mode?: unknown; note?: unknown };
  const name = normalized(body.name);
  if (!name) return { ok: false, error: "Enter a project name." };
  if (name.length > OWNER_EDITOR_NAME_MAX) {
    return { ok: false, error: "Project names are limited to 80 characters." };
  }
  const mode = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "";
  if (mode !== "render" && mode !== "process") return { ok: false, error: "Choose render or process." };
  const note = normalized(body.note);
  if (note.length > OWNER_EDITOR_NOTE_MAX) return { ok: false, error: "Notes are limited to 400 characters." };
  return { ok: true, value: { name, mode, note } };
}

/** Server-drawn result frame. Sans-serif only, so the preview matches the suite. */
export function ownerEditorFrameSvg(input: { name: string; mode: OwnerEditorMode }): string {
  const title = xmlEscape(input.name.slice(0, 42));
  const mode = xmlEscape(ownerEditorModeLabel(input.mode));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <rect width="960" height="540" fill="#071422"/>
  <rect x="48" y="48" width="864" height="444" rx="28" fill="#102844" stroke="#e8c872" stroke-width="3"/>
  <text x="88" y="140" fill="#e8c872" font-family="Inter, Arial, Helvetica, sans-serif" font-size="20" font-weight="700">aICON</text>
  <text x="88" y="230" fill="#f7f1e4" font-family="Inter, Arial, Helvetica, sans-serif" font-size="44" font-weight="700">${title}</text>
  <text x="88" y="292" fill="#d5deea" font-family="Inter, Arial, Helvetica, sans-serif" font-size="24">${mode}</text>
  <text x="88" y="430" fill="#9fb0c7" font-family="Inter, Arial, Helvetica, sans-serif" font-size="18">Finished on the server</text>
</svg>`;
}

function normalized(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
