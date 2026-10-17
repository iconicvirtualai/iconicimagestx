import { FormEvent, useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import {
  THANKFUL_ALREADY_VOTED_ERROR,
  THANKFUL_DRINKS_NOTE,
  THANKFUL_EMAIL,
  THANKFUL_EMAIL_HREF,
  THANKFUL_HEADLINE,
  THANKFUL_MENUS,
  THANKFUL_PHONE_DISPLAY,
  THANKFUL_PHONE_HREF,
  THANKFUL_PROCESSING_NOTE,
  THANKFUL_RSVP_CLOSED_ERROR,
  THANKFUL_RSVP_CLOSES_LABEL,
  THANKFUL_SOCIAL_LOCK_LABEL,
  THANKFUL_SOCIAL_PACKAGES,
  THANKFUL_SOCIAL_TERMS,
  THANKFUL_STUDIO_ADDRESS,
  THANKFUL_VOTE_RULE,
  THANKFUL_WHEN_LABEL,
  openThankfulSlots,
  quoteThankfulSocial,
  thankfulMoney,
  thankfulZonedTimeToUtc,
  type ThankfulMenu,
  type ThankfulSocialTermId,
  type ThankfulSlot,
} from "@shared/thankfulEvent";

type SlotResponse = {
  live?: boolean;
  closed?: boolean;
  socialOpen?: boolean;
  slots?: ThankfulSlot[];
};

type CastVote = { menuName: string; orderNumber: string };

const VOTE_KEY = "thankful-menu-vote";
const PHOTO_PLACES = ["Photo 1", "Photo 2", "Photo 3", "Photo 4"] as const;
const RSVP_CLOSE_AT = thankfulZonedTimeToUtc(2026, 11, 10, 0, 0);
const EVENT_START_AT = thankfulZonedTimeToUtc(2026, 11, 14, 11, 0);

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function useCountdown(target: Date) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const diff = Math.max(0, target.getTime() - now);
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    done: diff <= 0,
  };
}

const fieldClass =
  "mt-2 w-full min-h-12 rounded-2xl border border-[#e4d9c8] bg-white px-4 text-base text-[#1c1612] outline-none focus:border-[#8f3d32]";

export const thankfulCheckoutNavigation = {
  assign(url: string) {
    window.location.assign(url);
  },
};

function readCastVote(): CastVote | null {
  try {
    const raw = sessionStorage.getItem(VOTE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CastVote>;
    if (!parsed || typeof parsed.menuName !== "string") return null;
    return {
      menuName: parsed.menuName,
      orderNumber: typeof parsed.orderNumber === "string" ? parsed.orderNumber : "",
    };
  } catch {
    return null;
  }
}

function rememberCastVote(vote: CastVote) {
  sessionStorage.setItem(VOTE_KEY, JSON.stringify(vote));
}

export default function Thankful() {
  const [live, setLive] = useState(false);
  const [closed, setClosed] = useState(false);
  const [socialOpen, setSocialOpen] = useState(true);
  const [slots, setSlots] = useState<ThankfulSlot[]>([]);
  const [slotsReady, setSlotsReady] = useState(false);
  const [slotStart, setSlotStart] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [partySize, setPartySize] = useState("1");
  const [menuVote, setMenuVote] = useState<ThankfulMenu["id"] | "">("");
  const [santa, setSanta] = useState<boolean | null>(null);
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [voted, setVoted] = useState<CastVote | null>(() => readCastVote());
  const [termId, setTermId] = useState<ThankfulSocialTermId>("12");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [socialError, setSocialError] = useState("");
  const [buying, setBuying] = useState("");
  const rsvpClock = useCountdown(RSVP_CLOSE_AT);
  const eventClock = useCountdown(EVENT_START_AT);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/thankful/slots")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: SlotResponse | null) => {
        if (cancelled) return;
        const isClosed = data?.closed === true;
        const open = !isClosed && data?.live === true && Array.isArray(data.slots);
        setClosed(isClosed);
        setSocialOpen(data?.socialOpen !== false);
        setLive(open);
        setSlots(isClosed ? [] : open ? data?.slots || [] : openThankfulSlots({ now: new Date(), busy: [] }));
        setSlotsReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLive(false);
        setSlots(openThankfulSlots({ now: new Date(), busy: [] }));
        setSlotsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (closed || voted) return;
    setError("");
    if (!slotStart) {
      setError("Choose a photo time.");
      return;
    }
    if (!menuVote) {
      setError("Choose one menu.");
      return;
    }
    if (santa == null) {
      setError("Let us know if you want Santa.");
      return;
    }
    const party = Number(partySize);
    if (!Number.isInteger(party) || party < 1) {
      setError("Enter the number of people in your party.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/thankful", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          partySize: party,
          menuVote,
          santa,
          notes,
          slotStart,
          website,
        }),
      });
      const data = await response.json().catch(() => null) as { success?: boolean; orderNumber?: string; error?: string; alreadyVoted?: boolean } | null;
      if (response.status === 403) {
        setClosed(true);
        setError(data?.error || THANKFUL_RSVP_CLOSED_ERROR);
        return;
      }
      if (response.status === 409 && data?.alreadyVoted) {
        const cast = { menuName: "", orderNumber: "" };
        rememberCastVote(cast);
        setVoted(cast);
        return;
      }
      if (!response.ok || !data?.success) {
        setError(data?.error || `We could not save that RSVP. Please call ${THANKFUL_PHONE_DISPLAY}.`);
        return;
      }
      const menuName = THANKFUL_MENUS.find((menu) => menu.id === menuVote)?.label || "";
      const cast = { menuName, orderNumber: data.orderNumber || "" };
      rememberCastVote(cast);
      setVoted(cast);
    } catch {
      setError(`We could not save that RSVP. Please call ${THANKFUL_PHONE_DISPLAY}.`);
    } finally {
      setPending(false);
    }
  }

  async function buyPackage(packageId: string) {
    if (!socialOpen || buying) return;
    setSocialError("");
    const checkoutName = buyerName.trim() || name.trim();
    const checkoutEmail = buyerEmail.trim() || email.trim();
    const checkoutPhone = buyerPhone.trim() || phone.trim();
    if (!checkoutName || !checkoutEmail || !checkoutPhone) {
      setSocialError("Enter your name, email, and phone to check out.");
      return;
    }
    setBuying(packageId);
    try {
      const response = await fetch("/api/thankful/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: checkoutName,
          email: checkoutEmail,
          phone: checkoutPhone,
          packageId,
          termId,
          website,
        }),
      });
      const data = await response.json().catch(() => null) as {
        success?: boolean;
        invoiceId?: string;
        payToken?: string;
        orderNumber?: string;
        checkoutReady?: boolean;
        error?: string;
      } | null;
      if (response.status === 403) {
        setSocialOpen(false);
        setSocialError(data?.error || "Pre-event pricing has ended.");
        return;
      }
      if (!response.ok || !data?.success || !data.invoiceId || !data.payToken) {
        setSocialError(data?.error || `We could not start checkout. Please call ${THANKFUL_PHONE_DISPLAY}.`);
        return;
      }
      if (data.checkoutReady) {
        const checkout = await fetch(`/api/payments/invoice/${encodeURIComponent(data.invoiceId)}/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ t: data.payToken }),
        });
        const payment = await checkout.json().catch(() => null) as { checkoutUrl?: string; error?: string } | null;
        if (checkout.ok && payment?.checkoutUrl) {
          thankfulCheckoutNavigation.assign(payment.checkoutUrl);
          return;
        }
        setSocialError(payment?.error || `We saved ${data.orderNumber}. Call ${THANKFUL_PHONE_DISPLAY} to finish payment.`);
        return;
      }
      setSocialError(`We saved ${data.orderNumber}. Call ${THANKFUL_PHONE_DISPLAY} to finish payment.`);
    } catch {
      setSocialError(`We could not start checkout. Please call ${THANKFUL_PHONE_DISPLAY}.`);
    } finally {
      setBuying("");
    }
  }

  const chosen = slots.find((slot) => slot.start === slotStart);
  const term = THANKFUL_SOCIAL_TERMS.find((item) => item.id === termId) || THANKFUL_SOCIAL_TERMS[0];

  const steps = [
    { label: "Menu", done: Boolean(menuVote) },
    { label: "Time", done: Boolean(slotStart) },
    { label: "Santa", done: santa != null },
  ];
  const stepDone = steps.filter((step) => step.done).length;

  return (
    <Layout>
      <article className="bg-[#f8f1e6] pb-28 text-[#1c1612]">
        <header className="relative overflow-hidden bg-[radial-gradient(circle_at_top,#a34a38_0%,#3d221c_32%,#16352b_72%)] pt-28 text-[#f6f1e7]">
          <div className="thankful-lights absolute inset-x-0 top-24 h-4" aria-hidden="true" />
          <div
            data-testid="thankful-video-hero"
            className="relative mx-auto aspect-video w-full max-w-[min(100%,calc(42vh*16/9))] overflow-hidden bg-[#10241c] shadow-[0_0_80px_rgba(231,197,106,0.35)] ring-2 ring-[#e7c56a]"
            aria-label="Client holiday video. The studio will add it here."
          >
            <div data-testid="thankful-lights" className="thankful-lights absolute inset-x-6 top-5 h-3 sm:inset-x-10" aria-hidden="true" />
            <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs uppercase tracking-[0.32em] text-[#e7c56a]">Client holiday video</p>
            <div className="thankful-garland absolute inset-x-0 bottom-0 h-3" aria-hidden="true" />
          </div>
          <div className="relative mx-auto max-w-xl px-6 pb-12 pt-8 text-center">
            <span className="thankful-float absolute left-6 top-6 text-2xl text-[#e7c56a]" aria-hidden="true">♥</span>
            <span className="thankful-float absolute right-8 top-16 text-xl text-[#f0c14d]" style={{ animationDelay: "1.2s" }} aria-hidden="true">✦</span>
            <img data-testid="thankful-logo" src="/media/logos/logo-white-large.png" alt="Iconic Images" className="mx-auto h-10 w-auto sm:h-12" />
            <h1 className="mt-6 font-serif text-5xl leading-[0.95] tracking-tight sm:text-7xl">
              {THANKFUL_HEADLINE}
            </h1>
            <p className="mt-5 text-lg text-[#f6f1e7]/90">Bring the people you love. We’ll bring Santa.</p>
            <p className="mt-3 text-base text-[#e7c56a]">{THANKFUL_WHEN_LABEL}</p>
            {!closed && !rsvpClock.done && (
              <div className="mt-8 flex flex-wrap justify-center gap-3" data-testid="thankful-countdown">
                <p className="rounded-full bg-black/30 px-4 py-2 text-sm">
                  RSVP closes in {rsvpClock.days}d {pad(rsvpClock.hours)}h {pad(rsvpClock.minutes)}m {pad(rsvpClock.seconds)}s
                </p>
                <p className="rounded-full bg-black/30 px-4 py-2 text-sm">
                  Doors {eventClock.days}d {pad(eventClock.hours)}h
                </p>
              </div>
            )}
            {closed ? (
              <p className="mt-8 text-base" data-testid="thankful-closed">RSVPs are closed.</p>
            ) : (
              <a
                href="#rsvp"
                className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-[#c45a42] px-8 text-base font-semibold text-white shadow-[0_0_28px_rgba(196,90,66,0.55)] transition hover:scale-105"
              >
                RSVP
              </a>
            )}
          </div>
        </header>

        <p className="mx-auto max-w-xl px-6 pt-14 text-center text-sm tracking-wide text-[#8f3d32]" data-testid="thankful-deadline">
          RSVP and menu vote close {THANKFUL_RSVP_CLOSES_LABEL}.
        </p>

        <section className="mx-auto max-w-xl px-6 pt-14" data-testid="thankful-photo-strip" aria-label="Event photos">
          <p className="text-center text-xs uppercase tracking-[0.28em] text-[#8f3d32]">Event photos</p>
          <p className="mt-2 text-center text-sm text-[#1c1612]/70">Photos go here.</p>
          <div className="mt-5 grid grid-cols-4 gap-3">
            {PHOTO_PLACES.map((label) => (
              <div key={label} className="flex aspect-[4/3] items-end rounded-2xl border border-dashed border-[#c45a42]/50 bg-[#fffaf3] p-2 shadow-[0_8px_24px_rgba(143,61,50,0.06)]">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8f3d32]">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="mx-auto max-w-xl px-6 py-16">
          <p className="font-serif text-4xl leading-tight">Your people. Our studio. One Saturday.</p>
          <p className="mt-4 text-lg leading-relaxed">
            Bring family, friends, and pets. Headshots, a free content day, and Santa.
          </p>
          <p className="mt-4 text-base leading-relaxed text-[#1c1612]/75" data-testid="thankful-location">
            {THANKFUL_STUDIO_ADDRESS}
            {" · "}
            <a className="underline decoration-[#8f3d32]/40 underline-offset-4" href={THANKFUL_PHONE_HREF}>{THANKFUL_PHONE_DISPLAY}</a>
            {" · "}
            <a className="underline decoration-[#8f3d32]/40 underline-offset-4" href={THANKFUL_EMAIL_HREF}>{THANKFUL_EMAIL}</a>
          </p>

          {voted ? (
            <section data-testid="thankful-voted" className="mt-20">
              <h2 className="font-serif text-4xl">You already voted</h2>
              <p className="mt-4 text-lg leading-relaxed">
                {voted.menuName ? `${voted.menuName} is your one vote.` : THANKFUL_ALREADY_VOTED_ERROR}
              </p>
              {voted.orderNumber ? (
                <p className="mt-4 text-lg leading-relaxed">
                  {voted.orderNumber} is saved.{chosen ? ` ${chosen.label}.` : ""} We’ll see you Saturday.
                </p>
              ) : null}
              <p className="mt-4 text-base text-[#1c1612]/75">One menu vote per email. That vote stays as it is.</p>
              <p className="mt-8 text-sm text-[#1c1612]/70">{LEGAL_BUSINESS_NAME}</p>
            </section>
          ) : closed ? (
            <p className="mt-20 text-lg">{THANKFUL_RSVP_CLOSED_ERROR}</p>
          ) : (
            <form id="rsvp" className="mt-16 scroll-mt-28 space-y-14" onSubmit={onSubmit} data-testid="thankful-form">
              <div data-testid="thankful-progress">
                <p className="text-xs uppercase tracking-[0.22em] text-[#8f3d32]">Step {Math.min(stepDone + 1, 3)} of 3</p>
                <div className="mt-3 flex gap-2">
                  {steps.map((step) => (
                    <div key={step.label} className="flex-1">
                      <div className={`h-1.5 rounded-full ${step.done ? "bg-[#c45a42]" : "bg-[#eadcc8]"}`} />
                      <p className={`mt-2 text-xs font-semibold ${step.done ? "text-[#8f3d32]" : "text-[#1c1612]/50"}`}>{step.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <fieldset className="space-y-6" data-testid="thankful-slots">
                <legend className="font-serif text-4xl">Grab a photo time</legend>
                <p className="text-sm leading-relaxed text-[#1c1612]/70">15 minutes, between 11 AM and 3 PM.</p>
                {!live && slotsReady && (
                  <p className="text-sm leading-relaxed text-[#1c1612]/70" data-testid="thankful-calendar-note">
                    We’ll confirm this time. Call {THANKFUL_PHONE_DISPLAY} if you need another hour.
                  </p>
                )}
                {!slotsReady && <p className="text-sm">Checking open times.</p>}
                {slotsReady && slots.length === 0 && (
                  <p className="text-sm">No open photo times. Call {THANKFUL_PHONE_DISPLAY}.</p>
                )}
                {chosen && (
                  <p className="rounded-2xl bg-[#1b332b] px-4 py-3 text-sm font-semibold text-[#f6f1e7]" data-testid="thankful-chosen">
                    {chosen.label} is yours.
                  </p>
                )}
                {slots.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {slots.map((slot) => (
                      <button
                        key={slot.start}
                        type="button"
                        data-testid={`slot-${slot.start}`}
                        aria-pressed={slot.start === slotStart}
                        onClick={() => setSlotStart(slot.start)}
                        className={`min-h-14 min-w-28 rounded-2xl border px-4 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-md ${slot.start === slotStart ? "scale-105 border-[#c45a42] bg-[#c45a42] text-white shadow-lg" : "border-[#e4d9c8] bg-white"}`}
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                )}
              </fieldset>

              <div className="space-y-6">
                <div>
                  <label htmlFor="thankful-name" className="text-sm font-semibold">Name</label>
                  <input id="thankful-name" className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
                </div>
                <div>
                  <label htmlFor="thankful-email" className="text-sm font-semibold">Email</label>
                  <input id="thankful-email" type="email" className={fieldClass} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
                </div>
                <div>
                  <label htmlFor="thankful-phone" className="text-sm font-semibold">Phone</label>
                  <input id="thankful-phone" className={fieldClass} value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" required />
                </div>
                <div>
                  <label htmlFor="thankful-party" className="text-sm font-semibold">Number in party</label>
                  <input id="thankful-party" type="number" min={1} max={50} step={1} className={fieldClass} value={partySize} onChange={(event) => setPartySize(event.target.value)} required />
                </div>
              </div>

              <fieldset className="space-y-4" data-testid="thankful-menus">
                <legend className="font-serif text-4xl">Vote your menu</legend>
                <p className="text-sm leading-relaxed text-[#1c1612]/70" data-testid="thankful-vote-rule">{THANKFUL_VOTE_RULE}</p>
                <p className="text-sm leading-relaxed text-[#1c1612]/70">{THANKFUL_DRINKS_NOTE}</p>
                {THANKFUL_MENUS.map((menu) => {
                  const selected = menuVote === menu.id;
                  return (
                    <label key={menu.id} className={`block cursor-pointer rounded-3xl border px-4 py-4 transition hover:-translate-y-0.5 hover:shadow-md ${selected ? "border-[#c45a42] bg-[#fff4ef] shadow-md" : "border-[#eadcc8] bg-white"}`}>
                      <input
                        className="sr-only"
                        type="radio"
                        name="menuVote"
                        value={menu.id}
                        checked={selected}
                        onChange={() => setMenuVote(menu.id)}
                      />
                      <span className={`text-base font-semibold ${selected ? "text-[#8f3d32]" : ""}`}>{selected ? "✓ " : ""}{menu.label}</span>
                      <span className="mt-2 block text-sm leading-7 text-[#1c1612]/80">{menu.dishes.join(" · ")}</span>
                    </label>
                  );
                })}
              </fieldset>

              <fieldset>
                <legend className="font-serif text-4xl">Santa?</legend>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button type="button" aria-pressed={santa === true} onClick={() => setSanta(true)} className={`min-h-14 rounded-full border px-6 text-sm font-semibold transition hover:-translate-y-0.5 ${santa === true ? "scale-105 border-[#c45a42] bg-[#c45a42] text-white shadow-lg" : "border-[#e4d9c8] bg-white"}`}>Santa</button>
                  <button type="button" aria-pressed={santa === false} onClick={() => setSanta(false)} className={`min-h-14 rounded-full border px-6 text-sm font-semibold transition hover:-translate-y-0.5 ${santa === false ? "scale-105 border-[#1b332b] bg-[#1b332b] text-[#f6f1e7] shadow-lg" : "border-[#e4d9c8] bg-white"}`}>No Santa</button>
                </div>
              </fieldset>

              <div>
                <label htmlFor="thankful-notes" className="text-sm font-semibold">Notes <span className="font-normal text-[#1c1612]/60">(optional)</span></label>
                <textarea id="thankful-notes" className={`${fieldClass} min-h-28 py-3`} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} />
              </div>

              <input
                name="website"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute -left-[9999px] h-0 w-0"
              />

              {error && <p className="text-sm font-medium text-red-800" role="alert">{error}</p>}

              <button
                type="submit"
                data-testid="thankful-submit"
                disabled={pending || closed || Boolean(voted)}
                className="inline-flex min-h-14 items-center justify-center rounded-full bg-[#c45a42] px-8 text-base font-semibold text-white shadow-[0_10px_30px_rgba(196,90,66,0.35)] transition hover:scale-105 disabled:opacity-60"
              >
                {pending ? "Saving" : "Save my RSVP"}
              </button>
              <p className="text-sm text-[#1c1612]/60">{LEGAL_BUSINESS_NAME}</p>
            </form>
          )}

          <section className="mt-24" data-testid="thankful-social" aria-label="Social Packages">
            <p className="text-xs uppercase tracking-[0.22em] text-[#8f3d32]">Last call</p>
            <h2 className="mt-3 font-serif text-4xl leading-tight">Half off, before the public sees it.</h2>
            <p className="mt-4 text-base leading-relaxed" data-testid="thankful-lock">{THANKFUL_SOCIAL_LOCK_LABEL}</p>
            <p className="mt-3 text-sm leading-relaxed text-[#1c1612]/70">This price ends before the doors open. After that, it’s the public rate.</p>
            {socialOpen ? (
              <>
                <div className="mt-8 flex flex-wrap gap-3" data-testid="thankful-terms">
                  {THANKFUL_SOCIAL_TERMS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`term-${item.id}`}
                      aria-pressed={item.id === termId}
                      onClick={() => setTermId(item.id)}
                      className={`min-h-12 rounded-full border px-4 text-sm font-semibold transition hover:-translate-y-0.5 ${item.id === termId ? "scale-105 border-[#c45a42] bg-[#c45a42] text-white shadow-md" : "border-[#e4d9c8] bg-white"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-sm text-[#1c1612]/75">{term.detail}</p>
                <div className="mt-8 space-y-4">
                  <div>
                    <label htmlFor="thankful-buyer-name" className="text-sm font-semibold">Name</label>
                    <input id="thankful-buyer-name" className={fieldClass} value={buyerName} onChange={(event) => setBuyerName(event.target.value)} autoComplete="name" />
                  </div>
                  <div>
                    <label htmlFor="thankful-buyer-email" className="text-sm font-semibold">Email</label>
                    <input id="thankful-buyer-email" type="email" className={fieldClass} value={buyerEmail} onChange={(event) => setBuyerEmail(event.target.value)} autoComplete="email" />
                  </div>
                  <div>
                    <label htmlFor="thankful-buyer-phone" className="text-sm font-semibold">Phone</label>
                    <input id="thankful-buyer-phone" className={fieldClass} value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} autoComplete="tel" />
                  </div>
                </div>
                <div className="mt-8 space-y-4">
                  {THANKFUL_SOCIAL_PACKAGES.map((pkg) => {
                    const quote = quoteThankfulSocial(pkg.id, termId);
                    if (!quote) return null;
                    const sale = termId === "month"
                      ? `${thankfulMoney(quote.saleMonthlyCents)}/mo`
                      : thankfulMoney(quote.subtotalCents);
                    return (
                      <article key={pkg.id} data-testid={`social-${pkg.id}`} className="flex items-center justify-between gap-4 rounded-3xl border border-[#eadcc8] bg-white px-5 py-4 transition hover:-translate-y-1 hover:shadow-lg">
                        <div>
                          <h3 className="font-serif text-xl">{pkg.name}</h3>
                          <p className="mt-1 text-sm text-[#1c1612]/50 line-through">{thankfulMoney(quote.regularMonthlyCents)}/mo</p>
                          <p className="text-2xl font-semibold text-[#8f3d32]">{sale}</p>
                        </div>
                        <button
                          type="button"
                          data-testid={`buy-${pkg.id}`}
                          disabled={Boolean(buying)}
                          onClick={() => buyPackage(pkg.id)}
                          className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full bg-[#1b332b] px-5 text-sm font-semibold text-[#f6f1e7] transition hover:scale-105 disabled:opacity-60"
                        >
                          {buying === pkg.id ? "Starting checkout" : "Buy now"}
                        </button>
                      </article>
                    );
                  })}
                </div>
                <p className="mt-6 text-sm text-[#1c1612]/70" data-testid="thankful-processing">{THANKFUL_PROCESSING_NOTE}</p>
                {socialError && <p className="mt-4 text-sm font-medium text-red-800" role="alert">{socialError}</p>}
              </>
            ) : (
              <p className="mt-6 text-base" data-testid="thankful-social-closed">Pre-event pricing has ended.</p>
            )}
          </section>
        </div>
        {!closed && !voted && (
          <a
            href="#rsvp"
            data-testid="thankful-sticky"
            className="fixed bottom-4 left-1/2 z-40 inline-flex min-h-12 -translate-x-1/2 items-center justify-center rounded-full bg-[#c45a42] px-6 text-sm font-semibold text-white shadow-[0_12px_40px_rgba(196,90,66,0.45)]"
          >
            RSVP · closes Nov 9
          </a>
        )}
      </article>
    </Layout>
  );
}
