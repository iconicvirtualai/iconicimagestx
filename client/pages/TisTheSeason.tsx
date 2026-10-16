import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { ProcessingFeeNote } from "@/components/ProcessingFeeNote";
import { PublicContactLine } from "@/components/PublicContactLine";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import {
  HOLIDAY_ADDONS,
  HOLIDAY_BOOK_END,
  HOLIDAY_BOOK_START,
  HOLIDAY_CALENDAR_NOTE,
  HOLIDAY_GIFT,
  HOLIDAY_HOOK,
  HOLIDAY_LEAD_RULE,
  HOLIDAY_PACKAGES,
  HOLIDAY_PROMO_CODE,
  HOLIDAY_PROMO_NAME,
  HOLIDAY_BOOK_WINDOW,
  holidayMinimumQuote,
  holidayNeedsLead,
  holidayToday,
  openHolidaySlots,
  parseHolidayBooking,
  quoteHolidayPackage,
  type HolidayAddonId,
  type HolidayPackageId,
  type HolidaySlot,
} from "@shared/holidayPromo";
import { formatUsd, PUBLIC_PROCESSING_LABEL } from "@shared/publicRequests";

const fieldClass =
  "mt-2 w-full min-h-12 rounded-2xl border border-[#e4d9c8] bg-white px-4 text-base text-[#1c1612] outline-none focus:border-[#8f3d32]";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function monthCells(year: number, month: number) {
  const lead = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<string | null> = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= count; day += 1) {
    cells.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return cells;
}

export default function TisTheSeason() {
  const today = useMemo(() => holidayToday(), []);
  const [packageId, setPackageId] = useState<HolidayPackageId>("single");
  const [families, setFamilies] = useState(1);
  const [addons, setAddons] = useState<HolidayAddonId[]>([]);
  const [slots, setSlots] = useState<HolidaySlot[]>([]);
  const [live, setLive] = useState(false);
  const [slotsReady, setSlotsReady] = useState(false);
  const [day, setDay] = useState("");
  const [slotStart, setSlotStart] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [received, setReceived] = useState(false);

  const selected = HOLIDAY_PACKAGES.find((item) => item.id === packageId) ?? HOLIDAY_PACKAGES[0];
  const needsLead = holidayNeedsLead(packageId, addons);
  const quote = useMemo(() => quoteHolidayPackage(selected.id, families), [selected.id, families]);
  const localSlots = useMemo(
    () => openHolidaySlots({ now: new Date(), packageId, addonIds: addons }),
    [packageId, addons],
  );

  useEffect(() => {
    let cancelled = false;
    setSlots(localSlots);
    setLive(false);
    setSlotsReady(true);
    const params = new URLSearchParams({ packageId, addons: addons.join(",") });
    fetch(`/api/public-campaigns/holiday/slots?${params}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { live?: boolean; slots?: HolidaySlot[] } | null) => {
        if (cancelled || !data || !Array.isArray(data.slots)) return;
        setSlots(data.slots);
        setLive(data.live === true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [packageId, addons, localSlots]);

  const openDays = useMemo(() => [...new Set(slots.map((slot) => slot.date))], [slots]);

  useEffect(() => {
    if (!openDays.includes(day)) setDay(openDays[0] || "");
  }, [openDays, day]);

  useEffect(() => {
    if (slotStart && !slots.some((slot) => slot.start === slotStart)) setSlotStart("");
  }, [slots, slotStart]);

  const daySlots = slots.filter((slot) => slot.date === day);
  const chosen = slots.find((slot) => slot.start === slotStart);

  function choosePackage(id: HolidayPackageId) {
    const pkg = HOLIDAY_PACKAGES.find((item) => item.id === id) ?? HOLIDAY_PACKAGES[0];
    setPackageId(id);
    setFamilies((current) => (pkg.pricing === "flat" ? 1 : Math.max(current, pkg.minFamilies)));
  }

  function toggleAddon(id: HolidayAddonId) {
    setAddons((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const payload = {
      name,
      email,
      phone,
      packageId,
      families,
      addons,
      notes,
      website,
      slotStart,
      preferredDate: chosen?.date || "",
      preferredTime: chosen?.clock || "",
    };
    const parsed = parseHolidayBooking(payload, { today });
    if (parsed.ok === false) {
      if (!parsed.honeypot) setError(parsed.error);
      else setReceived(true);
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/public-campaigns/holiday", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "We could not save that request.");
      setReceived(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "We could not save that request.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Layout>
      <article className="bg-[#f8f1e6] text-[#1c1612]">
        <header className="bg-[radial-gradient(circle_at_top,#5a3028_0%,#1b332b_46%,#12241c_100%)] pt-36 text-[#f6f1e7]">
          <div
            data-testid="holiday-video"
            className="relative aspect-video w-full overflow-hidden bg-[#10241c]"
            style={{ aspectRatio: "16 / 9" }}
            aria-label="Client holiday video. The studio will add it here."
          >
            <div className="festive-lights absolute inset-x-6 top-5 h-3 sm:inset-x-10" aria-hidden="true" />
            <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs uppercase tracking-[0.32em] text-[#e7c56a]">Client holiday video</p>
            <div className="festive-garland absolute inset-x-0 bottom-0 h-3" aria-hidden="true" />
          </div>
          <div className="mx-auto max-w-xl px-6 py-14 text-center sm:py-16">
            <p className="text-sm tracking-wide text-[#e7c56a]">{HOLIDAY_BOOK_WINDOW}</p>
            <p className="mt-3 text-sm font-semibold" data-testid="holiday-code">{HOLIDAY_PROMO_CODE}</p>
            <h1 className="mt-6 font-serif text-5xl leading-tight tracking-tight sm:text-6xl" data-testid="holiday-title">
              {HOLIDAY_PROMO_NAME}
            </h1>
            <p className="mt-5 text-lg leading-relaxed">{HOLIDAY_HOOK}</p>
            <a
              href="#holiday-booking"
              className="mt-8 inline-flex min-h-12 items-center justify-center rounded-full bg-[#c45a42] px-8 text-base font-semibold text-white"
            >
              Book your holiday session
            </a>
          </div>
        </header>

        <div className="mx-auto max-w-xl px-6 py-16">
          <section className="space-y-12" aria-labelledby="holiday-packages">
            <h2 id="holiday-packages" className="font-serif text-4xl">Packages</h2>
            {HOLIDAY_PACKAGES.map((pkg) => {
              const minimum = holidayMinimumQuote(pkg.id);
              return (
                <article key={pkg.id} data-testid={`package-${pkg.id}`}>
                  <p className="text-sm text-[#8f3d32]">{pkg.letter}</p>
                  <h3 className="mt-1 font-serif text-3xl">{pkg.name}</h3>
                  <p className="mt-2 text-3xl font-semibold text-[#8f3d32]">{pkg.headline}</p>
                  <p className="mt-2 text-base leading-relaxed text-[#1c1612]/75">{pkg.summary}</p>
                  {pkg.pricing === "per-family" ? (
                    <p className="mt-2 text-sm text-[#1c1612]/70" data-testid={`math-${pkg.id}`}>
                      {pkg.minFamilies} × {formatUsd(pkg.rate)} + {pkg.rentalHours} hr × {formatUsd(pkg.rentalHourly)}/hr = {formatUsd(minimum.subtotal)}
                    </p>
                  ) : null}
                </article>
              );
            })}
            <ProcessingFeeNote className="text-sm text-[#1c1612]/70" />
            <p className="text-base leading-relaxed">{HOLIDAY_GIFT}</p>
          </section>

          <section className="mt-16">
            <h2 className="font-serif text-4xl">Add-ons</h2>
            <ul className="mt-6 space-y-5 text-base leading-relaxed">
              {HOLIDAY_ADDONS.map((addon) => (
                <li key={addon.id}>
                  <span className="font-semibold">{addon.name}</span>
                  <span className="text-[#1c1612]/70"> — {addon.detail}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm leading-relaxed text-[#1c1612]/70">{HOLIDAY_LEAD_RULE}</p>
          </section>

          {received ? (
            <p className="mt-16 text-lg leading-relaxed" role="status" data-testid="holiday-received">
              Request received. The office will confirm your session. This is not a charge.
            </p>
          ) : (
            <form id="holiday-booking" className="mt-16 scroll-mt-28 space-y-14" onSubmit={onSubmit} data-testid="holiday-booking-form" noValidate>
              <fieldset className="space-y-6">
                <legend className="font-serif text-3xl">Package</legend>
                {HOLIDAY_PACKAGES.map((pkg) => {
                  const active = packageId === pkg.id;
                  return (
                    <label key={pkg.id} className="block cursor-pointer">
                      <input
                        className="sr-only"
                        type="radio"
                        name="packageId"
                        value={pkg.id}
                        checked={active}
                        onChange={() => choosePackage(pkg.id)}
                      />
                      <span className={`text-base font-semibold ${active ? "text-[#8f3d32]" : ""}`}>
                        {pkg.letter} · {pkg.name} · {pkg.headline}
                      </span>
                    </label>
                  );
                })}
              </fieldset>

              {selected.pricing === "per-family" ? (
                <div>
                  <label htmlFor="holiday-families" className="text-sm font-semibold">Families</label>
                  <input
                    id="holiday-families"
                    className={fieldClass}
                    type="number"
                    min={selected.minFamilies}
                    max={40}
                    value={families}
                    onChange={(event) => setFamilies(Number(event.target.value))}
                  />
                </div>
              ) : null}

              <fieldset className="space-y-6">
                <legend className="font-serif text-3xl">Add-ons</legend>
                {HOLIDAY_ADDONS.map((addon) => (
                  <label key={addon.id} className="flex items-start gap-3 text-base">
                    <input
                      className="mt-1"
                      type="checkbox"
                      name="addons"
                      value={addon.id}
                      checked={addons.includes(addon.id)}
                      onChange={() => toggleAddon(addon.id)}
                    />
                    <span>{addon.name}</span>
                  </label>
                ))}
              </fieldset>

              <fieldset className="space-y-6" data-testid="holiday-calendar">
                <legend className="font-serif text-3xl">Session time</legend>
                <p className="text-sm leading-relaxed text-[#1c1612]/70">Studio 105. 10 AM–5 PM CT.</p>
                {needsLead ? <p className="text-sm leading-relaxed text-[#8f3d32]">{HOLIDAY_LEAD_RULE}</p> : null}
                {!live && slotsReady ? (
                  <p className="text-sm leading-relaxed text-[#1c1612]/70" data-testid="holiday-calendar-note">{HOLIDAY_CALENDAR_NOTE}</p>
                ) : null}
                {!slotsReady ? <p className="text-sm">Checking open times.</p> : null}
                {slotsReady && slots.length === 0 ? (
                  <p className="text-sm">No open session times. Call {BUSINESS_CONTACT.phoneDisplay}.</p>
                ) : null}
                {slots.length > 0 ? (
                  <div className="space-y-8">
                    {[{ year: 2026, month: 11, label: "November" }, { year: 2026, month: 12, label: "December" }].map((month) => (
                      <div key={month.label}>
                        <p className="font-serif text-2xl">{month.label}</p>
                        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-[#1c1612]/50">
                          {WEEKDAYS.map((label, index) => <span key={`${month.label}-${index}`}>{label}</span>)}
                          {monthCells(month.year, month.month).map((date, index) => {
                            if (!date) return <span key={`${month.label}-pad-${index}`} />;
                            const dayNumber = Number(date.slice(-2));
                            const inWindow = date >= HOLIDAY_BOOK_START && date <= HOLIDAY_BOOK_END;
                            const open = openDays.includes(date);
                            const selectedDay = date === day;
                            return (
                              <button
                                key={date}
                                type="button"
                                disabled={!open}
                                data-testid={open ? `holiday-day-${date}` : undefined}
                                aria-pressed={selectedDay}
                                onClick={() => setDay(date)}
                                className={`min-h-11 rounded-full text-sm font-semibold ${selectedDay ? "bg-[#1b332b] text-[#f6f1e7]" : open ? "bg-white text-[#1c1612]" : inWindow ? "text-[#1c1612]/30" : "text-[#1c1612]/20"}`}
                              >
                                {dayNumber}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-3">
                      {daySlots.map((slot) => (
                        <button
                          key={slot.start}
                          type="button"
                          data-testid={`holiday-slot-${slot.start}`}
                          aria-pressed={slot.start === slotStart}
                          onClick={() => setSlotStart(slot.start)}
                          className={`min-h-12 min-w-28 rounded-full border px-4 text-sm font-semibold ${slot.start === slotStart ? "border-[#1b332b] bg-[#1b332b] text-[#f6f1e7]" : "border-[#e4d9c8] bg-white"}`}
                        >
                          {slot.time}
                        </button>
                      ))}
                    </div>
                    {chosen ? <p className="text-sm font-semibold">{chosen.label}</p> : null}
                  </div>
                ) : null}
              </fieldset>

              <div className="space-y-6">
                <div>
                  <label htmlFor="holiday-name" className="text-sm font-semibold">Name</label>
                  <input id="holiday-name" className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
                </div>
                <div>
                  <label htmlFor="holiday-email" className="text-sm font-semibold">Email</label>
                  <input id="holiday-email" className={fieldClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
                </div>
                <div>
                  <label htmlFor="holiday-phone" className="text-sm font-semibold">Phone</label>
                  <input id="holiday-phone" className={fieldClass} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" />
                </div>
              </div>

              {quote ? (
                <p className="text-sm leading-relaxed text-[#1c1612]/80" data-testid="holiday-quote">
                  {formatUsd(quote.subtotal)} session · {PUBLIC_PROCESSING_LABEL} {formatUsd(quote.processing)} · {formatUsd(quote.total)} if confirmed
                </p>
              ) : null}
              <ProcessingFeeNote className="text-sm text-[#1c1612]/70" />

              <div>
                <label htmlFor="holiday-notes" className="text-sm font-semibold">Notes <span className="font-normal text-[#1c1612]/60">(optional)</span></label>
                <textarea id="holiday-notes" className={`${fieldClass} min-h-28 py-3`} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
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

              {error ? <p className="text-sm font-medium text-red-800" role="alert" data-testid="holiday-error">{error}</p> : null}

              <button
                type="submit"
                data-testid="holiday-submit"
                disabled={pending}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#8f3d32] px-8 text-base font-semibold text-white disabled:opacity-60"
              >
                {pending ? "Sending" : "Request booking"}
              </button>
              <p className="text-sm text-[#1c1612]/60">This form does not charge a card. {LEGAL_BUSINESS_NAME}</p>
            </form>
          )}

          <p className="mt-16 text-sm">
            <Link className="underline underline-offset-4" to="/studios">Iconic Studios</Link>
          </p>
          <PublicContactLine className="mt-4 text-sm" linkClassName="underline underline-offset-4" />
          <p className="mt-4 text-sm">
            <a className="underline underline-offset-4" href={BUSINESS_CONTACT.emailHref}>Ask about a menu</a>
          </p>
        </div>
      </article>
    </Layout>
  );
}
