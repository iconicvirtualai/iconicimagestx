/**
 * Iconic Studio image edits via OpenAI's Images API.
 * POST https://api.openai.com/v1/images/edits with gpt-image-1.
 * A finished order JPEG is inspected with the same API key via chat completions.
 * The API key stays on the server. This does not train a model or use Assistants.
 */

import { AI_EDIT_TIMEOUT_NOTE, listingPhotoEditSize, type ListingEditSize } from "../../shared/iconicStudio";

export const OPENAI_IMAGE_EDITS_URL = "https://api.openai.com/v1/images/edits";
export const OPENAI_IMAGE_EDIT_MODEL = "gpt-image-1";
export const OPENAI_IMAGE_EDIT_TIMEOUT_MS = 45_000;
export const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
export const OPENAI_INSPECTION_MODEL = "gpt-4o-mini";
export const OPENAI_INSPECTION_TIMEOUT_MS = 20_000;

/** Issues a finished listing JPEG may be flagged for. Nothing else. */
export const DELIVERY_INSPECTION_NOTES = [
  "Photographer visible in a mirror or shadow.",
  "Photographer reflected in a doorway or glass.",
  "Inconsistent color.",
  "Double exposure.",
  "Frame is too poor to deliver.",
] as const;

export const INSPECTION_MISSING_KEY_NOTE = "Inspection skipped. Review this photo.";
export const INSPECTION_FAILED_NOTE = "Inspection did not finish. Review this photo.";

export interface DeliveryInspection {
  status: "pass" | "flag";
  notes: string[];
}

export function deliveryInspection(status: DeliveryInspection["status"], notes: readonly string[]): DeliveryInspection {
  return { status, notes: [...notes] };
}

const MAX_SOURCE_BYTES = 20_000_000;

export class OpenAiEditError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "OpenAiEditError";
    this.status = status;
  }
}

export function readOpenAiApiKey(env: { OPENAI_API_KEY?: string } | NodeJS.ProcessEnv): string {
  return typeof env.OPENAI_API_KEY === "string" ? env.OPENAI_API_KEY.trim() : "";
}

export function imageSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes.toString("ascii", 1, 4) === "PNG") {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length > 30 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    const format = bytes.toString("ascii", 12, 16);
    if (format === "VP8X" && bytes.length >= 30) {
      return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    }
    if (format === "VP8 " && bytes.length >= 30) {
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    }
    if (format === "VP8L" && bytes.length >= 25) {
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const size = bytes.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      if (size < 2) break;
      offset += 2 + size;
    }
  }
  return null;
}

export function editSizeForImage(bytes: Buffer): ListingEditSize {
  const size = imageSize(bytes);
  return listingPhotoEditSize(size?.width ?? 0, size?.height ?? 0);
}

function imagePart(bytes: Buffer, contentType: string, filename?: string): { blob: Blob; filename: string } {
  const type = contentType.includes("png")
    ? "image/png"
    : contentType.includes("webp")
      ? "image/webp"
      : "image/jpeg";
  const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return {
    blob: new Blob([new Uint8Array(bytes)], { type }),
    filename: filename || `source.${extension}`,
  };
}

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: string }).name;
  return name === "TimeoutError" || name === "AbortError";
}

export function openAiErrorNote(status: number, body: string): string {
  let message = "";
  let code = "";
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; code?: string } };
    message = String(parsed.error?.message || "").trim();
    code = String(parsed.error?.code || "").trim();
  } catch {
    message = "";
  }
  if (code === "moderation_blocked" || /moderation/i.test(message)) {
    return "OpenAI blocked this edit. Revise the prompt and queue it again.";
  }
  if (status === 401) return "OpenAI rejected the API key. Check OPENAI_API_KEY on the server.";
  if (status === 429) return "OpenAI rate limit reached. Wait a moment and queue the edit again.";
  const detail = message.replace(/\s+/g, " ").slice(0, 180);
  if (detail) return `OpenAI could not edit this photo (${status}). ${detail}`;
  return `OpenAI could not edit this photo (${status}). Queue the edit again.`;
}

export async function editListingPhotoWithOpenAI(input: {
  apiKey: string;
  prompt: string;
  bytes: Buffer;
  contentType: string;
  /** Extra inputs, such as the scratch-pad grass reference. One image stays a single `image` part. */
  references?: Array<{ bytes: Buffer; contentType: string; filename?: string }>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<{ bytes: Buffer; contentType: "image/jpeg" }> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new OpenAiEditError("OPENAI_API_KEY is not configured on the server, so this photo was not edited.");
  if (!input.bytes.length) throw new OpenAiEditError("The source photo was empty.");
  if (input.bytes.length > MAX_SOURCE_BYTES) {
    throw new OpenAiEditError("That photo is over 20 MB. Export a smaller JPEG and queue the edit again.");
  }
  const prompt = input.prompt.trim();
  if (prompt.length < 3) throw new OpenAiEditError("Describe the AI edit.");
  const references = input.references || [];
  for (const reference of references) {
    if (reference.bytes.length > MAX_SOURCE_BYTES) {
      throw new OpenAiEditError("A reference image is over 20 MB.");
    }
  }

  const file = imagePart(input.bytes, input.contentType);
  const form = new FormData();
  form.append("model", OPENAI_IMAGE_EDIT_MODEL);
  form.append("prompt", prompt);
  if (!references.length) {
    form.append("image", file.blob, file.filename);
  } else {
    form.append("image[]", file.blob, file.filename);
    for (const reference of references) {
      const extra = imagePart(reference.bytes, reference.contentType, reference.filename);
      form.append("image[]", extra.blob, extra.filename);
    }
  }
  form.append("n", "1");
  form.append("size", editSizeForImage(input.bytes));
  form.append("quality", "medium");
  form.append("output_format", "jpeg");
  form.append("output_compression", "85");
  form.append("input_fidelity", "high");

  const fetchImpl = input.fetchImpl || fetch;
  const timeoutMs = input.timeoutMs ?? OPENAI_IMAGE_EDIT_TIMEOUT_MS;
  let response: Response;
  try {
    response = await fetchImpl(OPENAI_IMAGE_EDITS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (isTimeoutError(err)) throw new OpenAiEditError(AI_EDIT_TIMEOUT_NOTE);
    throw new OpenAiEditError("Iconic Studio could not reach OpenAI. Queue the edit again.");
  }

  const body = await response.text();
  if (!response.ok) throw new OpenAiEditError(openAiErrorNote(response.status, body), response.status);

  let parsed: { data?: Array<{ b64_json?: string }> };
  try {
    parsed = JSON.parse(body) as { data?: Array<{ b64_json?: string }> };
  } catch {
    throw new OpenAiEditError("OpenAI returned an unreadable image edit.");
  }
  const encoded = parsed.data?.[0]?.b64_json || "";
  if (!encoded) throw new OpenAiEditError("OpenAI returned no edited image.");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length < 32) throw new OpenAiEditError("OpenAI returned an empty edited image.");
  return { bytes, contentType: "image/jpeg" };
}

function canonicalInspectionNotes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const found: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const text = item.trim().toLowerCase();
    const match = DELIVERY_INSPECTION_NOTES.find((note) => note.toLowerCase() === text);
    if (match && !found.includes(match)) found.push(match);
  }
  return found;
}

function inspectionObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Read a pass/flag result from model JSON or a chat completion body.
 * Pass drops notes. Flag keeps only the five delivery issues.
 * Returns null when the payload is not that shape.
 */
export function parseDeliveryInspection(body: unknown): DeliveryInspection | null {
  let value = body;
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  const row = inspectionObject(value);
  if (!row) return null;

  if (Array.isArray(row.choices)) {
    const message = inspectionObject(inspectionObject(row.choices[0])?.message);
    const content = message?.content;
    if (typeof content !== "string") return null;
    return parseDeliveryInspection(content);
  }

  if (row.status !== "pass" && row.status !== "flag") return null;
  if (row.status === "pass") return deliveryInspection("pass", []);
  const notes = canonicalInspectionNotes(row.notes);
  if (!notes.length) return null;
  return deliveryInspection("flag", notes);
}

const INSPECTION_PROMPT = [
  "Inspect this finished real-estate listing JPEG.",
  "Look only for: a photographer in a mirror or shadow; a doorway or glass reflection of the photographer; inconsistent color; a double exposure; a frame too poor to deliver.",
  "Do not comment on staging, sky, furniture, or other edits.",
  "Do not approve or reject the photo.",
  "Reply with JSON only: {\"status\":\"pass\" or \"flag\",\"notes\":string[]}.",
  "Use status flag only when one of those issues is visible. Otherwise pass.",
  "When status is pass, notes must be an empty array.",
  "When status is flag, copy notes exactly from this list:",
  ...DELIVERY_INSPECTION_NOTES,
].join(" ");

/**
 * Second OpenAI look at a finished order JPEG.
 * A missing key or a failed call stays a review note. It does not throw.
 */
export async function inspectFinishedListingJpeg(input: {
  apiKey: string;
  bytes: Buffer;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<DeliveryInspection> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) return deliveryInspection("flag", [INSPECTION_MISSING_KEY_NOTE]);
  if (!input.bytes.length) return deliveryInspection("flag", [INSPECTION_FAILED_NOTE]);

  const fetchImpl = input.fetchImpl || fetch;
  const timeoutMs = input.timeoutMs ?? OPENAI_INSPECTION_TIMEOUT_MS;
  let response: Response;
  try {
    response = await fetchImpl(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_INSPECTION_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: INSPECTION_PROMPT },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${input.bytes.toString("base64")}` },
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    console.error("[Studio inspection]", err instanceof Error ? err.message : err);
    return deliveryInspection("flag", [INSPECTION_FAILED_NOTE]);
  }

  const body = await response.text();
  if (!response.ok) {
    console.error("[Studio inspection] OpenAI did not inspect the finished photo.", response.status);
    return deliveryInspection("flag", [INSPECTION_FAILED_NOTE]);
  }
  return parseDeliveryInspection(body) || deliveryInspection("flag", [INSPECTION_FAILED_NOTE]);
}
