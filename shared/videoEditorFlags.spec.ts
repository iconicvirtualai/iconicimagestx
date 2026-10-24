import { describe, expect, it } from "vitest";
import { videoEditorEnabled, videoTemplatesEnabled } from "./videoEditorFlags";

describe("video editor flags", () => {
  it("stays off in production when unset and on in preview and local", () => {
    expect(videoEditorEnabled({ VERCEL_ENV: "production" })).toBe(false);
    expect(videoTemplatesEnabled({ VERCEL_ENV: "production" })).toBe(false);
    expect(videoEditorEnabled({ VERCEL_ENV: "preview" })).toBe(true);
    expect(videoTemplatesEnabled({ VERCEL_ENV: "preview" })).toBe(true);
    expect(videoEditorEnabled({})).toBe(true);
  });

  it("lets an explicit flag win", () => {
    expect(videoEditorEnabled({ VERCEL_ENV: "production", VIDEO_EDITOR_ENABLED: "true" })).toBe(true);
    expect(videoTemplatesEnabled({ VERCEL_ENV: "preview", VIDEO_TEMPLATES_ENABLED: "false" })).toBe(false);
    expect(videoTemplatesEnabled({ VIDEO_EDITOR_ENABLED: "false", VIDEO_TEMPLATES_ENABLED: "true" })).toBe(false);
  });
});
