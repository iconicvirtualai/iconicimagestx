/**
 * Firebase-backed studio job manager.
 * The singleton outlives the editor page, so resumable uploads and render
 * requests keep running across route changes.
 */

import {
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { ref, uploadBytesResumable } from "firebase/storage";
import {
  normalizeStudioJob,
  type StudioProjectJob,
  type StudioProjectRecord,
} from "@shared/studioProjects";
import { scratchDownloadName } from "@shared/studioScratch";
import { db, storage } from "@/lib/firebase";
import { createStudioJobManager, type StudioJobManager } from "@/lib/studioJobManager";

let manager: StudioJobManager | null = null;
let tokenGetter: () => Promise<string> = async () => {
  throw new Error("Sign in again before rendering.");
};

export function setStudioJobTokenGetter(getter: () => Promise<string>) {
  tokenGetter = getter;
}

async function authHeader() {
  const token = await tokenGetter();
  return { Authorization: `Bearer ${token}` };
}

export function getStudioJobManager(): StudioJobManager {
  if (manager) return manager;
  manager = createStudioJobManager({
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    persistJob: async (job) => {
      await setDoc(doc(db, "projects", job.projectId, "jobs", job.id), job, { merge: true });
    },
    persistProject: async (project) => {
      await setDoc(doc(db, "projects", project.id), project, { merge: true });
    },
    startUpload: ({ path, data, signal, onProgress }) => new Promise((resolve, reject) => {
      const task = uploadBytesResumable(ref(storage, path), data, { contentType: "image/jpeg" });
      task.on("state_changed", (snap) => {
        if (signal.cancelled) {
          task.cancel();
          reject(new Error("Upload cancelled."));
          return;
        }
        const progress = snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
        onProgress(progress);
      }, reject, () => resolve());
    }),
    startRender: async (job) => {
      const headers = await authHeader();
      const res = await fetch(`/api/studio/projects/${job.projectId}/jobs/${job.id}/render`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: job.kind,
          action: job.action,
          prompt: job.prompt,
          steps: job.steps,
          roomType: job.roomType,
          style: job.style,
          label: job.label,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.job) {
        throw new Error(data.error || `Render failed (${res.status}).`);
      }
      const next = normalizeStudioJob(data.job as StudioProjectJob, job.id) || job;
      let outputBytes: Uint8Array | undefined;
      if (next.status === "done" && next.outputRef) {
        const file = await fetch(`/api/studio/projects/${job.projectId}/jobs/${job.id}/file`, { headers });
        if (file.ok) outputBytes = new Uint8Array(await file.arrayBuffer());
      }
      return { job: next, outputBytes };
    },
  });
  return manager;
}

export function watchStudioJobs(uid: string | null): () => void {
  if (!uid) return () => undefined;
  const jobsQuery = query(collectionGroup(db, "jobs"), where("ownerUid", "==", uid));
  const projectsQuery = query(collection(db, "projects"), where("ownerUid", "==", uid));
  const stopJobs = onSnapshot(jobsQuery, (snap) => {
    const jobs = snap.docs
      .map((row) => normalizeStudioJob({ ...(row.data() as Partial<StudioProjectJob>), id: row.id }, row.id))
      .filter((job): job is StudioProjectJob => Boolean(job));
    getStudioJobManager().applyRemote(jobs);
  }, (err) => {
    console.error("[Studio projects] job listener", err);
  });
  const stopProjects = onSnapshot(projectsQuery, (snap) => {
    const projects = snap.docs
      .map((row) => ({ id: row.id, ...(row.data() as Omit<StudioProjectRecord, "id">) }))
      .filter((project) => project.recordType === "studio-project" && project.ownerUid === uid);
    getStudioJobManager().applyRemoteProjects(projects);
  }, (err) => {
    console.error("[Studio projects] project listener", err);
  });
  return () => {
    stopJobs();
    stopProjects();
  };
}

export async function downloadStudioJobFile(job: StudioProjectJob): Promise<void> {
  const headers = await authHeader();
  const res = await fetch(`/api/studio/projects/${job.projectId}/jobs/${job.id}/file`, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "That download is not available.");
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const url = URL.createObjectURL(new Blob([copy], { type: "image/jpeg" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = scratchDownloadName(job.fileName);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
