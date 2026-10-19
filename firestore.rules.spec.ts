import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("communications firestore rules", () => {
  const rules = readFileSync("firestore.rules", "utf8");

  it("lets a client or photographer read only their own message threads", () => {
    expect(rules).toContain("resource.data.clientId == request.auth.uid");
    expect(rules).toContain("resource.data.photographerId == request.auth.uid");
    expect(rules).toContain("request.auth.uid in resource.data.participantIds");
    expect(rules).toMatch(/match \/contactThreads\/\{threadId\}[\s\S]*allow read, write: if false/);
  });
});
