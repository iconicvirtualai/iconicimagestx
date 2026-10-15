import { FormEvent, useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import {
  THANKFUL_CLIENT_NOTE,
  THANKFUL_DRINKS_NOTE,
  THANKFUL_EMAIL,
  THANKFUL_EMAIL_HREF,
  THANKFUL_EVENT_TITLE,
  THANKFUL_HEADLINE,
  THANKFUL_LOCATION_LINE,
  THANKFUL_MENUS,
  THANKFUL_PHONE_DISPLAY,
  THANKFUL_PHONE_HREF,
  THANKFUL_STUDIO_ADDRESS,
  THANKFUL_WHEN_LABEL,
  openThankfulSlots,
  type ThankfulMenu,
  type ThankfulSlot,
} from "@shared/thankfulEvent";

type SlotResponse = {
  live?: boolean;
  slots?: ThankfulSlot[];
  durationMinutes?: number;
  bufferMinutes?: number;
};

const fieldClass =
  "mt-2 w-full min-h-12 rounded-xl border border-[#d9cfc0] bg-white px-4 text-base text-[#221811] outline-none focus:border-[#1c2e27]";

export default function Thankful() {
  const [live, setLive] = useState(false);
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
  const [orderNumber, setOrderNumber] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/thankful/slots")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: SlotResponse | null) => {
        if (cancelled) return;
        const open = data?.live === true && Array.isArray(data.slots);
        setLive(open);
        setSlots(open ? data.slots || [] : openThankfulSlots({ now: new Date(), busy: [] }));
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
      const data = await response.json().catch(() => null) as { success?: boolean; orderNumber?: string; error?: string } | null;
      if (!response.ok || !data?.success) {
        setError(data?.error || `We could not save that RSVP. Please call ${THANKFUL_PHONE_DISPLAY}.`);
        return;
      }
      setOrderNumber(data.orderNumber || "");
    } catch {
      setError(`We could not save that RSVP. Please call ${THANKFUL_PHONE_DISPLAY}.`);
    } finally {
      setPending(false);
    }
  }

  const chosen = slots.find((slot) => slot.start === slotStart);

  return (
    <Layout>
      <article className="bg-[#f3eee4] text-[#221811]">
        <header className="bg-[#1c2e27] text-[#f6f1e7]">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-16 pt-32 lg:grid-cols-[1.15fr_0.85fr] lg:pt-36">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#d7c4a3]">Iconic Client Event 2026</p>
              <h1 className="mt-4 font-serif text-5xl leading-none tracking-tight sm:text-7xl">
                {THANKFUL_HEADLINE} <span className="text-[#e07a68]" aria-hidden="true">♥</span>
              </h1>
              <p className="mt-4 text-lg text-[#f6f1e7]/90">{THANKFUL_EVENT_TITLE}</p>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#f6f1e7]/90">
                Bring family, friends, and pets. Headshots, a free content day, and Santa.
              </p>
              <p className="mt-6 text-base font-semibold text-[#d7c4a3]">{THANKFUL_WHEN_LABEL}</p>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#f6f1e7]/85" data-testid="thankful-location">
                {THANKFUL_STUDIO_ADDRESS}
                {" | "}
                <a className="underline decoration-[#d7c4a3]/70 underline-offset-4" href={THANKFUL_PHONE_HREF}>{THANKFUL_PHONE_DISPLAY}</a>
                {" | "}
                <a className="underline decoration-[#d7c4a3]/70 underline-offset-4" href={THANKFUL_EMAIL_HREF}>{THANKFUL_EMAIL}</a>
              </p>
              <p className="sr-only">{THANKFUL_LOCATION_LINE}</p>
              <ul className="mt-8 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wider">
                {["Family, friends, and pets", "Headshots", "Free content day", "Santa"].map((item) => (
                  <li key={item} className="rounded-full border border-[#d7c4a3]/40 px-3 py-2">{item}</li>
                ))}
              </ul>
              <p className="mt-6 max-w-xl text-sm leading-relaxed text-[#f6f1e7]/80" data-testid="thankful-client-note">
                {THANKFUL_CLIENT_NOTE}
              </p>
            </div>
            <img
              src="/events/thankful-hero.svg"
              alt="Thankful for You Always, Saturday, Nov 14, 2026 at Studio 105"
              className="w-full rounded-[2rem] border border-[#d7c4a3]/30"
              data-testid="thankful-hero-art"
            />
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-6 py-16">
          <section aria-labelledby="thankful-menus">
            <div className="grid items-end gap-8 lg:grid-cols-[1fr_280px]">
              <div>
                <h2 id="thankful-menus" className="font-serif text-4xl tracking-tight">Vote for one menu</h2>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#221811]/80">{THANKFUL_DRINKS_NOTE}</p>
              </div>
              <img
                src="/events/thankful-menu.svg"
                alt="Menu 1, Menu 2, and Menu 3"
                className="hidden w-full rounded-3xl border border-[#d9cfc0] lg:block"
                data-testid="thankful-menu-art"
              />
            </div>
            <div className="mt-8 grid gap-4 lg:grid-cols-3" data-testid="thankful-menus">
              {THANKFUL_MENUS.map((menu) => {
                const selected = menuVote === menu.id;
                return (
                  <label
                    key={menu.id}
                    className={`block cursor-pointer rounded-3xl border p-5 ${selected ? "border-[#1c2e27] bg-[#1c2e27] text-[#f6f1e7]" : "border-[#d9cfc0] bg-white"}`}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="menuVote"
                      value={menu.id}
                      checked={selected}
                      onChange={() => setMenuVote(menu.id)}
                    />
                    <span className="text-xs font-semibold uppercase tracking-[0.2em]">{menu.label}</span>
                    <ul className="mt-4 space-y-2 text-sm leading-relaxed">
                      {menu.dishes.map((dish) => (
                        <li key={dish}>{dish}</li>
                      ))}
                    </ul>
                  </label>
                );
              })}
            </div>
          </section>

          {orderNumber ? (
            <section data-testid="thankful-saved" className="mt-14 rounded-[2rem] bg-[#1c2e27] px-6 py-10 text-[#f6f1e7]">
              <h2 className="font-serif text-4xl">You’re on the list</h2>
              <p className="mt-4 text-lg leading-relaxed">
                {orderNumber ? `${orderNumber} is saved.` : "Your RSVP is saved."} {chosen ? `${chosen.label}.` : ""} We’ll see you Saturday. This page does not take payment.
              </p>
              <p className="mt-6 text-sm text-[#d7c4a3]">{LEGAL_BUSINESS_NAME}</p>
            </section>
          ) : (
            <form className="mt-14 space-y-8" onSubmit={onSubmit} data-testid="thankful-form">
              <fieldset className="space-y-4" data-testid="thankful-slots">
                <legend className="font-serif text-3xl">Choose a 15-minute photo time</legend>
                <p className="max-w-2xl text-sm leading-relaxed text-[#221811]/75">
                  Times run {THANKFUL_WHEN_LABEL}. Each opening is 15 minutes, with a 5-minute cushion around anything already on the studio calendar.
                </p>
                {!live && slotsReady && (
                  <p className="text-sm leading-relaxed text-[#221811]/75" data-testid="thankful-calendar-note">
                    We’ll confirm this time with the studio. Call {THANKFUL_PHONE_DISPLAY} if you need a different hour.
                  </p>
                )}
                {!slotsReady && <p className="text-sm">Checking open times.</p>}
                {slotsReady && slots.length === 0 && (
                  <p className="text-sm">No open photo times left. Call {THANKFUL_PHONE_DISPLAY}.</p>
                )}
                {slots.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {slots.map((slot) => (
                      <button
                        key={slot.start}
                        type="button"
                        data-testid={`slot-${slot.start}`}
                        aria-pressed={slot.start === slotStart}
                        onClick={() => setSlotStart(slot.start)}
                        className={`min-h-12 rounded-xl border px-3 text-sm font-semibold ${slot.start === slotStart ? "border-[#1c2e27] bg-[#1c2e27] text-[#f6f1e7]" : "border-[#d9cfc0] bg-white"}`}
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                )}
              </fieldset>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
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
                <fieldset>
                  <legend className="text-sm font-semibold">Santa</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" aria-pressed={santa === true} onClick={() => setSanta(true)} className={`min-h-12 rounded-xl border text-sm font-semibold ${santa === true ? "border-[#1c2e27] bg-[#1c2e27] text-[#f6f1e7]" : "border-[#d9cfc0] bg-white"}`}>Santa</button>
                    <button type="button" aria-pressed={santa === false} onClick={() => setSanta(false)} className={`min-h-12 rounded-xl border text-sm font-semibold ${santa === false ? "border-[#1c2e27] bg-[#1c2e27] text-[#f6f1e7]" : "border-[#d9cfc0] bg-white"}`}>No Santa</button>
                  </div>
                </fieldset>
                <div className="sm:col-span-2">
                  <label htmlFor="thankful-notes" className="text-sm font-semibold">Notes <span className="font-normal text-[#221811]/60">(optional)</span></label>
                  <textarea id="thankful-notes" className={`${fieldClass} min-h-28 py-3`} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} />
                </div>
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

              {error && <p className="text-sm font-medium text-red-700" role="alert">{error}</p>}

              <button
                type="submit"
                data-testid="thankful-submit"
                disabled={pending}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#8f3d32] px-8 text-base font-semibold text-white disabled:opacity-60"
              >
                Save my photo time
              </button>
              <p className="text-sm leading-relaxed text-[#221811]/70">
                RSVP and menu vote only. Payment can come later. {LEGAL_BUSINESS_NAME}.
              </p>
            </form>
          )}
        </div>
      </article>
    </Layout>
  );
}
