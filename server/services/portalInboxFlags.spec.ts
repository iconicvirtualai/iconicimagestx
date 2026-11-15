import { describe, expect, it } from "vitest";
import {
  listFlags,
  resetPortalFlagsForTests,
  saveFlags,
} from "./portalInboxFlags";

describe("portal inbox flags", () => {
  it("does not return one person's flags to another person", async () => {
    resetPortalFlagsForTests();
    await saveFlags("user-a", [
      { threadKey: "comm:order:1", folder: "trash", starred: true },
    ]);
    await saveFlags("user-b", [
      { threadKey: "comm:order:1", folder: "inbox", forceUnread: true },
    ]);
    const a = await listFlags("user-a");
    const b = await listFlags("user-b");
    expect(a.map((flag) => flag.folder)).toEqual(["trash"]);
    expect(b.map((flag) => flag.forceUnread)).toEqual([true]);
    expect(a[0].forceUnread).toBe(false);
    expect(b[0].folder).toBe("inbox");
  });
});
