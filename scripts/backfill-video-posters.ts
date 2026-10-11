/**
 * One-off video poster backfill. Dry-run is the default.
 *
 *   pnpm backfill:video-posters
 *   pnpm backfill:video-posters -- --listing playtest-delivery-qa-listing --limit 3
 *   pnpm backfill:video-posters -- --write
 *
 * Dry-run lists every listing and gallery video that has no stored poster,
 * including the playtest delivery QA fixtures when they are in Firestore.
 * It prints the planned seek and the Storage path. It does not run ffmpeg,
 * upload, or write Firestore.
 *
 * --write needs ffmpeg on PATH and FIREBASE_SERVICE_ACCOUNT or
 * GOOGLE_APPLICATION_CREDENTIALS. It seeks 2s (or 10% when the clip is
 * shorter), uploads one JPEG, and sets poster and posterUrl on that media
 * item only. Items that already have a poster are skipped.
 *
 * /media/... sources are read from public/ on this machine. Firebase Storage
 * URLs are downloaded with the Admin SDK. Other hosts are listed and skipped.
 */
import admin from "firebase-admin";
import { spawn } from "node:child_process";

type FirebaseAdmin = typeof admin;
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  applyVideoPosterBackfill,
  formatVideoPosterDryRun,
  hasStoredVideoPoster,
  parseVideoPosterArgs,
  planVideoPosterBackfill,
  type VideoPosterPlanItem,
  type VideoPosterSourceDoc,
} from "../shared/videoPosterBackfill.ts";

const parsed = parseVideoPosterArgs(process.argv.slice(2));
const entry = process.argv[1] || "";
const invoked = /backfill-video-posters\.ts$/.test(entry);

if (invoked) {
  if (parsed.unknown.length > 0) {
    console.error(`Unknown argument: ${parsed.unknown.join(" ")}. Flags: --write, --limit <n>, --listing <id>.`);
    process.exit(2);
  }
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

async function main() {
  const admin = await loadAdmin();
  const docs = await loadDocs(admin, parsed.listingId);
  const plan = planVideoPosterBackfill({
    listings: docs.listings,
    galleries: docs.galleries,
    listingId: parsed.listingId,
    limit: parsed.limit,
  });
  if (!parsed.write) {
    process.stdout.write(formatVideoPosterDryRun(plan));
    return;
  }
  const projectId = (await credentialProjectId()) || admin.app().options.projectId || "(unknown project)";
  console.log(`WRITE MODE. Firebase project: ${projectId}`);
  console.log(`Extracting posters for ${plan.length} video${plan.length === 1 ? "" : "s"}.`);
  const bucket = admin.storage().bucket();
  const result = await applyVideoPosterBackfill(plan, {
    write: true,
    loadRow: (item) => loadFreshRow(admin, item),
    readRepo: readRepoFile,
    downloadStorage: (url) => downloadStorageFile(admin, url),
    probeDuration: probeDuration,
    extractFrame: extractFrame,
    uploadJpeg: async (storagePath, jpeg) => {
      const token = randomUUID();
      const file = bucket.file(storagePath);
      await file.save(jpeg, {
        resumable: false,
        metadata: {
          contentType: "image/jpeg",
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });
      const name = bucket.name;
      return `https://firebasestorage.googleapis.com/v0/b/${name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
    },
    savePoster: (item, posterUrl) => savePoster(admin, item, posterUrl),
  });
  console.log(`Wrote ${result.written}. Skipped ${result.skipped}. Planned ${result.planned}.`);
}

async function loadDocs(admin: FirebaseAdmin, listingId: string | null): Promise<{
  listings: VideoPosterSourceDoc[];
  galleries: VideoPosterSourceDoc[];
}> {
  const db = admin.firestore();
  if (listingId) {
    const listingSnap = await db.collection("listings").doc(listingId).get();
    const gallerySnap = await db.collection("galleries").doc(listingId).get();
    const linked = await db.collection("galleries").where("listingId", "==", listingId).get();
    const galleries = new Map<string, VideoPosterSourceDoc>();
    if (gallerySnap.exists) galleries.set(gallerySnap.id, { id: gallerySnap.id, data: gallerySnap.data() || {} });
    linked.docs.forEach((doc) => galleries.set(doc.id, { id: doc.id, data: doc.data() || {} }));
    return {
      listings: listingSnap.exists ? [{ id: listingSnap.id, data: listingSnap.data() || {} }] : [],
      galleries: [...galleries.values()],
    };
  }
  const [listings, galleries] = await Promise.all([
    db.collection("listings").get(),
    db.collection("galleries").get(),
  ]);
  return {
    listings: listings.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} })),
    galleries: galleries.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} })),
  };
}

async function loadFreshRow(admin: FirebaseAdmin, item: VideoPosterPlanItem): Promise<Record<string, unknown> | null> {
  const snap = await admin.firestore().collection(item.collection).doc(item.docId).get();
  if (!snap.exists) return null;
  const rows = snap.data()?.[item.field];
  if (!Array.isArray(rows)) return null;
  const row = rows[item.index];
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (typeof record.id === "string" && record.id !== item.itemId) return null;
  if (hasStoredVideoPoster(record)) return record;
  return record;
}

async function savePoster(admin: FirebaseAdmin, item: VideoPosterPlanItem, posterUrl: string) {
  const ref = admin.firestore().collection(item.collection).doc(item.docId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() || {};
  const rows = Array.isArray(data[item.field]) ? [...data[item.field]] : null;
  if (!rows || !rows[item.index] || typeof rows[item.index] !== "object") return;
  const current = rows[item.index] as Record<string, unknown>;
  if (typeof current.id === "string" && current.id !== item.itemId) return;
  if (hasStoredVideoPoster(current)) return;
  rows[item.index] = { ...current, poster: posterUrl, posterUrl };
  await ref.update({
    [item.field]: rows,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function readRepoFile(repoPath: string): Promise<Buffer | null> {
  const root = path.resolve(process.cwd(), "public");
  const resolved = path.resolve(process.cwd(), repoPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  try {
    const realRoot = await realpath(root);
    const real = await realpath(resolved);
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) return null;
    return await readFile(real);
  } catch {
    return null;
  }
}

function storageObject(url: string): { bucket: string; objectPath: string } | null {
  if (url.startsWith("gs://")) {
    const rest = url.slice("gs://".length);
    const slash = rest.indexOf("/");
    if (slash <= 0) return null;
    return { bucket: rest.slice(0, slash), objectPath: decodeURIComponent(rest.slice(slash + 1)) };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "firebasestorage.googleapis.com") {
    const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!match) return null;
    return { bucket: match[1], objectPath: decodeURIComponent(match[2]) };
  }
  if (host === "storage.googleapis.com") {
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { bucket: parts[0], objectPath: decodeURIComponent(parts.slice(1).join("/")) };
  }
  return null;
}

async function downloadStorageFile(admin: FirebaseAdmin, url: string): Promise<Buffer | null> {
  const object = storageObject(url);
  if (!object) return null;
  const [bytes] = await admin.storage().bucket(object.bucket).file(object.objectPath).download();
  return bytes;
}

async function withTempVideo(bytes: Buffer, fileName: string, run: (file: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "video-poster-"));
  const ext = path.extname(fileName).toLowerCase();
  const safeExt = [".mp4", ".m4v", ".mov", ".webm"].includes(ext) ? ext : ".mp4";
  const file = path.join(dir, `source${safeExt}`);
  try {
    await writeFile(file, bytes);
    await run(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runCommand(command: string, args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out`));
    }, 30_000);
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout: Buffer.concat(out).toString("utf8").trim() });
    });
  });
}

async function probeDuration(bytes: Buffer, fileName: string): Promise<number | null> {
  let duration: number | null = null;
  await withTempVideo(bytes, fileName, async (file) => {
    const result = await runCommand("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    const value = Number(result.stdout);
    duration = result.code === 0 && Number.isFinite(value) && value > 0 ? value : null;
  });
  return duration;
}

async function extractFrame(bytes: Buffer, fileName: string, seekSeconds: number): Promise<Buffer> {
  let jpeg: Buffer | null = null;
  await withTempVideo(bytes, fileName, async (file) => {
    const poster = path.join(path.dirname(file), "poster.jpg");
    const result = await runCommand("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-ss", seekSeconds.toFixed(3),
      "-i", file,
      "-frames:v", "1",
      "-q:v", "2",
      poster,
    ]);
    if (result.code !== 0) return;
    jpeg = await readFile(poster);
  });
  return jpeg ?? Buffer.alloc(0);
}

async function loadAdmin() {
  await import("dotenv/config");
  if (admin.apps.length) return admin;
  const bucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
      storageBucket: bucket,
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: bucket,
    });
  } else {
    throw new Error("Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS before running backfill:video-posters.");
  }
  return admin;
}

async function credentialProjectId(): Promise<string | null> {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) as { project_id?: unknown };
      return typeof parsed.project_id === "string" ? parsed.project_id : null;
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const parsed = JSON.parse(await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")) as { project_id?: unknown };
      return typeof parsed.project_id === "string" ? parsed.project_id : null;
    }
  } catch {
    return null;
  }
  return null;
}
