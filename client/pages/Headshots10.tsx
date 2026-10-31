import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Calendar, Check, Clock, MapPin, Minus, Plus } from "lucide-react";
import { trackConversion } from "@/lib/tracking";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import {
  HEADSHOT_PATHS,
  HEADSHOT_PAY_FAQ,
  HEADSHOTS_CALENDAR_FALLBACK,
  HEADSHOTS_DATE_COUNT,
  HEADSHOTS_DOUBLE_SLOT_AT,
  HEADSHOTS_CITY,
  HEADSHOTS_FACTS,
  HEADSHOTS_FOOTER_ADDRESS,
  HEADSHOTS_FULL_LINE,
  HEADSHOTS_H1,
  HEADSHOTS_HOLD_MINUTES,
  HEADSHOTS_MAPS_QUERY,
  HEADSHOTS_MAX_QUANTITY,
  HEADSHOTS_RESERVE_LINE,
  HEADSHOTS_STUDIO_ADDRESS,
  HEADSHOTS_STUDIO_LINE,
  HEADSHOTS_STUDIO_NAME,
  headshotHeroGroup,
  headshotPlaceJsonLd,
  headshotPhotoStrip,
  headshotCalendarIcs,
  headshotConversionKey,
  headshotConversionValue,
  headshotSlotsNeeded,
  isHeadshotHoliday,
  money,
  openHeadshotSlots,
  quoteHeadshots,
  shouldRecordHeadshotConversion,
  upcomingHeadshotTuesdays,
} from "@shared/headshots10";
import { sanitizeGclid, withGclid } from "@shared/realestate75";

const GCLID_KEY = "headshots-gclid";
const DRAFT_KEY = "headshots-draft";
const PENDING_KEY = "headshots-pending";
const FORM_START_KEY = "headshot-form-start";

interface Draft {
  quantity: number;
  slotStart: string;
  slotEnd: string;
  slotDate: string;
  slotTime: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface SlotChoice {
  start: string;
  end: string;
  date: string;
  time: string;
  label: string;
}

interface PendingBooking extends Draft {
  orderNumber: string;
  paid: boolean;
}

const EMPTY_DRAFT: Draft = {
  quantity: 1,
  slotStart: "",
  slotEnd: "",
  slotDate: "",
  slotTime: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
};

const WEAR = [
  "Solid colors work best. Avoid tiny stripes, busy patterns and large logos.",
  "Wear what you'd wear to a client meeting or to represent your business.",
  "Mid-tones and jewel colors read well on camera; avoid pure white or neon.",
  "Bring one or two outfit options if you're buying several headshots.",
  "Fresh haircut or grooming the day before; keep makeup natural.",
  "Glasses: bring a pair without heavy glare if you have one.",
  "Arrive 5 minutes early.",
];

const heroGroup = headshotHeroGroup();
const photoStrip = headshotPhotoStrip();

const HERO_FIGURE = [
  "left-0 z-10 h-auto w-[42%]",
  "left-1/2 z-30 h-auto w-[48%] -translate-x-1/2",
  "right-0 z-20 h-auto w-[42%]",
] as const;

function readJson<T>(key: string): T | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return JSON.parse(sessionStorage.getItem(key) || "") as T;
  } catch {
    return null;
  }
}

function sectionId(pathname: string): string {
  if (pathname.endsWith("/book")) return "book";
  if (pathname.endsWith("/how-it-works")) return "how-it-works";
  if (pathname.endsWith("/faq")) return "faq";
  if (pathname.endsWith("/location")) return "location";
  return "";
}

function openCheckout(url: string) {
  try {
    if (window.top && window.top !== window) {
      window.top.location.href = url;
      return;
    }
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.assign(url);
}

function fieldClass() {
  return "mt-2 w-full min-h-12 rounded-xl border border-[#081228]/20 bg-white px-4 text-base text-[#081228] outline-none focus-visible:border-[#00B4C8] focus-visible:ring-2 focus-visible:ring-[#00B4C8]";
}

function dateLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const stamp = new Date(Date.UTC(year, month - 1, day, 18));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(stamp);
}

export default function Headshots10() {
  const location = useLocation();
  const [gclid, setGclid] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [maxQuantity, setMaxQuantity] = useState(HEADSHOTS_MAX_QUANTITY);
  const [doubleSlotAt, setDoubleSlotAt] = useState(HEADSHOTS_DOUBLE_SLOT_AT);
  const [processingOn, setProcessingOn] = useState(true);
  const [liveSlots, setLiveSlots] = useState<SlotChoice[] | null>(null);
  const [calendarLive, setCalendarLive] = useState<boolean | null>(null);
  const [calendarNote, setCalendarNote] = useState("");
  const [step, setStep] = useState(1);
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const [website, setWebsite] = useState("");
  const [confirmation, setConfirmation] = useState<PendingBooking | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const tuesdays = useMemo(() => upcomingHeadshotTuesdays(new Date(), HEADSHOTS_DATE_COUNT), []);
  const quote = useMemo(
    () => quoteHeadshots(draft.quantity, processingOn, maxQuantity),
    [draft.quantity, processingOn, maxQuantity],
  );
  const paidReturn = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("booking") === "received" && params.get("paid") === "1";
  }, [location.search]);
  const returnedOrder = useMemo(() => {
    const order = new URLSearchParams(location.search).get("order") || "";
    return order.slice(0, 20);
  }, [location.search]);

  useEffect(() => {
    const fromUrl = sanitizeGclid(new URLSearchParams(location.search).get("gclid") || "");
    const stored = sanitizeGclid(sessionStorage.getItem(GCLID_KEY) || "");
    const next = fromUrl || stored;
    if (next) sessionStorage.setItem(GCLID_KEY, next);
    setGclid(next);
    const saved = readJson<Partial<Draft>>(DRAFT_KEY);
    if (saved) {
      setDraft({
        ...EMPTY_DRAFT,
        ...saved,
        quantity: Number(saved.quantity) || 1,
      });
    }
    const held = readJson<PendingBooking>(PENDING_KEY);
    if (held?.orderNumber) setConfirmation(held);
  }, [location.search]);

  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

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
    fetch("/api/headshots-10/config")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { maxQuantity?: number; doubleSlotAt?: number; processingEnabled?: boolean } | null) => {
        if (cancelled || !data) return;
        if (typeof data.maxQuantity === "number") setMaxQuantity(data.maxQuantity);
        if (typeof data.doubleSlotAt === "number") setDoubleSlotAt(data.doubleSlotAt);
        if (typeof data.processingEnabled === "boolean") setProcessingOn(data.processingEnabled);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ quantity: String(quote.quantity) });
    fetch(`/api/headshots-10/slots?${params.toString()}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { live?: boolean; slots?: SlotChoice[]; fallback?: string | null } | null) => {
        if (cancelled || !data) return;
        setCalendarLive(data.live === true);
        setLiveSlots(Array.isArray(data.slots) ? data.slots : []);
        setCalendarNote(data.live ? "" : data.fallback || HEADSHOTS_CALENDAR_FALLBACK);
      })
      .catch(() => {
        if (!cancelled) {
          setCalendarLive(false);
          setCalendarNote(HEADSHOTS_CALENDAR_FALLBACK);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [quote.quantity]);

  useEffect(() => {
    if (!draft.slotStart || sessionStorage.getItem(FORM_START_KEY)) return;
    sessionStorage.setItem(FORM_START_KEY, "1");
    trackConversion({ name: "headshot_form_start", quantity: quote.quantity });
  }, [draft.slotStart, quote.quantity]);

  useEffect(() => {
    if (!paidReturn || !confirmation?.orderNumber) return;
    const transactionId = confirmation.orderNumber;
    const alreadySeen = sessionStorage.getItem(headshotConversionKey(transactionId)) === "1";
    if (!shouldRecordHeadshotConversion({ paid: paidReturn, transactionId, alreadySeen })) return;
    sessionStorage.setItem(headshotConversionKey(transactionId), "1");
    trackConversion({
      name: "headshot_booking",
      value: headshotConversionValue(confirmation.quantity),
      currency: "USD",
      transactionId,
      quantity: confirmation.quantity,
      email: confirmation.email,
      phone: confirmation.phone,
    });
  }, [paidReturn, confirmation]);

  const scheduleSlots = useMemo(() => {
    if (calendarLive && liveSlots) return liveSlots;
    return openHeadshotSlots({ now: new Date() }).map((slot) => ({
      ...slot,
      label: slot.label,
    }));
  }, [calendarLive, liveSlots]);

  const selectedDate = draft.slotDate || tuesdays.find((date) => !isHeadshotHoliday(date)) || tuesdays[0] || "";
  const dateIsFull = calendarLive === true
    && !isHeadshotHoliday(selectedDate)
    && scheduleSlots.every((slot) => slot.date !== selectedDate);
  const nextOpenDate = tuesdays.find((date) => !isHeadshotHoliday(date) && scheduleSlots.some((slot) => slot.date === date)) || "";

  useEffect(() => {
    if (!dateIsFull || !nextOpenDate || nextOpenDate === selectedDate) return;
    setDraft((current) => ({ ...current, slotDate: nextOpenDate, slotStart: "", slotEnd: "", slotTime: "" }));
  }, [dateIsFull, nextOpenDate, selectedDate]);

  function href(path: string) {
    return withGclid(path, gclid);
  }

  function patch(partial: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...partial }));
    setFormError("");
  }

  function chooseQuantity(quantity: number) {
    const next = Math.min(maxQuantity, Math.max(1, quantity));
    patch({ quantity: next, slotStart: "", slotEnd: "", slotTime: "" });
  }

  function chooseSlot(slot: SlotChoice) {
    if (calendarLive !== true) return;
    patch({
      slotStart: slot.start,
      slotEnd: slot.end,
      slotDate: slot.date,
      slotTime: slot.time,
    });
  }

  function downloadCalendar() {
    if (!confirmation?.slotStart || !confirmation.slotEnd) return;
    const ics = headshotCalendarIcs({
      start: confirmation.slotStart,
      end: confirmation.slotEnd,
      orderNumber: confirmation.orderNumber,
      quantity: confirmation.quantity,
    });
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tuesday-headshots.ics";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function submitBooking(event: FormEvent) {
    event.preventDefault();
    if (calendarLive !== true || !draft.slotStart) {
      setFormError(calendarLive === false ? calendarNote || HEADSHOTS_CALENDAR_FALLBACK : "Choose an open Tuesday time.");
      setStep(1);
      return;
    }
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setFormError("Enter your first and last name.");
      setStep(2);
      return;
    }
    if (!draft.email.includes("@") || draft.email.includes(" ")) {
      setFormError("Enter an email address.");
      setStep(2);
      return;
    }
    if (draft.phone.replace(/\D/g, "").length < 10) {
      setFormError("Enter a phone number.");
      setStep(2);
      return;
    }
    setPending(true);
    setFormError("");
    try {
      const response = await fetch("/api/headshots-10/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: quote.quantity,
          slotStart: draft.slotStart,
          firstName: draft.firstName.trim(),
          lastName: draft.lastName.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          gclid,
          website,
        }),
      });
      const data = await response.json().catch(() => null) as {
        success?: boolean;
        orderNumber?: string;
        invoiceId?: string;
        payToken?: string;
        checkoutReady?: boolean;
        slotStart?: string;
        slotEnd?: string;
        slotDate?: string;
        slotTime?: string;
        quantity?: number;
        error?: string;
      } | null;
      if (!response.ok || !data?.success || !data.orderNumber) {
        setFormError(data?.error || `We could not save that booking. Please call ${BUSINESS_CONTACT.phoneDisplay}.`);
        return;
      }
      const saved: PendingBooking = {
        ...draft,
        quantity: data.quantity || quote.quantity,
        slotStart: data.slotStart || draft.slotStart,
        slotEnd: data.slotEnd || draft.slotEnd,
        slotDate: data.slotDate || draft.slotDate,
        slotTime: data.slotTime || draft.slotTime,
        orderNumber: data.orderNumber,
        paid: false,
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
      };
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(saved));
      setConfirmation(saved);
      if (data.checkoutReady && data.invoiceId && data.payToken) {
        const checkout = await fetch(`/api/payments/invoice/${encodeURIComponent(data.invoiceId)}/deposit-checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ t: data.payToken }),
        });
        const payment = await checkout.json().catch(() => null) as { checkoutUrl?: string; error?: string } | null;
        if (checkout.ok && payment?.checkoutUrl && /^https:\/\//.test(payment.checkoutUrl)) {
          openCheckout(payment.checkoutUrl);
          return;
        }
        setFormError(payment?.error || `Call ${BUSINESS_CONTACT.phoneDisplay} to pay the ${quote.dueTodayLine.replace("Due today: ", "")} booking fee.`);
      }
    } catch {
      setFormError(`We could not save that booking. Please call ${BUSINESS_CONTACT.phoneDisplay}.`);
    } finally {
      setPending(false);
    }
  }

  const confirmed = confirmation
    ? { ...confirmation, paid: confirmation.paid || paidReturn, orderNumber: confirmation.orderNumber || returnedOrder }
    : paidReturn && returnedOrder
      ? { ...draft, orderNumber: returnedOrder, paid: true }
      : null;
  const showingConfirmation = Boolean(confirmed?.orderNumber);
  const confirmedQuote = quoteHeadshots(confirmed?.quantity || quote.quantity, processingOn, maxQuantity);
  const slotsForDate = scheduleSlots.filter((slot) => slot.date === selectedDate);
  const slotsNeeded = headshotSlotsNeeded(quote.quantity, doubleSlotAt);
  const chips = [1, 3, 5, 10].filter((count) => count <= maxQuantity);

  const faqs: Array<{ q: string; a: string }> = [
    { q: "How much is a headshot?", a: "Headshots are $10 each. Buy as many as you like." },
    { q: "When is it?", a: "Every Tuesday, 10am to 2pm." },
    { q: "Where is it?", a: `${HEADSHOTS_STUDIO_LINE}.` },
    { q: "Do I need to book?", a: HEADSHOTS_RESERVE_LINE },
    { q: "Can I pay at the event?", a: HEADSHOT_PAY_FAQ },
    { q: "Do you do other photography?", a: "Yes. See all Iconic Images services." },
  ];

  return (
    <div className="min-h-screen bg-[#F5F2EA] text-[#081228]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(headshotPlaceJsonLd()) }} />
      <a href="#book" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:px-3 focus:py-2">
        Skip to booking
      </a>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4">
        <Link to={href(HEADSHOT_PATHS.home)} className="inline-flex min-h-11 items-center">
          <img src="/media/logos/logo-black-large.png" alt="Iconic Images" className="h-10 w-auto" />
        </Link>
        <a
          href={BUSINESS_CONTACT.phoneHref}
          className="inline-flex min-h-11 items-center gap-2 text-base font-semibold text-[#081228] underline decoration-[#00B4C8] decoration-2 underline-offset-4"
        >
          {BUSINESS_CONTACT.phoneDisplay}
        </a>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-6xl items-start gap-8 px-4 pb-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pt-4" data-testid="headshots-hero">
          <div>
            <div className="mb-4 h-2 w-24 bg-[#00B4C8]" aria-hidden="true" />
            <h1 className="max-w-xl text-[2rem] font-extrabold leading-tight tracking-tight sm:text-5xl">
              {HEADSHOTS_H1}
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-snug">
              Tuesdays 10am-2pm at Iconic Studios in {HEADSHOTS_CITY}. Buy as many headshots as you like.
            </p>
            <div className="mt-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <a
                href={href(`${HEADSHOT_PATHS.book}`)}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#E81060] px-6 text-lg font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#081228]"
              >
                Book Your Tuesday Time
              </a>
              <a href={href(HEADSHOT_PATHS.how)} className="inline-flex min-h-12 items-center text-base font-semibold underline decoration-[#00B4C8] decoration-2 underline-offset-4">
                See how it works
              </a>
            </div>
          </div>
          <div>
            {heroGroup.length === 3 ? (
              <div
                className="relative mx-auto mb-4 h-[300px] w-full max-w-[420px] sm:mb-6 sm:h-[480px] sm:max-w-[520px] lg:h-[460px] lg:max-w-none"
                data-testid="headshots-hero-photo"
              >
                <div className="pointer-events-none absolute left-[8%] top-[10%] h-40 w-40 rounded-full bg-[#00B4C8]/45 blur-3xl sm:h-56 sm:w-56" aria-hidden="true" />
                <div className="pointer-events-none absolute right-[2%] top-[22%] h-44 w-44 rounded-full bg-[#E81060]/30 blur-3xl sm:h-60 sm:w-60" aria-hidden="true" />
                <div className="pointer-events-none absolute bottom-[12%] left-[28%] h-24 w-40 rounded-full bg-[#00B4C8]/25 blur-2xl" aria-hidden="true" />
                <div className="pointer-events-none absolute bottom-2 left-1/2 h-8 w-[72%] -translate-x-1/2 rounded-full bg-[#081228]/10 blur-md" aria-hidden="true" />
                {heroGroup.map((photo, index) => (
                  <img
                    key={photo.cutout || photo.src}
                    src={photo.cutout || photo.src}
                    alt={photo.alt}
                    width={900}
                    height={1400}
                    fetchPriority="high"
                    className={`absolute bottom-0 object-contain object-bottom drop-shadow-[0_22px_18px_rgba(8,18,40,0.16)] ${HERO_FIGURE[index]}`}
                    style={{
                      WebkitMaskImage: "linear-gradient(to bottom, #000 84%, transparent 100%)",
                      maskImage: "linear-gradient(to bottom, #000 84%, transparent 100%)",
                    }}
                  />
                ))}
              </div>
            ) : null}
            <aside className="border-t-4 border-[#00B4C8] bg-white/70 p-6">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#081228]">At the studio</p>
              <p className="mt-3 text-2xl font-bold leading-tight">Every Tuesday, 10am to 2pm</p>
              <p className="mt-3 text-base leading-relaxed">{HEADSHOTS_STUDIO_LINE}</p>
              <p className="mt-4 text-base">{HEADSHOTS_RESERVE_LINE}</p>
            </aside>
          </div>
        </section>

        <ul className="mx-auto flex w-full max-w-6xl flex-wrap gap-2 px-4 pb-10">
          {HEADSHOTS_FACTS.map((fact) => (
            <li key={fact} className="rounded-full border border-[#00B4C8] px-3 py-2 text-sm font-semibold">
              {fact}
            </li>
          ))}
        </ul>
        {photoStrip.length >= 3 ? (
          <section className="mx-auto w-full max-w-6xl px-4 pb-12" data-testid="headshots-photo-strip" aria-label="Studio headshots">
            <h2 className="text-sm font-bold uppercase tracking-[0.16em]">Studio headshots</h2>
            <ul className="mt-4 flex items-center">
              {photoStrip.map((photo, index) => (
                <li key={photo.src} className={index === 0 ? "relative" : "relative -ml-4 sm:-ml-7"} style={{ zIndex: index + 1 }}>
                  <div className="rounded-full bg-gradient-to-br from-[#00B4C8] via-[#F5F2EA] to-[#E81060] p-[3px] shadow-[0_14px_28px_rgba(8,18,40,0.16)]">
                    <img
                      src={photo.src}
                      alt={photo.alt}
                      width={400}
                      height={400}
                      loading="lazy"
                      decoding="async"
                      className={`h-[4.65rem] w-[4.65rem] rounded-full object-cover sm:h-[7.25rem] sm:w-[7.25rem] ${photo.objectPosition === "top" ? "object-top" : "object-center"}`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section id="pricing" className="mx-auto w-full max-w-6xl px-4 pb-14" data-testid="headshots-pricing">
          <h2 className="text-3xl font-extrabold tracking-tight">$10 per headshot</h2>
          <p className="mt-2 text-lg">Buy as many as you like.</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-[#081228]/20 bg-white" role="group" aria-label="Number of headshots">
              <button
                type="button"
                className="inline-flex h-12 w-12 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00B4C8]"
                aria-label="Fewer headshots"
                onClick={() => chooseQuantity(quote.quantity - 1)}
                disabled={quote.quantity <= 1}
              >
                <Minus aria-hidden="true" />
              </button>
              <span className="min-w-10 text-center text-xl font-bold" aria-live="polite">{quote.quantity}</span>
              <button
                type="button"
                className="inline-flex h-12 w-12 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00B4C8]"
                aria-label="More headshots"
                onClick={() => chooseQuantity(quote.quantity + 1)}
                disabled={quote.quantity >= maxQuantity}
              >
                <Plus aria-hidden="true" />
              </button>
            </div>
            {chips.map((count) => {
              const selected = quote.quantity === count;
              return (
                <button
                  key={count}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => chooseQuantity(count)}
                  className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-4 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4C8] ${selected ? "border-[#00B4C8] bg-white" : "border-[#081228]/15 bg-transparent"}`}
                >
                  {selected ? <Check className="mr-1 h-4 w-4" aria-hidden="true" /> : null}
                  {count}
                  {selected ? <span className="sr-only"> selected</span> : null}
                </button>
              );
            })}
          </div>
          <div className="mt-6 max-w-xl border-l-4 border-[#00B4C8] bg-white p-5">
            <p>Headshots: {quote.quantity} × {money(quote.unitPrice)} = {money(quote.subtotal)}</p>
            <p className="mt-2 text-xl font-bold">{quote.dueTodayLine}</p>
            {quote.balanceLine ? <p className="mt-1 text-xl font-bold">{quote.balanceLine}</p> : null}
            {quote.balanceLine ? <p className="mt-1">That balance is {money(quote.balanceTotal)}.</p> : null}
          </div>
          <a
            href={href(HEADSHOT_PATHS.book)}
            className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-[#E81060] px-6 text-lg font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#081228]"
          >
            Book Your Tuesday Time
          </a>
        </section>

        <section id="how-it-works" className="scroll-mt-6 mx-auto w-full max-w-6xl px-4 pb-14">
          <h2 className="text-3xl font-extrabold tracking-tight">How it works</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2">
            {([
              { title: "Book a Tuesday slot.", body: "Pick a time between 10am and 2pm.", Icon: Calendar },
              { title: "Choose your quantity.", body: "$10 per headshot. Buy as many as you like.", Icon: Plus },
              { title: "Show up.", body: `Iconic Studios, 26410 Oakridge Dr. Ste 105, ${HEADSHOTS_CITY}.`, Icon: MapPin },
              { title: "Pick your favorites.", body: "Choose the headshots you want to keep.", Icon: Check },
            ] as const).map(({ title, body, Icon }, index) => (
              <li key={title} className="bg-white p-5">
                <Icon className="h-7 w-7 text-[#00B4C8]" aria-hidden="true" />
                <p className="mt-3 text-lg font-bold">{index + 1}. {title}</p>
                <p className="mt-1">{body}</p>
              </li>
            ))}
          </ol>
          <div id="what-to-wear" className="mt-8">
            <h3 className="text-2xl font-extrabold">What to wear</h3>
            <ul className="mt-3 max-w-2xl list-disc space-y-2 pl-5">
              {WEAR.map((tip) => <li key={tip}>{tip}</li>)}
            </ul>
          </div>
        </section>

        <section id="faq" className="scroll-mt-6 mx-auto w-full max-w-6xl px-4 pb-14">
          <h2 className="text-3xl font-extrabold tracking-tight">Headshot FAQ</h2>
          <div className="mt-4 divide-y divide-[#081228]/15 border-y border-[#081228]/15">
            {faqs.map((item, index) => {
              const open = openFaq === index;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    className="flex min-h-12 w-full items-center justify-between gap-4 py-3 text-left text-lg font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00B4C8]"
                    aria-expanded={open}
                    onClick={() => setOpenFaq(open ? null : index)}
                  >
                    {item.q}
                    <span aria-hidden="true">{open ? "–" : "+"}</span>
                  </button>
                  {open ? (
                    <div className="pb-4 pr-8">
                      {item.q === "Do you do other photography?" ? (
                        <p>
                          Yes. <Link to="/pricing" className="font-semibold underline decoration-[#00B4C8] decoration-2 underline-offset-4">See all Iconic Images services</Link>.
                        </p>
                      ) : <p>{item.a}</p>}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section id="location" className="scroll-mt-6 mx-auto w-full max-w-6xl px-4 pb-14">
          <h2 className="text-3xl font-extrabold tracking-tight">Map and parking</h2>
          <p className="mt-3 text-lg">{HEADSHOTS_STUDIO_LINE}</p>
          <p className="mt-2">Tuesdays 10am-2pm</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              className="inline-flex min-h-12 items-center rounded-full bg-[#081228] px-5 font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4C8]"
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(HEADSHOTS_MAPS_QUERY)}`}
              target="_blank"
              rel="noreferrer"
            >
              Get directions
            </a>
            <a className="inline-flex min-h-12 items-center font-semibold underline decoration-[#00B4C8] decoration-2 underline-offset-4" href={BUSINESS_CONTACT.phoneHref}>
              {BUSINESS_CONTACT.phoneDisplay}
            </a>
            <a className="inline-flex min-h-12 items-center font-semibold underline decoration-[#00B4C8] decoration-2 underline-offset-4" href={BUSINESS_CONTACT.emailHref}>
              {BUSINESS_CONTACT.email}
            </a>
          </div>
          <iframe
            title={`Map of ${HEADSHOTS_STUDIO_NAME}, ${HEADSHOTS_STUDIO_ADDRESS}`}
            className="mt-5 h-64 w-full border border-[#081228]/15"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={`https://maps.google.com/maps?q=${encodeURIComponent(HEADSHOTS_MAPS_QUERY)}&output=embed`}
          />
        </section>

        <section id="book" className="scroll-mt-6 mx-auto w-full max-w-6xl px-4 pb-20" data-testid="headshots-booking">
          <h2 className="text-3xl font-extrabold tracking-tight">Book a Tuesday slot</h2>
          <p className="mt-2">{HEADSHOTS_RESERVE_LINE}</p>
          {showingConfirmation && confirmed ? (
            <div className="mt-6 max-w-xl bg-white p-6" data-testid="headshots-confirmation">
              <h3 className="text-2xl font-extrabold">
                {confirmed.paid ? "You're booked." : "Your time is held."}
              </h3>
              <p className="mt-3">
                {confirmed.paid
                  ? "The booking fee is paid and your Tuesday time is confirmed."
                  : `Your time is held for ${HEADSHOTS_HOLD_MINUTES} minutes and confirmed once the $10 booking fee is paid.`}
              </p>
              {confirmed.orderNumber ? <p className="mt-2 font-semibold">Confirmation {confirmed.orderNumber}</p> : null}
              {confirmed.slotDate ? <p className="mt-3">{dateLabel(confirmed.slotDate)} at {confirmed.slotTime}</p> : null}
              <p>{confirmed.quantity || quote.quantity} headshot{(confirmed.quantity || quote.quantity) === 1 ? "" : "s"}</p>
              <p className="mt-3 text-xl font-bold">{confirmedQuote.dueTodayLine}</p>
              {confirmedQuote.balanceLine ? <p className="text-xl font-bold">{confirmedQuote.balanceLine}</p> : null}
              {confirmedQuote.balanceLine ? <p>That balance is {money(confirmedQuote.balanceTotal)}.</p> : null}
              <p className="mt-4">{HEADSHOTS_STUDIO_LINE}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                {confirmed.slotStart && confirmed.slotEnd ? (
                  <button
                    type="button"
                    onClick={downloadCalendar}
                    className="inline-flex min-h-12 items-center rounded-full border border-[#081228] px-5 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00B4C8]"
                  >
                    Add to Calendar
                  </button>
                ) : null}
                <Link to={href(HEADSHOT_PATHS.how)} className="inline-flex min-h-12 items-center font-semibold underline decoration-[#00B4C8] decoration-2 underline-offset-4">
                  What to wear
                </Link>
              </div>
              {formError ? <p className="mt-4 text-sm font-semibold" role="alert">{formError}</p> : null}
            </div>
          ) : (
            <form className="mt-6 max-w-xl" onSubmit={submitBooking}>
              <p className="text-sm font-semibold">Step {step} of 4</p>
              {step === 1 ? (
                <div className="mt-4">
                  <p className="font-bold">Quantity</p>
                  <p className="mt-1">{quote.quantity} × {money(quote.unitPrice)} = {money(quote.subtotal)}</p>
                  {slotsNeeded === 2 ? <p className="mt-2 text-sm">This quantity holds two consecutive 10-minute slots.</p> : null}
                  <div className="mt-4 flex gap-2 overflow-x-auto" role="tablist" aria-label="Tuesday dates">
                    {tuesdays.map((date) => {
                      const selected = date === selectedDate;
                      const holiday = isHeadshotHoliday(date);
                      return (
                        <button
                          key={date}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          disabled={holiday}
                          onClick={() => patch({ slotDate: date, slotStart: "", slotEnd: "", slotTime: "" })}
                          className={`min-h-12 shrink-0 rounded-full border px-4 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00B4C8] ${selected ? "border-[#00B4C8] bg-white" : "border-[#081228]/15"}`}
                        >
                          {dateLabel(date)}
                          {holiday ? " closed" : ""}
                          {selected ? <span className="sr-only"> selected</span> : null}
                        </button>
                      );
                    })}
                  </div>
                  {dateIsFull ? <p className="mt-4 font-semibold">{HEADSHOTS_FULL_LINE}</p> : null}
                  {calendarLive === false ? <p className="mt-4" role="status">{calendarNote || HEADSHOTS_CALENDAR_FALLBACK}</p> : null}
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Tuesday times">
                    {slotsForDate.map((slot) => {
                      const selected = draft.slotStart === slot.start;
                      const open = calendarLive === true;
                      return (
                        <button
                          key={slot.start}
                          type="button"
                          disabled={!open}
                          aria-pressed={selected}
                          onClick={() => chooseSlot(slot)}
                          className={`min-h-12 rounded-xl border px-2 text-left font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00B4C8] disabled:opacity-50 ${selected ? "border-[#00B4C8] bg-white" : "border-[#081228]/15 bg-white/50"}`}
                        >
                          <Clock className="mr-1 inline h-4 w-4 text-[#00B4C8]" aria-hidden="true" />
                          {slot.time}
                          {slotsNeeded === 2 ? " + next" : ""}
                          {selected ? <span className="ml-1 text-sm font-bold">Selected</span> : null}
                        </button>
                      );
                    })}
                  </div>
                  {calendarLive === null ? <p className="mt-3">Checking open times.</p> : null}
                </div>
              ) : null}
              {step === 2 ? (
                <div className="mt-4 grid gap-4">
                  <label className="block font-semibold">
                    First name
                    <input className={fieldClass()} autoComplete="given-name" value={draft.firstName} onChange={(event) => patch({ firstName: event.target.value })} required />
                  </label>
                  <label className="block font-semibold">
                    Last name
                    <input className={fieldClass()} autoComplete="family-name" value={draft.lastName} onChange={(event) => patch({ lastName: event.target.value })} required />
                  </label>
                  <label className="block font-semibold">
                    Email
                    <input className={fieldClass()} type="email" autoComplete="email" inputMode="email" value={draft.email} onChange={(event) => patch({ email: event.target.value })} required />
                  </label>
                  <label className="block font-semibold">
                    Phone
                    <input className={fieldClass()} type="tel" autoComplete="tel" inputMode="tel" value={draft.phone} onChange={(event) => patch({ phone: event.target.value })} required />
                  </label>
                </div>
              ) : null}
              {step >= 3 ? (
                <div className="mt-4 border-l-4 border-[#00B4C8] bg-white p-5">
                  <p>Headshots: {quote.quantity} × {money(quote.unitPrice)} = {money(quote.subtotal)}</p>
                  {draft.slotDate ? <p className="mt-2">{dateLabel(draft.slotDate)} at {draft.slotTime}</p> : null}
                  <p className="mt-2">{HEADSHOTS_STUDIO_LINE}</p>
                  <p className="mt-3 text-xl font-bold">{quote.dueTodayLine}</p>
                  {quote.balanceLine ? <p className="text-xl font-bold">{quote.balanceLine}</p> : null}
                  {quote.balanceLine ? <p className="mt-1">That balance is {money(quote.balanceTotal)}.</p> : null}
                  <p className="mt-3 text-sm">The $10 counts toward your headshots. Your time is held for {HEADSHOTS_HOLD_MINUTES} minutes once the booking fee checkout starts.</p>
                </div>
              ) : null}
              <label className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
                Website
                <input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
              </label>
              {formError ? <p className="mt-4 text-sm font-semibold" role="alert">{formError}</p> : null}
              <div className="mt-5 flex flex-wrap gap-3">
                {step > 1 ? (
                  <button type="button" className="inline-flex min-h-12 items-center rounded-full border border-[#081228] px-5 font-bold" onClick={() => setStep(step - 1)}>
                    Back
                  </button>
                ) : null}
                {step < 4 ? (
                  <button
                    type="button"
                    className="inline-flex min-h-12 items-center rounded-full bg-[#E81060] px-6 text-lg font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#081228]"
                    onClick={() => {
                      if (step === 1 && !draft.slotStart) {
                        setFormError(calendarLive === false ? calendarNote || HEADSHOTS_CALENDAR_FALLBACK : "Choose an open Tuesday time.");
                        return;
                      }
                      setFormError("");
                      setStep(step + 1);
                    }}
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={pending}
                    className="inline-flex min-h-12 items-center rounded-full bg-[#E81060] px-6 text-lg font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#081228] disabled:opacity-60"
                  >
                    {pending ? "Reserving…" : `Pay ${money(quote.dueToday)} to reserve`}
                  </button>
                )}
              </div>
            </form>
          )}
        </section>
      </main>

      <footer className="border-t border-[#081228]/15 px-4 py-8 text-sm">
        <p className="mx-auto max-w-6xl leading-relaxed">
          {LEGAL_BUSINESS_NAME} · {HEADSHOTS_FOOTER_ADDRESS} · {BUSINESS_CONTACT.phoneDisplay} · {BUSINESS_CONTACT.email}
        </p>
      </footer>
    </div>
  );
}
