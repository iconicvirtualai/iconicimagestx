import { describe, expect, it } from "vitest";
import { pollVsaiJob } from "./scratchStaging";

describe("virtual staging poll", () => {
  it("returns the result url once the job completes", async () => {
    const reads = [
      { status: "processing" },
      { status: "completed", resultUrl: "https://cdn.example/staged.jpg" },
    ];
    const url = await pollVsaiJob(async () => reads.shift() || { status: "processing" }, async () => undefined, 4);
    expect(url).toBe("https://cdn.example/staged.jpg");
  });

  it("surfaces a failed render", async () => {
    await expect(pollVsaiJob(async () => ({ status: "failed", error: "Room type rejected." }), async () => undefined, 2))
      .rejects.toThrow(/Room type rejected/);
  });
});
