/**
 * Hand a queued render to Cloud Tasks when the owner has provisioned it.
 * Without VIDEO_TASKS_QUEUE the job stays queued and the UI says the
 * renderer is not connected. This file does not deploy anything.
 */

import admin from "firebase-admin";

export interface DispatchResult {
  connected: boolean;
  message: string;
}

export function rendererConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.VIDEO_WORKER_URL && env.VIDEO_TASKS_QUEUE && env.GOOGLE_CLOUD_PROJECT && env.VIDEO_TASKS_SERVICE_ACCOUNT);
}

function storageBucket(env: NodeJS.ProcessEnv): string {
  return env.FIREBASE_STORAGE_BUCKET || env.VITE_FIREBASE_STORAGE_BUCKET || "";
}

function isStoragePath(value: string): boolean {
  return value.startsWith("studio-video/") || value.startsWith("galleries/");
}

async function signRead(path: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  const bucketName = storageBucket(env);
  if (!admin.apps.length || !bucketName || !isStoragePath(path)) return null;
  const [url] = await admin.storage().bucket(bucketName).file(path).getSignedUrl({
    action: "read",
    expires: Date.now() + 3 * 60 * 60 * 1000,
    version: "v4",
  });
  return url;
}

async function signWrite(path: string, contentType: string, env: NodeJS.ProcessEnv): Promise<{ uploadUrl: string; readUrl: string } | null> {
  const bucketName = storageBucket(env);
  if (!admin.apps.length || !bucketName) return null;
  const file = admin.storage().bucket(bucketName).file(path);
  const [uploadUrl] = await file.getSignedUrl({
    action: "write",
    expires: Date.now() + 3 * 60 * 60 * 1000,
    contentType,
    version: "v4",
  });
  const [readUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    version: "v4",
  });
  return { uploadUrl, readUrl };
}

async function signClipValue(value: unknown, env: NodeJS.ProcessEnv): Promise<unknown> {
  if (typeof value === "string" && isStoragePath(value)) return (await signRead(value, env)) || value;
  if (Array.isArray(value)) return Promise.all(value.map((entry) => signClipValue(entry, env)));
  return value;
}

/** Signed URLs live on the task body only. The saved job keeps storage paths. */
export async function taskPayload(job: { id: string; kind: string; request: unknown }, env: NodeJS.ProcessEnv = process.env): Promise<Record<string, unknown>> {
  const request = job.request && typeof job.request === "object" ? { ...(job.request as Record<string, unknown>) } : {};
  if (request.slots && typeof request.slots === "object") {
    const slots: Record<string, unknown> = {};
    for (const [slotId, value] of Object.entries(request.slots as Record<string, unknown>)) {
      slots[slotId] = await signClipValue(value, env);
    }
    request.slots = slots;
  }
  if (request.sources && typeof request.sources === "object") {
    const sources: Record<string, unknown> = {};
    for (const [sourceId, value] of Object.entries(request.sources as Record<string, unknown>)) {
      sources[sourceId] = await signClipValue(value, env);
    }
    request.sources = sources;
  }
  const outputPath = `studio-video/renders/${job.id}.mp4`;
  const posterPath = `studio-video/renders/${job.id}.jpg`;
  let output: Record<string, string> = { path: outputPath, posterPath };
  try {
    const video = await signWrite(outputPath, "video/mp4", env);
    const poster = await signWrite(posterPath, "image/jpeg", env);
    if (video) output = { ...output, uploadUrl: video.uploadUrl, readUrl: video.readUrl };
    if (poster) output = { ...output, posterUploadUrl: poster.uploadUrl, posterReadUrl: poster.readUrl };
  } catch (error) {
    console.error("[Studio video] Could not sign the render upload.");
    void error;
  }
  return { jobId: job.id, kind: job.kind, request, output };
}

export async function dispatchVideoJob(job: { id: string; kind: string; request: unknown }, env: NodeJS.ProcessEnv = process.env): Promise<DispatchResult> {
  if (!rendererConfigured(env)) {
    return { connected: false, message: "Renderer not connected yet" };
  }
  const project = env.GOOGLE_CLOUD_PROJECT as string;
  const location = env.VIDEO_TASKS_LOCATION || "us-central1";
  const queue = env.VIDEO_TASKS_QUEUE as string;
  const worker = (env.VIDEO_WORKER_URL as string).replace(/\/$/, "");
  const path = job.kind === "timeline" ? "/render-timeline" : job.kind === "analyze" ? "/analyze" : "/render-template";
  const audience = env.VIDEO_WORKER_AUDIENCE || worker;
  try {
    const payload = await taskPayload(job, env);
    const specifier = "google-auth-library";
    const loaded = (await import(specifier)) as {
      GoogleAuth: new (options: { scopes: string[] }) => {
        getClient(): Promise<{ request(options: { url: string; method: string; data: unknown }): Promise<unknown> }>;
      };
    };
    const auth = new loaded.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-tasks"] });
    const client = await auth.getClient();
    await client.request({
      url: `https://cloudtasks.googleapis.com/v2/projects/${project}/locations/${location}/queues/${queue}/tasks`,
      method: "POST",
      data: {
        task: {
          dispatchDeadline: "900s",
          httpRequest: {
            httpMethod: "POST",
            url: `${worker}${path}`,
            headers: { "Content-Type": "application/json" },
            body: Buffer.from(JSON.stringify(payload)).toString("base64"),
            oidcToken: {
              serviceAccountEmail: env.VIDEO_TASKS_SERVICE_ACCOUNT,
              audience,
            },
          },
        },
      },
    });
    return { connected: true, message: "Render queued." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cloud Tasks dispatch failed.";
    console.error("[Studio video] Dispatch failed.");
    return { connected: false, message: `Renderer not connected yet (${message})` };
  }
}
