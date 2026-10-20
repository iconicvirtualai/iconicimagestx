import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Layout from "@/components/Layout";
import { MoneyAmount } from "@/components/MoneyAmount";
import { BookingConfirmation } from "@/components/BookingConfirmation";
import { createOrder } from "@/lib/createOrder";
import { readClientNotificationsLive, type BookingSubmitResult } from "@/lib/bookingFollowUp";
import { trackConversion } from "@/lib/tracking";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import { APPRENTICESHIP_OVERAGE_LABEL } from "@shared/bookingCatalog";
import {
  RE75_DURATION_MINUTES,
  RE75_LEAD_SOURCE,
  RE75_OUTSIDE_MESSAGE,
  RE75_PACKAGE_ID,
  RE75_PACKAGE_NAME,
  RE75_PATHS,
  RE75_SAMPLES_CAPTION,
  RE75_TRAVEL_TBD_NOTE,
  classifyRealEstate75Area,
  openRealEstate75Slots,
  realEstate75Quote,
  sanitizeGclid,
  withGclid,
  type RealEstate75Area,
} from "@shared/realestate75";
import type { ApprenticeshipSlot } from "@shared/apprenticeship";

const GCLID_KEY = "re75-gclid";
const DRAFT_KEY = "re75-booking-draft";
const CONVERSION_PREFIX = "re75-conversion-";
const HERO_ALT = "25 listing photos for $75, 20-minute shoot by Iconic apprentices";

const SAMPLES = [
  {
    src: "/realestate-75/pool-backyard.jpg",
    webp: "/realestate-75/pool-backyard.webp",
    alt: "Pool and backyard at a Spring listing",
    width: 1200,
    height: 801,
  },
  {
    src: "/realestate-75/kitchen.jpg",
    webp: "/realestate-75/kitchen.webp",
    alt: "Kitchen at a Spring listing",
    width: 1200,
    height: 801,
  },
  {
    src: "/realestate-75/living-room.jpg",
    webp: "/realestate-75/living-room.webp",
    alt: "Living room at a Spring listing",
    width: 1200,
    height: 801,
  },
  {
    src: "/realestate-75/lake-view.jpg",
    webp: "/realestate-75/lake-view.webp",
    alt: "Living room with a lake view at a Conroe listing",
    width: 1200,
    height: 801,
  },
  {
    src: "/realestate-75/outdoor-living.jpg",
    webp: "/realestate-75/outdoor-living.webp",
    alt: "Covered outdoor living area at a Spring listing",
    width: 1200,
    height: 801,
  },
] as const;

type LiveSlot = ApprenticeshipSlot & { photographerId?: string; photographerName?: string };

interface Draft {
  address: string;
  sqft: string;
  occupancy: string;
  slotStart: string;
  slotDate: string;
  slotTime: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  brokerage: string;
}

const EMPTY_DRAFT: Draft = {
  address: "",
  sqft: "",
  occupancy: "",
  slotStart: "",
  slotDate: "",
  slotTime: "",
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
    return { ...EMPTY_DRAFT, ...parsed };
  } catch {
    return EMPTY_DRAFT;
  }
}

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
  const [slots, setSlots] = useState<LiveSlot[]>([]);
  const [slotsLive, setSlotsLive] = useState(false);
  const [slotsReady, setSlotsReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingSubmitResult | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [barHidden, setBarHidden] = useState(false);
  const [scheduleVisible, setScheduleVisible] = useState(false);
  const formStarted = useRef(false);
  const quote = useMemo(() => realEstate75Quote(processingOn), [processingOn]);
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
    if (area.status !== "inside") {
      setSlots([]);
      setSlotsLive(false);
      setSlotsReady(false);
      return;
    }
    if (!formStarted.current && !sessionStorage.getItem("re75-form-start")) {
      formStarted.current = true;
      sessionStorage.setItem("re75-form-start", "1");
      trackConversion({ name: "re75_form_start", packageId: RE75_PACKAGE_ID });
    }
    const address = draft.address;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ address });
      fetch(`/api/bookings/realestate-75/slots?${params.toString()}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { live?: boolean; slots?: LiveSlot[] } | null) => {
          const live = data?.live === true;
          setSlotsLive(live);
          setSlots(live && Array.isArray(data?.slots) ? data.slots : []);
          setSlotsReady(true);
        })
        .catch(() => {
          setSlotsLive(false);
          setSlots([]);
          setSlotsReady(true);
        });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [area.status, draft.address]);

  useEffect(() => {
    if (!confirmation) return;
    const bookingId = confirmation.requestId || confirmation.orderNumber || "";
    if (!bookingId) return;
    const key = `${CONVERSION_PREFIX}${bookingId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    trackConversion({
      name: "re75_booking",
      packageId: RE75_PACKAGE_ID,
      value: 75,
      currency: "USD",
      transactionId: bookingId,
      email: draft.email,
      phone: draft.phone,
    });
  }, [confirmation, draft.email, draft.phone]);

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

  function patch(partial: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  const days = useMemo(() => {
    const source = slotsLive || !slotsReady ? slots : openRealEstate75Slots({ now: new Date() });
    const groups = new Map<string, LiveSlot[]>();
    for (const slot of source) {
      const list = groups.get(slot.date) || [];
      list.push(slot);
      groups.set(slot.date, list);
    }
    return [...groups.entries()];
  }, [slots, slotsLive, slotsReady]);

  const daySlots = days.find(([date]) => date === draft.slotDate)?.[1] || [];

  useEffect(() => {
    if (draft.slotDate || !days.length) return;
    setDraft((current) => (current.slotDate ? current : { ...current, slotDate: days[0][0] }));
  }, [draft.slotDate, days]);

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
    if (slotsLive && !draft.slotStart) {
      setFormError("Pick an open time.");
      return;
    }
    if (!slotsLive && !draft.slotTime) {
      setFormError(`Open times are not on the calendar right now. ${RE75_OUTSIDE_MESSAGE}`);
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
      const [result, clientNotificationsLive] = await Promise.all([
        createOrder({
          firstName: draft.firstName.trim(),
          lastName: draft.lastName.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          address: draft.address.trim(),
          sqft: draft.sqft.replace(/,/g, ""),
          propertyStatus: draft.occupancy,
          furnishingStatus: draft.occupancy === "Vacant" ? "Vacant" : "Furnished",
          accessMethod: "Not collected on this form",
          serviceDate: draft.slotDate,
          serviceTime: draft.slotTime,
          slotStart: slotsLive ? draft.slotStart : "",
          photographerId: slotsLive
            ? slots.find((slot) => slot.start === draft.slotStart)?.photographerId || ""
            : "",
          leadSource: RE75_LEAD_SOURCE,
          gclid,
          brokerage: draft.brokerage.trim(),
          selectedBasics: [RE75_PACKAGE_ID],
          selectedAddOns: [],
          selectedService: "",
          lineItems: [{
            id: RE75_PACKAGE_ID,
            name: RE75_PACKAGE_NAME,
            unitPrice: quote.subtotal,
            qty: 1,
            price: quote.subtotal,
          }],
          total: quote.subtotal,
          vibeNote: [
            `Brokerage: ${draft.brokerage.trim()}`,
            `Home: ${draft.occupancy}`,
            `Approx sq ft: ${draft.sqft.trim()}`,
            current.travelFee === "tbd" ? RE75_TRAVEL_TBD_NOTE : "",
          ].filter(Boolean).join("\n"),
        }),
        readClientNotificationsLive(),
      ]);
      setConfirmation({
        ...result,
        selectedService: RE75_PACKAGE_ID,
        clientNotificationsLive,
      });
      sessionStorage.removeItem(DRAFT_KEY);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "We could not save that booking.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Layout>
      <div className="overflow-x-clip bg-white text-neutral-950">
        <Hero href={href} quote={quote} processingOn={processingOn} />
        <Benefits />
        <OfferCta href={href} />
        <WhatYouGet quoteLine={quote.priceLine} />
        <OfferCta href={href} />
        <Comparison />
        <OfferCta href={href} />
        <HowItWorks />
        <OfferCta href={href} />
        <Samples />
        <OfferCta href={href} />
        <Faq />
        <OfferCta href={href} />
        <Schedule
          draft={draft}
          area={area}
          formError={formError}
          quote={quote}
          days={days}
          daySlots={daySlots}
          slotsLive={slotsLive}
          slotsReady={slotsReady}
          pending={pending}
          confirmation={confirmation}
          onSubmit={submitBooking}
          onPatch={patch}
        />
        <FinalCta href={href} quoteLine={quote.priceLine} />
        <ReviewsSlot />
        <PageContact />
        <MobileBar href={href} hidden={barHidden || scheduleVisible} />
      </div>
    </Layout>
  );
}

function OfferCta({ href }: { href: (path: string) => string }) {
  return (
    <div className="px-4 md:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 border-t border-neutral-200 py-8 sm:flex-row">
        <Link
          to={href(RE75_PATHS.schedule)}
          className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-black px-5 text-base font-semibold text-white hover:bg-neutral-800"
        >
          Schedule My $75 Shoot
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
  href,
  quote,
  processingOn,
}: {
  href: (path: string) => string;
  quote: ReturnType<typeof realEstate75Quote>;
  processingOn: boolean;
}) {
  return (
    <section className="pt-28 md:pt-36">
      <div className="mx-auto w-full max-w-[1200px]">
        <Link to={href(RE75_PATHS.schedule)} className="block" aria-label="Schedule the $75 shoot">
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
            to={href(RE75_PATHS.schedule)}
            className="inline-flex min-h-14 flex-1 items-center justify-center rounded-xl bg-black px-6 text-lg font-semibold text-white hover:bg-neutral-800"
          >
            Schedule My $75 Shoot
          </Link>
          <a
            href={BUSINESS_CONTACT.phoneHref}
            className="inline-flex min-h-14 items-center justify-center rounded-xl border border-neutral-300 px-6 text-lg font-semibold text-neutral-950 hover:bg-neutral-50"
          >
            Call {BUSINESS_CONTACT.phoneDisplay}
          </a>
        </div>
        <h1 className="mt-8 text-4xl font-black leading-[1.05] tracking-tight text-neutral-950 sm:text-5xl">
          25 Listing Photos for $75
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-neutral-700">
          A {RE75_DURATION_MINUTES}-minute shoot by Iconic Images apprentices. Made for listing refreshes, relists and lease listings in The Woodlands, Spring, Conroe, Willis and Cypress.
        </p>
        <p className="mt-4 text-base font-semibold text-neutral-950">{quote.priceLine}</p>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-neutral-800">
          <span>{RE75_PACKAGE_NAME}</span>
          <MoneyAmount>${quote.total.toFixed(2)}</MoneyAmount>
          {processingOn ? <span className="text-sm text-neutral-600">includes ${quote.processing.toFixed(2)} processing</span> : null}
        </p>
        <ul className="mt-5 flex flex-wrap gap-2">
          {["25 photos", "20-minute appointment", "$75", "Shot by Iconic apprentices", "Photos only"].map((item) => (
            <li key={item} className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm font-semibold text-neutral-800">
              {item}
            </li>
          ))}
        </ul>
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
      title: "Twenty minutes at the house",
      body: "The appointment is 20 minutes. Have the home ready when we arrive.",
    },
    {
      title: "25 edited photos",
      body: "You get 25 edited photos. We confirm the requested time within 1 business day.",
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

function WhatYouGet({ quoteLine }: { quoteLine: string }) {
  const items = [
    ["25 photos", "Edited listing photos. Photos only."],
    ["20-minute shoot", "The appointment is 20 minutes. Overages are " + APPRENTICESHIP_OVERAGE_LABEL + "."],
    ["Service area", "The Woodlands, Spring, Conroe, Willis, and Cypress."],
    ["Price", quoteLine],
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

function Comparison() {
  return (
    <section className="border-t border-neutral-200 px-4 py-14 md:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">$75 shoot or full service</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border-2 border-black p-5">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#0d9488]">This page</p>
            <h3 className="mt-2 text-2xl font-black">Apprentice 25 / $75</h3>
            <ul className="mt-4 space-y-2 leading-relaxed text-neutral-800">
              <li>25 photos in a 20-minute appointment</li>
              <li>Shot by Iconic apprentices</li>
              <li>Photos only. No aerials, video, or twilight</li>
              <li>$75 + 2.8% processing fee ($77.10 total by card)</li>
            </ul>
          </article>
          <article className="rounded-2xl border border-neutral-200 p-5">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-neutral-500">When you need more</p>
            <h3 className="mt-2 text-2xl font-black">Full-service packages</h3>
            <p className="mt-4 leading-relaxed text-neutral-700">
              Aerials, video, and twilight are on the full-service packages. This $75 shoot does not include them.
            </p>
            <Link to="/pricing" className="mt-4 inline-flex font-semibold underline underline-offset-4">
              See full-service packages
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    "Pick a time.",
    "Have the home prepped. Lights on, clutter put away, ready when we arrive.",
    "The apprentice shoots for 20 minutes. You get 25 edited photos.",
  ];
  return (
    <section id="how-it-works" className="scroll-mt-28 border-t border-neutral-200 px-4 py-14 md:scroll-mt-32 md:px-8">
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

function Samples() {
  return (
    <section id="samples" className="scroll-mt-28 border-t border-neutral-200 bg-neutral-50 px-4 py-14 md:scroll-mt-32 md:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Samples</h2>
        <p className="mt-3 text-lg text-neutral-700">{RE75_SAMPLES_CAPTION}</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SAMPLES.map((photo) => (
            <li key={photo.src} className="overflow-hidden rounded-2xl bg-white">
              <picture>
                <source type="image/webp" srcSet={photo.webp} />
                <img
                  src={photo.src}
                  alt={photo.alt}
                  width={photo.width}
                  height={photo.height}
                  loading="lazy"
                  className="aspect-[3/2] h-auto w-full object-cover"
                />
              </picture>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Faq() {
  const items = [
    {
      q: "Who takes the photos?",
      a: "Iconic Images apprentices. They are learning. Graduates become vetted Iconic shooters.",
    },
    {
      q: "What is included, and what is not?",
      a: `25 edited photos from a 20-minute appointment. Photos only. No extra trips, no extra edits, and no Iconic Polish. Overages are ${APPRENTICESHIP_OVERAGE_LABEL}. Aerials, video, and twilight are on the full-service packages.`,
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
      a: "The card total is on this page before you schedule: $75 plus a 2.8% processing fee, $77.10. This form saves the booking. Iconic Images invoices after the shoot, the same way our other bookings work. We confirm the requested time within 1 business day.",
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
  area: RealEstate75Area;
  formError: string;
  quote: ReturnType<typeof realEstate75Quote>;
  days: Array<[string, LiveSlot[]]>;
  daySlots: LiveSlot[];
  slotsLive: boolean;
  slotsReady: boolean;
  pending: boolean;
  confirmation: BookingSubmitResult | null;
  onSubmit: (event: FormEvent) => void;
  onPatch: (partial: Partial<Draft>) => void;
}) {
  const { draft, confirmation, area } = props;
  return (
    <section id="schedule" className="scroll-mt-28 border-t border-neutral-200 px-4 py-14 md:scroll-mt-32 md:px-8">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Schedule My $75 Shoot</h2>
        <p className="mt-3 text-lg text-neutral-700">One package: {RE75_PACKAGE_NAME}. {props.quote.priceLine}</p>
        {confirmation ? (
          <div className="mt-8">
            <p className="mb-4 leading-relaxed text-neutral-800">
              We confirm the requested time within 1 business day. Iconic Images invoices after the shoot. Card total {props.quote.priceLine}
            </p>
            <BookingConfirmation result={confirmation} onBookAnother={() => window.location.assign(RE75_PATHS.schedule)} />
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={props.onSubmit}>
            <div>
              <label className="block text-sm font-semibold" htmlFor="re75-address">Property address</label>
              <textarea
                id="re75-address"
                value={draft.address}
                onChange={(event) => props.onPatch({ address: event.target.value })}
                className={`${fieldClass()} min-h-24 scroll-mb-28`}
                placeholder="123 Oak Dr, Spring, TX 77379"
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
            <TimePicker {...props} />
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
              <label className="block text-sm font-semibold">
                Brokerage
                <input value={draft.brokerage} onChange={(event) => props.onPatch({ brokerage: event.target.value })} className={`${fieldClass()} scroll-mb-28`} />
              </label>
            </div>
            <div className="space-y-3 rounded-2xl border border-neutral-200 p-5">
              <h3 className="text-xl font-black">{RE75_PACKAGE_NAME}</h3>
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
              <p className="text-sm leading-relaxed text-neutral-700">{props.quote.priceLine}</p>
              {area.status === "inside" && area.travelFee === "tbd" ? (
                <p className="text-sm leading-relaxed text-neutral-700">{RE75_TRAVEL_TBD_NOTE}</p>
              ) : (
                <p className="text-sm leading-relaxed text-neutral-700">Travel is included for The Woodlands, Spring, and Conroe.</p>
              )}
            </div>
            {props.formError ? <p className="text-sm font-semibold text-red-700">{props.formError}</p> : null}
            <button type="submit" disabled={props.pending} className="min-h-14 w-full rounded-xl bg-black px-5 text-lg font-semibold text-white disabled:opacity-60">
              {props.pending ? "Saving…" : "Schedule My $75 Shoot"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function TimePicker({
  draft,
  days,
  daySlots,
  slotsLive,
  slotsReady,
  onPatch,
}: {
  draft: Draft;
  days: Array<[string, LiveSlot[]]>;
  daySlots: LiveSlot[];
  slotsLive: boolean;
  slotsReady: boolean;
  onPatch: (partial: Partial<Draft>) => void;
}) {
  return (
    <div>
      <p className="text-sm font-semibold">Date and time</p>
      <p className="mt-1 text-sm leading-relaxed text-neutral-700">
        {slotsLive
          ? "20-minute openings. Weekdays 8:00–5:00, Saturday 9:00–12:00, Sunday closed."
          : slotsReady
            ? "The calendar is not listing openings right now. Pick a requested time and we will confirm it."
            : "Add an address in the service area to see times."}
      </p>
      {slotsReady ? (
        <>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {days.map(([date, list]) => (
              <button
                key={date}
                type="button"
                onClick={() => onPatch({ slotDate: date, slotStart: "", slotTime: "" })}
                className={`shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold ${draft.slotDate === date ? "border-black bg-black text-white" : "border-neutral-300"}`}
              >
                {list[0]?.label.split(" · ")[0] || date}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {daySlots.map((slot) => (
              <button
                key={slot.start}
                type="button"
                onClick={() => onPatch({ slotStart: slotsLive ? slot.start : "", slotDate: slot.date, slotTime: slot.time })}
                className={`min-h-12 rounded-xl border text-sm font-semibold ${draft.slotTime === slot.time && draft.slotDate === slot.date ? "border-black bg-black text-white" : "border-neutral-300"}`}
              >
                {slot.time}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function FinalCta({ href, quoteLine }: { href: (path: string) => string; quoteLine: string }) {
  return (
    <section className="border-t border-neutral-200 bg-neutral-950 px-4 py-16 text-white md:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-black tracking-tight sm:text-5xl">Schedule the $75 shoot</h2>
        <p className="mt-4 text-lg text-neutral-200">{quoteLine}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            to={href(RE75_PATHS.schedule)}
            className="inline-flex min-h-14 items-center justify-center rounded-xl bg-white px-8 text-lg font-semibold text-black hover:bg-neutral-200"
          >
            Schedule My $75 Shoot
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

function MobileBar({ href, hidden }: { href: (path: string) => string; hidden: boolean }) {
  if (hidden) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.06)] md:hidden">
      <div className="mx-auto flex max-w-lg gap-2">
        <Link
          to={href(RE75_PATHS.schedule)}
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
