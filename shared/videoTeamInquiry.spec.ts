import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { services } from "../client/lib/services";
import { findAddOn } from "./bookingCatalog";
import {
  CAMERA_HELPER,
  GOAL_OPTIONS,
  VIDEO_TEAM_SOURCE,
  parseVideoTeamInquiry,
  recommendVideoTeamPackages,
  videoTeamBookingQuery,
  videoTeamCheckoutPath,
  type VideoTeamAnswers,
  type VideoTeamCatalogRow,
  type VideoTeamRecommendation,
} from "./videoTeamInquiry";

function answers(patch: Partial<VideoTeamAnswers> = {}): VideoTeamAnswers {
  return {
    film: "listing",
    filmCustom: "",
    placeKind: "location",
    placeText: "200 Oak Ave, Spring, TX",
    whenDate: "2026-12-10",
    whenText: "",
    usage: ["social"],
    budgetBand: "under-300",
    customBudget: null,
    availability: "one-off",
    camera: "love",
    goal: "keep-up",
    ...patch,
  };
}

function catalogPrice(id: string): { name: string; price: number } | null {
  const service = services.find((item) => item.id === id);
  if (service) return { name: service.name, price: service.price };
  const addon = findAddOn(id);
  return addon ? { name: addon.name, price: addon.price } : null;
}

function expectCatalogPrices(picks: VideoTeamRecommendation[]) {
  expect(picks.length).toBeGreaterThan(0);
  for (const pick of picks) {
    if (pick.customQuote) {
      expect(pick.price).toBeNull();
      expect(pick.catalogId).toBeNull();
      expect([
        "Custom production quote",
        "Custom retainer quote",
        "Rate confirmed when the hold is set",
      ]).toContain(pick.priceLabel);
      expect(pick.priceLabel).not.toMatch(/\$\d/);
      continue;
    }
    const catalog = catalogPrice(pick.id);
    expect(catalog, pick.id).not.toBeNull();
    expect(pick.name).toBe(catalog?.name);
    expect(pick.price).toBe(catalog?.price);
    expect(pick.priceLabel).toBe(`$${catalog?.price.toLocaleString("en-US")}`);
  }
}

describe("video team package recommendations", () => {
  it("prices every recommendation from the order catalog", () => {
    const films = ["on-camera", "listing", "commercial", "event", "product", "twilight-aerial", "custom"] as const;
    const bands = ["under-300", "300-549", "550-999", "1000-2499", "2500-plus", "unsure"] as const;
    for (const film of films) {
      for (const budgetBand of bands) {
        expectCatalogPrices(recommendVideoTeamPackages(answers({
          film,
          filmCustom: film === "custom" ? "A brand story" : "",
          budgetBand,
          availability: budgetBand === "2500-plus" ? "yes-10" : "one-off",
          goal: "visibility",
          usage: ["web", "social"],
        })));
      }
    }
  });

  it("keeps a small listing budget on the reel and essentials prices", () => {
    const picks = recommendVideoTeamPackages(answers());
    expect(picks.map((pick) => pick.id)).toEqual(["basic-reel", "listing-essentials"]);
    expect(picks[0]).toMatchObject({ name: "Basic Reel", price: 125, bookingKind: "addon", primary: true });
    expect(picks[1]).toMatchObject({ name: "The Essentials", price: 249, bookingKind: "service" });
    expect(picks.some((pick) => pick.id === "listing-market-leader")).toBe(false);
  });

  it("recommends the aerial film at its catalog price when the budget covers it", () => {
    const picks = recommendVideoTeamPackages(answers({
      film: "twilight-aerial",
      budgetBand: "550-999",
      goal: "visibility",
      usage: ["web"],
    }));
    expect(picks[0]).toMatchObject({
      id: "aerial-premium",
      name: "Aerial Premium Video",
      price: 550,
      customQuote: false,
    });
  });

  it("uses a catalog override and drops the package when the live price no longer fits", () => {
    const rows: VideoTeamCatalogRow[] = [
      ...services.map((item) => ({ id: item.id, name: item.name, price: item.price, bookingKind: "service" })),
      { id: "aerial-premium", name: "Aerial Premium Video", price: 575, bookingKind: "addon" },
      { id: "basic-reel", name: "Basic Reel", price: 125, bookingKind: "addon" },
      { id: "basic-video", name: "Basic Video", price: 300, bookingKind: "addon" },
      { id: "aerial-drone", name: "Aerial Drone Stills", price: 200, bookingKind: "addon" },
      { id: "agent-intro-video", name: "Agent intro/outro", price: 59, bookingKind: "addon" },
    ];
    const fitted = recommendVideoTeamPackages(answers({
      film: "twilight-aerial",
      budgetBand: "550-999",
      goal: "visibility",
      usage: ["web"],
    }), rows);
    expect(fitted[0]).toMatchObject({ name: "Aerial Premium Video", price: 575, priceLabel: "$575" });

    const over = recommendVideoTeamPackages(answers({
      film: "twilight-aerial",
      budgetBand: "550-999",
      goal: "visibility",
      usage: ["web"],
    }), rows.map((row) => row.id === "aerial-premium" ? { ...row, price: 10000 } : row));
    expect(over.some((pick) => pick.id === "aerial-premium")).toBe(false);
    expect(over.every((pick) => pick.price == null || (pick.price ?? 0) <= 999)).toBe(true);
  });

  it("quotes event coverage instead of inventing a price", () => {
    const picks = recommendVideoTeamPackages(answers({
      film: "event",
      usage: ["event-recap", "social"],
      budgetBand: "550-999",
    }));
    expect(picks[0]).toMatchObject({
      customQuote: true,
      price: null,
      priceLabel: "Custom production quote",
    });
    expect(picks.some((pick) => pick.id === "basic-reel" && pick.price === 125)).toBe(true);
  });

  it("labels an ongoing event as a retainer quote", () => {
    const picks = recommendVideoTeamPackages(answers({
      film: "event",
      availability: "yes-10",
      usage: ["event-recap"],
      budgetBand: "unsure",
    }));
    expect(picks[0].priceLabel).toBe("Custom retainer quote");
  });

  it("sends an ongoing on-camera month to the catalog content packages", () => {
    const picks = recommendVideoTeamPackages(answers({
      film: "on-camera",
      availability: "yes-10",
      budgetBand: "1000-2499",
      goal: "engagement",
      usage: ["social"],
      camera: "getting-there",
    }));
    expect(picks.map((pick) => pick.name)).toEqual(["The Growth Engine", "The Content Partner"]);
    expect(picks.map((pick) => pick.price)).toEqual([850, 999]);
  });

  it("uses the agent intro price for a short one-off on-camera ask", () => {
    const picks = recommendVideoTeamPackages(answers({
      film: "on-camera",
      budgetBand: "under-300",
      goal: "keep-up",
      usage: ["social"],
    }));
    expect(picks[0]).toMatchObject({ id: "agent-intro-video", name: "Agent intro/outro", price: 59 });
  });

  it("confirms Studio 105 without a made-up room rate", () => {
    const picks = recommendVideoTeamPackages(answers({
      film: "product",
      placeKind: "studio",
      placeText: "",
      budgetBand: "550-999",
      usage: ["social"],
    }));
    expect(picks[0]).toMatchObject({
      id: "studio-105",
      name: "Studio 105",
      price: null,
      priceLabel: "Rate confirmed when the hold is set",
    });
    expect(picks[0].reason).toContain("Studio Noir");
  });

  it("keeps the four goal labels exact", () => {
    expect(GOAL_OPTIONS.map((option) => option.label)).toEqual([
      "More engagement",
      "More revenue",
      "More visibility",
      "Just trying to keep up!",
    ]);
    expect(CAMERA_HELPER).toBe("Don't worry, we'll bring it out in you!");
  });

  it("opens /book with the catalog package and the contact details", () => {
    const [pick] = recommendVideoTeamPackages(answers({
      film: "twilight-aerial",
      budgetBand: "550-999",
      goal: "visibility",
      usage: ["web"],
    }));
    const path = videoTeamCheckoutPath({
      pick,
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "(281) 555-0101",
      address: "200 Oak Ave, Spring, TX",
      note: "Video team inquiry.",
    });
    const url = new URL(path, "https://iconicimagestx.com");
    expect(url.pathname).toBe("/book");
    expect(url.searchParams.get("items")).toBe("aerial-premium");
    expect(url.searchParams.get("service")).toBeNull();
    expect(url.searchParams.get("utm_source")).toBe(VIDEO_TEAM_SOURCE);
    expect(url.searchParams.get("first")).toBe("Ada");
    expect(url.searchParams.get("last")).toBe("Lovelace");
    expect(url.searchParams.get("email")).toBe("ada@example.com");
    expect(videoTeamBookingQuery(url.searchParams)).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      address: "200 Oak Ave, Spring, TX",
      vibeNote: "Video team inquiry.",
    });

    const addon = recommendVideoTeamPackages(answers())[0];
    const addonPath = new URL(videoTeamCheckoutPath({
      pick: addon,
      name: "Ada",
      email: "",
      phone: "2815550101",
      address: "",
      note: "",
    }), "https://iconicimagestx.com");
    expect(addonPath.searchParams.get("items")).toBe("basic-reel");
    expect(addonPath.searchParams.get("service")).toBeNull();
  });

  it("wires the booking form to the video team query", () => {
    const source = readFileSync(new URL("../client/components/BookingForm.tsx", import.meta.url), "utf8");
    expect(source).toContain("videoTeamBookingQuery");
    expect(source).toContain("videoTeamStandaloneAddon");
  });
});

describe("parseVideoTeamInquiry", () => {
  const now = new Date("2026-11-30T14:00:00.000Z");

  function body(extra: Record<string, unknown> = {}) {
    return {
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "",
      film: "listing",
      placeKind: "location",
      placeText: "200 Oak Ave, Spring, TX",
      whenDate: "2026-12-10",
      whenText: "",
      usage: ["social"],
      budgetBand: "under-300",
      availability: "one-off",
      camera: "love",
      goal: "keep-up",
      intent: "buy",
      packageId: "basic-reel",
      ...extra,
    };
  }

  it("accepts a buy inquiry and a bookable call slot", () => {
    expect(parseVideoTeamInquiry(body(), now).ok).toBe(true);
    const slot = {
      start: "2026-11-30T15:00:00.000Z",
      end: "2026-11-30T15:30:00.000Z",
      label: "Mon, Nov 30 · 9:00 AM",
    };
    const call = parseVideoTeamInquiry(body({ intent: "call", slot }), now);
    expect(call.ok).toBe(true);
    if (call.ok) expect(call.value.slot?.start).toBe(slot.start);
  });

  it("rejects a Saturday call and a missing contact", () => {
    const saturday = parseVideoTeamInquiry(body({
      intent: "call",
      slot: {
        start: "2026-12-05T15:00:00.000Z",
        end: "2026-12-05T15:30:00.000Z",
        label: "Sat",
      },
    }), now);
    expect(saturday.ok).toBe(false);
    expect(parseVideoTeamInquiry(body({ email: "", phone: "" }), now).ok).toBe(false);
  });

  it("flags the honeypot without treating it as a real inquiry", () => {
    const parsed = parseVideoTeamInquiry(body({ companyWebsite: "https://spam.example" }), now);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.honeypot).toBe(true);
  });
});
