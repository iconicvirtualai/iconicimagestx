/**
 * Short-lived B2 reads. Credentials stay in the process environment.
 * This module does not log them and does not write Firestore.
 */

import { createHash, createHmac } from "node:crypto";
import {
  B2_MEDIA_ARRAY_KEYS,
  contentDispositionAttachment,
  encodeRfc3986,
  publicB2ObjectUrl,
  resolveB2ObjectKey,
  savedDownloadName,
} from "../../shared/b2Media";
import { deliveryFileName, orderedGalleryMedia, type SequenceShot } from "../../shared/gallerySequence";

export const B2_PRESIGN_SECONDS = 900;
const DEFAULT_BUCKET = "iconic-media";
const DEFAULT_ENDPOINT = "https://s3.us-west-004.backblazeb2.com";
const MAX_OBJECT_BYTES = 25_000_000;

export interface B2Settings {
  keyId: string;
  appKey: string;
  bucket: string;
  endpoint: string;
  region: string;
  publicBaseUrl: string;
}

export interface B2UrlOptions {
  now?: Date;
  env?: NodeJS.ProcessEnv;
}

interface PresignInput {
  host: string;
  canonicalUri: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  amzDate: string;
  expires: number;
  extraQuery?: Array<[string, string]>;
}

export function readB2Settings(env: NodeJS.ProcessEnv = process.env): B2Settings | null {
  const keyId = (env.B2_KEY_ID || "").trim();
  const appKey = (env.B2_APP_KEY || "").trim();
  const bucket = (env.B2_BUCKET || "").trim() || DEFAULT_BUCKET;
  const endpoint = ((env.B2_ENDPOINT || "").trim() || DEFAULT_ENDPOINT).replace(/\/+$/, "");
  const publicBaseUrl = (env.B2_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  let endpointHost = "";
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return null;
    endpointHost = url.hostname;
  } catch {
    return null;
  }
  if (publicBaseUrl) {
    try {
      const url = new URL(publicBaseUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    } catch {
      return null;
    }
  } else if (!keyId || !appKey) {
    return null;
  }
  return {
    keyId,
    appKey,
    bucket,
    endpoint,
    region: regionFromHost(endpointHost),
    publicBaseUrl,
  };
}

export function b2ReadableHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  const settings = readB2Settings(env);
  if (!settings) return [];
  const hosts = new Set<string>();
  try {
    hosts.add(new URL(settings.endpoint).hostname.toLowerCase());
  } catch {
    // Endpoint was already checked in readB2Settings.
  }
  if (dnsBucket(settings.bucket)) {
    try {
      hosts.add(`${settings.bucket}.${new URL(settings.endpoint).hostname}`.toLowerCase());
    } catch {
      // Same endpoint check.
    }
  }
  if (settings.publicBaseUrl) {
    try {
      hosts.add(new URL(settings.publicBaseUrl).hostname.toLowerCase());
    } catch {
      // Public base was already checked.
    }
  }
  return [...hosts];
}

/** SigV4 query-string GET. The AWS example in the spec locks this shape. */
export function presignS3GetUrl(input: PresignInput): string {
  const params: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${input.accessKeyId}/${input.amzDate.slice(0, 8)}/${input.region}/s3/aws4_request`],
    ["X-Amz-Date", input.amzDate],
    ["X-Amz-Expires", String(input.expires)],
    ["X-Amz-SignedHeaders", "host"],
    ...(input.extraQuery || []),
  ];
  params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const canonicalQuery = params.map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`).join("&");
  const canonicalRequest = [
    "GET",
    input.canonicalUri,
    canonicalQuery,
    `host:${input.host}`,
    "",
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const scope = `${input.amzDate.slice(0, 8)}/${input.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    input.amzDate,
    scope,
    createHash("sha256").update(canonicalRequest, "utf8").digest("hex"),
  ].join("\n");
  const dateKey = createHmac("sha256", `AWS4${input.secretAccessKey}`).update(input.amzDate.slice(0, 8), "utf8").digest();
  const regionKey = createHmac("sha256", dateKey).update(input.region, "utf8").digest();
  const serviceKey = createHmac("sha256", regionKey).update("s3", "utf8").digest();
  const signingKey = createHmac("sha256", serviceKey).update("aws4_request", "utf8").digest();
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  return `https://${input.host}${input.canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export function b2ObjectUrl(
  objectKey: string,
  options: B2UrlOptions & { disposition?: string } = {},
): string {
  const settings = readB2Settings(options.env);
  if (!settings || !objectKey) return "";
  if (settings.publicBaseUrl) return publicB2ObjectUrl(settings.publicBaseUrl, objectKey);
  if (!settings.keyId || !settings.appKey) return "";
  const now = options.now ?? new Date();
  const endpointHost = new URL(settings.endpoint).hostname;
  const virtual = dnsBucket(settings.bucket);
  const host = virtual ? `${settings.bucket}.${endpointHost}` : endpointHost;
  const encodedKey = objectKey.split("/").map(encodeRfc3986).join("/");
  const canonicalUri = virtual ? `/${encodedKey}` : `/${encodeRfc3986(settings.bucket)}/${encodedKey}`;
  const extraQuery = options.disposition ? [["response-content-disposition", options.disposition] as [string, string]] : [];
  return presignS3GetUrl({
    host,
    canonicalUri,
    region: settings.region,
    accessKeyId: settings.keyId,
    secretAccessKey: settings.appKey,
    amzDate: amzDate(now),
    expires: B2_PRESIGN_SECONDS,
    extraQuery,
  });
}

export function applyB2MediaUrls<T extends Record<string, unknown>>(record: T, options: B2UrlOptions = {}): T {
  const settings = readB2Settings(options.env);
  if (!settings) return record;
  const now = options.now ?? new Date();
  let changed = false;
  const next: Record<string, unknown> = { ...record };
  for (const key of B2_MEDIA_ARRAY_KEYS) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    let arrayChanged = false;
    const items = value.map((item) => {
      const stamped = stampMediaItem(item, record, settings, now);
      if (stamped !== item) arrayChanged = true;
      return stamped;
    });
    if (arrayChanged) {
      next[key] = items;
      changed = true;
    }
  }
  return (changed ? next : record) as T;
}

/** Saved order, then the delivery filename. B2 rows carry their object key. */
export function orderedDownloadPlan(
  items: unknown[],
  parent?: Record<string, unknown> | null,
): Array<{ name: string; key: string; item: Record<string, unknown> }> {
  const rows = items.filter((item): item is SequenceShot & Record<string, unknown> => Boolean(item) && typeof item === "object");
  return orderedGalleryMedia(rows).map((item, index) => ({
    name: deliveryFileName(item, index),
    key: resolveB2ObjectKey(item, parent),
    item,
  }));
}

export async function readB2Object(objectKey: string, env: NodeJS.ProcessEnv = process.env): Promise<Buffer | null> {
  const url = b2ObjectUrl(objectKey, { env });
  if (!url) return null;
  let response: Response;
  try {
    response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20_000) });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const advertised = Number(response.headers.get("content-length") || 0);
  if (advertised > MAX_OBJECT_BYTES) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_OBJECT_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } catch {
    return null;
  }
  return chunks.length ? Buffer.concat(chunks) : null;
}

function stampMediaItem(
  item: unknown,
  parent: Record<string, unknown>,
  settings: B2Settings,
  now: Date,
): unknown {
  if (!item || typeof item !== "object" || Array.isArray(item)) return item;
  const row = item as Record<string, unknown>;
  const objectKey = resolveB2ObjectKey(row, parent);
  if (!objectKey) return item;
  const view = objectUrl(settings, objectKey, now);
  if (!view) return item;
  const filename = savedDownloadName(row, objectKey);
  const download = settings.publicBaseUrl
    ? view
    : objectUrl(settings, objectKey, now, contentDispositionAttachment(filename));
  return {
    ...row,
    url: view,
    shareUrl: view,
    downloadUrl: download || view,
  };
}

function objectUrl(settings: B2Settings, objectKey: string, now: Date, disposition = ""): string {
  return b2ObjectUrl(objectKey, {
    now,
    disposition,
    env: settingsToEnv(settings),
  });
}

function settingsToEnv(settings: B2Settings): NodeJS.ProcessEnv {
  return {
    B2_KEY_ID: settings.keyId,
    B2_APP_KEY: settings.appKey,
    B2_BUCKET: settings.bucket,
    B2_ENDPOINT: settings.endpoint,
    B2_PUBLIC_BASE_URL: settings.publicBaseUrl,
  };
}

function dnsBucket(bucket: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket);
}

function regionFromHost(host: string): string {
  const match = host.match(/^s3\.([a-z0-9-]+)\.backblazeb2\.com$/i);
  return match?.[1] || "us-west-004";
}

function amzDate(now: Date): string {
  const iso = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return iso;
}
