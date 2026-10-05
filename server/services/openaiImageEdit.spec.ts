import { describe, expect, it, vi } from "vitest";
import { AI_EDIT_TIMEOUT_NOTE } from "../../shared/iconicStudio";
import {
  DELIVERY_INSPECTION_NOTES,
  INSPECTION_FAILED_NOTE,
  INSPECTION_MISSING_KEY_NOTE,
  OPENAI_CHAT_COMPLETIONS_URL,
  OPENAI_IMAGE_EDIT_MODEL,
  OPENAI_IMAGE_EDITS_URL,
  OPENAI_INSPECTION_MODEL,
  OpenAiEditError,
  editListingPhotoWithOpenAI,
  editSizeForImage,
  imageSize,
  inspectFinishedListingJpeg,
  openAiErrorNote,
  parseDeliveryInspection,
  readOpenAiApiKey,
} from "./openaiImageEdit";

function png(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  bytes.writeUInt32BE(0x89504e47, 0);
  bytes.write("\r\n\x1a\n", 4, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

describe("OpenAI image edit request", () => {
  it("reads the API key from the environment and ignores blanks", () => {
    expect(readOpenAiApiKey({ OPENAI_API_KEY: "  sk-live  " })).toBe("sk-live");
    expect(readOpenAiApiKey({})).toBe("");
    expect(readOpenAiApiKey({ OPENAI_API_KEY: "   " })).toBe("");
  });

  it("picks a documented gpt-image-1 size from the photo", () => {
    expect(imageSize(png(1600, 1000))).toEqual({ width: 1600, height: 1000 });
    expect(editSizeForImage(png(1600, 1000))).toBe("1536x1024");
    expect(editSizeForImage(png(800, 1200))).toBe("1024x1536");
    expect(editSizeForImage(png(1000, 1000))).toBe("1024x1024");
    expect(editSizeForImage(Buffer.from("not-an-image"))).toBe("1536x1024");
  });

  it("posts the source image to the Images edit API and decodes the jpeg", async () => {
    const jpeg = Buffer.from("edited-jpeg-bytes-that-are-long-enough");
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(OPENAI_IMAGE_EDITS_URL);
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
      const form = init.body as FormData;
      expect(form.get("model")).toBe(OPENAI_IMAGE_EDIT_MODEL);
      expect(form.get("prompt")).toContain("fireplace");
      expect(form.get("size")).toBe("1536x1024");
      expect(form.get("quality")).toBe("medium");
      expect(form.get("output_format")).toBe("jpeg");
      expect(form.get("input_fidelity")).toBe("high");
      expect(form.get("response_format")).toBeNull();
      const image = form.get("image");
      expect(image).toBeInstanceOf(Blob);
      expect((image as File).name).toBe("source.png");
      return new Response(JSON.stringify({ data: [{ b64_json: jpeg.toString("base64") }] }), { status: 200 });
    });

    const result = await editListingPhotoWithOpenAI({
      apiKey: "sk-test",
      prompt: "Add a fire in the fireplace",
      bytes: png(1800, 1200),
      contentType: "image/png",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.contentType).toBe("image/jpeg");
    expect(result.bytes.equals(jpeg)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("sends a reference image as an extra image[] part", async () => {
    const jpeg = Buffer.from("edited-jpeg-bytes-that-are-long-enough");
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      expect(form.get("image")).toBeNull();
      const images = form.getAll("image[]");
      expect(images).toHaveLength(2);
      expect((images[0] as File).name).toBe("source.png");
      expect((images[1] as File).name).toBe("grass-reference.jpg");
      return new Response(JSON.stringify({ data: [{ b64_json: jpeg.toString("base64") }] }), { status: 200 });
    });
    await editListingPhotoWithOpenAI({
      apiKey: "sk-test",
      prompt: "Replace the lawn with the reference grass",
      bytes: png(1800, 1200),
      contentType: "image/png",
      references: [{ bytes: png(80, 40), contentType: "image/jpeg", filename: "grass-reference.jpg" }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("turns auth, moderation, and timeout failures into readable notes", async () => {
    expect(openAiErrorNote(401, JSON.stringify({ error: { message: "Incorrect API key" } })))
      .toMatch(/OPENAI_API_KEY/);
    expect(openAiErrorNote(400, JSON.stringify({ error: { code: "moderation_blocked", message: "blocked" } })))
      .toMatch(/blocked this edit/);
    expect(openAiErrorNote(429, "{}")).toMatch(/rate limit/);

    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
    });
    await expect(editListingPhotoWithOpenAI({
      apiKey: "sk-test",
      prompt: "Remove the cars",
      bytes: png(400, 300),
      contentType: "image/png",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toMatchObject({ name: "OpenAiEditError", message: AI_EDIT_TIMEOUT_NOTE });
  });

  it("refuses to call OpenAI without a key or an image", async () => {
    await expect(editListingPhotoWithOpenAI({
      apiKey: " ",
      prompt: "Stage the room",
      bytes: png(400, 300),
      contentType: "image/jpeg",
      fetchImpl: vi.fn() as unknown as typeof fetch,
    })).rejects.toBeInstanceOf(OpenAiEditError);
  });
});

describe("finished JPEG delivery inspection", () => {
  it("keeps a pass or flag result to status and notes", () => {
    expect(parseDeliveryInspection({
      status: "pass",
      notes: ["Double exposure."],
      approved: true,
    })).toEqual({ status: "pass", notes: [] });

    expect(parseDeliveryInspection(JSON.stringify({
      status: "flag",
      notes: [
        "Double exposure.",
        "not a delivery issue",
        "double exposure.",
        "Inconsistent color.",
      ],
      rejected: true,
    }))).toEqual({
      status: "flag",
      notes: ["Double exposure.", "Inconsistent color."],
    });

    expect(parseDeliveryInspection({ status: "approved", notes: [] })).toBeNull();
    expect(parseDeliveryInspection("not json")).toBeNull();
    expect(parseDeliveryInspection({ status: "flag", notes: [] })).toBeNull();
    expect(DELIVERY_INSPECTION_NOTES).toEqual([
      "Photographer visible in a mirror or shadow.",
      "Photographer reflected in a doorway or glass.",
      "Inconsistent color.",
      "Double exposure.",
      "Frame is too poor to deliver.",
    ]);
  });

  it("reads the same shape from a chat completion body", () => {
    const parsed = parseDeliveryInspection(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            status: "flag",
            notes: ["Photographer reflected in a doorway or glass."],
          }),
        },
      }],
    }));
    expect(parsed).toEqual({
      status: "flag",
      notes: ["Photographer reflected in a doorway or glass."],
    });
    expect(Object.keys(parsed || {}).sort()).toEqual(["notes", "status"]);
  });

  it("flags a finished jpeg and does not call the image edit endpoint", async () => {
    const jpeg = Buffer.from("finished-jpeg-bytes");
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(OPENAI_CHAT_COMPLETIONS_URL);
      expect(url).not.toBe(OPENAI_IMAGE_EDITS_URL);
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe(OPENAI_INSPECTION_MODEL);
      const instruction = String(body.messages[0].content[0].text);
      expect(instruction).toMatch(/mirror or shadow/i);
      expect(instruction).toMatch(/doorway or glass/i);
      expect(instruction).toMatch(/inconsistent color/i);
      expect(instruction).toMatch(/double exposure/i);
      expect(instruction).toMatch(/too poor to deliver/i);
      expect(instruction).toMatch(/do not approve or reject/i);
      expect(instruction).not.toMatch(/autoenhance/i);
      expect(body.messages[0].content[1].image_url.url).toBe(
        `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      );
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              status: "flag",
              notes: ["Frame is too poor to deliver.", "Photographer visible in a mirror or shadow."],
            }),
          },
        }],
      }), { status: 200 });
    });

    const result = await inspectFinishedListingJpeg({
      apiKey: "sk-test",
      bytes: jpeg,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      status: "flag",
      notes: [
        "Frame is too poor to deliver.",
        "Photographer visible in a mirror or shadow.",
      ],
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("leaves a short review note when the key is missing or the call fails", async () => {
    const skipped = vi.fn();
    await expect(inspectFinishedListingJpeg({
      apiKey: " ",
      bytes: Buffer.from("finished-jpeg"),
      fetchImpl: skipped as unknown as typeof fetch,
    })).resolves.toEqual({ status: "flag", notes: [INSPECTION_MISSING_KEY_NOTE] });
    expect(skipped).not.toHaveBeenCalled();

    const failed = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(inspectFinishedListingJpeg({
      apiKey: "sk-test",
      bytes: Buffer.from("finished-jpeg"),
      fetchImpl: failed as unknown as typeof fetch,
    })).resolves.toEqual({ status: "flag", notes: [INSPECTION_FAILED_NOTE] });

    const timeout = vi.fn(async () => {
      throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
    });
    await expect(inspectFinishedListingJpeg({
      apiKey: "sk-test",
      bytes: Buffer.from("finished-jpeg"),
      fetchImpl: timeout as unknown as typeof fetch,
    })).resolves.toEqual({ status: "flag", notes: [INSPECTION_FAILED_NOTE] });
  });
});
