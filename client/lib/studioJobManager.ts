/**
 * In-app studio job manager.
 * Upload tasks live here, not on the editor page, so a route change does not
 * cancel a resumable upload or the server render that follows it.
 */

import {
  activeJobCount,
  blankStudioJob,
  canRetryJob,
  clampProgress,
  isActiveJobStatus,
  normalizeStudioJob,
  studioOutputStoragePath,
  type StudioJobKind,
  type StudioJobStep,
  type StudioProjectJob,
  type StudioProjectRecord,
} from "@shared/studioProjects";

export interface StudioUploadSignal {
  cancelled: boolean;
}

export interface StudioJobDraft {
  id?: string;
  projectId: string;
  ownerUid: string;
  fileName: string;
  kind: StudioJobKind;
  label?: string;
  action?: string;
  prompt?: string;
  steps?: StudioJobStep[];
  listingId?: string;
  thumbnailDataUrl?: string;
  roomType?: string;
  style?: string;
  data?: Uint8Array;
  /** Store these bytes as the finished output. No server render. */
  storeAsOutput?: boolean;
}

export interface StudioRenderResult {
  job: StudioProjectJob;
  outputBytes?: Uint8Array;
}

export interface StudioJobPorts {
  now(): number;
  newId(): string;
  persistJob(job: StudioProjectJob): Promise<void>;
  persistProject(project: StudioProjectRecord): Promise<void>;
  startUpload(input: {
    path: string;
    data: Uint8Array;
    signal: StudioUploadSignal;
    onProgress: (progress: number) => void;
  }): Promise<void>;
  startRender(job: StudioProjectJob): Promise<StudioRenderResult>;
}

export interface StudioJobManager {
  subscribe(listener: () => void): () => void;
  getState(): { jobs: StudioProjectJob[]; projects: StudioProjectRecord[]; activeProjectId: string | null };
  activeCount(ownerUid: string): number;
  ensureProject(ownerUid: string, title: string, listingId?: string): StudioProjectRecord;
  setActiveProject(projectId: string): void;
  jobsFor(projectId: string, ownerUid: string): StudioProjectJob[];
  enqueue(draft: StudioJobDraft): StudioProjectJob;
  retry(jobId: string, ownerUid: string): StudioProjectJob | null;
  outputBytes(jobId: string): Uint8Array | undefined;
  notePageDetached(): void;
  isUploadCancelled(jobId: string): boolean;
  hydrate(jobs: StudioProjectJob[], projects?: StudioProjectRecord[], activeProjectId?: string): void;
  applyRemote(jobs: StudioProjectJob[]): void;
  applyRemoteProjects(projects: StudioProjectRecord[]): void;
  takeFinished(): StudioProjectJob[];
}

function cloneJob(job: StudioProjectJob): StudioProjectJob {
  return {
    ...job,
    steps: job.steps.map((step) => ({ ...step })),
  };
}

export function createStudioJobManager(ports: StudioJobPorts): StudioJobManager {
  const jobs = new Map<string, StudioProjectJob>();
  const projects = new Map<string, StudioProjectRecord>();
  const sources = new Map<string, Uint8Array>();
  const outputs = new Map<string, Uint8Array>();
  const uploads = new Map<string, StudioUploadSignal>();
  const generationOf = new Map<string, number>();
  const listeners = new Set<() => void>();
  const finished: StudioProjectJob[] = [];
  const announced = new Set<string>();
  const ephemeral = new Set<string>();
  let activeProjectId: string | null = null;

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const persist = (job: StudioProjectJob) => {
    if (ephemeral.has(job.id)) return;
    void ports.persistJob(cloneJob(job)).catch(() => undefined);
  };

  const announce = (job: StudioProjectJob) => {
    const key = `${job.id}:${job.status}`;
    if (announced.has(key)) return;
    announced.add(key);
    finished.push(cloneJob(job));
  };

  const patch = (id: string, partial: Partial<StudioProjectJob>) => {
    const current = jobs.get(id);
    if (!current) return;
    const next: StudioProjectJob = {
      ...current,
      ...partial,
      progress: partial.progress === undefined ? current.progress : clampProgress(partial.progress),
      updatedAt: ports.now(),
    };
    jobs.set(id, next);
    if (isActiveJobStatus(current.status) && (next.status === "done" || next.status === "failed")) {
      announce(next);
    }
    persist(next);
    emit();
  };

  const run = async (id: string, generation: number) => {
    const handle: StudioUploadSignal = { cancelled: false };
    uploads.set(id, handle);
    const initial = jobs.get(id);
    if (!initial) return;
    try {
      const data = sources.get(id);
      if (data && initial.kind === "upload" && outputs.has(id) && initial.outputRef) {
        patch(id, { status: "uploading", progress: 0 });
        await ports.startUpload({
          path: initial.outputRef,
          data,
          signal: handle,
          onProgress: (progress) => {
            if (generationOf.get(id) !== generation) return;
            patch(id, { status: "uploading", progress });
          },
        });
        if (generationOf.get(id) !== generation || handle.cancelled) return;
        patch(id, { status: "done", progress: 100, outputRef: initial.outputRef });
        return;
      }
      if (data) {
        const path = initial.inputRef;
        patch(id, { status: "uploading", progress: 0, inputRef: path });
        await ports.startUpload({
          path,
          data,
          signal: handle,
          onProgress: (progress) => {
            if (generationOf.get(id) !== generation) return;
            patch(id, { status: "uploading", progress });
          },
        });
        if (generationOf.get(id) !== generation || handle.cancelled) return;
        patch(id, { status: "uploading", progress: 100, inputRef: path });
      }
      const latest = jobs.get(id);
      if (!latest || generationOf.get(id) !== generation) return;
      if (latest.kind === "upload") {
        patch(id, { status: "done", progress: 100 });
        return;
      }
      if (!latest.inputRef && !data) {
        patch(id, { status: "failed", error: "Upload the photo again before retrying." });
        return;
      }
      patch(id, { status: "rendering", progress: Math.max(latest.progress, 8) });
      const rendered = jobs.get(id);
      if (!rendered) return;
      const result = await ports.startRender(rendered);
      if (generationOf.get(id) !== generation || handle.cancelled) return;
      if (result.outputBytes) outputs.set(id, result.outputBytes);
      patch(id, {
        status: result.job.status,
        progress: result.job.progress,
        outputRef: result.job.outputRef,
        inputRef: result.job.inputRef || rendered.inputRef,
        error: result.job.error || "",
      });
    } catch (err) {
      if (generationOf.get(id) !== generation) return;
      patch(id, {
        status: "failed",
        error: err instanceof Error ? err.message : "The job failed.",
      });
    } finally {
      if (uploads.get(id) === handle) uploads.delete(id);
    }
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getState() {
      return {
        jobs: [...jobs.values()].map(cloneJob),
        projects: [...projects.values()].map((project) => ({ ...project })),
        activeProjectId,
      };
    },
    activeCount(ownerUid) {
      return activeJobCount([...jobs.values()], ownerUid);
    },
    ensureProject(ownerUid, title, listingId = "") {
      const now = ports.now();
      const project: StudioProjectRecord = {
        id: ports.newId(),
        ownerUid,
        title: title.trim() || "Scratch pad",
        listingId,
        createdAt: now,
        updatedAt: now,
        recordType: "studio-project",
      };
      projects.set(project.id, project);
      activeProjectId = project.id;
      void ports.persistProject({ ...project }).catch(() => undefined);
      emit();
      return { ...project };
    },
    setActiveProject(projectId) {
      if (!projectId || activeProjectId === projectId) return;
      activeProjectId = projectId;
      emit();
    },
    jobsFor(projectId, ownerUid) {
      return [...jobs.values()]
        .filter((job) => job.projectId === projectId && job.ownerUid === ownerUid)
        .map(cloneJob);
    },
    enqueue(draft) {
      const now = ports.now();
      const id = draft.id || ports.newId();
      const previous = jobs.get(id);
      const generation = (generationOf.get(id) || 0) + 1;
      generationOf.set(id, generation);
      for (const key of [...announced]) {
        if (key.startsWith(`${id}:`)) announced.delete(key);
      }
      const base = previous
        ? cloneJob(previous)
        : blankStudioJob({
          id,
          projectId: draft.projectId,
          ownerUid: draft.ownerUid,
          fileName: draft.fileName,
          kind: draft.kind,
          now,
          listingId: draft.listingId,
        });
      const storeOutput = Boolean(draft.storeAsOutput);
      const outputRef = storeOutput
        ? studioOutputStoragePath(draft.ownerUid, draft.projectId, id)
        : "";
      const job: StudioProjectJob = {
        ...base,
        id,
        projectId: draft.projectId,
        ownerUid: draft.ownerUid,
        status: "queued",
        progress: 0,
        fileName: draft.fileName || base.fileName,
        kind: storeOutput ? "upload" : draft.kind,
        label: draft.label || draft.kind,
        action: draft.action || "",
        prompt: draft.prompt || "",
        steps: draft.steps ? draft.steps.map((step) => ({ ...step })) : [],
        error: "",
        inputRef: base.inputRef || blankStudioJob({
          id,
          projectId: draft.projectId,
          ownerUid: draft.ownerUid,
          fileName: draft.fileName,
          kind: draft.kind,
          now,
        }).inputRef,
        outputRef,
        updatedAt: now,
        createdAt: previous?.createdAt || now,
        thumbnailDataUrl: (draft.thumbnailDataUrl || previous?.thumbnailDataUrl || "").slice(0, 12000),
        listingId: draft.listingId || previous?.listingId || "",
        roomType: draft.roomType || "",
        style: draft.style || "",
        recordType: "studio-project",
      };
      if (draft.data) sources.set(id, draft.data);
      if (storeOutput && draft.data) outputs.set(id, draft.data);
      jobs.set(id, job);
      activeProjectId = job.projectId;
      persist(job);
      emit();
      void run(id, generation);
      return cloneJob(job);
    },
    retry(jobId, ownerUid) {
      const job = jobs.get(jobId);
      if (!job || !canRetryJob(job, ownerUid)) return null;
      return this.enqueue({
        id: job.id,
        projectId: job.projectId,
        ownerUid,
        fileName: job.fileName,
        kind: job.kind,
        label: job.label,
        action: job.action,
        prompt: job.prompt,
        steps: job.steps,
        listingId: job.listingId,
        thumbnailDataUrl: job.thumbnailDataUrl,
        roomType: job.roomType,
        style: job.style,
        data: sources.get(jobId),
      });
    },
    outputBytes(jobId) {
      return outputs.get(jobId);
    },
    notePageDetached() {
      // Route changes must not cancel the UploadTask held in this module.
    },
    isUploadCancelled(jobId) {
      return Boolean(uploads.get(jobId)?.cancelled);
    },
    hydrate(nextJobs, nextProjects = [], projectId) {
      jobs.clear();
      for (const job of nextJobs) {
        const normalized = normalizeStudioJob(job, job.id);
        if (!normalized) continue;
        ephemeral.add(normalized.id);
        jobs.set(normalized.id, normalized);
      }
      for (const project of nextProjects) projects.set(project.id, { ...project });
      if (projectId) activeProjectId = projectId;
      emit();
    },
    applyRemote(remoteJobs) {
      for (const raw of remoteJobs) {
        const remote = normalizeStudioJob(raw, raw.id);
        if (!remote || ephemeral.has(remote.id)) continue;
        const local = jobs.get(remote.id);
        if (!local) {
          jobs.set(remote.id, remote);
          continue;
        }
        if (isActiveJobStatus(local.status) && (remote.status === "done" || remote.status === "failed")) {
          jobs.set(remote.id, { ...local, ...remote });
          announce(jobs.get(remote.id)!);
          continue;
        }
        if ((remote.status === "queued" || remote.status === "uploading") && local.progress > remote.progress && isActiveJobStatus(local.status)) {
          continue;
        }
        if (isActiveJobStatus(remote.status) && !isActiveJobStatus(local.status)) continue;
        jobs.set(remote.id, {
          ...local,
          ...remote,
          progress: Math.max(local.progress, remote.progress),
        });
      }
      emit();
    },
    applyRemoteProjects(remoteProjects) {
      for (const project of remoteProjects) {
        if (project.recordType && project.recordType !== "studio-project") continue;
        projects.set(project.id, { ...project });
      }
      emit();
    },
    takeFinished() {
      return finished.splice(0, finished.length).map(cloneJob);
    },
  };
}
