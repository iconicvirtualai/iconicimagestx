import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { ProcessingFeeNote } from "@/components/ProcessingFeeNote";
import { PublicContactLine } from "@/components/PublicContactLine";
import { BUSINESS_CONTACT, LEGAL_BUSINESS_NAME } from "@shared/businessContact";
import {
  HOLIDAY_ADDONS,
  HOLIDAY_BOOK_END,
  HOLIDAY_GIFT,
  HOLIDAY_HOOK,
  HOLIDAY_LEAD_RULE,
  HOLIDAY_PACKAGES,
  HOLIDAY_PROMO_CODE,
  HOLIDAY_PROMO_NAME,
  HOLIDAY_BOOK_WINDOW,
  holidayEarliestDate,
  holidayMinimumQuote,
  holidayNeedsLead,
  holidayToday,
  parseHolidayBooking,
  quoteHolidayPackage,
  type HolidayAddonId,
  type HolidayPackageId,
} from "@shared/holidayPromo";
import { formatUsd, PUBLIC_PROCESSING_LABEL } from "@shared/publicRequests";

const fieldClass =
  "mt-2 w-full min-h-12 rounded-2xl border border-[#5c2a33]/20 bg-white px-4 text-base text-[#2a1214] outline-none focus:border-[#8f3d4a]";

export default function TisTheSeason() {
  const today = useMemo(() => holidayToday(), []);
  const [packageId, setPackageId] = useState<HolidayPackageId>("single");
  const [families, setFamilies] = useState(1);
  const [addons, setAddons] = useState<HolidayAddonId[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [received, setReceived] = useState(false);

  const selected = HOLIDAY_PACKAGES.find((item) => item.id === packageId) ?? HOLIDAY_PACKAGES[0];
  const needsLead = holidayNeedsLead(packageId, addons);
  const earliest = holidayEarliestDate({ packageId, addonIds: addons, today });
  const quote = useMemo(() => quoteHolidayPackage(selected.id, families), [selected.id, families]);

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
      preferredDate,
      preferredTime,
      families,
      addons,
      notes,
      website,
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
      <div className="bg-[#f6efe6] text-[#2a1214]">
        <section className="px-6 pt-40">
          <div className="mx-auto max-w-5xl">
            <div
              className="aspect-video w-full overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#6e2433] via-[#2a1214] to-[#1d3a32]"
              style={{ aspectRatio: "16 / 9" }}
              data-testid="holiday-video"
            >
              <div className="flex h-full items-end p-6 sm:p-10">
                <p className="text-xs uppercase tracking-[0.28em] text-[#f6efe6]/80">Holiday video</p>
              </div>
            </div>
            <div className="mx-auto mt-12 max-w-xl text-center">
              <p className="text-sm tracking-wide text-[#8f3d4a]">{HOLIDAY_BOOK_WINDOW}</p>
              <p className="mt-3 text-sm font-semibold" data-testid="holiday-code">{HOLIDAY_PROMO_CODE}</p>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl" data-testid="holiday-title">
                {HOLIDAY_PROMO_NAME}
              </h1>
              <p className="mt-5 text-lg leading-relaxed text-[#2a1214]/80">{HOLIDAY_HOOK}</p>
              <a
                href="#holiday-booking"
                className="mt-8 inline-flex rounded-full bg-[#6e2433] px-7 py-3 text-sm font-semibold text-[#f6efe6]"
              >
                Book your holiday session
              </a>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-24" aria-labelledby="holiday-packages">
          <h2 id="holiday-packages" className="text-center text-sm uppercase tracking-[0.22em] text-[#8f3d4a]">Packages</h2>
          <div className="mt-12 space-y-12">
            {HOLIDAY_PACKAGES.map((pkg) => {
              const minimum = holidayMinimumQuote(pkg.id);
              return (
                <article key={pkg.id} data-testid={`package-${pkg.id}`} className="text-center">
                  <p className="text-sm text-[#8f3d4a]">{pkg.letter}</p>
                  <h3 className="mt-2 text-2xl font-semibold">{pkg.name}</h3>
                  <p className="mt-3 text-4xl font-semibold">{pkg.headline}</p>
                  <p className="mt-3 text-base text-[#2a1214]/75">{pkg.summary}</p>
                  {pkg.pricing === "per-family" ? (
                    <p className="mt-3 text-sm text-[#2a1214]/70" data-testid={`math-${pkg.id}`}>
                      {pkg.minFamilies} × {formatUsd(pkg.rate)} + {pkg.rentalHours} hr × {formatUsd(pkg.rentalHourly)}/hr = {formatUsd(minimum.subtotal)}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
          <ProcessingFeeNote className="mt-12 text-center text-sm text-[#2a1214]/70" />
          <p className="mx-auto mt-10 max-w-md text-center text-base leading-relaxed">{HOLIDAY_GIFT}</p>
        </section>

        <section className="mx-auto max-w-xl px-6 pb-8 text-center">
          <h2 className="text-sm uppercase tracking-[0.22em] text-[#8f3d4a]">Add-ons</h2>
          <ul className="mt-8 space-y-5 text-base leading-relaxed">
            {HOLIDAY_ADDONS.map((addon) => (
              <li key={addon.id}>
                <span className="font-semibold">{addon.name}</span>
                <span className="text-[#2a1214]/70"> — {addon.detail}</span>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-sm leading-relaxed text-[#2a1214]/70">{HOLIDAY_LEAD_RULE}</p>
        </section>

        <section id="holiday-booking" className="scroll-mt-28 px-6 py-20">
          <div className="mx-auto max-w-lg">
            <h2 className="text-center text-3xl font-semibold">Book your holiday session</h2>
            <p className="mt-3 text-center text-sm text-[#2a1214]/70">Request booking. This form does not charge a card.</p>
            {received ? (
              <p className="mt-10 text-center text-lg" role="status" data-testid="holiday-received">
                Request received. The office will confirm your session. This is not a charge.
              </p>
            ) : (
              <form className="mt-10 space-y-6" onSubmit={onSubmit} data-testid="holiday-booking-form" noValidate>
                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold">Package</legend>
                  {HOLIDAY_PACKAGES.map((pkg) => (
                    <label key={pkg.id} className="flex items-center gap-3 text-sm">
                      <input
                        type="radio"
                        name="packageId"
                        value={pkg.id}
                        checked={packageId === pkg.id}
                        onChange={() => choosePackage(pkg.id)}
                      />
                      {pkg.letter} · {pkg.name} · {pkg.headline}
                    </label>
                  ))}
                </fieldset>
                {selected.pricing === "per-family" ? (
                  <label className="block text-sm font-semibold">
                    Families
                    <input
                      id="holiday-families"
                      className={fieldClass}
                      type="number"
                      min={selected.minFamilies}
                      max={40}
                      value={families}
                      onChange={(event) => setFamilies(Number(event.target.value))}
                    />
                  </label>
                ) : null}
                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold">Add-ons</legend>
                  {HOLIDAY_ADDONS.map((addon) => (
                    <label key={addon.id} className="flex items-start gap-3 text-sm">
                      <input
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
                {quote ? (
                  <p className="text-sm leading-relaxed text-[#2a1214]/80" data-testid="holiday-quote">
                    {formatUsd(quote.subtotal)} session · {PUBLIC_PROCESSING_LABEL} {formatUsd(quote.processing)} · {formatUsd(quote.total)} if confirmed
                  </p>
                ) : null}
                <ProcessingFeeNote className="text-sm text-[#2a1214]/70" />
                <label className="block text-sm font-semibold">
                  Name
                  <input id="holiday-name" className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
                </label>
                <label className="block text-sm font-semibold">
                  Email
                  <input id="holiday-email" className={fieldClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
                </label>
                <label className="block text-sm font-semibold">
                  Phone
                  <input id="holiday-phone" className={fieldClass} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" />
                </label>
                <label className="block text-sm font-semibold">
                  Preferred date
                  <input
                    id="holiday-date"
                    className={fieldClass}
                    type="date"
                    min={earliest > HOLIDAY_BOOK_END ? HOLIDAY_BOOK_END : earliest}
                    max={HOLIDAY_BOOK_END}
                    value={preferredDate}
                    onChange={(event) => setPreferredDate(event.target.value)}
                  />
                </label>
                {needsLead ? <p className="text-sm text-[#8f3d4a]">{HOLIDAY_LEAD_RULE}</p> : null}
                <label className="block text-sm font-semibold">
                  Preferred time
                  <input id="holiday-time" className={fieldClass} type="time" value={preferredTime} onChange={(event) => setPreferredTime(event.target.value)} />
                </label>
                <label className="block text-sm font-semibold">
                  Notes
                  <textarea id="holiday-notes" className={fieldClass} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
                </label>
                <label className="absolute left-[-9999px]" aria-hidden="true">
                  Website
                  <input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
                </label>
                {error ? (
                  <p className="text-sm font-semibold text-[#8f3d4a]" role="alert" data-testid="holiday-error">{error}</p>
                ) : null}
                <button
                  type="submit"
                  className="w-full rounded-full bg-[#6e2433] px-8 py-4 text-sm font-semibold text-[#f6efe6] disabled:opacity-60"
                  disabled={pending}
                  data-testid="holiday-submit"
                >
                  {pending ? "Sending" : "Request booking"}
                </button>
              </form>
            )}
            <p className="mt-12 text-center text-sm">
              <Link className="underline underline-offset-4" to="/studios">Iconic Studios</Link>
              {" · "}
              {LEGAL_BUSINESS_NAME}
            </p>
            <PublicContactLine className="mt-4 text-center text-sm" linkClassName="underline underline-offset-4" />
            <p className="mt-4 text-center text-sm">
              <a className="underline underline-offset-4" href={BUSINESS_CONTACT.emailHref}>Ask about a menu</a>
            </p>
          </div>
        </section>
      </div>
    </Layout>
  );
}
