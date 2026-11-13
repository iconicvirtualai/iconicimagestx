import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("client hub firestore rules", () => {
  const rules = readFileSync("firestore.rules", "utf8");

  it("keeps team, CRM, and billing reads on the owner or listed members", () => {
    expect(rules).toContain("match /customerTeams/{teamId}");
    expect(rules).toContain("match /customerTeamMembers/{memberId}");
    expect(rules).toContain("match /agentContacts/{contactId}");
    expect(rules).toContain("match /clientBilling/{clientId}");
    expect(rules).toContain("request.auth.uid in data.memberUids");
    expect(rules).toContain("request.auth.uid in data.readerUids");
    expect(rules).toMatch(/match \/clientBilling\/\{clientId\}[\s\S]*allow write: if false/);
    expect(rules).toMatch(/match \/clientCreditEntries\/\{entryId\}[\s\S]*allow write: if false/);
    expect(rules).toContain("!request.resource.data.keys().hasAny(['cardNumber', 'cvv', 'pan'])");
  });
});

describe("task board firestore rules", () => {
  const rules = readFileSync("firestore.rules", "utf8");

  it("lets coordinators read the checklist and write only event tasks", () => {
    const board = rules.indexOf("match /taskBoardItems/{itemId}");
    const events = rules.indexOf("match /officeEvents/{eventId}");
    const catchAll = rules.indexOf("match /{document=**}");
    expect(board).toBeGreaterThan(-1);
    expect(events).toBeGreaterThan(board);
    expect(events).toBeLessThan(catchAll);
    expect(rules).toMatch(/match \/taskBoardItems\/\{itemId\}[\s\S]*allow read: if isCoordinator\(\)/);
    expect(rules).toMatch(/match \/officeEvents\/\{eventId\}[\s\S]*allow read: if isCoordinator\(\)/);
    expect(rules).toMatch(/request\.resource\.data\.eventId/);
  });
});

describe("gallery selection firestore rules", () => {
  const rules = readFileSync("firestore.rules", "utf8");

  it("lets staff and that gallery's client read one pick list", () => {
    const start = rules.indexOf("match /clientPicks/{pickId}");
    const block = start === -1 ? "" : rules.slice(start, start + 900);
    expect(start).toBeGreaterThan(rules.indexOf("match /galleries/{galleryId}"));
    expect(block).toContain("allow read: if isStaff() || galleryClient()");
    expect(block).toContain("data.clientId == request.auth.uid");
    expect(block).toContain("request.resource.data.status == 'draft'");
    expect(block).toContain("pickId == 'current'");
    expect(block).not.toContain("allow read: if true");
  });
});

describe("communications firestore rules", () => {
  const rules = readFileSync("firestore.rules", "utf8");

  it("lets a client or photographer read only their own message threads", () => {
    expect(rules).toContain("resource.data.clientId == request.auth.uid");
    expect(rules).toContain("resource.data.photographerId == request.auth.uid");
    expect(rules).toContain("request.auth.uid in resource.data.participantIds");
    expect(rules).toMatch(/match \/contactThreads\/\{threadId\}[\s\S]*allow read, write: if false/);
  });
});
