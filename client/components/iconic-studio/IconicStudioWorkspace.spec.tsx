import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import IconicStudioWorkspace from "./IconicStudioWorkspace";
import { sampleStudioFrames } from "@shared/iconicStudio";

describe("Iconic Studio staff shell", () => {
  it("renders the filmstrip, preview, and four tool tabs", () => {
    const html = renderToString(
      <IconicStudioWorkspace
        listings={[{ id: "sampledemo", address: "100 Sample Lane", imageCount: 2 }]}
        jobs={[]}
        listingId="sampledemo"
        address="100 Sample Lane"
        frames={sampleStudioFrames()}
        demo
        onSelectListing={() => undefined}
        onAiEdit={async () => undefined}
        onSaveAdjust={async () => undefined}
        onApprove={async () => undefined}
      />,
    );
    expect(html).toContain("Iconic Studio tools");
    expect(html).toContain("Adjust");
    expect(html).toContain("AI");
    expect(html).toContain("Brand");
    expect(html).toContain("Gallery");
    expect(html).toContain("studio-filmstrip");
    expect(html).toContain("studio-preview");
    expect(html).toContain("living-room.jpg");
    expect(html).toContain("RAW");
    expect(html).toContain("Agents: later");
  });
});
