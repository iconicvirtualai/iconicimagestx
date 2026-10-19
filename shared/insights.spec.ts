import { describe, expect, it } from "vitest";
import {
  claimSlug,
  createInsightPost,
  embedSrc,
  insightHeadTags,
  insightReadyToPublish,
  moveItem,
  slugify,
  toPublicInsight,
  updateInsightPost,
} from "./insights";
import { zipStored } from "./zipStore";

describe("insight posts", () => {
  it("builds a journal draft and keeps social fields off the public payload", () => {
    const post = createInsightPost({ template: "journal" }, { uid: "cadi", name: "Cadi" });
    expect(post.status).toBe("draft");
    expect(post.categories).toEqual(["FROM THE SHOOT"]);
    expect(post.blocks.map((block) => block.type)).toEqual(["heading", "text"]);
    expect(slugify(post.title)).toBe(post.slug);
    const published = { ...post, status: "published" as const, publishedAt: "2026-10-19T15:00:00.000Z" };
    const publicPost = toPublicInsight(published);
    expect(publicPost.authorName).toBe("Iconic Images");
    expect(publicPost).not.toHaveProperty("socialPack");
    expect(publicPost).not.toHaveProperty("readyForSocial");
    expect(insightHeadTags(publicPost, "https://iconicimagestx.vercel.app")).toContain('property="og:image"');
    expect(insightHeadTags({ ...publicPost, coverUrl: "/media/photos/drone-hero.jpg" }, "https://iconicimagestx.vercel.app")).toContain(
      "https://iconicimagestx.vercel.app/media/photos/drone-hero.jpg",
    );
  });

  it("rejects a reserved slug and a publish with no title", () => {
    expect(slugify("Photoshoot Prep!!!")).toBe("photoshoot-prep");
    const prep = createInsightPost({ title: "Prep", slug: "prep" }, { uid: "cadi", name: "Cadi" });
    expect(prep.slug).toBe("prep-note");
    const blank = createInsightPost({}, { uid: "cadi", name: "Cadi" });
    expect(insightReadyToPublish(blank)).toMatch(/title/i);
    const social = createInsightPost({ template: "social" }, { uid: "cadi", name: "Cadi" });
    expect(social.readyForSocial).toBe(true);
    expect(insightReadyToPublish(social)).toBeNull();
  });

  it("preserves publish state while editing and moves blocks", () => {
    const current = createInsightPost({ template: "value", title: "Porch light" }, { uid: "cadi", name: "Cadi" });
    current.status = "published";
    current.publishedAt = "2026-10-01T00:00:00.000Z";
    const next = updateInsightPost(current, { title: "Porch light, revised", status: "draft" });
    expect(next.status).toBe("published");
    expect(next.publishedAt).toBe("2026-10-01T00:00:00.000Z");
    expect(next.title).toBe("Porch light, revised");
    const moved = moveItem(next.blocks, 0, 1);
    expect(moved[1].id).toBe(next.blocks[0].id);
    expect(claimSlug("porch-light", "other", [next])).toBe("porch-light-2");
  });

  it("only embeds known video hosts", () => {
    expect(embedSrc("https://youtu.be/abcdefghijk")).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk");
    expect(embedSrc("https://example.com/watch")).toBe("");
    expect(embedSrc("javascript:alert(1)")).toBe("");
  });

  it("packs a stored zip the browser can download", () => {
    const zipped = Buffer.from(zipStored([{ name: "porch.webp", data: new TextEncoder().encode("iconic") }]));
    expect(zipped.subarray(0, 2).toString()).toBe("PK");
    expect(zipped.includes(Buffer.from("porch.webp"))).toBe(true);
    expect(zipped.includes(Buffer.from("iconic"))).toBe(true);
  });
});
