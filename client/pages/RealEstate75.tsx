import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Layout from "@/components/Layout";
import { MoneyAmount } from "@/components/MoneyAmount";
import { BookingConfirmation } from "@/components/BookingConfirmation";
import { createOrder } from "@/lib/createOrder";
import { readClientNotificationsLive, type BookingSubmitResult } from "@/lib/bookingFollowUp";
import { trackConversion } from "@/lib/tracking";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import { APPRENTICESHIP_OVERAGE_LABEL, APPRENTICESHIP_RULES } from "@shared/bookingCatalog";
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

const STEPS = ["Address", "Size", "Home", "Time", "Agent", "Summary"] as const;
type StepIndex = 0 | 1 | 2 | 3 | 4 | 5;

type LiveSlot = ApprenticeshipSlot & { photographerId?: string; photographerName?: string };

interface Draft {
  step: StepIndex;
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
  step: 0,
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
    const step = parsed.step;
    return {
      ...EMPTY_DRAFT,
      ...parsed,
      step: step === 0 || step === 1 || step === 2 || step === 3 || step === 4 || step === 5 ? step : 0,
    };
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
  const [areaError, setAreaError] = useState("");
  const [formError, setFormError] = useState("");
  const [slots, setSlots] = useState<LiveSlot[]>([]);
  const [slotsLive, setSlotsLive] = useState(false);
  const [slotsReady, setSlotsReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingSubmitResult | null>(null);
  const [hydrated, setHydrated] = useState(false);
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

  function href(path: string) {
    return withGclid(path, gclid);
  }

  function patch(partial: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  function loadSlots(address: string) {
    setSlotsReady(false);
    const params = new URLSearchParams({ address });
    fetch(`/api/bookings/realestate-75/slots?${params.toString()}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { live?: boolean; slots?: LiveSlot[] } | null) => {
        const live = data?.live === true;
        const next = live && Array.isArray(data?.slots) ? data.slots : [];
        setSlotsLive(live);
        setSlots(next);
        setSlotsReady(true);
      })
      .catch(() => {
        setSlotsLive(false);
        setSlots([]);
        setSlotsReady(true);
      });
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
    if (draft.step !== 3 || draft.slotDate || !days.length) return;
    setDraft((current) => (current.slotDate ? current : { ...current, slotDate: days[0][0] }));
  }, [draft.step, draft.slotDate, days]);

  function continueAddress() {
    const next = classifyRealEstate75Area(draft.address);
    if (next.status !== "inside") {
      setAreaError(next.message);
      return;
    }
    setAreaError("");
    if (!formStarted.current && !sessionStorage.getItem("re75-form-start")) {
      formStarted.current = true;
      sessionStorage.setItem("re75-form-start", "1");
      trackConversion({ name: "re75_form_start", packageId: RE75_PACKAGE_ID });
    }
    patch({ step: 1 });
  }

  function continueDetails() {
    const sqft = Number(draft.sqft.replace(/,/g, ""));
    if (!Number.isFinite(sqft) || sqft < 200 || sqft > 20000) {
      setFormError("Enter an approximate square footage between 200 and 20,000.");
      return;
    }
    if (!draft.occupancy) {
      setFormError("Tell us if the home is occupied, vacant, or a lease.");
      return;
    }
    setFormError("");
    loadSlots(draft.address);
    patch({ step: 3 });
  }

  function continueTime() {
    if (slotsLive && !draft.slotStart) {
      setFormError("Pick an open time.");
      return;
    }
    if (!slotsLive && !draft.slotTime) {
      setFormError(`Open times are not on the calendar right now. ${RE75_OUTSIDE_MESSAGE}`);
      return;
    }
    setFormError("");
    patch({ step: 4 });
  }

  function continueAgent() {
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setFormError("Enter the agent's first and last name.");
      return;
    }
    if (!draft.email.includes("@") || draft.email.includes(" ")) {
      setFormError("Enter an email address.");
      return;
    }
    const digits = draft.phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setFormError("Enter a phone number.");
      return;
    }
    if (!draft.brokerage.trim()) {
      setFormError("Enter the brokerage.");
      return;
    }
    setFormError("");
    patch({ step: 5 });
  }

  async function submitBooking(event: FormEvent) {
    event.preventDefault();
    const current = classifyRealEstate75Area(draft.address);
    if (current.status !== "inside") {
      setFormError(current.message);
      patch({ step: 0 });
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
      const saved: BookingSubmitResult = {
        ...result,
        selectedService: RE75_PACKAGE_ID,
        clientNotificationsLive,
      };
      setConfirmation(saved);
      sessionStorage.removeItem(DRAFT_KEY);
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not save that booking.";
      setFormError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Layout>
      <div className="overflow-x-clip bg-white text-neutral-950">
        <Hero href={href} quoteLine={quote.priceLine} total={quote.total} processing={quote.processing} processingOn={processingOn} />
        <HowItWorks />
        <Samples />
        <Schedule
          draft={draft}
          area={area}
          areaError={areaError}
          formError={formError}
          quote={quote}
          days={days}
          daySlots={daySlots}
          slotsLive={slotsLive}
          slotsReady={slotsReady}
          pending={pending}
          confirmation={confirmation}
          onAddress={continueAddress}
          onDetails={continueDetails}
          onTime={continueTime}
          onAgent={continueAgent}
          onSubmit={submitBooking}
          onPatch={patch}
          onBack={() => {
            setFormError("");
            patch({ step: Math.max(0, draft.step - 1) as StepIndex });
          }}
        />
        <PageContact />
      </div>
    </Layout>
  );
}

function Hero({
  href,
  quoteLine,
  total,
  processing,
  processingOn,
}: {
  href: (path: string) => string;
  quoteLine: string;
  total: number;
  processing: number;
  processingOn: boolean;
}) {
  return (
    <section className="px-4 pb-16 pt-28 md:px-8 md:pb-24 md:pt-36">
      <div className="mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#0d9488]">Preview · Apprentice shoot</p>
          <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight text-neutral-950 sm:text-5xl lg:text-6xl">
            25 Listing Photos for $75
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-neutral-700">
            A {RE75_DURATION_MINUTES}-minute shoot by Iconic Images apprentices. Made for listing refreshes, relists and lease listings in The Woodlands, Spring, Conroe, Willis and Cypress.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {["25 photos", "20-minute appointment", "$75", "Shot by Iconic apprentices", "Photos only"].map((item) => (
              <li key={item} className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm font-semibold text-neutral-800">
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-6 max-w-xl rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="text-sm font-semibold text-neutral-950">{quoteLine}</p>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-neutral-800">
              <span>{RE75_PACKAGE_NAME}</span>
              <MoneyAmount>${total.toFixed(2)}</MoneyAmount>
              {processingOn ? <span className="text-sm text-neutral-600">includes ${processing.toFixed(2)} processing</span> : null}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-neutral-600">{RE75_TRAVEL_TBD_NOTE}</p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              to={href(RE75_PATHS.schedule)}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-black px-6 text-base font-semibold text-white hover:bg-neutral-800"
            >
              Schedule now
            </Link>
            <a
              href={BUSINESS_CONTACT.phoneHref}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-neutral-300 px-6 text-base font-semibold text-neutral-950 hover:bg-neutral-50"
            >
              {BUSINESS_CONTACT.phoneDisplay}
            </a>
          </div>
          <nav className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
            <Link className="underline underline-offset-4" to={href(RE75_PATHS.how)}>How it works</Link>
            <Link className="underline underline-offset-4" to={href(RE75_PATHS.samples)}>Samples</Link>
            <Link className="underline underline-offset-4" to={href(RE75_PATHS.schedule)}>Pick a time</Link>
          </nav>
        </div>
        <picture>
          <source type="image/webp" srcSet="/realestate-75/hero.webp" />
          <img
            src="/realestate-75/hero.jpg"
            alt="Covered outdoor living area with a stone fireplace at a listing"
            width={1200}
            height={628}
            className="h-auto w-full rounded-3xl object-cover"
          />
        </picture>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    "Pick a time.",
    "Have the home prepped (lights on, clutter put away, ready when we arrive).",
    "The apprentice shoots for 20 minutes.",
    "You get 25 edited photos.",
  ];
  return (
    <section id="how-it-works" className="scroll-mt-28 border-t border-neutral-200 px-4 py-16 md:scroll-mt-32 md:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">How it works</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-2">
          {steps.map((step, index) => (
            <li key={step} className="rounded-2xl border border-neutral-200 p-5">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#0d9488]">Step {index + 1}</p>
              <p className="mt-2 text-lg leading-relaxed text-neutral-900">{step}</p>
            </li>
          ))}
        </ol>
        <ul className="mt-8 max-w-3xl space-y-2 text-base leading-relaxed text-neutral-700">
          {APPRENTICESHIP_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
          <li>Photos only. No extra trips. No extra edits. Be prepped.</li>
          <li>Overages are {APPRENTICESHIP_OVERAGE_LABEL}.</li>
          <li>Apprentice photos aren&apos;t eligible for Iconic Polish.</li>
        </ul>
        <p className="mt-8 text-base leading-relaxed text-neutral-800">
          Need aerials, video or twilight?{" "}
          <Link to="/pricing" className="font-semibold underline underline-offset-4">See full-service packages</Link>
        </p>
      </div>
    </section>
  );
}

function Samples() {
  return (
    <section id="samples" className="scroll-mt-28 border-t border-neutral-200 bg-neutral-50 px-4 py-16 md:scroll-mt-32 md:px-8">
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

function Schedule(props: {
  draft: Draft;
  area: RealEstate75Area;
  areaError: string;
  formError: string;
  quote: ReturnType<typeof realEstate75Quote>;
  days: Array<[string, LiveSlot[]]>;
  daySlots: LiveSlot[];
  slotsLive: boolean;
  slotsReady: boolean;
  pending: boolean;
  confirmation: BookingSubmitResult | null;
  onAddress: () => void;
  onDetails: () => void;
  onTime: () => void;
  onAgent: () => void;
  onSubmit: (event: FormEvent) => void;
  onPatch: (partial: Partial<Draft>) => void;
  onBack: () => void;
}) {
  const { draft, confirmation } = props;
  return (
    <section id="schedule" className="scroll-mt-28 border-t border-neutral-200 px-4 py-16 md:scroll-mt-32 md:px-8">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Schedule now</h2>
        <p className="mt-3 text-lg text-neutral-700">One package: {RE75_PACKAGE_NAME}.</p>
        {confirmation ? (
          <div className="mt-8">
            <p className="mb-4 text-base leading-relaxed text-neutral-800">
              Card total {props.quote.priceLine} Payment is collected the same way as our other bookings.
            </p>
            <BookingConfirmation result={confirmation} onBookAnother={() => window.location.assign(RE75_PATHS.schedule)} />
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={props.onSubmit}>
            <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {STEPS.map((label, index) => (
                <li
                  key={label}
                  className={`rounded-full px-2 py-1 text-center text-xs font-semibold ${index === draft.step ? "bg-black text-white" : "bg-neutral-100 text-neutral-600"}`}
                >
                  {label}
                </li>
              ))}
            </ol>
            {draft.step === 0 ? (
              <AddressStep {...props} />
            ) : null}
            {draft.step === 1 || draft.step === 2 ? (
              <DetailsStep {...props} />
            ) : null}
            {draft.step === 3 ? <TimeStep {...props} /> : null}
            {draft.step === 4 ? <AgentStep {...props} /> : null}
            {draft.step === 5 ? <SummaryStep {...props} /> : null}
            {props.formError ? <p className="text-sm font-semibold text-red-700">{props.formError}</p> : null}
            <div className="flex flex-col gap-3 sm:flex-row">
              {draft.step > 0 ? (
                <button type="button" onClick={props.onBack} className="min-h-12 rounded-xl border border-neutral-300 px-5 font-semibold">
                  Back
                </button>
              ) : null}
              {draft.step === 0 ? (
                <button type="button" onClick={props.onAddress} className="min-h-12 flex-1 rounded-xl bg-black px-5 font-semibold text-white">
                  Continue
                </button>
              ) : null}
              {draft.step === 1 || draft.step === 2 ? (
                <button type="button" onClick={props.onDetails} className="min-h-12 flex-1 rounded-xl bg-black px-5 font-semibold text-white">
                  Continue
                </button>
              ) : null}
              {draft.step === 3 ? (
                <button type="button" onClick={props.onTime} className="min-h-12 flex-1 rounded-xl bg-black px-5 font-semibold text-white">
                  Continue
                </button>
              ) : null}
              {draft.step === 4 ? (
                <button type="button" onClick={props.onAgent} className="min-h-12 flex-1 rounded-xl bg-black px-5 font-semibold text-white">
                  Review
                </button>
              ) : null}
              {draft.step === 5 ? (
                <button type="submit" disabled={props.pending} className="min-h-12 flex-1 rounded-xl bg-black px-5 font-semibold text-white disabled:opacity-60">
                  {props.pending ? "Saving…" : "Schedule this shoot"}
                </button>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function AddressStep({ draft, area, areaError, onPatch }: {
  draft: Draft;
  area: RealEstate75Area;
  areaError: string;
  onPatch: (partial: Partial<Draft>) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold" htmlFor="re75-address">Property address</label>
      <textarea
        id="re75-address"
        value={draft.address}
        onChange={(event) => onPatch({ address: event.target.value })}
        className={`${fieldClass()} min-h-24`}
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
      ) : areaError ? (
        <p className="mt-3 text-sm font-semibold">
          <a href={BUSINESS_CONTACT.phoneHref} className="underline underline-offset-4">{areaError}</a>
        </p>
      ) : null}
    </div>
  );
}

function DetailsStep({ draft, onPatch }: { draft: Draft; onPatch: (partial: Partial<Draft>) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-semibold" htmlFor="re75-sqft">Approximate square feet</label>
        <input
          id="re75-sqft"
          inputMode="numeric"
          value={draft.sqft}
          onChange={(event) => onPatch({ sqft: event.target.value, step: 1 })}
          className={fieldClass()}
        />
      </div>
      <fieldset>
        <legend className="text-sm font-semibold">Occupied, vacant, or lease</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {["Occupied", "Vacant", "Lease"].map((option) => (
            <label key={option} className={`flex min-h-12 items-center justify-center rounded-xl border px-3 text-sm font-semibold ${draft.occupancy === option ? "border-black bg-black text-white" : "border-neutral-300"}`}>
              <input
                type="radio"
                name="occupancy"
                value={option}
                checked={draft.occupancy === option}
                onChange={() => onPatch({ occupancy: option, step: 2 })}
                className="sr-only"
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function TimeStep({
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
      <p className="text-sm leading-relaxed text-neutral-700">
        {slotsLive
          ? "20-minute openings from the same calendar as our other bookings. Weekdays 8:00–5:00, Saturday 9:00–12:00, Sunday closed."
          : slotsReady
            ? (
              <>
                The calendar is not listing openings right now. Pick a requested time and we will confirm it, or{" "}
                <a href={BUSINESS_CONTACT.phoneHref} className="font-semibold underline underline-offset-4">{RE75_OUTSIDE_MESSAGE}</a>.
              </>
            )
            : "Checking the calendar…"}
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
      ) : (
        <p className="mt-4 text-sm text-neutral-600">Checking the calendar…</p>
      )}
    </div>
  );
}

function AgentStep({ draft, onPatch }: { draft: Draft; onPatch: (partial: Partial<Draft>) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block text-sm font-semibold">
        First name
        <input value={draft.firstName} onChange={(event) => onPatch({ firstName: event.target.value })} className={fieldClass()} autoComplete="given-name" />
      </label>
      <label className="block text-sm font-semibold">
        Last name
        <input value={draft.lastName} onChange={(event) => onPatch({ lastName: event.target.value })} className={fieldClass()} autoComplete="family-name" />
      </label>
      <label className="block text-sm font-semibold sm:col-span-2">
        Email
        <input type="email" value={draft.email} onChange={(event) => onPatch({ email: event.target.value })} className={fieldClass()} autoComplete="email" />
      </label>
      <label className="block text-sm font-semibold">
        Phone
        <input type="tel" value={draft.phone} onChange={(event) => onPatch({ phone: event.target.value })} className={fieldClass()} autoComplete="tel" />
      </label>
      <label className="block text-sm font-semibold">
        Brokerage
        <input value={draft.brokerage} onChange={(event) => onPatch({ brokerage: event.target.value })} className={fieldClass()} />
      </label>
    </div>
  );
}

function SummaryStep({ draft, area, quote }: {
  draft: Draft;
  area: RealEstate75Area;
  quote: ReturnType<typeof realEstate75Quote>;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-neutral-200 p-5">
      <h3 className="text-xl font-black">{RE75_PACKAGE_NAME}</h3>
      <p>{draft.address}</p>
      <p>{draft.sqft} sq ft · {draft.occupancy}</p>
      <p>{draft.slotDate} · {draft.slotTime}</p>
      <p>{draft.firstName} {draft.lastName} · {draft.brokerage}</p>
      <p>{draft.email} · {draft.phone}</p>
      <div className="border-t border-neutral-200 pt-3">
        <p className="flex items-center justify-between gap-4">
          <span>Package</span>
          <MoneyAmount>${quote.subtotal.toFixed(2)}</MoneyAmount>
        </p>
        {quote.processing > 0 ? (
          <p className="mt-2 flex items-center justify-between gap-4">
            <span>Processing (2.8%)</span>
            <MoneyAmount>${quote.processing.toFixed(2)}</MoneyAmount>
          </p>
        ) : null}
        <p className="mt-3 flex items-center justify-between gap-4 text-lg font-black">
          <span>Total by card</span>
          <MoneyAmount>${quote.total.toFixed(2)}</MoneyAmount>
        </p>
        <p className="mt-3 text-sm leading-relaxed text-neutral-700">{quote.priceLine}</p>
        {area.status === "inside" && area.travelFee === "tbd" ? (
          <p className="mt-3 text-sm leading-relaxed text-neutral-700">{RE75_TRAVEL_TBD_NOTE}</p>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-neutral-700">Travel is included for The Woodlands, Spring, and Conroe.</p>
        )}
      </div>
    </div>
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
