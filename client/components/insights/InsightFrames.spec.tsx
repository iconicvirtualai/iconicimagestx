import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createInsightPost, toPublicInsight } from "@shared/insights";
import { InsightEditor } from "./InsightEditor";
import { InsightsFeed } from "./InsightFrames";
import { SocialQueue } from "./SocialQueue";

describe("insight frames", () => {
  it("renders a published post in the featured frame and the social queue", () => {
    const post = createInsightPost(
      { template: "stat", title: "Twelve listings, one twilight set", coverUrl: "/media/photos/drone-hero.jpg" },
      { uid: "cadi", name: "Cadi" },
    );
    post.readyForSocial = true;
    post.socialPack = {
      caption: "Save this for the next listing.",
      hashtags: "#IconicImages",
      platforms: ["instagram", "tiktok"],
      assets: [{ id: "asset_1", url: "/media/photos/drone-hero.jpg", name: "twilight.jpg", kind: "image" }],
    };
    const html = renderToString(
      <MemoryRouter>
        <InsightsFeed
          posts={[toPublicInsight({ ...post, status: "published", publishedAt: "2026-10-19T15:00:00.000Z" })]}
          category="ALL"
          query=""
          onCategory={() => undefined}
          onQuery={() => undefined}
        />
        <InsightEditor
          post={post}
          busy={false}
          message=""
          onChange={() => undefined}
          onSave={() => undefined}
          onPublish={() => undefined}
          onUnpublish={() => undefined}
          onDelete={() => undefined}
          onUpload={async () => ({ url: "/media/photos/drone-hero.jpg", kind: "image" })}
          onImportLink={async () => ({ url: "/media/photos/drone-hero.jpg", kind: "image" })}
        />
        <SocialQueue posts={[post]} busyId={null} message="" onDownload={() => undefined} onCopy={() => undefined} />
      </MemoryRouter>,
    );
    expect(html).toContain("Twelve listings, one twilight set");
    expect(html).toContain("insight-featured");
    expect(html).toContain("Publish");
    expect(html).toContain("Ready for social");
    expect(html).toContain("Download pack");
    expect(html).toContain("Instagram");
    expect(html).not.toContain("socialPack");
  });
});
