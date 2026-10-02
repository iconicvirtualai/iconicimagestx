import { describe, expect, it, vi } from "vitest";
import { AI_EDIT_TIMEOUT_NOTE } from "../../shared/iconicStudio";
import {
  OPENAI_IMAGE_EDIT_MODEL,
  OPENAI_IMAGE_EDITS_URL,
  OpenAiEditError,
  editListingPhotoWithOpenAI,
  editSizeForImage,
  imageSize,
  openAiErrorNote,
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
