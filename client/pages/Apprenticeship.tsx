import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { MoneyAmount } from "@/components/MoneyAmount";
import { useAuth } from "@/contexts/AuthContext";
import {
  APPRENTICESHIP_BALANCE_LINE,
  APPRENTICESHIP_BOOKING_FEE_LINE,
  APPRENTICESHIP_CALENDAR_FALLBACK,
  apprenticeshipPackageViews,
  quoteApprenticeship,
  usd,
  type ApprenticeshipPackageView,
  type ApprenticeshipSlot,
} from "@shared/apprenticeship";
import {
  APPRENTICESHIP_BRIDGE_COPY,
  APPRENTICESHIP_PROGRAM_NAME,
  packagesForStaffEditor,
} from "@shared/bookingCatalog";
import { BUSINESS_CONTACT } from "@shared/businessContact";

export const apprenticeshipCheckoutNavigation = {
  assign(url: string) {
    window.location.assign(url);
  },
};

type SlotResponse = {
  available?: boolean;
  slots?: ApprenticeshipSlot[];
  fallback?: string | null;
  durationMinutes?: number;
};

const pageType = "bg-white font-[Inter,ui-sans-serif,system-ui,sans-serif] text-neutral-950";

function fieldClass() {
  return "mt-2 w-full min-h-12 rounded-xl border border-neutral-300 bg-white px-4 text-base text-neutral-950 outline-none focus:border-black";
}

export default function Apprenticeship() {
  const [searchParams] = useSearchParams();
  const received = searchParams.get("booking") === "received";
  const receivedOrder = searchParams.get("order") || "";
  const { isStaff, user } = useAuth();
  const [packages, setPackages] = useState<ApprenticeshipPackageView[]>(() => apprenticeshipPackageViews());
  const [packageId, setPackageId] = useState("apprentice-25");
  const [processingOn, setProcessingOn] = useState(true);
  const [slots, setSlots] = useState<ApprenticeshipSlot[]>([]);
  const [slotsReady, setSlotsReady] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  const [day, setDay] = useState("");
  const [slotStart, setSlotStart] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [savedOrder, setSavedOrder] = useState("");
  const [setupNote, setSetupNote] = useState<string | null>(null);

  const selected = packages.find((item) => item.id === packageId) || packages[0];
  const quote = useMemo(() => {
    if (!selected) return null;
    const result = quoteApprenticeship({
      packageId: selected.id,
      address,
      applyProcessing: processingOn,
    });
    return result.ok ? result.quote : null;
  }, [selected, address, processingOn]);

  const days = useMemo(() => {
    const groups = new Map<string, ApprenticeshipSlot[]>();
    for (const slot of slots) {
      const list = groups.get(slot.date) || [];
      list.push(slot);
      groups.set(slot.date, list);
    }
    return [...groups.entries()];
  }, [slots]);

  const daySlots = days.find(([date]) => date === day)?.[1] || [];
  const rules = selected?.rules || [];

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bookings/catalog")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.packages)) return;
        const next = apprenticeshipPackageViews(packagesForStaffEditor(data.packages));
        if (next.length) setPackages(next);
        if (typeof data.processingEnabled === "boolean") setProcessingOn(data.processingEnabled);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setSlotsReady(false);
    fetch(`/api/apprenticeship/slots?package=${encodeURIComponent(selected.id)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: SlotResponse | null) => {
        if (cancelled) return;
        const next = Array.isArray(data?.slots) ? data.slots : [];
        const open = data?.available === true;
        setCalendarOpen(open);
        setSlots(open ? next : []);
        setFallback(open ? null : data?.fallback || APPRENTICESHIP_CALENDAR_FALLBACK);
        setDay(open && next[0] ? next[0].date : "");
        setSlotStart("");
        setSlotsReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setCalendarOpen(false);
        setSlots([]);
        setFallback(APPRENTICESHIP_CALENDAR_FALLBACK);
        setSlotsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    if (!isStaff || !user) return;
    let cancelled = false;
    user.getIdToken()
      .then((token) => fetch("/api/apprenticeship/setup", {
        headers: { Authorization: `Bearer ${token}` },
      }))
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { setupNote?: string | null } | null) => {
        if (!cancelled) setSetupNote(data?.setupNote || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isStaff, user]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/apprenticeship/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: selected.id,
          name,
          email,
          phone,
          address,
          slotStart: calendarOpen ? slotStart : "",
          preferredTime,
          website,
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
      if (!response.ok || !data?.success) {
        setError(data?.error || `We could not save that booking. Please call ${BUSINESS_CONTACT.phoneDisplay}.`);
        return;
      }
      if (data.checkoutReady && data.invoiceId && data.payToken) {
        const checkout = await fetch(`/api/payments/invoice/${encodeURIComponent(data.invoiceId)}/deposit-checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ t: data.payToken }),
        });
        const payment = await checkout.json().catch(() => null) as { checkoutUrl?: string; error?: string } | null;
        if (checkout.ok && payment?.checkoutUrl) {
          apprenticeshipCheckoutNavigation.assign(payment.checkoutUrl);
          return;
        }
        setSavedOrder(data.orderNumber || "");
        setError(payment?.error || `We saved ${data.orderNumber}. Call ${BUSINESS_CONTACT.phoneDisplay} to pay the booking fee.`);
        return;
      }
      setSavedOrder(data.orderNumber || "");
    } catch {
      setError(`We could not save that booking. Please call ${BUSINESS_CONTACT.phoneDisplay}.`);
    } finally {
      setPending(false);
    }
  }

  return (
    <Layout>
      <div className={pageType}>
        <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-32 sm:pt-36">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Iconic Images</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-neutral-950 sm:text-5xl">
            {APPRENTICESHIP_PROGRAM_NAME}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-neutral-800">{APPRENTICESHIP_BRIDGE_COPY}</p>
          <p className="mt-3 text-base leading-relaxed text-neutral-600">
            Photos only. The appointment ends when the clock does. Overages are {selected?.overage || "$25 per 15-minute increment"}.
          </p>

          {received && (
            <p data-testid="apprenticeship-received" className="mt-8 rounded-2xl border border-black bg-neutral-950 px-5 py-4 text-base leading-relaxed text-white">
              Booking fee received{receivedOrder ? ` for ${receivedOrder}` : ""}. {APPRENTICESHIP_BALANCE_LINE}
            </p>
          )}

          {setupNote && (
            <aside data-testid="apprenticeship-admin-setup" className="mt-8 rounded-2xl border border-amber-700 bg-amber-50 px-5 py-4 text-sm leading-relaxed text-amber-950">
              <p className="font-semibold">Admin setup</p>
              <p className="mt-2">{setupNote}</p>
            </aside>
          )}

          <div className="mt-10 grid gap-4 sm:grid-cols-2" data-testid="apprenticeship-packages">
            {packages.map((pkg) => {
              const active = pkg.id === selected?.id;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  data-testid={`package-${pkg.id}`}
                  aria-pressed={active}
                  onClick={() => setPackageId(pkg.id)}
                  className={`rounded-2xl border p-5 text-left ${active ? "border-black bg-neutral-950 text-white" : "border-neutral-200 bg-white text-neutral-950"}`}
                >
                  <p className={`text-xs font-semibold uppercase tracking-widest ${active ? "text-white/70" : "text-neutral-500"}`}>{pkg.kicker}</p>
                  <p className="mt-2 text-2xl font-semibold">{pkg.cardTitle || pkg.name}</p>
                  <p className="mt-2 text-3xl font-semibold">
                    <MoneyAmount className={active ? "text-white" : "text-neutral-950"}>{usd(pkg.price)}</MoneyAmount>
                  </p>
                  <p className={`mt-3 text-sm leading-relaxed ${active ? "text-white/80" : "text-neutral-600"}`}>{pkg.appointmentLimit}</p>
                  <p className={`mt-2 text-sm leading-relaxed ${active ? "text-white/80" : "text-neutral-600"}`}>{pkg.aside}</p>
                </button>
              );
            })}
          </div>

          <section data-testid="apprenticeship-rules" className="mt-8 rounded-2xl border border-black bg-white p-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em]">The rules</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-800">
              {rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm font-semibold text-neutral-950">Overages: {selected?.overage}.</p>
          </section>

          {quote && (
            <section data-testid="apprenticeship-fee" className="mt-8 space-y-3 rounded-2xl bg-neutral-100 p-5 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <span>Package</span>
                <MoneyAmount>{usd(quote.subtotal)}</MoneyAmount>
              </div>
              {quote.processing > 0 && (
                <div className="flex items-baseline justify-between gap-4" data-testid="apprenticeship-processing">
                  <span>{quote.processingLabel}</span>
                  <MoneyAmount>{usd(quote.processing)}</MoneyAmount>
                </div>
              )}
              {/\b\d{5}\b/.test(address) && (
                <div className="flex items-baseline justify-between gap-4">
                  <span>{quote.travelLabel}</span>
                  {quote.travelAmount ? <MoneyAmount>{quote.travelAmount}</MoneyAmount> : null}
                </div>
              )}
              <div className="flex items-baseline justify-between gap-4 text-base font-semibold">
                <span>Order total</span>
                <MoneyAmount>{usd(quote.total)}</MoneyAmount>
              </div>
              <p className="pt-2 text-base font-semibold text-neutral-950">{APPRENTICESHIP_BOOKING_FEE_LINE}</p>
              <p className="text-neutral-700">
                {APPRENTICESHIP_BALANCE_LINE} Balance {usd(quote.balanceDue)}.
              </p>
            </section>
          )}

          <form className="mt-10 space-y-5" onSubmit={onSubmit} data-testid="apprenticeship-form">
            <div>
              <label htmlFor="apprentice-name" className="text-sm font-semibold">Name</label>
              <input id="apprentice-name" className={fieldClass()} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
            </div>
            <div>
              <label htmlFor="apprentice-email" className="text-sm font-semibold">Email</label>
              <input id="apprentice-email" type="email" className={fieldClass()} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            </div>
            <div>
              <label htmlFor="apprentice-phone" className="text-sm font-semibold">Phone</label>
              <input id="apprentice-phone" className={fieldClass()} value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" required />
            </div>
            <div>
              <label htmlFor="apprentice-address" className="text-sm font-semibold">Property address</label>
              <input id="apprentice-address" className={fieldClass()} value={address} onChange={(event) => setAddress(event.target.value)} autoComplete="street-address" required />
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

            <fieldset className="space-y-4" data-testid="apprenticeship-calendar">
              <legend className="text-sm font-semibold">
                {selected?.durationMinutes === 60 ? "1-hour appointment" : "20-minute appointment"}
              </legend>
              {!slotsReady && <p className="text-sm text-neutral-600">Checking open times.</p>}
              {slotsReady && calendarOpen && days.length === 0 && (
                <p className="text-sm text-neutral-700">No open times in the current window. Call {BUSINESS_CONTACT.phoneDisplay}.</p>
              )}
              {slotsReady && !calendarOpen && (
                <div className="space-y-3">
                  <p data-testid="apprenticeship-calendar-fallback" className="text-sm leading-relaxed text-neutral-700">{fallback}</p>
                  <label htmlFor="apprentice-preferred" className="block text-sm font-semibold">Preferred time</label>
                  <input id="apprentice-preferred" className={fieldClass()} value={preferredTime} onChange={(event) => setPreferredTime(event.target.value)} />
                </div>
              )}
              {calendarOpen && days.length > 0 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {days.map(([date, times]) => (
                      <button
                        key={date}
                        type="button"
                        data-testid={`day-${date}`}
                        aria-pressed={date === day}
                        onClick={() => {
                          setDay(date);
                          setSlotStart("");
                        }}
                        className={`min-h-12 rounded-full border px-4 text-sm font-semibold ${date === day ? "border-black bg-black text-white" : "border-neutral-300 bg-white"}`}
                      >
                        {times[0]?.label.split("·")[0]?.trim()}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {daySlots.map((slot) => (
                      <button
                        key={slot.start}
                        type="button"
                        data-testid={`slot-${slot.start}`}
                        aria-pressed={slot.start === slotStart}
                        onClick={() => setSlotStart(slot.start)}
                        className={`min-h-12 rounded-xl border px-3 text-sm font-semibold ${slot.start === slotStart ? "border-black bg-black text-white" : "border-neutral-300 bg-white"}`}
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </fieldset>

            {error && <p className="text-sm font-medium text-red-700" role="alert">{error}</p>}
            {savedOrder && (
              <p data-testid="apprenticeship-saved" className="text-base font-semibold">
                Order {savedOrder} is held for 60 minutes until the $25 booking fee is paid. {APPRENTICESHIP_BOOKING_FEE_LINE}. {APPRENTICESHIP_BALANCE_LINE}
              </p>
            )}

            <button
              type="submit"
              data-testid="apprenticeship-submit"
              disabled={pending}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-black px-6 text-base font-semibold text-white disabled:opacity-60 sm:w-auto"
            >
              Book Now!
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
