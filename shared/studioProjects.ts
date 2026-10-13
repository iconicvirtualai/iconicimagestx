/**
 * Staff studio projects.
 * Each photo job lives at projects/{projectId}/jobs/{jobId} and keeps
 * uploading or rendering after the editor unmounts.
 */

export const STUDIO_PROJECTS_COLLECTION = "projects";
export const STUDIO_JOBS_COLLECTION = "jobs";
export const STUDIO_PROJECT_RECORD = "studio-project";
export const MY_PROJECTS_PATH = "/admin/my-projects";
export const STUDIO_PROJECT_QUERY = "studioProject";

export const STUDIO_JOB_STATUSES = ["queued", "uploading", "rendering", "done", "failed"] as const;
export type StudioJobStatus = (typeof STUDIO_JOB_STATUSES)[number];

export type StudioJobKind = "upload" | "edit" | "staging";

export interface StudioJobStep {
  action: string;
  prompt: string;
}

export interface StudioProjectJob {
  id: string;
  projectId: string;
  ownerUid: string;
  status: StudioJobStatus;
  progress: number;
  inputRef: string;
  outputRef: string;
  fileName: string;
  kind: StudioJobKind;
  label: string;
  action: string;
  prompt: string;
  steps: StudioJobStep[];
  error: string;
  createdAt: number;
  updatedAt: number;
  thumbnailDataUrl: string;
  listingId: string;
  roomType: string;
  style: string;
  recordType: typeof STUDIO_PROJECT_RECORD;
}

export interface StudioProjectRecord {
  id: string;
  ownerUid: string;
  title: string;
  listingId: string;
  createdAt: number;
  updatedAt: number;
  recordType: typeof STUDIO_PROJECT_RECORD;
}

export interface ResumedStudioFrame {
  id: string;
  projectId: string;
  name: string;
  status: "ready" | "editing" | "done" | "failed";
  progress: number;
  inputRef: string;
  outputRef: string;
  error: string;
  ownerUid: string;
  kind: StudioJobKind;
}

export function studioProjectDocPath(projectId: string): string {
  return `${STUDIO_PROJECTS_COLLECTION}/${projectId}`;
}

export function studioJobDocPath(projectId: string, jobId: string): string {
  return `${STUDIO_PROJECTS_COLLECTION}/${projectId}/${STUDIO_JOBS_COLLECTION}/${jobId}`;
}

export function studioInputStoragePath(ownerUid: string, projectId: string, jobId: string): string {
  return `studio-projects/${ownerUid}/${projectId}/${jobId}/input.jpg`;
}

export function studioOutputStoragePath(ownerUid: string, projectId: string, jobId: string): string {
  return `studio-projects/${ownerUid}/${projectId}/${jobId}/output.jpg`;
}

export function isStudioJobStatus(value: string): value is StudioJobStatus {
  return (STUDIO_JOB_STATUSES as readonly string[]).includes(value);
}

export function isActiveJobStatus(status: StudioJobStatus): boolean {
  return status === "queued" || status === "uploading" || status === "rendering";
}

export function activeJobCount(jobs: readonly StudioProjectJob[], ownerUid?: string): number {
  return jobs.filter((job) => isActiveJobStatus(job.status) && (!ownerUid || job.ownerUid === ownerUid)).length;
}

export function canRetryJob(job: Pick<StudioProjectJob, "ownerUid" | "status">, viewerUid: string): boolean {
  return Boolean(viewerUid) && job.ownerUid === viewerUid && job.status === "failed";
}

export function canDownloadJob(job: Pick<StudioProjectJob, "ownerUid" | "status" | "outputRef">, viewerUid: string): boolean {
  return Boolean(viewerUid) && job.ownerUid === viewerUid && job.status === "done" && Boolean(job.outputRef);
}

export function canOpenJob(job: Pick<StudioProjectJob, "ownerUid">, viewerUid: string): boolean {
  return Boolean(viewerUid) && job.ownerUid === viewerUid;
}

export function jobStatusLabel(status: StudioJobStatus): string {
  if (status === "queued") return "Queued";
  if (status === "uploading") return "Uploading";
  if (status === "rendering") return "Rendering";
  if (status === "done") return "Done";
  return "Failed";
}

export function formatJobTime(updatedAt: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function studioJobProgressLabel(jobs: readonly StudioProjectJob[]): string {
  const active = jobs.filter((job) => isActiveJobStatus(job.status));
  if (!active.length) return "";
  const job = active[0];
  if (job.status === "uploading") return `Uploading ${job.fileName} · ${job.progress}%`;
  if (job.status === "rendering") return `Rendering ${job.fileName} · ${job.progress}%`;
  return `Queued ${job.fileName}`;
}

export function isStudioEditorPath(pathname: string): boolean {
  const path = pathname.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  return path === "/admin/studio/scratch" || path === "/admin/studio/editing";
}

export function studioProjectIdFromSearch(search: string): string {
  const raw = search.startsWith("?") ? search.slice(1) : search.split("#")[0];
  return (new URLSearchParams(raw).get(STUDIO_PROJECT_QUERY) || "").trim();
}

export function studioProjectEditorHref(projectId: string): string {
  return `/admin/studio/scratch?${STUDIO_PROJECT_QUERY}=${encodeURIComponent(projectId)}`;
}

export function scratchStatusForJob(job: Pick<StudioProjectJob, "status" | "outputRef">, hasLocalResult = false): ResumedStudioFrame["status"] {
  if (job.status === "failed") return "failed";
  if (isActiveJobStatus(job.status)) return "editing";
  if (job.status === "done" && (Boolean(job.outputRef) || hasLocalResult)) return "done";
  return "ready";
}

export function resumeProject(jobs: readonly StudioProjectJob[], projectId: string, ownerUid: string): {
  projectId: string;
  frames: ResumedStudioFrame[];
  inProgress: boolean;
} {
  const frames = jobs
    .filter((job) => job.projectId === projectId && job.ownerUid === ownerUid)
    .map((job) => ({
      id: job.id,
      projectId: job.projectId,
      name: job.fileName,
      status: scratchStatusForJob(job),
      progress: job.progress,
      inputRef: job.inputRef,
      outputRef: job.outputRef,
      error: job.error,
      ownerUid: job.ownerUid,
      kind: job.kind,
    }));
  return {
    projectId,
    frames,
    inProgress: frames.some((frame) => frame.status === "editing"),
  };
}

export function jobsFinishedElsewhere(
  previous: readonly Pick<StudioProjectJob, "id" | "status">[],
  next: readonly StudioProjectJob[],
  pathname: string,
): StudioProjectJob[] {
  if (isStudioEditorPath(pathname)) return [];
  const prior = new Map(previous.map((job) => [job.id, job.status]));
  return next.filter((job) => {
    const before = prior.get(job.id);
    if (!before || !isActiveJobStatus(before)) return false;
    return job.status === "done" || job.status === "failed";
  });
}

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function blankStudioJob(input: {
  id: string;
  projectId: string;
  ownerUid: string;
  fileName: string;
  kind: StudioJobKind;
  now: number;
  listingId?: string;
}): StudioProjectJob {
  return {
    id: input.id,
    projectId: input.projectId,
    ownerUid: input.ownerUid,
    status: "queued",
    progress: 0,
    inputRef: studioInputStoragePath(input.ownerUid, input.projectId, input.id),
    outputRef: "",
    fileName: input.fileName,
    kind: input.kind,
    label: input.kind,
    action: "",
    prompt: "",
    steps: [],
    error: "",
    createdAt: input.now,
    updatedAt: input.now,
    thumbnailDataUrl: "",
    listingId: input.listingId || "",
    roomType: "",
    style: "",
    recordType: STUDIO_PROJECT_RECORD,
  };
}

export function normalizeStudioJob(raw: Partial<StudioProjectJob> & { id?: string }, fallbackId = ""): StudioProjectJob | null {
  const id = String(raw.id || fallbackId || "");
  const projectId = String(raw.projectId || "");
  const ownerUid = String(raw.ownerUid || "");
  if (!id || !projectId || !ownerUid) return null;
  if (raw.recordType && raw.recordType !== STUDIO_PROJECT_RECORD) return null;
  const status = isStudioJobStatus(String(raw.status || "")) ? (raw.status as StudioJobStatus) : "queued";
  const kind: StudioJobKind = raw.kind === "edit" || raw.kind === "staging" ? raw.kind : "upload";
  return {
    id,
    projectId,
    ownerUid,
    status,
    progress: clampProgress(Number(raw.progress || 0)),
    inputRef: String(raw.inputRef || ""),
    outputRef: String(raw.outputRef || ""),
    fileName: String(raw.fileName || "photo.jpg"),
    kind,
    label: String(raw.label || kind),
    action: String(raw.action || ""),
    prompt: String(raw.prompt || ""),
    steps: Array.isArray(raw.steps)
      ? raw.steps
        .filter((step) => step && typeof step.action === "string")
        .map((step) => ({ action: String(step.action), prompt: String(step.prompt || "") }))
      : [],
    error: String(raw.error || ""),
    createdAt: Number(raw.createdAt || 0),
    updatedAt: Number(raw.updatedAt || 0),
    thumbnailDataUrl: String(raw.thumbnailDataUrl || "").slice(0, 12000),
    listingId: String(raw.listingId || ""),
    roomType: String(raw.roomType || ""),
    style: String(raw.style || ""),
    recordType: STUDIO_PROJECT_RECORD,
  };
}

export function previewThumbnail(label: string): string {
  const safe = label.replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#10211f"/><rect x="18" y="30" width="124" height="60" rx="8" fill="#0d9488"/><text x="80" y="66" text-anchor="middle" fill="white" font-family="Inter,sans-serif" font-size="13">${safe}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function midRenderPreview(now: number): { project: StudioProjectRecord; jobs: StudioProjectJob[] } {
  const project: StudioProjectRecord = {
    id: "preview-project",
    ownerUid: "temp-admin-uid",
    title: "Scratch pad",
    listingId: "",
    createdAt: now - 120_000,
    updatedAt: now - 5_000,
    recordType: STUDIO_PROJECT_RECORD,
  };
  const base = {
    projectId: project.id,
    ownerUid: project.ownerUid,
    recordType: STUDIO_PROJECT_RECORD as const,
    listingId: "",
    action: "",
    prompt: "",
    steps: [] as StudioJobStep[],
    error: "",
    roomType: "",
    style: "",
    createdAt: now - 90_000,
  };
  const jobs: StudioProjectJob[] = [
    {
      ...base,
      id: "preview-render",
      status: "rendering",
      progress: 64,
      inputRef: studioInputStoragePath(project.ownerUid, project.id, "preview-render"),
      outputRef: "",
      fileName: "living-room.jpg",
      kind: "edit",
      label: "Edit",
      updatedAt: now - 5_000,
      thumbnailDataUrl: previewThumbnail("Living room"),
    },
    {
      ...base,
      id: "preview-upload",
      status: "uploading",
      progress: 28,
      inputRef: studioInputStoragePath(project.ownerUid, project.id, "preview-upload"),
      outputRef: "",
      fileName: "kitchen.jpg",
      kind: "upload",
      label: "Upload",
      updatedAt: now - 8_000,
      thumbnailDataUrl: previewThumbnail("Kitchen"),
    },
    {
      ...base,
      id: "preview-failed",
      status: "failed",
      progress: 40,
      inputRef: studioInputStoragePath(project.ownerUid, project.id, "preview-failed"),
      outputRef: "",
      fileName: "porch.jpg",
      kind: "staging",
      label: "Virtual Staging",
      error: "The render stopped. Retry when you are ready.",
      updatedAt: now - 60_000,
      thumbnailDataUrl: previewThumbnail("Porch"),
    },
    {
      ...base,
      id: "preview-done",
      status: "done",
      progress: 100,
      inputRef: studioInputStoragePath(project.ownerUid, project.id, "preview-done"),
      outputRef: studioOutputStoragePath(project.ownerUid, project.id, "preview-done"),
      fileName: "front.jpg",
      kind: "edit",
      label: "Edit",
      updatedAt: now - 180_000,
      thumbnailDataUrl: previewThumbnail("Front"),
    },
  ];
  return { project, jobs };
}
