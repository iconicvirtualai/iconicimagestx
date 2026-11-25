import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  emailImageSrcs,
  mergeNewsCards,
  newsFilesFromCampaign,
  newsHeadTags,
  legacyNewsRedirect,
  newsIssuePath,
  parseNewsMeta,
  prepareEmailSrcDoc,
  publicCampaignCard,
} from "./news";
import { CANONICAL_WWW_ORIGIN, DEFAULT_SITE_ORIGIN } from "./siteSeo";

const email = readFileSync(new URL("../content/news/holysmokes/email.html", import.meta.url), "utf8");
const meta = JSON.parse(readFileSync(new URL("../content/news/holysmokes/meta.json", import.meta.url), "utf8"));

const HOLY_SMOKES_IMAGES = [
  "hero.jpg",
  "crew.jpg",
  "01-website.jpg",
  "02-loyalty.jpg",
  "03-reel-phone.jpg",
  "04-pay-at-close.jpg",
  "05-noir.jpg",
  "05-blanc.jpg",
  "05-podcast.jpg",
  "05-podcast-vote.gif",
  "06-apprentice.jpg",
  "07-social.jpg",
  "08-partners.jpg",
  "10-iconic-studio.jpg",
  "10-staging.jpg",
  "11-snap-reel-play.jpg",
  "podcast-hosts.jpg",
  "video-everything.jpg",
];

describe("news issues", () => {
  it("publishes HOLYYY SMOKES as a newsletter", () => {
    const parsed = parseNewsMeta(meta, "holysmokes");
    expect(parsed.title).toBe("HOLYYY SMOKES");
    expect(parsed.category).toBe("newsletter");
    expect(parsed.date).toBe("2026-11-23");
    expect(newsIssuePath(parsed)).toBe("/news/holysmokes");
    expect(newsIssuePath({ slug: "jan2027", category: "promo" })).toBe("/news/promos/jan2027");
    expect(legacyNewsRedirect("/news")).toBe("/");
    expect(legacyNewsRedirect("/insights/news/holysmokes")).toBe("/news/holysmokes");
    expect(legacyNewsRedirect("/insights/news/promos/jan2027")).toBe("/news/promos/jan2027");
  });

  it("keeps send-ready image URLs on the www asset host", () => {
    const srcs = emailImageSrcs(email);
    const assets = srcs.filter((src) => src.includes("/marketing/email/holy-smokes-2026/"));
    expect(assets).toHaveLength(HOLY_SMOKES_IMAGES.length);
    for (const file of HOLY_SMOKES_IMAGES) {
      expect(assets).toContain(`https://www.iconicimagestx.com/marketing/email/holy-smokes-2026/${file}`);
    }
    expect(srcs.every((src) => src.startsWith("https://www.iconicimagestx.com/"))).toBe(true);
  });

  it("points Open Graph at the hero and isolates preview images inside the page", () => {
    const tags = newsHeadTags(parseNewsMeta(meta, "holysmokes"), CANONICAL_WWW_ORIGIN);
    expect(tags).toContain("<title>HOLYYY SMOKES | Iconic Images</title>");
    expect(tags).toContain(`property="og:image" content="${CANONICAL_WWW_ORIGIN}/marketing/email/holy-smokes-2026/hero.jpg"`);
    expect(tags).toContain(`href="${CANONICAL_WWW_ORIGIN}/news/holysmokes"`);
    expect(email).toContain("https://www.iconicimagestx.com/flash-sale?bundle=5");
    expect(email).toContain("https://www.iconicimagestx.com/flash-sale?bundle=10");
    expect(email).toContain("BLACK FRIDAY SALE");
    expect(email).toContain("11:59 PM CT");
    expect(email).not.toContain("FLASH SALE");
    expect(email).not.toContain("Nov 25");
    expect(email).toContain("Cadi, Mike, Armando, Daniel, Steven, Pedro and David");
    expect(email).toContain("Message us and we'll lock in your bundle");
    const preview = prepareEmailSrcDoc(email, "https://preview.example");
    expect(preview).toContain("https://preview.example/marketing/email/holy-smokes-2026/03-reel-phone.jpg");
    expect(preview).toContain("https://preview.example/marketing/email/holy-smokes-2026/05-podcast-vote.gif");
    expect(preview).toContain("news-email-height");
    expect(preview).toContain("overflow:hidden");
    expect(preview).toContain("https://preview.example/black-friday?bundle=5");
    expect(preview).not.toContain("/flash-sale");
    expect(preview).toContain(">Unsubscribe</a>");
    expect(prepareEmailSrcDoc('<a href="[UNSUBSCRIBE LINK]">Unsubscribe</a>')).toContain('href="/unsubscribe"');
    expect(preview).toContain('href="https://www.iconicimagestx.com/book"');
    const previewHost = prepareEmailSrcDoc(email, DEFAULT_SITE_ORIGIN);
    expect(previewHost).toContain(`${DEFAULT_SITE_ORIGIN}/marketing/email/holy-smokes-2026/hero.jpg`);
    const live = prepareEmailSrcDoc(email, CANONICAL_WWW_ORIGIN);
    expect(live).toContain("https://www.iconicimagestx.com/marketing/email/holy-smokes-2026/hero.jpg");
  });

  it("builds a folder from a sent campaign and lets that folder win", () => {
    expect(newsFilesFromCampaign({
      id: "draft-1",
      name: "Draft",
      status: "draft",
      subject: "Not yet",
      html: "<p>Hi</p>",
      sentAt: "2027-01-04T15:00:00.000Z",
      newsSlug: "jan2027",
    })).toBeNull();

    const files = newsFilesFromCampaign({
      id: "camp-1",
      name: "January promo",
      status: "sent",
      subject: "January bundle",
      preheader: "A short January offer.",
      html: "<p>January</p>",
      sentAt: "2027-01-04T15:00:00.000Z",
      newsSlug: "jan2027",
      newsCategory: "promo",
      newsHero: "/marketing/email/jan2027/hero.jpg",
    });
    expect(files?.directory).toBe("content/news/jan2027");
    expect(JSON.parse(files!.metaJson).category).toBe("promo");
    expect(files?.emailHtml).toBe("<p>January</p>");

    const card = publicCampaignCard({
      id: "camp-1",
      name: "January promo",
      status: "sent",
      subject: "January bundle",
      html: "<p>January</p>",
      sentAt: "2027-01-04T15:00:00.000Z",
      newsSlug: "jan2027",
      newsCategory: "promo",
      newsHero: "/marketing/email/jan2027/hero.jpg",
      newsSummary: "A short January offer.",
    });
    const merged = mergeNewsCards(
      [{ ...parseNewsMeta(meta, "holysmokes"), path: "/news/holysmokes", source: "folder" }],
      [
        card!,
        { ...card!, slug: "holysmokes", path: "/news/holysmokes" },
      ],
    );
    expect(merged.map((item) => item.slug)).toEqual(["jan2027", "holysmokes"]);
    expect(merged.find((item) => item.slug === "holysmokes")?.source).toBe("folder");
  });
});
