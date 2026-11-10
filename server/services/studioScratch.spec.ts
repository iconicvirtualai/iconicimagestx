import fs from "fs/promises";
import os from "os";
import path from "path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { AI_EDIT_MISSING_KEY_NOTE, realEstateEditPrompt } from "../../shared/iconicStudio";
import { orderExteriorTwilightPrompt } from "../../shared/orderEditPlan";
import { OPENAI_IMAGE_EDIT_MODEL, OPENAI_IMAGE_EDITS_URL } from "./openaiImageEdit";
import { editScratchPhoto, grassReferenceStatus } from "./studioScratch";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9, ...Buffer.alloc(40, 1)]);

describe("scratch photo edit", () => {
  it("calls the Images edit API with the studio guardrails around a free-text prompt", async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(OPENAI_IMAGE_EDITS_URL);
      const form = init.body as FormData;
      expect(form.get("prompt")).toBe(realEstateEditPrompt("Clear the window glare"));
      expect(form.get("model")).toBe(OPENAI_IMAGE_EDIT_MODEL);
      expect(form.get("image")).toBeInstanceOf(Blob);
      return new Response(JSON.stringify({ data: [{ b64_json: jpeg.toString("base64") }] }), { status: 200 });
    });
    const result = await editScratchPhoto({
      action: "edit",
      prompt: "Clear the window glare",
      bytes: jpeg,
      contentType: "image/jpeg",
      fileName: "living room.jpg",
      env: { OPENAI_API_KEY: "sk-test" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.downloadName).toBe("living-room-edit.jpg");
    expect(result.contentType).toBe("image/jpeg");
  });

  it("sends the order twilight prompt and does not attach grass", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      expect(form.get("prompt")).toBe(realEstateEditPrompt(orderExteriorTwilightPrompt()));
      expect(form.getAll("image[]")).toHaveLength(0);
      expect(form.get("image")).toBeInstanceOf(Blob);
      return new Response(JSON.stringify({ data: [{ b64_json: jpeg.toString("base64") }] }), { status: 200 });
    });
    await editScratchPhoto({
      action: "twilight",
      prompt: "",
      bytes: jpeg,
      contentType: "image/jpeg",
      env: { OPENAI_API_KEY: "sk-test" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
  });

  it("composites the lawn from the reference and does not call the image model", async () => {
    const width = 240;
    const height = 180;
    const raw = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 3;
        const sky = y < 70;
        raw[i] = sky ? 90 : 40;
        raw[i + 1] = sky ? 150 : 130;
        raw[i + 2] = sky ? 220 : 50;
      }
    }
    const photo = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    const reference = await sharp({
      create: { width: 48, height: 48, channels: 3, background: { r: 20, g: 140, b: 40 } },
    }).jpeg().toBuffer();
    const fetchImpl = vi.fn();
    const result = await editScratchPhoto({
      action: "grass",
      prompt: "",
      bytes: photo,
      contentType: "image/jpeg",
      env: {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readGrass: async () => ({ bytes: reference, contentType: "image/jpeg" }),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.note).toMatch(/grass reference/i);
    const meta = await sharp(result.bytes).metadata();
    expect(meta.width).toBe(width);
    expect(meta.height).toBe(height);
  });

  it("stops before OpenAI when the key or the lawn file is missing", async () => {
    const fetchImpl = vi.fn();
    await expect(editScratchPhoto({
      action: "edit",
      prompt: "Lift the shadows",
      bytes: jpeg,
      contentType: "image/jpeg",
      env: {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toThrow(AI_EDIT_MISSING_KEY_NOTE);
    expect(fetchImpl).not.toHaveBeenCalled();

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "scratch-grass-"));
    const missing = path.join(dir, "nope.jpg");
    const status = await grassReferenceStatus({ STUDIO_GRASS_REFERENCE_PATH: missing });
    expect(status.ready).toBe(false);
    expect(status.note).toMatch(/public\/studio\/grass-reference.jpg/);
  });
});
