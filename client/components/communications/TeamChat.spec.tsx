import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { TeamChatSample } from "./TeamChat";

describe("team chat sample", () => {
  it("shows the channel, the group form, and no phone numbers", () => {
    const channel = renderToString(<TeamChatSample view="channel" />);
    expect(channel).toContain("#dispatch");
    expect(channel).toContain("A7K2");
    expect(channel).not.toMatch(/555-\d{4}/);
    const group = renderToString(<TeamChatSample view="new" />);
    expect(group).toContain("New group");
    expect(group).toContain("Alex Rivera");
    expect(group).toContain("photographer");
    expect(group).not.toMatch(/\+1\d{10}/);
  });
});
