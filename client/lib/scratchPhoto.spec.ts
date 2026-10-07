import { describe, expect, it } from "vitest";
import { findExifShotTime } from "./scratchPhoto";

function exifJpeg(date: string): Uint8Array {
  const text = new TextEncoder().encode(`${date}\0`);
  const tiff = new Uint8Array(26 + text.length);
  tiff.set([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00], 0);
  tiff.set([0x01, 0x00], 8);
  tiff.set(
    [
      0x03,
      0x90,
      0x02,
      0x00,
      text.length,
      0x00,
      0x00,
      0x00,
      0x1a,
      0x00,
      0x00,
      0x00,
    ],
    10,
  );
  tiff.set(text, 26);
  const segmentLength = 2 + 6 + tiff.length;
  const jpeg = new Uint8Array(4 + segmentLength);
  jpeg.set(
    [0xff, 0xd8, 0xff, 0xe1, (segmentLength >> 8) & 0xff, segmentLength & 0xff],
    0,
  );
  jpeg.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 6);
  jpeg.set(tiff, 12);
  return jpeg;
}

describe("jpeg shot time", () => {
  it("reads DateTimeOriginal and ignores a jpeg with no exif", () => {
    const ms = findExifShotTime(exifJpeg("2020:01:02 03:04:05"));
    expect(ms).toBe(Date.parse("2020-01-02T03:04:05"));
    expect(
      findExifShotTime(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])),
    ).toBeNull();
  });
});
