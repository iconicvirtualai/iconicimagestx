import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { renderDeliveryJpeg } from "./deliveryWatermark";

describe("delivery watermark", () => {
  it("burns a mark into the preview and leaves the paid file clean", async () => {
    const source = await sharp({
      create: { width: 80, height: 48, channels: 3, background: "#336699" },
    }).jpeg().toBuffer();
    const clean = await renderDeliveryJpeg(source, { edge: 80, watermark: false });
    const marked = await renderDeliveryJpeg(source, { edge: 80, watermark: true });
    expect(clean?.[0]).toBe(0xff);
    expect(marked?.[0]).toBe(0xff);
    expect(marked?.equals(clean || Buffer.alloc(0))).toBe(false);
  });
});
