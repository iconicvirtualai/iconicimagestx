/**
 * Video team order recommendations.
 * Names and prices come from the booking catalog seed (services + add-ons).
 * A loaded catalog row replaces the seed price for that id.
 * Jobs the catalog does not price stay custom quotes — no invented rates.
 */

import { services } from "../client/lib/services.ts";
import { findAddOn, isPubliclyBookable } from "./bookingCatalog.ts";
import {
  MIKE_CALL_PHOTOGRAPHER_ID,
  mikeCallSlotBookable,
  type MikeCallSlot,
} from "./mikeCallSlots.ts";

export const VIDEO_TEAM_SOURCE = "video-team-form";
export const VIDEO_TEAM_LEAD = "Video team page";

export const CUSTOM_PRODUCTION_LABEL = "Custom production quote";
export const CUSTOM_RETAINER_LABEL = "Custom retainer quote";
export const STUDIO_RATE_LABEL = "Rate confirmed when the hold is set";
export const CAMERA_HELPER = "Don't worry, we'll bring it out in you!";

export const VIDEO_TEAM_STANDALONE_ADDONS = [
  "basic-reel",
  "basic-video",
  "aerial-premium",
  "agent-intro-video",
] as const;

export function videoTeamStandaloneAddon(id: string): boolean {
  return (VIDEO_TEAM_STANDALONE_ADDONS as readonly string[]).includes(id);
}

export const FILM_OPTIONS = [
  { id: "on-camera", label: "On-Camera / Personal Brand" },
  { id: "listing", label: "Real Estate / Listing Film" },
  { id: "commercial", label: "Commercial / Business Promo" },
  { id: "event", label: "Event Coverage" },
  { id: "product", label: "Product / Studio" },
  { id: "twilight-aerial", label: "Twilight / Aerial" },
  { id: "custom", label: "Something else" },
] as const;

export const USAGE_OPTIONS = [
  { id: "social", label: "Social media reels" },
  { id: "web", label: "Website / YouTube" },
  { id: "ads", label: "Ads / Paid Campaigns" },
  { id: "listing-mls", label: "Listing / MLS" },
  { id: "event-recap", label: "Event recap" },
] as const;

export const PLACE_OPTIONS = [
  { id: "studio", label: "Studio 105" },
  { id: "location", label: "On-location" },
] as const;

export const BUDGET_OPTIONS = [
  { id: "under-300", label: "Under $300", max: 299 },
  { id: "300-549", label: "$300 – $549", max: 549 },
  { id: "550-999", label: "$550 – $999", max: 999 },
  { id: "1000-2499", label: "$1,000 – $2,499", max: 2499 },
  { id: "2500-plus", label: "$2,500+", max: Number.POSITIVE_INFINITY },
  { id: "unsure", label: "Not sure yet", max: null },
  { id: "custom", label: "Custom amount", max: null },
] as const;

export const AVAILABILITY_OPTIONS = [
  { id: "yes-10", label: "Yes" },
  { id: "one-two", label: "1–2 days per month" },
  { id: "flexible", label: "Flexible" },
  { id: "one-off", label: "One-off shoot" },
] as const;

export const CAMERA_OPTIONS = [
  { id: "love", label: "Love it" },
  { id: "getting-there", label: "Getting there" },
  { id: "shy", label: "Camera-shy — coach me!" },
] as const;

export const GOAL_OPTIONS = [
  { id: "engagement", label: "More engagement" },
  { id: "revenue", label: "More revenue" },
  { id: "visibility", label: "More visibility" },
  { id: "keep-up", label: "Just trying to keep up!" },
] as const;

type OptionId<T extends readonly { id: string }[]> = T[number]["id"];

export type VideoFilmId = OptionId<typeof FILM_OPTIONS>;
export type VideoUsageId = OptionId<typeof USAGE_OPTIONS>;
export type VideoPlaceId = OptionId<typeof PLACE_OPTIONS>;
export type VideoBudgetId = OptionId<typeof BUDGET_OPTIONS>;
export type VideoAvailabilityId = OptionId<typeof AVAILABILITY_OPTIONS>;
export type VideoCameraId = OptionId<typeof CAMERA_OPTIONS>;
export type VideoGoalId = OptionId<typeof GOAL_OPTIONS>;

export interface VideoTeamAnswers {
  film: VideoFilmId;
  filmCustom: string;
  placeKind: VideoPlaceId;
  placeText: string;
  whenDate: string;
  whenText: string;
  usage: VideoUsageId[];
  budgetBand: VideoBudgetId;
  customBudget: number | null;
  availability: VideoAvailabilityId;
  camera: VideoCameraId;
  goal: VideoGoalId;
}

export interface VideoTeamCatalogRow {
  id: string;
  bookingId?: string;
  name?: string;
  price?: number;
  description?: string;
  bookingKind?: string;
}

export interface VideoTeamRecommendation {
  id: string;
  catalogId: string | null;
  name: string;
  price: number | null;
  priceLabel: string;
  description: string;
  features: string[];
  bookingKind: "service" | "addon" | "custom";
  customQuote: boolean;
  reason: string;
  primary: boolean;
}

interface Offered {
  id: string;
  name: string;
  price: number;
  description: string;
  features: string[];
  bookingKind: "service" | "addon";
}

const POOLS: Record<VideoFilmId, string[]> = {
  "on-camera": [
    "agent-intro-video",
    "business-baseline",
    "business-growth-engine",
    "branding-content-partner",
    "branding-local-legend",
  ],
  listing: [
    "basic-reel",
    "listing-essentials",
    "basic-video",
    "listing-showcase",
    "red-carpet",
    "luxe-video",
    "listing-legacy",
    "aerial-premium",
    "listing-market-leader",
  ],
  commercial: [
    "basic-reel",
    "basic-video",
    "business-baseline",
    "business-growth-engine",
    "branding-content-partner",
    "branding-local-legend",
  ],
  event: ["basic-reel"],
  product: ["basic-reel", "basic-video", "agent-intro-video"],
  "twilight-aerial": [
    "listing-essentials",
    "aerial-drone",
    "aerial-premium",
    "listing-showcase",
    "listing-legacy",
  ],
  custom: ["basic-reel", "basic-video", "branding-content-partner"],
};

function optionLabel<T extends readonly { id: string; label: string }[]>(options: T, id: string): string {
  return options.find((option) => option.id === id)?.label || id;
}

function money(price: number): string {
  if (Number.isInteger(price)) return `$${price.toLocaleString("en-US")}`;
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function seedItem(id: string): Offered | null {
  const service = services.find((item) => item.id === id);
  if (service) {
    return {
      id: service.id,
      name: service.name,
      price: service.price,
      description: service.description,
      features: service.features || [],
      bookingKind: "service",
    };
  }
  const addon = findAddOn(id);
  if (!addon) return null;
  return {
    id: addon.id,
    name: addon.name,
    price: addon.price,
    description: addon.description,
    features: addon.features || [],
    bookingKind: "addon",
  };
}

function offerFromCatalog(id: string, catalog: VideoTeamCatalogRow[] | undefined): Offered | null {
  const seeded = seedItem(id);
  if (!seeded) return null;
  if (!catalog) return seeded.price > 0 ? seeded : null;
  const live = catalog.find((row) => row.id === id || row.bookingId === id);
  if (!live || !isPubliclyBookable({ price: live.price })) return null;
  const price = Number(live.price);
  return {
    ...seeded,
    name: live.name?.trim() || seeded.name,
    price,
    description: live.description?.trim() || seeded.description,
  };
}

export function videoTeamBudgetMax(input: Pick<VideoTeamAnswers, "budgetBand" | "customBudget">): number | null {
  if (input.budgetBand === "custom") {
    return input.customBudget != null && input.customBudget > 0 ? input.customBudget : null;
  }
  const band = BUDGET_OPTIONS.find((option) => option.id === input.budgetBand);
  if (!band || band.max == null) return null;
  return band.max;
}

function ongoing(input: VideoTeamAnswers): boolean {
  return input.availability !== "one-off";
}

function scorePackage(id: string, input: VideoTeamAnswers): number {
  const usage = new Set(input.usage);
  const month = ongoing(input);
  let score = 1;

  if (id === "agent-intro-video") {
    score += month ? -4 : 6;
    if (input.camera === "shy") score += 3;
    if (input.goal === "keep-up") score += 2;
  }
  if (id === "business-baseline") {
    score += month ? 6 : -5;
    if (input.goal === "keep-up") score += 4;
    if (usage.has("social")) score += 2;
  }
  if (id === "business-growth-engine") {
    score += month ? 7 : -5;
    if (input.goal === "engagement") score += 4;
    if (input.goal === "revenue") score += 2;
    if (usage.has("social") || usage.has("ads")) score += 3;
  }
  if (id === "branding-content-partner") {
    score += month ? 8 : -3;
    if (input.goal === "revenue" || input.goal === "visibility") score += 3;
    if (input.availability === "yes-10" || input.availability === "one-two") score += 2;
    if (usage.has("social")) score += 2;
  }
  if (id === "branding-local-legend") {
    score += month ? 1 : 5;
    if (input.goal === "visibility") score += 5;
    if (input.goal === "revenue") score += 2;
    if (usage.has("web") || usage.has("ads")) score += 2;
  }
  if (id === "basic-reel") {
    if (input.goal === "engagement" || input.goal === "keep-up") score += 4;
    if (usage.has("social") || usage.has("event-recap")) score += 4;
    if (input.film === "listing" && usage.has("listing-mls") && !usage.has("social")) score -= 2;
    if ((input.goal === "visibility" || input.goal === "revenue") && input.film !== "event" && input.film !== "product") {
      score -= 2;
    }
  }
  if (id === "listing-essentials") {
    if (input.goal === "keep-up") score += 5;
    if (usage.has("listing-mls") || usage.has("social")) score += 3;
    if (input.film === "twilight-aerial") score += 2;
  }
  if (id === "basic-video") {
    if (usage.has("web") || usage.has("listing-mls")) score += 4;
    if (input.goal === "revenue") score += 2;
  }
  if (id === "listing-showcase") {
    if (input.goal === "revenue" || input.goal === "engagement") score += 4;
    if (usage.has("listing-mls")) score += 3;
    score += 1;
  }
  if (id === "red-carpet") {
    if (usage.has("social")) score += 3;
    if (input.goal === "engagement") score += 2;
  }
  if (id === "luxe-video") {
    if (usage.has("web") || usage.has("listing-mls")) score += 4;
    if (input.goal === "revenue" || input.goal === "visibility") score += 3;
  }
  if (id === "listing-legacy") {
    if (input.goal === "visibility" || input.goal === "revenue") score += 4;
    if (input.film === "twilight-aerial") score += 3;
    if (usage.has("web")) score += 2;
  }
  if (id === "aerial-premium") {
    if (input.film === "twilight-aerial") score += 8;
    if (input.goal === "visibility") score += 3;
    if (usage.has("web") || usage.has("ads")) score += 2;
  }
  if (id === "aerial-drone") {
    score += input.film === "twilight-aerial" ? 2 : -3;
  }
  if (id === "listing-market-leader") {
    if (input.goal === "visibility" || input.goal === "revenue") score += 3;
    if (usage.has("ads")) score += 3;
    if (input.goal === "keep-up") score -= 2;
  }
  if (input.film === "commercial" && month && (id === "branding-content-partner" || id === "business-growth-engine")) {
    score += 2;
  }
  return score;
}

function reasonFor(id: string, input: VideoTeamAnswers): string {
  const goal = optionLabel(GOAL_OPTIONS, input.goal).toLowerCase();
  if (id === "agent-intro-video") return `A short on-camera intro from the catalog. Fits a ${goal} goal without a full production day.`;
  if (id === "business-baseline") return "Monthly edited reels from the catalog. A steady cadence while the filming days stay light.";
  if (id === "business-growth-engine") return "Monthly reels with conversion-focused hooks from the catalog.";
  if (id === "branding-content-partner") return "A monthly filming session and 20 reels. The catalog price is for that content month.";
  if (id === "branding-local-legend") return "A one-day production with a 90-second film. The catalog price is for that day.";
  if (id === "basic-reel") return "A 15-second vertical reel from the catalog. It is the social cut, not a full production day.";
  if (id === "basic-video") return "A 60-second walkthrough from the catalog.";
  if (id === "listing-essentials") return "Listing photos plus the Snap Reel and a twilight render, at the catalog price.";
  if (id === "listing-showcase") return "The listing package with a Snap Reel and an animated reel, at the catalog price.";
  if (id === "red-carpet") return "Listing coverage with a social reel, at the catalog price.";
  if (id === "luxe-video") return "Listing coverage with a listing video, at the catalog price.";
  if (id === "listing-legacy") return "Cinematic listing film, aerial, and an on-camera intro, at the catalog price.";
  if (id === "listing-market-leader") return "Full-cycle listing media from the catalog, including the cinematic video.";
  if (id === "aerial-premium") return "The 90-second aerial film from the catalog.";
  if (id === "aerial-drone") return "Aerial stills from the catalog. This is photos, not a film.";
  return "Priced from the Iconic order catalog.";
}

function customCard(input: VideoTeamAnswers, retainer: boolean, reason: string): VideoTeamRecommendation {
  return {
    id: `custom-${input.film}`,
    catalogId: null,
    name: optionLabel(FILM_OPTIONS, input.film),
    price: null,
    priceLabel: retainer ? CUSTOM_RETAINER_LABEL : CUSTOM_PRODUCTION_LABEL,
    description: reason,
    features: [],
    bookingKind: "custom",
    customQuote: true,
    reason,
    primary: false,
  };
}

function studioCard(): VideoTeamRecommendation {
  const reason = "Studio Noir and Studio Blanc at Studio 105. The catalog confirms the rate when the hold is set.";
  return {
    id: "studio-105",
    catalogId: null,
    name: "Studio 105",
    price: null,
    priceLabel: STUDIO_RATE_LABEL,
    description: reason,
    features: ["Studio Noir", "Studio Blanc"],
    bookingKind: "custom",
    customQuote: true,
    reason,
    primary: false,
  };
}

function toRecommendation(item: Offered, input: VideoTeamAnswers): VideoTeamRecommendation {
  return {
    id: item.id,
    catalogId: item.id,
    name: item.name,
    price: item.price,
    priceLabel: money(item.price),
    description: item.description,
    features: item.features.slice(0, 3),
    bookingKind: item.bookingKind,
    customQuote: false,
    reason: reasonFor(item.id, input),
    primary: false,
  };
}

export function recommendVideoTeamPackages(
  input: VideoTeamAnswers,
  catalog?: VideoTeamCatalogRow[],
): VideoTeamRecommendation[] {
  const ceiling = videoTeamBudgetMax(input);
  const pool = POOLS[input.film];
  if (!pool) return [];
  const ranked = pool
    .map((id) => ({ id, score: scorePackage(id, input) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const fitted: VideoTeamRecommendation[] = [];
  for (const row of ranked) {
    const item = offerFromCatalog(row.id, catalog);
    if (!item) continue;
    if (ceiling != null && item.price > ceiling) continue;
    fitted.push(toRecommendation(item, input));
  }
  const withoutStills = fitted.filter((item) => item.id !== "aerial-drone");
  const priced = (withoutStills.length ? withoutStills : fitted).slice(0, 2);
  const month = ongoing(input);
  const retainer = month && input.film !== "listing" && input.film !== "twilight-aerial";
  const cards: VideoTeamRecommendation[] = [];

  if (input.film === "product" && input.placeKind === "studio") {
    cards.push(studioCard());
  } else if (input.film === "event") {
    cards.push(customCard(
      input,
      retainer,
      "Event coverage is quoted for the shoot. The catalog does not publish an event package price.",
    ));
  } else if (input.film === "product") {
    cards.push(customCard(
      input,
      retainer,
      "Product films are quoted to the shot list. The catalog does not publish a product-film price.",
    ));
  } else if (input.film === "custom") {
    cards.push(customCard(
      input,
      retainer,
      "This request is quoted to the job. A catalog package is listed only when its price fits.",
    ));
  } else if (priced.length === 0) {
    cards.push(customCard(
      input,
      retainer,
      "Nothing in the catalog fits this budget. We'll quote the film before any charge.",
    ));
  }

  cards.push(...priced);
  const seen = new Set<string>();
  return cards.filter((card) => {
    if (seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  }).slice(0, 3).map((card, index) => ({ ...card, primary: index === 0 }));
}

export function videoTeamWhereLine(input: Pick<VideoTeamAnswers, "placeKind" | "placeText">): string {
  if (input.placeKind === "studio") return "Studio 105";
  return input.placeText.trim();
}

export function videoTeamWhenLine(input: Pick<VideoTeamAnswers, "whenDate" | "whenText">): string {
  return [input.whenDate.trim(), input.whenText.trim()].filter(Boolean).join(" · ");
}

export function videoTeamBudgetLine(input: Pick<VideoTeamAnswers, "budgetBand" | "customBudget">): string {
  if (input.budgetBand === "custom" && input.customBudget != null) {
    return `Custom amount ${money(input.customBudget)}`;
  }
  return optionLabel(BUDGET_OPTIONS, input.budgetBand);
}

export function videoTeamAnswerNote(input: VideoTeamAnswers, pick: VideoTeamRecommendation): string {
  const film = input.film === "custom" && input.filmCustom.trim()
    ? `${optionLabel(FILM_OPTIONS, input.film)}: ${input.filmCustom.trim()}`
    : optionLabel(FILM_OPTIONS, input.film);
  const usage = input.usage.map((id) => optionLabel(USAGE_OPTIONS, id)).join(", ");
  return [
    "Video team inquiry.",
    `Film: ${film}.`,
    `Where: ${videoTeamWhereLine(input)}.`,
    `When: ${videoTeamWhenLine(input)}.`,
    `Use: ${usage}.`,
    `Budget: ${videoTeamBudgetLine(input)}.`,
    `Availability: ${optionLabel(AVAILABILITY_OPTIONS, input.availability)}.`,
    `On camera: ${optionLabel(CAMERA_OPTIONS, input.camera)}.`,
    `Goal: ${optionLabel(GOAL_OPTIONS, input.goal)}.`,
    `Recommended: ${pick.name} (${pick.priceLabel}).`,
  ].join(" ");
}

export function videoTeamCheckoutPath(input: {
  pick: VideoTeamRecommendation;
  name: string;
  email: string;
  phone: string;
  address: string;
  note: string;
}): string {
  const params = new URLSearchParams();
  params.set("utm_source", VIDEO_TEAM_SOURCE);
  if (input.pick.bookingKind === "service" && input.pick.catalogId) {
    params.set("service", input.pick.catalogId);
  } else if (input.pick.bookingKind === "addon" && input.pick.catalogId) {
    params.set("items", input.pick.catalogId);
  }
  const parts = input.name.trim().split(/\s+/).filter(Boolean);
  if (parts[0]) params.set("first", parts[0].slice(0, 80));
  if (parts.length > 1) params.set("last", parts.slice(1).join(" ").slice(0, 80));
  const clip = (value: string, max: number) => value.trim().slice(0, max);
  const email = clip(input.email, 120);
  const phone = clip(input.phone, 40);
  const address = clip(input.address, 180);
  const note = clip(input.note, 500);
  if (email) params.set("email", email);
  if (phone) params.set("phone", phone);
  if (address) params.set("address", address);
  if (note) params.set("note", note);
  return `/book?${params.toString()}`;
}

export function videoTeamBookingQuery(params: { get(name: string): string | null }): {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  vibeNote?: string;
} {
  const read = (key: string, max: number) => (params.get(key) || "").trim().slice(0, max);
  const patch: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: string;
    vibeNote?: string;
  } = {};
  const first = read("first", 80);
  const last = read("last", 80);
  const email = read("email", 120);
  const phone = read("phone", 40);
  const address = read("address", 180);
  const note = read("note", 500);
  if (first) patch.firstName = first;
  if (last) patch.lastName = last;
  if (email) patch.email = email;
  if (phone) patch.phone = phone;
  if (address) patch.address = address;
  if (note) patch.vibeNote = note;
  return patch;
}

export interface VideoTeamInquiryValue {
  name: string;
  email: string;
  phone: string;
  answers: VideoTeamAnswers;
  intent: "buy" | "call";
  packageId: string;
  slot: Pick<MikeCallSlot, "start" | "end" | "label" | "date" | "time"> | null;
}

export type VideoTeamInquiryParse =
  | { ok: true; value: VideoTeamInquiryValue }
  | { ok: false; error: string; honeypot?: boolean };

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : null;
}

function emailOk(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function parseVideoTeamInquiry(body: unknown, now = new Date()): VideoTeamInquiryParse {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (text(record.companyWebsite, 200)) {
    return { ok: false, error: "", honeypot: true };
  }

  const name = text(record.name, 120);
  const email = text(record.email, 120).toLowerCase();
  const phone = text(record.phone, 40);
  if (name.length < 2) return { ok: false, error: "Add your name." };
  if (!email && !phone) return { ok: false, error: "Add an email or a phone number." };
  if (email && !emailOk(email)) return { ok: false, error: "That email does not look right." };
  if (phone && phoneDigits(phone).length < 10) return { ok: false, error: "That phone number needs 10 digits." };

  const film = oneOf(record.film, FILM_OPTIONS.map((option) => option.id));
  const placeKind = oneOf(record.placeKind, PLACE_OPTIONS.map((option) => option.id));
  const budgetBand = oneOf(record.budgetBand, BUDGET_OPTIONS.map((option) => option.id));
  const availability = oneOf(record.availability, AVAILABILITY_OPTIONS.map((option) => option.id));
  const camera = oneOf(record.camera, CAMERA_OPTIONS.map((option) => option.id));
  const goal = oneOf(record.goal, GOAL_OPTIONS.map((option) => option.id));
  if (!film || !placeKind || !budgetBand || !availability || !camera || !goal) {
    return { ok: false, error: "Answer each question to continue." };
  }

  const filmCustom = text(record.filmCustom, 240);
  if (film === "custom" && filmCustom.length < 2) {
    return { ok: false, error: "Tell us what you want to film." };
  }
  const placeText = text(record.placeText, 180);
  if (placeKind === "location" && placeText.length < 4) {
    return { ok: false, error: "Add the filming address." };
  }
  const whenDate = text(record.whenDate, 10);
  const whenText = text(record.whenText, 160);
  if (whenDate && !/^\d{4}-\d{2}-\d{2}$/.test(whenDate)) {
    return { ok: false, error: "That date does not look right." };
  }
  if (!whenDate && whenText.length < 2) {
    return { ok: false, error: "Add a target date or a timeframe." };
  }

  const usageRaw = Array.isArray(record.usage) ? record.usage : [];
  const usage = [...new Set(usageRaw.map((item) => oneOf(item, USAGE_OPTIONS.map((option) => option.id))).filter((item): item is VideoUsageId => Boolean(item)))];
  if (!usage.length) return { ok: false, error: "Choose how you want the film used." };

  let customBudget: number | null = null;
  if (budgetBand === "custom") {
    const amount = typeof record.customBudget === "number" ? record.customBudget : Number(record.customBudget);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
      return { ok: false, error: "Add a budget amount." };
    }
    customBudget = Math.round(amount * 100) / 100;
  }

  const intent = record.intent === "call" ? "call" : record.intent === "buy" ? "buy" : null;
  if (!intent) return { ok: false, error: "Choose Buy Now or a call with Mike." };
  const packageId = text(record.packageId, 80);
  if (!packageId) return { ok: false, error: "Choose a recommended package." };

  let slot: VideoTeamInquiryValue["slot"] = null;
  if (intent === "call") {
    const slotRecord = record.slot && typeof record.slot === "object" ? record.slot as Record<string, unknown> : {};
    const start = text(slotRecord.start, 40);
    const end = text(slotRecord.end, 40);
    const label = text(slotRecord.label, 80);
    const date = text(slotRecord.date, 10);
    const time = text(slotRecord.time, 20);
    if (!mikeCallSlotBookable(start, end, now)) {
      return { ok: false, error: "Choose a weekday call time in Mike's 9–12 or 2–4 CT windows." };
    }
    slot = { start, end, label, date, time };
  }

  return {
    ok: true,
    value: {
      name,
      email,
      phone,
      intent,
      packageId,
      slot,
      answers: {
        film,
        filmCustom,
        placeKind,
        placeText,
        whenDate,
        whenText,
        usage,
        budgetBand,
        customBudget,
        availability,
        camera,
        goal,
      },
    },
  };
}

export function videoTeamInquiryLine(pick: VideoTeamRecommendation): {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  price: number;
} {
  if (pick.customQuote || pick.price == null) {
    return {
      id: pick.id,
      name: `${pick.name} (${pick.priceLabel})`,
      qty: 1,
      unitPrice: 0,
      price: 0,
    };
  }
  return {
    id: pick.catalogId || pick.id,
    name: pick.name,
    qty: 1,
    unitPrice: pick.price,
    price: pick.price,
  };
}

export { MIKE_CALL_PHOTOGRAPHER_ID };
