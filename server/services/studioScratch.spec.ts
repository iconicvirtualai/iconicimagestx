import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import { AI_EDIT_MISSING_KEY_NOTE, realEstateEditPrompt } from "../../shared/iconicStudio";
import { orderExteriorTwilightPrompt } from "../../shared/orderEditPlan";
import { GRASS_REPLACE_PROMPT } from "../../shared/studioScratch";
import { OPENAI_IMAGE_EDITS_URL } from "./openaiImageEdit";
import { editScratchPhoto, grassReferenceStatus } from "./studioScratch";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9, ...Buffer.alloc(40, 1)]);

describe("scratch photo edit", () => {
  it("calls the Images edit API with the studio guardrails around a free-text prompt", async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(OPENAI_IMAGE_EDITS_URL);
      const form = init.body as FormData;
      expect(form.get("prompt")).toBe(realEstateEditPrompt("Clear the window glare"));
      expect(form.get("model")).toBe("gpt-image-1");
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

  it("attaches the configured grass reference as the second image", async () => {
    const grass = Buffer.from([0xff, 0xd8, 0xff, ...Buffer.alloc(48, 7)]);
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      expect(form.get("prompt")).toBe(realEstateEditPrompt(GRASS_REPLACE_PROMPT));
      const images = form.getAll("image[]");
      expect(images).toHaveLength(2);
      expect((images[1] as File).name).toBe("grass-reference.jpg");
      return new Response(JSON.stringify({ data: [{ b64_json: jpeg.toString("base64") }] }), { status: 200 });
    });
    await editScratchPhoto({
      action: "grass",
      prompt: "",
      bytes: jpeg,
      contentType: "image/jpeg",
      env: { OPENAI_API_KEY: "sk-test" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readGrass: async () => ({ bytes: grass, contentType: "image/jpeg" }),
    });
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
