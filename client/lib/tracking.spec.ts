import { describe, expect, it, vi } from "vitest";
import {
  CONSENT_OPT_IN_REGIONS,
  consentForCountry,
  conversionForBooking,
  dispatchTracking,
  enhancedUserData,
  estimateValue,
  googleAdsSendTo,
  isIconicCallHref,
  isPublicSitePath,
  isStudioRequestPackage,
  planConsentUpdate,
  planConversion,
  planFirstLoad,
  planInstall,
  planPageView,
  readTrackingConfig,
  trackBookingSuccess,
  trackCallClick,
  trackContactSubmit,
  uetLoaderOptions,
  type TrackingConfig,
  type TrackingSinks,
} from "./tracking";

const FULL_ENV = {
  VITE_GA4_MEASUREMENT_ID: " G-TEST1234 ",
  VITE_GOOGLE_ADS_ID: "AW-999",
  VITE_GOOGLE_ADS_LABEL_BOOK_SUBMIT: "bookLabel",
  VITE_GOOGLE_ADS_LABEL_STUDIO_REQUEST: "studioLabel",
  VITE_GOOGLE_ADS_LABEL_CONTACT_SUBMIT: "contactLabel",
  VITE_GOOGLE_ADS_LABEL_CALL_CLICK: "callLabel",
  VITE_UET_TAG_ID: "12345678",
};

function config(overrides: Partial<TrackingConfig> = {}): TrackingConfig {
  return { ...readTrackingConfig(FULL_ENV), ...overrides };
}

function capture(): { gtag: ReturnType<typeof vi.fn>; uetq: { push: ReturnType<typeof vi.fn> }; sinks: TrackingSinks } {
  const gtag = vi.fn();
  const uetq = { push: vi.fn() };
  return { gtag, uetq, sinks: { gtag, uetq } };
}

describe("tracking config", () => {
  it("reads trimmed Vite ids and treats blanks as missing", () => {
    expect(readTrackingConfig(FULL_ENV)).toMatchObject({
      ga4MeasurementId: "G-TEST1234",
      googleAdsId: "AW-999",
      uetTagId: "12345678",
      adsLabels: {
        book_submit: "bookLabel",
        studio_request: "studioLabel",
        contact_submit: "contactLabel",
        call_click: "callLabel",
      },
    });
    expect(readTrackingConfig({})).toEqual({
      ga4MeasurementId: "",
      googleAdsId: "",
      uetTagId: "",
      adsLabels: {
        book_submit: "",
        studio_request: "",
        contact_submit: "",
        call_click: "",
      },
    });
    expect(readTrackingConfig({
      VITE_GA4_MEASUREMENT_ID: "   ",
      VITE_GOOGLE_ADS_ID: "AW 1",
      VITE_UET_TAG_ID: "12 34",
    }).ga4MeasurementId).toBe("");
    expect(readTrackingConfig({ VITE_GOOGLE_ADS_ID: "AW 1" }).googleAdsId).toBe("");
  });
});

describe("public routes", () => {
  it("tracks the public site and skips admin, portal, and photographer routes", () => {
    expect(isPublicSitePath("/")).toBe(true);
    expect(isPublicSitePath("/book")).toBe(true);
    expect(isPublicSitePath("/book?service=studio-noir")).toBe(true);
    expect(isPublicSitePath("/contact")).toBe(true);
    expect(isPublicSitePath("/studio")).toBe(true);
    expect(isPublicSitePath("/studio-105")).toBe(true);
    expect(isPublicSitePath("/pricing")).toBe(true);

    expect(isPublicSitePath("/admin")).toBe(false);
    expect(isPublicSitePath("/admin/photographer")).toBe(false);
    expect(isPublicSitePath("/admin/upload")).toBe(false);
    expect(isPublicSitePath("/admin/dashboard")).toBe(false);
    expect(isPublicSitePath("/portal")).toBe(false);
    expect(isPublicSitePath("/portal/home")).toBe(false);
    expect(isPublicSitePath("/portal/listings/abc")).toBe(false);
    expect(isPublicSitePath("/login")).toBe(false);
    expect(isPublicSitePath("/listing-cards")).toBe(false);
    expect(isPublicSitePath("/studio/listing-1")).toBe(false);
    expect(isPublicSitePath("/gallery/job-1")).toBe(false);
    expect(isPublicSitePath("/invoice/inv-1")).toBe(false);
    expect(isPublicSitePath("/present/token")).toBe(false);
    expect(isPublicSitePath("/gallery")).toBe(true);
  });
});

describe("consent defaults", () => {
  it("grants US visitors and denies EEA, UK, and Switzerland", () => {
    expect(consentForCountry("US")).toEqual({
      ad_storage: "granted",
      analytics_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
    });
    for (const region of ["DE", "FR", "GB", "CH"]) {
      expect(consentForCountry(region).ad_storage).toBe("denied");
      expect(consentForCountry(region).ad_user_data).toBe("denied");
      expect(consentForCountry(region).ad_personalization).toBe("denied");
      expect(consentForCountry(region).analytics_storage).toBe("denied");
    }
    expect(CONSENT_OPT_IN_REGIONS).toContain("DE");
    expect(CONSENT_OPT_IN_REGIONS).not.toContain("US");
  });

  it("builds a consent update a banner can send later", () => {
    expect(planConsentUpdate({ ad_storage: "denied", analytics_storage: "denied" })).toEqual([
      {
        target: "gtag",
        args: ["consent", "update", { ad_storage: "denied", analytics_storage: "denied" }],
      },
      { target: "uetq", args: ["consent", "update", { ad_storage: "denied" }] },
    ]);
    expect(planConsentUpdate({})).toEqual([]);
  });
});

describe("page views", () => {
  it("sends one manual page view per tag and disables the automatic first hit", () => {
    const calls = planFirstLoad(config(), {
      path: "/book",
      title: "Book",
      location: "https://iconicimagestx.vercel.app/book",
    });

    const gtagPageViews = calls.filter((call) => call.target === "gtag" && call.args[1] === "page_view");
    const uetPageViews = calls.filter((call) => call.target === "uetq" && call.args[1] === "page_view");
    expect(gtagPageViews).toHaveLength(2);
    expect(gtagPageViews.map((call) => (call.args[2] as { send_to: string }).send_to)).toEqual([
      "G-TEST1234",
      "AW-999",
    ]);
    expect(uetPageViews).toEqual([
      { target: "uetq", args: ["event", "page_view", { page_path: "/book", page_title: "Book" }] },
    ]);

    const configs = calls.filter((call) => call.target === "gtag" && call.args[0] === "config");
    expect(configs).toHaveLength(2);
    expect(configs.every((call) => (call.args[2] as { send_page_view: boolean }).send_page_view === false)).toBe(true);
    expect(calls.some((call) => call.args.includes("pageLoad"))).toBe(false);
    expect(uetLoaderOptions("12345678")).toMatchObject({
      ti: "12345678",
      enableAutoSpaTracking: false,
      disableAutoPageView: true,
    });
  });

  it("is a no-op when every id is missing", () => {
    expect(planInstall(readTrackingConfig({}))).toEqual([]);
    expect(planPageView(readTrackingConfig({}), { path: "/" })).toEqual([]);
  });
});

describe("conversion helpers", () => {
  it("maps a listing order to book_submit with package, estimate, and currency", () => {
    const planned = conversionForBooking({
      packageId: "listing-essentials",
      value: 249,
      email: " Ada@Example.com ",
      phone: "(281) 555-0100",
      transactionId: "req-1",
    });
    expect(planned.name).toBe("book_submit");
    expect(planned.value).toBe(249);
    expect(planned.currency).toBe("USD");

    const { gtag, uetq } = capture();
    trackBookingSuccess({
      packageId: "listing-essentials",
      value: 249,
      email: " Ada@Example.com ",
      phone: "(281) 555-0100",
      transactionId: "req-1",
    }, config(), { gtag, uetq });

    expect(gtag).toHaveBeenNthCalledWith(1, "set", "user_data", {
      email: "ada@example.com",
      phone_number: "+12815550100",
    });
    expect(gtag).toHaveBeenNthCalledWith(2, "event", "book_submit", {
      package_id: "listing-essentials",
      value: 249,
      currency: "USD",
      transaction_id: "req-1",
      send_to: "G-TEST1234",
    });
    expect(gtag).toHaveBeenNthCalledWith(3, "event", "conversion", {
      send_to: "AW-999/bookLabel",
      value: 249,
      currency: "USD",
      transaction_id: "req-1",
    });
    expect(uetq.push).toHaveBeenCalledWith("event", "book_submit", {
      event_category: "conversion",
      event_label: "listing-essentials",
      revenue_value: 249,
      currency: "USD",
      transaction_id: "req-1",
    });
    expect(JSON.stringify(uetq.push.mock.calls)).not.toContain("ada@example.com");
  });

  it("maps Studio Noir and Studio Blanc to studio_request", () => {
    expect(isStudioRequestPackage("studio-noir")).toBe(true);
    expect(isStudioRequestPackage("studio-blanc")).toBe(true);
    expect(isStudioRequestPackage("listing-essentials")).toBe(false);
    expect(conversionForBooking({ packageId: "studio-noir", value: 0 }).name).toBe("studio_request");
    expect(conversionForBooking({ packageId: "studio-blanc", value: 0 }).name).toBe("studio_request");

    const { gtag, uetq } = capture();
    trackBookingSuccess({
      packageId: "studio-blanc",
      value: 0,
      email: "studio@example.com",
    }, config(), { gtag, uetq });

    expect(gtag).toHaveBeenCalledWith("event", "studio_request", expect.objectContaining({
      package_id: "studio-blanc",
      value: 0,
      currency: "USD",
      send_to: "G-TEST1234",
    }));
    expect(gtag).toHaveBeenCalledWith("event", "conversion", expect.objectContaining({
      send_to: "AW-999/studioLabel",
      value: 0,
      currency: "USD",
    }));
    expect(uetq.push).toHaveBeenCalledWith("event", "studio_request", expect.objectContaining({
      event_label: "studio-blanc",
      revenue_value: 0,
      currency: "USD",
    }));
  });

  it("sends contact_submit with only the user_data fields the form has", () => {
    const { gtag, uetq } = capture();
    trackContactSubmit({ email: "a@b.co", phone: "" }, config(), { gtag, uetq });
    expect(gtag).toHaveBeenNthCalledWith(1, "set", "user_data", { email: "a@b.co" });
    expect(gtag).toHaveBeenCalledWith("event", "contact_submit", { send_to: "G-TEST1234" });
    expect(gtag).toHaveBeenCalledWith("event", "conversion", { send_to: "AW-999/contactLabel" });
    expect(uetq.push).toHaveBeenCalledWith("event", "contact_submit", { event_category: "conversion" });

    const phoneOnly = capture();
    trackContactSubmit({ email: "not-an-email", phone: "+44 20 7946 0958" }, config(), phoneOnly.sinks);
    expect(phoneOnly.gtag).toHaveBeenNthCalledWith(1, "set", "user_data", {
      phone_number: "+442079460958",
    });
  });

  it("fires call_click for the Iconic tel link and not for other taps", () => {
    expect(isIconicCallHref("tel:281-356-0965")).toBe(true);
    expect(isIconicCallHref("tel:+1-281-356-0965")).toBe(true);
    expect(isIconicCallHref(" tel:+12813560965 ")).toBe(true);
    expect(isIconicCallHref("tel:555-010-0000")).toBe(false);
    expect(isIconicCallHref("mailto:photos@iconicimagestx.com")).toBe(false);
    expect(isIconicCallHref(null)).toBe(false);

    const { gtag, uetq } = capture();
    trackCallClick(config(), { gtag, uetq });
    expect(gtag).not.toHaveBeenCalledWith("set", "user_data", expect.anything());
    expect(gtag).toHaveBeenCalledWith("event", "call_click", { send_to: "G-TEST1234" });
    expect(gtag).toHaveBeenCalledWith("event", "conversion", { send_to: "AW-999/callLabel" });
    expect(uetq.push).toHaveBeenCalledWith("event", "call_click", {
      event_category: "conversion",
      event_label: "281-356-0965",
    });
  });

  it("skips a destination when its id or label is missing", () => {
    const ga4Only = capture();
    trackBookingSuccess({
      packageId: "listing-essentials",
      value: "249",
      email: "a@b.co",
    }, readTrackingConfig({ VITE_GA4_MEASUREMENT_ID: "G-ONLY" }), ga4Only.sinks);
    expect(ga4Only.gtag.mock.calls.map((call) => call[0])).toEqual(["set", "event"]);
    expect(ga4Only.gtag).toHaveBeenCalledWith("event", "book_submit", expect.objectContaining({
      value: 249,
      currency: "USD",
      send_to: "G-ONLY",
    }));
    expect(ga4Only.uetq.push).not.toHaveBeenCalled();

    const adsOnly = capture();
    trackContactSubmit({ email: "a@b.co" }, readTrackingConfig({
      VITE_GOOGLE_ADS_ID: "AW-1",
      VITE_GOOGLE_ADS_LABEL_CONTACT_SUBMIT: "AW-1/alreadyFull",
    }), adsOnly.sinks);
    expect(adsOnly.gtag).toHaveBeenCalledWith("event", "conversion", {
      send_to: "AW-1/alreadyFull",
    });

    const unlabeled = capture();
    trackCallClick(readTrackingConfig({ VITE_GOOGLE_ADS_ID: "AW-1" }), unlabeled.sinks);
    expect(unlabeled.gtag).toHaveBeenCalledWith("event", "call_click", { send_to: "AW-1" });
    expect(unlabeled.gtag.mock.calls.some((call) => call[1] === "conversion")).toBe(false);
  });

  it("does nothing and stays quiet when ids are missing or a tag throws", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { gtag, uetq } = capture();
    const empty = readTrackingConfig(null);

    expect(() => trackBookingSuccess({
      packageId: "listing-essentials",
      value: 249,
    }, empty, { gtag, uetq })).not.toThrow();
    expect(() => trackContactSubmit({ email: "a@b.co" }, empty, { gtag, uetq })).not.toThrow();
    expect(() => trackCallClick(empty, { gtag, uetq })).not.toThrow();
    expect(gtag).not.toHaveBeenCalled();
    expect(uetq.push).not.toHaveBeenCalled();

    expect(() => dispatchTracking(
      planConversion(config(), { name: "book_submit", packageId: "listing-essentials", value: 249, currency: "USD" }),
      { gtag: () => { throw new Error("tag failed"); } },
    )).not.toThrow();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    error.mockRestore();
    warn.mockRestore();
    log.mockRestore();
  });

  it("keeps estimate numbers and drops user_data the form does not have", () => {
    expect(estimateValue(249)).toBe(249);
    expect(estimateValue("249.5")).toBe(249.5);
    expect(estimateValue(0)).toBe(0);
    expect(estimateValue("")).toBeUndefined();
    expect(estimateValue("nope")).toBeUndefined();
    expect(enhancedUserData({ email: "  ", phone: "123" })).toBeUndefined();
    expect(googleAdsSendTo("AW-9", "label")).toBe("AW-9/label");
  });
});
