import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { MoneyAmount } from "@/components/MoneyAmount";
import ApprenticeLiveSlotPicker, { type LiveSlotState } from "@/components/ApprenticeLiveSlotPicker";
import PropertyAddressField from "@/components/PropertyAddressField";
import { trackConversion } from "@/lib/tracking";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import { APPRENTICESHIP_OVERAGE_LABEL } from "@shared/bookingCatalog";
import {
  APPRENTICESHIP_BALANCE_LINE,
  APPRENTICESHIP_BOOKING_FEE,
  APPRENTICESHIP_BOOKING_FEE_LINE,
  APPRENTICESHIP_DEPOSIT_REQUIRED_LINE,
} from "@shared/apprenticeship";
import type { PickedServiceLocation } from "@shared/serviceLocation";
import {
  RE75_LEAD_SOURCE,
  RE75_OUTSIDE_MESSAGE,
  RE75_PACKAGES,
  RE75_PATHS,
  RE75_GALLERY_CAPTION,
  RE75_GALLERY_DISCLAIMER,
  RE75_TRAVEL_TBD_NOTE,
  classifyRealEstate75Area,
  isRealEstate75PackageId,
  realEstate75Package,
  realEstate75Quote,
  sanitizeGclid,
  withGclid,
  type RealEstate75Area,
  type RealEstate75Package,
  type RealEstate75PackageId,
} from "@shared/realestate75";

const GCLID_KEY = "re75-gclid";
const DRAFT_KEY = "re75-booking-draft";
const CONVERSION_PREFIX = "re75-conversion-";
const HERO_ALT = "25 listing photos for $75, 20-minute shoot by Iconic apprentices";
/** Where /realestate-75 is embedded. Return from Square lands on /realestate-75/schedule?booking=received. */
const RETURN_PAGE = "realestate-75";
/** Wix parent site. Links that leave this landing page open there, not inside the embed. */
const MAIN_SITE = "https://www.iconicimagestx.com";

/** Twelve listing photos, in file order. Cities come from the shoot notes. Unknown cities stay off the alt text. */
const LISTING_GALLERY = [
  { file: "01-front-exterior-spring", alt: "Front exterior of a Spring listing", height: 1069 },
  { file: "02-front-exterior-new-country-dr", alt: "Front exterior of a listing home", height: 1067 },
  { file: "03-front-exterior-stetson-heights", alt: "Front exterior of a listing home", height: 1068 },
  { file: "04-kitchen-cypress", alt: "Kitchen at a Cypress listing", height: 1069 },
  { file: "05-kitchen-new-country-dr", alt: "Kitchen at a listing home", height: 1066 },
  { file: "06-living-room-spring", alt: "Living room at a Spring listing", height: 1069 },
  { file: "07-dining-room-spring", alt: "Dining room at a Spring listing", height: 1069 },
  { file: "08-primary-bedroom-jessica-rose", alt: "Primary bedroom at a Spring listing", height: 1067 },
  { file: "09-primary-bath-spring", alt: "Primary bathroom at a Spring listing", height: 1069 },
  { file: "10-pool-backyard-spring", alt: "Pool and backyard at a Spring listing", height: 1069 },
  { file: "11-covered-patio-stetson-heights", alt: "Covered patio at a listing home", height: 1068 },
  { file: "12-backyard-patio-jessica-rose", alt: "Backyard patio at a Spring listing", height: 1067 },
].map((item) => ({
  src: `/realestate-75/gallery/${item.file}.jpg`,
  webp: `/realestate-75/gallery/${item.file}.webp`,
  avif: `/realestate-75/gallery/${item.file}.avif`,
  alt: item.alt,
  width: 1600,
  height: item.height,
}));

interface Draft {
  packageId: RealEstate75PackageId;
  address: string;
  servicePlace: PickedServiceLocation | null;
  sqft: string;
  occupancy: string;
  slotDate: string;
  /** ISO start of an open slot from /api/apprenticeship/slots. */
  slotStart: string;
  /** Only when the apprentice calendar cannot be read. */
  preferredTime: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  brokerage: string;
}

const EMPTY_DRAFT: Draft = {
  packageId: "apprentice-25",
  address: "",
  servicePlace: null,
  sqft: "",
  occupancy: "",
  slotDate: "",
  slotStart: "",
  preferredTime: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  brokerage: "",
};

function readDraft(): Draft {
  if (typeof sessionStorage === "undefined") return EMPTY_DRAFT;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "") as Partial<Draft>;
    const packageId = isRealEstate75PackageId(parsed.packageId) ? parsed.packageId : EMPTY_DRAFT.packageId;
    const servicePlace = parsed.servicePlace && parsed.servicePlace.placeId && parsed.servicePlace.formatted
      ? parsed.servicePlace
      : null;
    const slotStart = typeof parsed.slotStart === "string" ? parsed.slotStart : "";
    const preferredTime = typeof parsed.preferredTime === "string" ? parsed.preferredTime : "";
    return { ...EMPTY_DRAFT, ...parsed, packageId, servicePlace, slotStart, preferredTime };
  } catch {
    return EMPTY_DRAFT;
  }
}

function appointmentLabel(pkg: RealEstate75Package): string {
  return pkg.durationMinutes === 60 ? "1 hour" : `${pkg.durationMinutes} minutes`;
}

/** Saved order waiting on the $25 booking fee. */
interface DepositStep {
  orderNumber: string;
  checkoutUrl: string;
  error: string;
  slotLabel: string;
  packageId: RealEstate75PackageId;
}

/**
 * Square checkout cannot run inside the Wix embed. Leave the frame when we
 * are allowed to; otherwise the Pay button (new tab) is the way through.
 */
function openCheckout(url: string) {
  try {
    if (window.top && window.top !== window) {
      window.top.location.href = url;
      return;
    }
  } catch {
    return;
  }
  window.location.assign(url);
}

export const re75CheckoutNavigation = { open: openCheckout };

function sectionId(pathname: string): string {
  if (pathname.endsWith("/schedule")) return "schedule";
  if (pathname.endsWith("/samples")) return "samples";
  if (pathname.endsWith("/how-it-works")) return "how-it-works";
  return "";
}

function fieldClass() {
  return "mt-2 w-full min-h-12 rounded-xl border border-neutral-300 bg-white px-4 text-base text-neutral-950 outline-none focus:border-black";
}

export default function RealEstate75() {
  const location = useLocation();
  const [gclid, setGclid] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [processingOn, setProcessingOn] = useState(true);
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState<DepositStep | null>(null);
  const [slotState, setSlotState] = useState<LiveSlotState>({ available: null, slots: [], fallback: "" });
  const [slotReload, setSlotReload] = useState(0);
  const [website, setWebsite] = useState("");
  const feeReceived = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("booking") === "received" ? (params.get("order") || "").slice(0, 20) || "received" : "";
  }, [location.search]);
  const [hydrated, setHydrated] = useState(false);
  const [barHidden, setBarHidden] = useState(false);
  const [scheduleVisible, setScheduleVisible] = useState(false);
  const formStarted = useRef(false);
  const pkg = realEstate75Package(draft.packageId);
  const quote = useMemo(() => realEstate75Quote(processingOn, pkg.id), [processingOn, pkg.id]);
  const area = useMemo(() => classifyRealEstate75Area(draft.address), [draft.address]);

  useEffect(() => {
    const fromUrl = sanitizeGclid(new URLSearchParams(location.search).get("gclid") || "");
    const stored = sanitizeGclid(sessionStorage.getItem(GCLID_KEY) || "");
    const next = fromUrl || stored;
    if (next) sessionStorage.setItem(GCLID_KEY, next);
    setGclid(next);
  }, [location.search]);

  useEffect(() => {
    setDraft(readDraft());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const fromUrl = new URLSearchParams(location.search).get("package");
    if (!isRealEstate75PackageId(fromUrl)) return;
    setDraft((current) => (
      current.packageId === fromUrl
        ? current
        : { ...current, packageId: fromUrl, slotStart: "" }
    ));
  }, [hydrated, location.search]);

  useEffect(() => {
    if (!hydrated || confirmation) return;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, hydrated, confirmation]);

  useEffect(() => {
    const id = sectionId(location.pathname);
    const timer = window.setTimeout(() => {
      if (!id) return;
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bookings/catalog")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { processingEnabled?: boolean } | null) => {
        if (!cancelled && typeof data?.processingEnabled === "boolean") setProcessingOn(data.processingEnabled);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (area.status !== "inside") return;
    if (!formStarted.current && !sessionStorage.getItem("re75-form-start")) {
      formStarted.current = true;
      sessionStorage.setItem("re75-form-start", "1");
      trackConversion({ name: "re75_form_start", packageId: draft.packageId });
    }
  }, [area.status, draft.packageId]);

  useEffect(() => {
    if (!confirmation) return;
    const bookingId = confirmation.orderNumber || "";
    if (!bookingId) return;
    const key = `${CONVERSION_PREFIX}${bookingId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    const booked = realEstate75Package(confirmation.packageId);
    trackConversion({
      name: "re75_booking",
      packageId: booked.id,
      value: booked.subtotal,
      currency: "USD",
      transactionId: bookingId,
      email: draft.email,
      phone: draft.phone,
    });
  }, [confirmation, draft.email, draft.phone]);

  useEffect(() => {
    if (window.parent === window) return;
    const post = () => {
      const height = Math.ceil(document.documentElement.scrollHeight);
      window.parent.postMessage({ source: "realestate-75", type: "iconic-embed-height", height }, "*");
    };
    post();
    const observer = new ResizeObserver(post);
    observer.observe(document.documentElement);
    window.addEventListener("resize", post);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", post);
    };
  }, [confirmation, draft.packageId]);

  useEffect(() => {
    const root = document.documentElement;
    const previousPadding = root.style.scrollPaddingBottom;
    const previousBody = document.body.style.paddingBottom;
    const query = window.matchMedia("(max-width: 767px)");
    const apply = () => {
      const reserve = query.matches ? "6rem" : "";
      root.style.scrollPaddingBottom = reserve;
      document.body.style.paddingBottom = reserve;
    };
    apply();
    query.addEventListener("change", apply);
    return () => {
      query.removeEventListener("change", apply);
      root.style.scrollPaddingBottom = previousPadding;
      document.body.style.paddingBottom = previousBody;
    };
  }, []);

  useEffect(() => {
    const node = document.getElementById("schedule");
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setScheduleVisible(entry.isIntersecting),
      { threshold: 0.08 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [confirmation]);

  useEffect(() => {
    const onFocus = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const field = target.closest("input, textarea, select, button");
      setBarHidden(Boolean(field && target.closest("#schedule form")));
    };
    const onBlur = () => {
      window.setTimeout(() => {
        const active = document.activeElement;
        const field = active instanceof HTMLElement && active.closest("input, textarea, select, button");
        const inForm = active instanceof HTMLElement && active.closest("#schedule form");
        setBarHidden(Boolean(field && inForm));
      }, 0);
    };
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
    };
  }, []);

  function href(path: string) {
    return withGclid(path, gclid);
  }

  function scheduleHref(packageId: RealEstate75PackageId) {
    return href(`${RE75_PATHS.schedule}?package=${packageId}`);
  }

  function patch(partial: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  async function submitBooking(event: FormEvent) {
    event.preventDefault();
    const current = classifyRealEstate75Area(draft.address);
    if (current.status !== "inside") {
      setFormError(current.message);
      return;
    }
    const sqft = Number(draft.sqft.replace(/,/g, ""));
    if (!Number.isFinite(sqft) || sqft < 200 || sqft > 20000) {
      setFormError("Enter an approximate square footage between 200 and 20,000.");
      return;
    }
    if (!draft.occupancy) {
      setFormError("Tell us if the home is occupied, vacant, or a lease.");
      return;
    }
    const calendarOpen = slotState.available === true;
    const slot = calendarOpen ? slotState.slots.find((item) => item.start === draft.slotStart) || null : null;
    if (slotState.available === null) {
      setFormError("Still checking open times. Try again in a moment.");
      return;
    }
    if (calendarOpen && !slot) {
      setFormError("Choose an open date and time.");
      return;
    }
    if (!calendarOpen && draft.preferredTime.trim().length < 3) {
      setFormError("Tell us a preferred day and time.");
      return;
    }
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setFormError("Enter the agent's first and last name.");
      return;
    }
    if (!draft.email.includes("@") || draft.email.includes(" ")) {
      setFormError("Enter an email address.");
      return;
    }
    if (draft.phone.replace(/\D/g, "").length < 10) {
      setFormError("Enter a phone number.");
      return;
    }
    if (!draft.brokerage.trim()) {
      setFormError("Enter the brokerage.");
      return;
    }
    setPending(true);
    setFormError("");
    try {
      const response = await fetch("/api/apprenticeship/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: pkg.id,
          firstName: draft.firstName.trim(),
          lastName: draft.lastName.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          address: draft.address.trim(),
          slotStart: slot ? slot.start : "",
          preferredTime: slot ? "" : draft.preferredTime.trim(),
          website,
          returnPage: RETURN_PAGE,
          gclid,
          details: [
            `Page: /realestate-75`,
            `Brokerage: ${draft.brokerage.trim()}`,
            `Home: ${draft.occupancy}`,
            `Approx sq ft: ${draft.sqft.trim()}`,
            current.travelFee === "tbd" ? RE75_TRAVEL_TBD_NOTE : "",
          ].filter(Boolean).join("\n"),
        }),
      });
      const data = await response.json().catch(() => null) as {
        success?: boolean;
        orderNumber?: string;
        invoiceId?: string;
        payToken?: string;
        checkoutReady?: boolean;
        error?: string;
      } | null;
      if (response.status === 409) setSlotReload((value) => value + 1);
      if (!response.ok || !data?.success) {
        setFormError(data?.error || `We could not save that booking. Please call ${BUSINESS_CONTACT.phoneDisplay}.`);
        return;
      }
      let checkoutUrl = "";
      let payError = "";
      if (data.checkoutReady && data.invoiceId && data.payToken) {
        const checkout = await fetch(`/api/payments/invoice/${encodeURIComponent(data.invoiceId)}/deposit-checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ t: data.payToken }),
        });
        const payment = await checkout.json().catch(() => null) as { checkoutUrl?: string; error?: string } | null;
        if (checkout.ok && payment?.checkoutUrl && /^https:\/\//.test(payment.checkoutUrl)) checkoutUrl = payment.checkoutUrl;
        else payError = payment?.error || "";
      }
      setConfirmation({
        orderNumber: data.orderNumber || "",
        checkoutUrl,
        error: checkoutUrl ? "" : payError || `Call ${BUSINESS_CONTACT.phoneDisplay} to pay the $25 booking fee and lock in your time.`,
        slotLabel: slot ? slot.label : draft.preferredTime.trim(),
        packageId: pkg.id,
      });
      sessionStorage.removeItem(DRAFT_KEY);
      if (checkoutUrl) re75CheckoutNavigation.open(checkoutUrl);
    } catch {
      setFormError(`We could not save that booking. Please call ${BUSINESS_CONTACT.phoneDisplay}.`);
    } finally {
      setPending(false);
    }
  }

  return (
      <div className="overflow-x-clip bg-white text-neutral-950">
        <Hero scheduleHref={scheduleHref} processingOn={processingOn} />
        <OfferCards scheduleHref={scheduleHref} processingOn={processingOn} />
        <NeedMore gclid={gclid} />
        <OfferCta scheduleHref={scheduleHref} />
        <Benefits />
        <WhatYouGet processingOn={processingOn} />
        <OfferCta scheduleHref={scheduleHref} />
        <HowItWorks />
        <OfferCta scheduleHref={scheduleHref} />
        <ListingGallery />
        <OfferCta scheduleHref={scheduleHref} />
        <Faq processingOn={processingOn} />
        <NeedMore gclid={gclid} />
        <Schedule
          draft={draft}
          pkg={pkg}
          area={area}
          formError={formError}
          quote={quote}
          pending={pending}
          confirmation={confirmation}
          feeReceived={feeReceived}
          slotReload={slotReload}
          onSlotState={setSlotState}
          website={website}
          onWebsite={setWebsite}
          onSubmit={submitBooking}
          onPatch={patch}
        />
        <FinalCta scheduleHref={scheduleHref} processingOn={processingOn} />
        <ReviewsSlot />
        <PageContact />
        <MobileBar to={scheduleHref(draft.packageId)} hidden={barHidden || scheduleVisible} />
      </div>
  );
}

function OfferCta({ scheduleHref }: { scheduleHref: (packageId: RealEstate75PackageId) => string }) {
  return (
    <div className="px-4 md:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 border-t border-neutral-200 py-8 sm:flex-row">
        <Link
          to={scheduleHref("apprentice-25")}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-black px-5 text-base font-semibold text-white hover:bg-neutral-800"
        >
          Schedule from $75
        </Link>
        <a
          href={BUSINESS_CONTACT.phoneHref}
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-neutral-300 px-5 text-base font-semibold text-neutral-950 hover:bg-neutral-50"
        >
          Call {BUSINESS_CONTACT.phoneDisplay}
        </a>
      </div>
    </div>
  );
}

function Hero({
  scheduleHref,
  processingOn,
}: {
  scheduleHref: (packageId: RealEstate75PackageId) => string;
  processingOn: boolean;
}) {
  const starter = realEstate75Quote(processingOn, "apprentice-25");
  const upgrade = realEstate75Quote(processingOn, "apprentice-50");
  return (
    <section>
      <div className="mx-auto w-full max-w-[1200px]">
        <Link to={scheduleHref("apprentice-25")} className="block" aria-label="Schedule the $75 shoot">
          <img
            src="/realestate-75-hero.png"
            alt={HERO_ALT}
            width={1200}
            height={628}
            fetchPriority="high"
            className="block h-auto w-full"
          />
        </Link>
      </div>
      <div className="mx-auto max-w-3xl px-4 pt-4 md:px-8">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            to={scheduleHref("apprentice-25")}
            className="inline-flex min-h-14 flex-1 items-center justify-center rounded-xl bg-black px-6 text-lg font-semibold text-white hover:bg-neutral-800"
          >
            Schedule from $75
          </Link>
          <a
            href={BUSINESS_CONTACT.phoneHref}
            className="inline-flex min-h-14 items-center justify-center rounded-xl border border-neutral-300 px-6 text-lg font-semibold text-neutral-950 hover:bg-neutral-50"
          >
            Call {BUSINESS_CONTACT.phoneDisplay}
          </a>
        </div>
        <h1 className="mt-8 text-4xl font-black leading-[1.05] tracking-tight text-neutral-950 sm:text-5xl">
          Listing Photos From $75
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-neutral-700">
          Two apprentice options. 25 photos in 20 minutes, or 50 photos in 1 hour. Made for listing refreshes, relists and lease listings in The Woodlands, Spring, Conroe, Willis and Cypress.
        </p>
        <p className="mt-4 text-base font-semibold text-neutral-950">From $75. {starter.priceLine} Or {upgrade.priceLine}</p>
        <ul className="mt-5 flex flex-wrap gap-2">
          {["From $75", "25 or 50 photos", "20 minutes or 1 hour", "Shot by Iconic apprentices", "Photos only"].map((item) => (
            <li key={item} className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm font-semibold text-neutral-800">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function OfferCards({
  scheduleHref,
  processingOn,
}: {
  scheduleHref: (packageId: RealEstate75PackageId) => string;
  processingOn: boolean;
}) {
  return (
    <section id="offers" className="px-4 py-14 md:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Pick a package</h2>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-neutral-700">
          From $75. Same apprentices and the same photos-only rules. Choose the option that fits the house.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {RE75_PACKAGES.map((item) => {
            const quote = realEstate75Quote(processingOn, item.id);
            return (
              <article
                key={item.id}
                data-testid={`offer-${item.id}`}
                className={`flex flex-col rounded-2xl p-6 ${item.nudge ? "border border-neutral-300 bg-neutral-50" : "border-2 border-black bg-white"}`}
              >
                <p className="min-h-6 text-sm font-bold uppercase tracking-[0.14em] text-[#0d9488]">
                  {item.nudge ?? "25 photos"}
                </p>
                <h3 className="mt-3 text-5xl font-black tracking-tight">${item.subtotal}</h3>
                <p className="mt-2 text-xl font-semibold">{item.photos} photos · {appointmentLabel(item)}</p>
                <p className="mt-3 text-neutral-800">{item.name}</p>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">{quote.priceLine}</p>
                <Link
                  to={scheduleHref(item.id)}
                  className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-black px-5 text-base font-semibold text-white hover:bg-neutral-800"
                >
                  Schedule · ${item.subtotal}
                </Link>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function NeedMore({ gclid }: { gclid: string }) {
  return (
    <section className="px-4 pb-4 md:px-8">
      <div className="mx-auto max-w-6xl rounded-2xl border border-neutral-200 bg-neutral-50 p-6 md:p-8">
        <h2 className="text-3xl font-black tracking-tight">Need more?</h2>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-neutral-700">
          Aerials, video, twilight, and full-service packages are the regular Iconic services. These apprentice options are photos only.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a
            href={withGclid(`${MAIN_SITE}/pricing`, gclid)}
            target="_top"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-black px-5 text-base font-semibold text-white hover:bg-neutral-800"
          >
            See pricing
          </a>
          <a
            href={withGclid(`${MAIN_SITE}/book`, gclid)}
            target="_top"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-neutral-300 bg-white px-5 text-base font-semibold text-neutral-950 hover:bg-neutral-50"
          >
            Book full service
          </a>
        </div>
      </div>
    </section>
  );
}

function Benefits() {
  const items = [
    {
      title: "A current look for the listing",
      body: "Use it for a refresh, a relist, or a lease when the old photos no longer match the home.",
    },
    {
      title: "Buyers can see the home first",
      body: "Listing photos are what a buyer looks at before they ask for a showing.",
    },
    {
      title: "Twenty minutes, or one hour",
      body: "25 photos is a 20-minute appointment. 50 photos is 1 hour. Have the home ready when we arrive.",
    },
    {
      title: "25 or 50 edited photos",
      body: "You get the edited photos in the option you schedule. Pick an open time and the $25 booking fee locks it in.",
    },
  ];
  return (
    <section className="px-4 py-14 md:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Built for a listing that needs photos now</h2>
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <li key={item.title} className="rounded-2xl border border-neutral-200 p-5">
              <h3 className="text-lg font-bold text-neutral-950">{item.title}</h3>
              <p className="mt-2 leading-relaxed text-neutral-700">{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function WhatYouGet({ processingOn }: { processingOn: boolean }) {
  const starter = realEstate75Quote(processingOn, "apprentice-25");
  const upgrade = realEstate75Quote(processingOn, "apprentice-50");
  const items = [
    ["From $75", "25 photos for $75, or 50 photos for $125. Photos only."],
    ["Two appointment lengths", `20 minutes for 25 photos. 1 hour for 50 photos. Overages are ${APPRENTICESHIP_OVERAGE_LABEL}.`],
    ["Service area", "The Woodlands, Spring, Conroe, Willis, and Cypress."],
    ["Price", `${starter.priceLine} ${upgrade.priceLine}`],
  ];
  return (
    <section className="border-t border-neutral-200 px-4 py-14 md:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">What you get</h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {items.map(([title, body]) => (
            <li key={title} className="rounded-2xl bg-neutral-50 p-5">
              <h3 className="text-lg font-bold">{title}</h3>
              <p className="mt-2 leading-relaxed text-neutral-700">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    "Pick 25 photos or 50 photos, pick an open time, and pay the $25 booking fee to lock it in.",
    "Have the home prepped. Lights on, clutter put away, ready when we arrive.",
    "The apprentice shoots for 20 minutes (25 photos) or 1 hour (50 photos). You get the edited photos for that option.",
  ];
  return (
    <section id="how-it-works" className="scroll-mt-4 border-t border-neutral-200 px-4 py-14 md:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">How it works</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step} className="rounded-2xl border border-neutral-200 p-5">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#0d9488]">Step {index + 1}</p>
              <p className="mt-2 text-lg leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
        <ul className="mt-8 max-w-3xl space-y-2 leading-relaxed text-neutral-700">
          <li>Photos only. No extra trips. No extra edits. Be prepped.</li>
          <li>Overages are {APPRENTICESHIP_OVERAGE_LABEL}.</li>
          <li>Apprentice photos aren&apos;t eligible for Iconic Polish.</li>
          <li>Apprentices are learning. Graduates become vetted Iconic shooters.</li>
        </ul>
      </div>
    </section>
  );
}

function ListingGallery() {
  const [index, setIndex] = useState<number | null>(null);
  const count = LISTING_GALLERY.length;
  const photo = index == null ? null : LISTING_GALLERY[index];

  useEffect(() => {
    if (index == null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIndex(null);
      if (event.key === "ArrowRight") setIndex((current) => (current == null ? current : (current + 1) % count));
      if (event.key === "ArrowLeft") setIndex((current) => (current == null ? current : (current - 1 + count) % count));
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [index, count]);

  return (
    <section id="samples" className="scroll-mt-4 border-t border-neutral-200 bg-neutral-50 px-4 py-14 md:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Listing photos</h2>
        <p className="mt-3 text-lg text-neutral-700">{RE75_GALLERY_CAPTION}</p>
        <ul className="mt-8 columns-1 gap-4 sm:columns-2 lg:columns-3">
          {LISTING_GALLERY.map((item, photoIndex) => (
            <li key={item.src} className="mb-4 break-inside-avoid">
              <button
                type="button"
                className="block w-full overflow-hidden rounded-2xl bg-white text-left"
                onClick={() => setIndex(photoIndex)}
                aria-label={`Open photo: ${item.alt}`}
              >
                <picture>
                  <source type="image/avif" srcSet={item.avif} />
                  <source type="image/webp" srcSet={item.webp} />
                  <img
                    src={item.src}
                    alt={item.alt}
                    width={item.width}
                    height={item.height}
                    loading="lazy"
                    className="h-auto w-full"
                  />
                </picture>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-3xl text-base leading-relaxed text-neutral-800">{RE75_GALLERY_DISCLAIMER}</p>
      </div>
      {photo && index != null ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={RE75_GALLERY_CAPTION}
        >
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Close photo" onClick={() => setIndex(null)} />
          <div className="relative z-10 w-full max-w-5xl">
            <img src={photo.src} alt={photo.alt} className="max-h-[78vh] w-full object-contain" />
            <p className="mt-3 text-center text-sm text-white">{RE75_GALLERY_CAPTION}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button type="button" className="min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-black" onClick={() => setIndex((index - 1 + count) % count)}>Previous</button>
              <button type="button" className="min-h-11 rounded-xl border border-white/50 px-4 text-sm font-semibold text-white" onClick={() => setIndex(null)}>Close</button>
              <button type="button" className="min-h-11 rounded-xl bg-white px-4 text-sm font-semibold text-black" onClick={() => setIndex((index + 1) % count)}>Next</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Faq({ processingOn }: { processingOn: boolean }) {
  const starter = realEstate75Quote(processingOn, "apprentice-25");
  const upgrade = realEstate75Quote(processingOn, "apprentice-50");
  const items = [
    {
      q: "Who takes the photos?",
      a: "Iconic Images apprentices. They are learning. Graduates become vetted Iconic shooters.",
    },
    {
      q: "What is included, and what is not?",
      a: `25 edited photos from a 20-minute appointment, or 50 edited photos from a 1-hour appointment. Photos only. No extra trips, no extra edits, and no Iconic Polish. Overages are ${APPRENTICESHIP_OVERAGE_LABEL}. Aerials, video, twilight, and full-service packages are on the regular Iconic services.`,
    },
    {
      q: "How should the home be prepped?",
      a: "Lights on, clutter put away, and the home ready when we arrive. We do not make an extra trip if it is not ready.",
    },
    {
      q: "Where do you shoot, and is there a travel fee?",
      a: `The Woodlands, Spring, and Conroe are included. ${RE75_TRAVEL_TBD_NOTE} Anywhere else: ${RE75_OUTSIDE_MESSAGE}.`,
    },
    {
      q: "When do I pay?",
      a: `A $25 booking fee by card when you schedule. It is credited toward your package, and your time is confirmed once it is paid. ${starter.priceLine} ${upgrade.priceLine} The balance is invoiced after the shoot.`,
    },
    {
      q: "Can I reschedule?",
      a: `Call or email us as soon as you need to move or cancel the shoot so we can adjust the calendar. If weather, access, or safety prevents the shoot, we will work with you to reschedule. ${BUSINESS_CONTACT.phoneDisplay} · ${BUSINESS_CONTACT.email}`,
    },
  ];
  return (
    <section className="border-t border-neutral-200 px-4 py-14 md:px-8">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Questions</h2>
        <div className="mt-6 divide-y divide-neutral-200 border-y border-neutral-200">
          {items.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="cursor-pointer list-none text-lg font-bold marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-start justify-between gap-4">
                  {item.q}
                  <span className="text-neutral-400 group-open:hidden" aria-hidden="true">+</span>
                  <span className="hidden text-neutral-400 group-open:inline" aria-hidden="true">–</span>
                </span>
              </summary>
              <p className="mt-3 leading-relaxed text-neutral-700">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Schedule(props: {
  draft: Draft;
  pkg: RealEstate75Package;
  area: RealEstate75Area;
  formError: string;
  quote: ReturnType<typeof realEstate75Quote>;
  pending: boolean;
  confirmation: DepositStep | null;
  feeReceived: string;
  slotReload: number;
  onSlotState: (state: LiveSlotState) => void;
  website: string;
  onWebsite: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onPatch: (partial: Partial<Draft>) => void;
}) {
  const { draft, confirmation, area, pkg } = props;
  const balance = Math.max(0, Math.round((props.quote.total - APPRENTICESHIP_BOOKING_FEE) * 100) / 100);
  return (
    <section id="schedule" className="scroll-mt-4 border-t border-neutral-200 px-4 py-14 md:px-8">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Schedule your shoot</h2>
        <p className="mt-3 text-lg text-neutral-700">{pkg.name}. {pkg.photos} photos · {appointmentLabel(pkg)}. {props.quote.priceLine}</p>
        {props.feeReceived ? (
          <p data-testid="re75-fee-received" className="mt-6 rounded-2xl bg-neutral-950 px-5 py-4 text-base leading-relaxed text-white">
            Booking fee received{props.feeReceived !== "received" ? ` for order ${props.feeReceived}` : ""}. Your shoot is confirmed. {APPRENTICESHIP_BALANCE_LINE}
          </p>
        ) : null}
        {confirmation ? (
          <div className="mt-8 rounded-2xl border-2 border-black p-6" data-testid="re75-deposit-step">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#0d9488]">Step 2 of 2 · Booking fee</p>
            <h3 className="mt-2 text-2xl font-black">
              {confirmation.checkoutUrl ? "One step left: the $25 booking fee." : "Your time is on hold."}
            </h3>
            <p className="mt-3 leading-relaxed text-neutral-800">
              {confirmation.orderNumber ? `Order ${confirmation.orderNumber}. ` : ""}
              {realEstate75Package(confirmation.packageId).name}
              {confirmation.slotLabel ? ` · ${confirmation.slotLabel}` : ""}. Photographed by an Iconic Images apprentice.
            </p>
            <p className="mt-2 font-semibold text-neutral-950">{APPRENTICESHIP_DEPOSIT_REQUIRED_LINE}</p>
            {confirmation.checkoutUrl ? (
              <>
                <a
                  href={confirmation.checkoutUrl}
                  target="_blank"
                  rel="noopener"
                  data-testid="re75-pay-fee"
                  className="mt-5 inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-black px-5 text-lg font-semibold text-white hover:bg-neutral-800"
                >
                  Pay $25 booking fee
                </a>
                <p className="mt-3 text-sm leading-relaxed text-neutral-700">
                  Secure card checkout by Square. {APPRENTICESHIP_BOOKING_FEE_LINE}. Balance after the shoot: ${balance.toFixed(2)}.
                </p>
              </>
            ) : (
              <p className="mt-4 font-semibold text-red-700">{confirmation.error}</p>
            )}
            <p className="mt-4 text-sm text-neutral-700">
              Questions? <a href={BUSINESS_CONTACT.phoneHref} className="font-semibold underline underline-offset-4">{BUSINESS_CONTACT.phoneDisplay}</a>
            </p>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={props.onSubmit}>
            <fieldset>
              <legend className="text-sm font-semibold">Package</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {RE75_PACKAGES.map((item) => (
                  <label
                    key={item.id}
                    className={`flex min-h-14 cursor-pointer flex-col justify-center rounded-xl border px-4 py-3 ${draft.packageId === item.id ? "border-black bg-black text-white" : "border-neutral-300"}`}
                  >
                    <input
                      type="radio"
                      name="package"
                      value={item.id}
                      checked={draft.packageId === item.id}
                      onChange={() => props.onPatch({
                        packageId: item.id,
                        slotStart: "",
                      })}
                      className="sr-only"
                    />
                    <span className="font-semibold">${item.subtotal} · {item.photos} photos</span>
                    <span className={`text-sm ${draft.packageId === item.id ? "text-white/80" : "text-neutral-600"}`}>
                      {appointmentLabel(item)}{item.nudge ? ` · ${item.nudge}` : ""}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label className="block text-sm font-semibold" htmlFor="re75-address">Property address</label>
              <PropertyAddressField
                id="re75-address"
                value={draft.address}
                onChange={({ address, place }) => props.onPatch({ address, servicePlace: place })}
                className={`${fieldClass()} scroll-mb-28`}
              />
              {area.status === "inside" ? (
                <p className="mt-3 text-sm text-neutral-700">
                  {area.city}
                  {area.travelFee === "tbd" ? `. ${RE75_TRAVEL_TBD_NOTE}` : ". Travel is included with this package."}
                </p>
              ) : null}
              {area.status === "outside" && draft.address.trim().length >= 5 ? (
                <p className="mt-3 text-sm font-semibold" data-testid="re75-outside">
                  <a href={BUSINESS_CONTACT.phoneHref} className="underline underline-offset-4">{RE75_OUTSIDE_MESSAGE}</a>
                </p>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <div>
                <label className="block text-sm font-semibold" htmlFor="re75-sqft">Approximate square feet</label>
                <input
                  id="re75-sqft"
                  inputMode="numeric"
                  value={draft.sqft}
                  onChange={(event) => props.onPatch({ sqft: event.target.value })}
                  className={`${fieldClass()} scroll-mb-28`}
                />
              </div>
              <fieldset>
                <legend className="text-sm font-semibold">Occupied, vacant, or lease</legend>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {["Occupied", "Vacant", "Lease"].map((option) => (
                    <label key={option} className={`flex min-h-12 items-center justify-center rounded-xl border px-2 text-sm font-semibold ${draft.occupancy === option ? "border-black bg-black text-white" : "border-neutral-300"}`}>
                      <input
                        type="radio"
                        name="occupancy"
                        value={option}
                        checked={draft.occupancy === option}
                        onChange={() => props.onPatch({ occupancy: option })}
                        className="sr-only"
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <ApprenticeLiveSlotPicker
              packageId={pkg.id}
              durationMinutes={pkg.durationMinutes}
              date={draft.slotDate}
              slotStart={draft.slotStart}
              preferredTime={draft.preferredTime}
              reloadKey={props.slotReload}
              onState={props.onSlotState}
              onChange={({ date, slotStart, preferredTime }) => props.onPatch({ slotDate: date, slotStart, preferredTime })}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                First name
                <input value={draft.firstName} onChange={(event) => props.onPatch({ firstName: event.target.value })} className={`${fieldClass()} scroll-mb-28`} autoComplete="given-name" />
              </label>
              <label className="block text-sm font-semibold">
                Last name
                <input value={draft.lastName} onChange={(event) => props.onPatch({ lastName: event.target.value })} className={`${fieldClass()} scroll-mb-28`} autoComplete="family-name" />
              </label>
              <label className="block text-sm font-semibold sm:col-span-2">
                Email
                <input type="email" value={draft.email} onChange={(event) => props.onPatch({ email: event.target.value })} className={`${fieldClass()} scroll-mb-28`} autoComplete="email" />
              </label>
              <label className="block text-sm font-semibold">
                Phone
                <input type="tel" value={draft.phone} onChange={(event) => props.onPatch({ phone: event.target.value })} className={`${fieldClass()} scroll-mb-28`} autoComplete="tel" />
              </label>
              <label className="block text-sm font-semibold" htmlFor="re75-brokerage">
                Brokerage
                <input id="re75-brokerage" value={draft.brokerage} onChange={(event) => props.onPatch({ brokerage: event.target.value })} className={`${fieldClass()} scroll-mb-28`} />
              </label>
            </div>
            <input
              name="website"
              value={props.website}
              onChange={(event) => props.onWebsite(event.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px] h-0 w-0"
            />
            <div className="space-y-3 rounded-2xl border border-neutral-200 p-5" data-testid="re75-summary">
              <h3 className="text-xl font-black">{pkg.name}</h3>
              <p className="text-sm text-neutral-700">{pkg.photos} photos · {appointmentLabel(pkg)}</p>
              <p className="flex items-center justify-between gap-4">
                <span>Package</span>
                <MoneyAmount>${props.quote.subtotal.toFixed(2)}</MoneyAmount>
              </p>
              {props.quote.processing > 0 ? (
                <p className="flex items-center justify-between gap-4">
                  <span>Processing (2.8%)</span>
                  <MoneyAmount>${props.quote.processing.toFixed(2)}</MoneyAmount>
                </p>
              ) : null}
              <p className="flex items-center justify-between gap-4 text-lg font-black">
                <span>Total by card</span>
                <MoneyAmount>${props.quote.total.toFixed(2)}</MoneyAmount>
              </p>
              <div className="rounded-xl bg-neutral-950 p-4 text-white" data-testid="re75-deposit-due">
                <p className="flex items-center justify-between gap-4 text-lg font-black">
                  <span>Due now: booking fee</span>
                  <span>${APPRENTICESHIP_BOOKING_FEE.toFixed(2)}</span>
                </p>
                <p className="mt-1 flex items-center justify-between gap-4 text-sm text-white/80">
                  <span>Balance after the shoot</span>
                  <span>${balance.toFixed(2)}</span>
                </p>
                <p className="mt-2 text-sm leading-relaxed text-white/80">
                  {APPRENTICESHIP_BOOKING_FEE_LINE}. Secure card checkout by Square. {APPRENTICESHIP_DEPOSIT_REQUIRED_LINE}
                </p>
              </div>
              {area.status === "inside" && area.travelFee === "tbd" ? (
                <p className="text-sm leading-relaxed text-neutral-700">{RE75_TRAVEL_TBD_NOTE}</p>
              ) : (
                <p className="text-sm leading-relaxed text-neutral-700">Travel is included for The Woodlands, Spring, and Conroe.</p>
              )}
            </div>
            {props.formError ? <p className="text-sm font-semibold text-red-700" role="alert">{props.formError}</p> : null}
            <button type="submit" disabled={props.pending} className="min-h-14 w-full rounded-xl bg-black px-5 text-lg font-semibold text-white disabled:opacity-60">
              {props.pending ? "Booking…" : "Book & pay $25 booking fee"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function FinalCta({
  scheduleHref,
  processingOn,
}: {
  scheduleHref: (packageId: RealEstate75PackageId) => string;
  processingOn: boolean;
}) {
  const starter = realEstate75Quote(processingOn, "apprentice-25");
  const upgrade = realEstate75Quote(processingOn, "apprentice-50");
  return (
    <section className="border-t border-neutral-200 bg-neutral-950 px-4 py-16 text-white md:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-black tracking-tight sm:text-5xl">Schedule from $75</h2>
        <p className="mt-4 text-lg text-neutral-200">{starter.priceLine}</p>
        <p className="mt-2 text-lg text-neutral-200">{upgrade.priceLine}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            to={scheduleHref("apprentice-25")}
            className="inline-flex min-h-14 items-center justify-center rounded-xl bg-white px-8 text-lg font-semibold text-black hover:bg-neutral-200"
          >
            Schedule · $75
          </Link>
          <Link
            to={scheduleHref("apprentice-50")}
            className="inline-flex min-h-14 items-center justify-center rounded-xl border border-white/40 px-8 text-lg font-semibold text-white hover:bg-white/10"
          >
            Schedule · $125
          </Link>
          <a
            href={BUSINESS_CONTACT.phoneHref}
            className="inline-flex min-h-14 items-center justify-center rounded-xl border border-white/40 px-8 text-lg font-semibold text-white hover:bg-white/10"
          >
            Call {BUSINESS_CONTACT.phoneDisplay}
          </a>
        </div>
      </div>
    </section>
  );
}

function ReviewsSlot() {
  return (
    <section id="reviews" hidden data-review-slot="awaiting-real-reviews">
      <h2>Client reviews</h2>
      <p>Hidden until real client reviews are added. Do not invent testimonials, counts, stars, or guarantees.</p>
    </section>
  );
}

function PageContact() {
  return (
    <footer className="border-t border-neutral-200 px-4 py-10 text-center text-sm leading-relaxed text-neutral-700 md:px-8">
      <p>
        {LEGAL_BUSINESS_NAME}
        {" · "}
        {BUSINESS_CONTACT.address}
        {" · "}
        <a href={BUSINESS_CONTACT.phoneHref} className="font-semibold underline underline-offset-4">{BUSINESS_CONTACT.phoneDisplay}</a>
        {" · "}
        <a href={BUSINESS_CONTACT.emailHref} className="font-semibold underline underline-offset-4">{BUSINESS_CONTACT.email}</a>
      </p>
    </footer>
  );
}

function MobileBar({ to, hidden }: { to: string; hidden: boolean }) {
  if (hidden) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.06)] md:hidden">
      <div className="mx-auto flex max-w-lg gap-2">
        <Link
          to={to}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-black px-3 text-sm font-semibold text-white"
        >
          Schedule
        </Link>
        <a
          href={BUSINESS_CONTACT.phoneHref}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-neutral-300 px-3 text-sm font-semibold text-neutral-950"
        >
          Call
        </a>
      </div>
    </div>
  );
}
