import { describe, expect, it } from "vitest";
import { zipStored } from "./zipStore";

function readStored(zip: Uint8Array): Array<{ name: string; data: Uint8Array }> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const files: Array<{ name: string; data: Uint8Array }> = [];
  let offset = 0;
  while (offset + 30 < zip.length && view.getUint32(offset, true) === 0x04034b50) {
    const nameLength = view.getUint16(offset + 26, true);
    const size = view.getUint32(offset + 18, true);
    const name = new TextDecoder().decode(zip.slice(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength;
    files.push({ name, data: zip.slice(start, start + size) });
    offset = start + size;
  }
  expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
  return files;
}

describe("stored zip", () => {
  it("packs selected jpeg bytes without renaming the payload", () => {
    const first = new Uint8Array([1, 2, 3, 4]);
    const second = new Uint8Array([9, 8, 7]);
    const zip = zipStored([
      { name: "front-edit.jpg", data: first },
      { name: "front-edit.jpg", data: second },
    ], new Date(2026, 3, 2, 12, 0, 0));
    const files = readStored(zip);
    expect(files.map((file) => file.name)).toEqual(["front-edit.jpg", "front-edit-2.jpg"]);
    expect(Array.from(files[0].data)).toEqual([1, 2, 3, 4]);
    expect(Array.from(files[1].data)).toEqual([9, 8, 7]);
  });
});
