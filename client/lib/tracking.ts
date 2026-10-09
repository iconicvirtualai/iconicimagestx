/**
 * Public-site ad and analytics tags (GA4, Google Ads, Microsoft UET).
 *
 * IDs are read from Vite public env vars. A missing or blank ID skips that
 * tag or conversion. This module never logs and never throws.
 *
 * Page views are manual. gtag config uses send_page_view: false, and UET is
 * loaded with disableAutoPageView plus enableAutoSpaTracking off, so the
 * first load is one page view per tag rather than an automatic hit plus a
 * route hit.
 *
 * Consent Mode v2 defaults to granted for US visitors. EEA, UK, and
 * Switzerland stay denied until a banner calls updateTrackingConsent().
 * The site has no consent banner today.
 *
 * Admin, portal, login, photographer, and other non-public routes are ignored.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { services } from "./services";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    uetq?: { push: (...args: unknown[]) => unknown } | unknown[];
    UET?: new (options: Record<string, unknown>) => { push: (...args: unknown[]) => unknown };
  }
}

export const TRACKING_EVENTS = [
  "book_submit",
  "studio_request",
  "contact_submit",
  "call_click",
] as const;

export type TrackingEventName = (typeof TRACKING_EVENTS)[number];

export type ConsentState = "granted" | "denied";

export type ConsentSignals = {
  ad_storage: ConsentState;
  analytics_storage: ConsentState;
  ad_user_data: ConsentState;
  ad_personalization: ConsentState;
};

/** ISO codes where Consent Mode stays denied until a banner updates it. */
export const CONSENT_OPT_IN_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH",
] as const;

const GRANTED_CONSENT: ConsentSignals = {
  ad_storage: "granted",
  analytics_storage: "granted",
  ad_user_data: "granted",
  ad_personalization: "granted",
};

const DENIED_CONSENT: ConsentSignals = {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
};

const CONSENT_KEYS: (keyof ConsentSignals)[] = [
  "ad_storage",
  "analytics_storage",
  "ad_user_data",
  "ad_personalization",
];

/** Studio 105 rooms. A successful request for one of these is studio_request. */
export const STUDIO_REQUEST_IDS = services
  .filter((service) => service.category === "studio")
  .map((service) => service.id);

const STUDIO_REQUEST_ID_SET = new Set(STUDIO_REQUEST_IDS);

const ICONIC_CALL_DIGITS = new Set(["2813560965", "12813560965"]);

const PRIVATE_PREFIXES = ["/admin", "/portal", "/login", "/listing-cards", "/invoice", "/present"];

export type TrackingEnv = {
  VITE_GA4_MEASUREMENT_ID?: string;
  VITE_GOOGLE_ADS_ID?: string;
  VITE_GOOGLE_ADS_LABEL_BOOK_SUBMIT?: string;
  VITE_GOOGLE_ADS_LABEL_STUDIO_REQUEST?: string;
  VITE_GOOGLE_ADS_LABEL_CONTACT_SUBMIT?: string;
  VITE_GOOGLE_ADS_LABEL_CALL_CLICK?: string;
  VITE_UET_TAG_ID?: string;
};

export type TrackingConfig = {
  ga4MeasurementId: string;
  googleAdsId: string;
  uetTagId: string;
  adsLabels: Record<TrackingEventName, string>;
};

export type TagCall = {
  target: "gtag" | "uetq";
  args: unknown[];
};

export type TrackingSinks = {
  gtag?: (...args: unknown[]) => void;
  uetq?: { push: (...args: unknown[]) => unknown } | unknown[];
};

export type PageViewInput = {
  path: string;
  title?: string;
  location?: string;
};

export type ConversionInput = {
  name: TrackingEventName;
  packageId?: string;
  value?: number;
  currency?: string;
  email?: string;
  phone?: string;
  transactionId?: string;
};

type GtagFn = (...args: unknown[]) => void;

let booted = false;
let consentOverride: Partial<ConsentSignals> | null = null;

function cleanToken(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || !/^[A-Za-z0-9_-]+$/.test(trimmed)) return "";
  return trimmed;
}

/** A conversion label, or the full AW-XXXX/label value copied from Google. */
function cleanAdsLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (/^AW-[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;
  return cleanToken(trimmed);
}

export function readTrackingConfig(env: Partial<TrackingEnv> | null | undefined): TrackingConfig {
  const source = env ?? {};
  return {
    ga4MeasurementId: cleanToken(source.VITE_GA4_MEASUREMENT_ID),
    googleAdsId: cleanToken(source.VITE_GOOGLE_ADS_ID),
    uetTagId: cleanToken(source.VITE_UET_TAG_ID),
    adsLabels: {
      book_submit: cleanAdsLabel(source.VITE_GOOGLE_ADS_LABEL_BOOK_SUBMIT),
      studio_request: cleanAdsLabel(source.VITE_GOOGLE_ADS_LABEL_STUDIO_REQUEST),
      contact_submit: cleanAdsLabel(source.VITE_GOOGLE_ADS_LABEL_CONTACT_SUBMIT),
      call_click: cleanAdsLabel(source.VITE_GOOGLE_ADS_LABEL_CALL_CLICK),
    },
  };
}

function currentConfig(): TrackingConfig {
  return readTrackingConfig(import.meta.env as Partial<TrackingEnv>);
}

export function normalizePathname(pathname: string | null | undefined): string {
  const raw = String(pathname || "/").split("?")[0].split("#")[0] || "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  if (withSlash.length > 1 && withSlash.endsWith("/")) return withSlash.slice(0, -1);
  return withSlash || "/";
}

function hasPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Marketing and other public pages only.
 * Skips admin, portal, photographer (/admin/photographer, /admin/upload),
 * and client-only links that carry a private id.
 */
export function isPublicSitePath(pathname: string | null | undefined): boolean {
  const path = normalizePathname(pathname);
  if (PRIVATE_PREFIXES.some((prefix) => hasPrefix(path, prefix))) return false;
  if (/^\/studio\/[^/]+/.test(path)) return false;
  if (/^\/gallery\/[^/]+/.test(path)) return false;
  return true;
}

export function isStudioRequestPackage(packageId: string | null | undefined): boolean {
  return STUDIO_REQUEST_ID_SET.has(String(packageId || "").trim());
}

export function isIconicCallHref(href: string | null | undefined): boolean {
  if (typeof href !== "string") return false;
  const trimmed = href.trim();
  if (!/^tel:/i.test(trimmed)) return false;
  const beforeParams = trimmed.replace(/^tel:/i, "").split(/[?;]/)[0] || "";
  const digits = beforeParams.replace(/\D/g, "");
  return ICONIC_CALL_DIGITS.has(digits);
}

export function estimateValue(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.round(numeric * 100) / 100;
}

/** E.164 when the form value is a usable phone. Otherwise omit it. */
export function toE164Phone(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (trimmed.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return "";
}

export function enhancedUserData(input: {
  email?: string | null;
  phone?: string | null;
} | null | undefined): { email?: string; phone_number?: string } | undefined {
  if (!input) return undefined;
  const data: { email?: string; phone_number?: string } = {};
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (email.includes("@") && !email.includes(" ")) data.email = email;
  const phone = toE164Phone(input.phone);
  if (phone) data.phone_number = phone;
  return data.email || data.phone_number ? data : undefined;
}

export function consentDefaultCommands(): Array<Record<string, unknown>> {
  return [
    { ...DENIED_CONSENT, region: [...CONSENT_OPT_IN_REGIONS] },
    { ...GRANTED_CONSENT, region: ["US"] },
    { ...GRANTED_CONSENT },
  ];
}

/** Region-specific command wins over the unscoped US-site fallback. */
export function consentForCountry(countryCode: string): ConsentSignals {
  const code = countryCode.trim().toUpperCase();
  if ((CONSENT_OPT_IN_REGIONS as readonly string[]).includes(code)) return { ...DENIED_CONSENT };
  return { ...GRANTED_CONSENT };
}

export function uetLoaderOptions(tagId: string, queued?: unknown): Record<string, unknown> {
  return {
    ti: tagId,
    q: Array.isArray(queued) ? queued : [],
    enableAutoSpaTracking: false,
    disableAutoPageView: true,
  };
}

export function googleAdsSendTo(adsId: string, label: string): string {
  const trimmed = label.trim();
  if (trimmed.startsWith("AW-") && trimmed.includes("/")) return trimmed;
  return `${adsId}/${trimmed}`;
}

function pagePath(path: string): string {
  const trimmed = (path || "/").trim() || "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function planInstall(config: TrackingConfig): TagCall[] {
  const calls: TagCall[] = [];
  if (config.ga4MeasurementId || config.googleAdsId) {
    for (const command of consentDefaultCommands()) {
      calls.push({ target: "gtag", args: ["consent", "default", command] });
    }
    if (config.ga4MeasurementId) {
      calls.push({
        target: "gtag",
        args: ["config", config.ga4MeasurementId, { send_page_view: false }],
      });
    }
    if (config.googleAdsId) {
      calls.push({
        target: "gtag",
        args: ["config", config.googleAdsId, { send_page_view: false }],
      });
    }
  }
  if (config.uetTagId) {
    calls.push({
      target: "uetq",
      args: ["consent", "default", { ad_storage: "granted" }],
    });
  }
  return calls;
}

export function planPageView(config: TrackingConfig, page: PageViewInput): TagCall[] {
  const path = pagePath(page.path);
  const params: Record<string, string> = { page_path: path };
  const title = page.title?.trim();
  const location = page.location?.trim();
  if (title) params.page_title = title;
  if (location) params.page_location = location;

  const calls: TagCall[] = [];
  if (config.ga4MeasurementId) {
    calls.push({
      target: "gtag",
      args: ["event", "page_view", { ...params, send_to: config.ga4MeasurementId }],
    });
  }
  if (config.googleAdsId) {
    calls.push({
      target: "gtag",
      args: ["event", "page_view", { ...params, send_to: config.googleAdsId }],
    });
  }
  if (config.uetTagId) {
    const uetParams: Record<string, string> = { page_path: path };
    if (title) uetParams.page_title = title;
    calls.push({ target: "uetq", args: ["event", "page_view", uetParams] });
  }
  return calls;
}

/** Install commands plus the one manual page view used on the first load. */
export function planFirstLoad(config: TrackingConfig, page: PageViewInput): TagCall[] {
  return [...planInstall(config), ...planPageView(config, page)];
}

export function conversionForBooking(input: {
  packageId?: string | null;
  value?: unknown;
  currency?: string | null;
  email?: string | null;
  phone?: string | null;
  transactionId?: string | null;
}): ConversionInput {
  const packageId = String(input.packageId || "").trim();
  const value = estimateValue(input.value);
  return {
    name: isStudioRequestPackage(packageId) ? "studio_request" : "book_submit",
    packageId: packageId || undefined,
    value,
    currency: value === undefined ? undefined : (input.currency || "USD").trim() || "USD",
    email: input.email || undefined,
    phone: input.phone || undefined,
    transactionId: String(input.transactionId || "").trim() || undefined,
  };
}

export function planConversion(config: TrackingConfig, input: ConversionInput): TagCall[] {
  const params: Record<string, unknown> = {};
  const packageId = input.packageId?.trim();
  if (packageId) params.package_id = packageId;
  if (input.value !== undefined) {
    params.value = input.value;
    params.currency = input.currency?.trim() || "USD";
  }
  const transactionId = input.transactionId?.trim();
  if (transactionId) params.transaction_id = transactionId;

  const userData = input.name === "call_click"
    ? undefined
    : enhancedUserData({ email: input.email, phone: input.phone });

  const calls: TagCall[] = [];
  const googleReady = Boolean(config.ga4MeasurementId || config.googleAdsId);
  if (googleReady && userData) {
    calls.push({ target: "gtag", args: ["set", "user_data", userData] });
  }

  if (config.ga4MeasurementId) {
    calls.push({
      target: "gtag",
      args: ["event", input.name, { ...params, send_to: config.ga4MeasurementId }],
    });
  }

  const label = config.adsLabels[input.name];
  if (config.googleAdsId && label) {
    const conversion: Record<string, unknown> = {
      send_to: googleAdsSendTo(config.googleAdsId, label),
    };
    if (input.value !== undefined) {
      conversion.value = input.value;
      conversion.currency = input.currency?.trim() || "USD";
    }
    if (transactionId) conversion.transaction_id = transactionId;
    calls.push({ target: "gtag", args: ["event", "conversion", conversion] });
  } else if (config.googleAdsId && !config.ga4MeasurementId) {
    calls.push({
      target: "gtag",
      args: ["event", input.name, { ...params, send_to: config.googleAdsId }],
    });
  }

  if (config.uetTagId) {
    const uet: Record<string, unknown> = { event_category: "conversion" };
    if (packageId) uet.event_label = packageId;
    if (input.name === "call_click") uet.event_label = "281-356-0965";
    if (input.value !== undefined) {
      uet.revenue_value = input.value;
      uet.currency = input.currency?.trim() || "USD";
    }
    if (transactionId) uet.transaction_id = transactionId;
    calls.push({ target: "uetq", args: ["event", input.name, uet] });
  }

  return calls;
}

export function planConsentUpdate(update: Partial<ConsentSignals>): TagCall[] {
  const next: Partial<ConsentSignals> = {};
  for (const key of CONSENT_KEYS) {
    const value = update[key];
    if (value === "granted" || value === "denied") next[key] = value;
  }
  if (Object.keys(next).length === 0) return [];
  const calls: TagCall[] = [{ target: "gtag", args: ["consent", "update", next] }];
  if (next.ad_storage) {
    calls.push({ target: "uetq", args: ["consent", "update", { ad_storage: next.ad_storage }] });
  }
  return calls;
}

export function dispatchTracking(calls: TagCall[], sinks: TrackingSinks | null | undefined): void {
  if (!calls.length || !sinks) return;
  try {
    for (const call of calls) {
      if (call.target === "gtag") {
        sinks.gtag?.(...call.args);
        continue;
      }
      const queue = sinks.uetq as { push?: (...args: unknown[]) => unknown } | undefined;
      if (queue && typeof queue.push === "function") {
        queue.push(...call.args);
      }
    }
  } catch {
    // A broken tag must not affect the page.
  }
}

function liveSinks(): TrackingSinks {
  if (typeof window === "undefined") return {};
  return {
    gtag: typeof window.gtag === "function" ? window.gtag : undefined,
    uetq: window.uetq as TrackingSinks["uetq"],
  };
}

function ensureGtag(): GtagFn {
  const win = window as Window & { dataLayer?: unknown[]; gtag?: GtagFn };
  win.dataLayer = win.dataLayer || [];
  if (typeof win.gtag !== "function") {
    win.gtag = function gtag() {
      win.dataLayer!.push(arguments);
    };
  }
  return win.gtag;
}

function installTags(config: TrackingConfig): void {
  const calls = planInstall(config);
  if (config.ga4MeasurementId || config.googleAdsId) {
    const gtag = ensureGtag();
    dispatchTracking(calls.filter((call) => call.target === "gtag" && call.args[0] === "consent"), { gtag });
    gtag("js", new Date());
    dispatchTracking(calls.filter((call) => call.target === "gtag" && call.args[0] === "config"), { gtag });
    if (consentOverride) {
      dispatchTracking(planConsentUpdate(consentOverride), { gtag, uetq: window.uetq as TrackingSinks["uetq"] });
    }
    if (!document.getElementById("iconic-gtag")) {
      const id = config.ga4MeasurementId || config.googleAdsId;
      const script = document.createElement("script");
      script.id = "iconic-gtag";
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
      document.head.appendChild(script);
    }
  }

  if (config.uetTagId && !document.getElementById("iconic-uet")) {
    window.uetq = window.uetq || [];
    dispatchTracking(calls.filter((call) => call.target === "uetq"), { uetq: window.uetq });
    if (consentOverride?.ad_storage && Array.isArray(window.uetq)) {
      window.uetq.push("consent", "update", { ad_storage: consentOverride.ad_storage });
    }
    const tagId = config.uetTagId;
    const script = document.createElement("script");
    script.id = "iconic-uet";
    script.async = true;
    script.src = "https://bat.bing.com/bat.js";
    script.onload = () => {
      const UETCtor = window.UET;
      if (typeof UETCtor !== "function") return;
      const queued = window.uetq;
      try {
        const uet = new UETCtor(uetLoaderOptions(tagId, queued));
        window.uetq = uet;
        // Flush commands queued before bat.js loaded. disableAutoPageView
        // drops this automatic pageLoad, so it does not add a second page view.
        uet.push("pageLoad");
      } catch {
        // Leave the queued commands in place. The page still works.
      }
    };
    document.head.appendChild(script);
  }
}

export function bootPublicTracking(pathname: string): void {
  if (!isPublicSitePath(pathname) || booted) return;
  if (typeof document === "undefined" || !document.head) return;
  booted = true;
  try {
    installTags(currentConfig());
  } catch {
    booted = false;
  }
}

export function trackPageView(
  page: PageViewInput,
  config: TrackingConfig = currentConfig(),
  sinks: TrackingSinks = liveSinks(),
): void {
  dispatchTracking(planPageView(config, page), sinks);
}

export function trackConversion(
  input: ConversionInput,
  config: TrackingConfig = currentConfig(),
  sinks: TrackingSinks = liveSinks(),
): void {
  dispatchTracking(planConversion(config, input), sinks);
}

export function trackBookingSuccess(
  input: {
    packageId?: string | null;
    value?: unknown;
    currency?: string | null;
    email?: string | null;
    phone?: string | null;
    transactionId?: string | null;
  },
  config: TrackingConfig = currentConfig(),
  sinks: TrackingSinks = liveSinks(),
): void {
  trackConversion(conversionForBooking(input), config, sinks);
}

export function trackContactSubmit(
  input: { email?: string | null; phone?: string | null } | null | undefined,
  config: TrackingConfig = currentConfig(),
  sinks: TrackingSinks = liveSinks(),
): void {
  trackConversion({
    name: "contact_submit",
    email: input?.email || undefined,
    phone: input?.phone || undefined,
  }, config, sinks);
}

export function trackCallClick(
  config: TrackingConfig = currentConfig(),
  sinks: TrackingSinks = liveSinks(),
): void {
  trackConversion({ name: "call_click" }, config, sinks);
}

/**
 * Banner hook. Call this when a visitor accepts or rejects cookies.
 * No-op when the update is empty. Safe to call before tags load.
 */
export function updateTrackingConsent(update: Partial<ConsentSignals>): void {
  const calls = planConsentUpdate(update);
  if (!calls.length) return;
  const next = calls[0].args[2] as Partial<ConsentSignals>;
  consentOverride = { ...consentOverride, ...next };
  // Defaults are installed first. An earlier banner choice is applied then,
  // so it is not pushed onto the queue before those defaults.
  if (!booted || typeof window === "undefined") return;
  dispatchTracking(calls, liveSinks());
}

export function bindPublicCallClicks(
  doc: Document | undefined = typeof document === "undefined" ? undefined : document,
): () => void {
  if (!doc) return () => {};
  const onClick = (event: Event) => {
    if (typeof window === "undefined" || !isPublicSitePath(window.location.pathname)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const href = target.closest("a")?.getAttribute("href");
    if (!isIconicCallHref(href)) return;
    trackCallClick();
  };
  doc.addEventListener("click", onClick);
  return () => doc.removeEventListener("click", onClick);
}

/** Router hook. Mount once inside BrowserRouter. Renders nothing. */
export function PublicSiteTracking() {
  const location = useLocation();

  useEffect(() => {
    if (!isPublicSitePath(location.pathname)) return;
    bootPublicTracking(location.pathname);
    const path = `${location.pathname}${location.search}`;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    trackPageView({
      path,
      title: typeof document !== "undefined" ? document.title : "",
      location: origin ? `${origin}${path}` : undefined,
    });
  }, [location.pathname, location.search]);

  useEffect(() => bindPublicCallClicks(), []);

  return null;
}
