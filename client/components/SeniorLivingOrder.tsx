import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfMonth,
} from "date-fns";
import { MoneyAmount } from "@/components/MoneyAmount";
import { BUSINESS_CONTACT } from "@shared/businessContact";
import {
  formatUsd,
  parseSeniorLivingOrder,
  quoteSeniorLivingOrder,
  SENIOR_FACILITY_SQFT_CAP,
  SENIOR_LIVING_DEPOSIT_RECEIVED,
  SENIOR_LIVING_HOSTING_NOTE,
  SENIOR_LIVING_HOSTING_OPTIONS,
  SENIOR_LIVING_PAY_STEP,
  SENIOR_LIVING_PROCESSING_LABEL,
  SENIOR_LIVING_REQUEST_STEP,
  SENIOR_LIVING_SCHEDULE_TIMES,
  SENIOR_ROOM_RATES,
  seniorLivingDepositCopy,
  seniorLivingHostingLabel,
  type SeniorLivingHostingId,
} from "@shared/seniorLiving";

const fieldClass =
  "mt-2 block min-h-12 w-full max-w-full rounded-lg border border-neutral-400 bg-white px-3 text-lg leading-snug text-neutral-950";

const buttonClass =
  "inline-flex min-h-12 w-full max-w-full items-center justify-center rounded-lg bg-neutral-950 px-6 py-3 text-center text-lg font-semibold leading-snug text-white disabled:opacity-60";

export const seniorCheckoutNavigation = {
  assign(url: string) {
    window.location.assign(url);
  },
};

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function SeniorLivingOrder({
  depositCheckoutLive = false,
}: {
  depositCheckoutLive?: boolean;
}) {
  const [params] = useSearchParams();
  const returnedOrder = params.get("deposit") === "received" ? params.get("order") || "" : "";
  const depositCopy = seniorLivingDepositCopy(depositCheckoutLive);
  const finalStep = depositCheckoutLive ? SENIOR_LIVING_PAY_STEP : SENIOR_LIVING_REQUEST_STEP;
  const stepTitles = ["Services", "Community", "Schedule", finalStep] as const;
  const [step, setStep] = useState(1);
  const [tour, setTour] = useState(false);
  const [hosting, setHosting] = useState<SeniorLivingHostingId | "">("");
  const [roomCount, setRoomCount] = useState("");
  const [facilitySqft, setFacilitySqft] = useState("");
  const [community, setCommunity] = useState("");
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [onsiteContact, setOnsiteContact] = useState("");
  const [notes, setNotes] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [monthKey, setMonthKey] = useState(format(startOfMonth(new Date()), "yyyy-MM"));
  const [scheduledDate, setScheduledDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [scheduledTime, setScheduledTime] = useState<string>(SENIOR_LIVING_SCHEDULE_TIMES[0]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    orderNumber: string;
    confirmationEmail: boolean;
  } | null>(null);
  const [readyCheckout, setReadyCheckout] = useState<{
    invoiceId: string;
    payToken: string;
  } | null>(null);

  const months = useMemo(
    () => Array.from({ length: 12 }, (_, index) => addMonths(startOfMonth(new Date()), index)),
    [],
  );
  const days = useMemo(() => {
    const month = months.find((item) => format(item, "yyyy-MM") === monthKey) || months[0];
    const today = startOfToday();
    return eachDayOfInterval({
      start: startOfMonth(month),
      end: endOfMonth(month),
    }).filter((day) => day >= today);
  }, [monthKey, months]);

  const rooms = roomCount.trim() === "" ? 0 : Number(roomCount);
  const sqft = facilitySqft.trim() === "" ? 0 : Number(facilitySqft);
  const quoted = quoteSeniorLivingOrder({
    tour,
    roomCount: rooms,
    facilitySqft: sqft,
    address,
  });

  function payload() {
    return {
      tour,
      roomCount: rooms,
      facilitySqft: sqft,
      community,
      address,
      name,
      title,
      phone,
      email,
      onsiteContact,
      notes,
      scheduledDate,
      scheduledTime,
      hosting,
      companyWebsite,
    };
  }

  function goNext() {
    if (step === 1 && quoted.ok === false) {
      setError(quoted.error);
      return;
    }
    if (step === 1 && !seniorLivingHostingLabel(hosting)) {
      setError("Choose monthly hosting or a transfer of ownership.");
      return;
    }
    if (step === 2) {
      const parsed = parseSeniorLivingOrder({
        ...payload(),
        scheduledDate: format(new Date(), "yyyy-MM-dd"),
        scheduledTime: SENIOR_LIVING_SCHEDULE_TIMES[0],
      });
      if (parsed.ok === false && parsed.honeypot !== true) {
        setError(parsed.error);
        return;
      }
    }
    if (step === 3 && !scheduledDate) {
      setError("Choose a date.");
      return;
    }
    setError("");
    setStep((current) => Math.min(4, current + 1));
  }

  async function redirectToDeposit(invoiceId: string, payToken: string) {
    const response = await fetch(
      `/api/payments/invoice/${encodeURIComponent(invoiceId)}/deposit-checkout`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: payToken }),
      },
    );
    const data = (await response.json().catch(() => null)) as {
      checkoutUrl?: string;
      error?: string;
    } | null;
    if (!response.ok || !data?.checkoutUrl) {
      setError(
        data?.error ||
          `We could not start the deposit checkout. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
      );
      return;
    }
    seniorCheckoutNavigation.assign(data.checkoutUrl);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 4) {
      goNext();
      return;
    }
    const parsed = parseSeniorLivingOrder(payload());
    if (parsed.ok === false) {
      if (parsed.honeypot === true) {
        setConfirmation({
          orderNumber: "",
          confirmationEmail: false,
        });
        return;
      }
      setError(parsed.error);
      return;
    }
    setError("");
    setPending(true);
    try {
      if (depositCheckoutLive && readyCheckout) {
        await redirectToDeposit(readyCheckout.invoiceId, readyCheckout.payToken);
        return;
      }
      const response = await fetch("/api/senior-living/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        orderNumber?: string;
        invoiceId?: string;
        payToken?: string;
        confirmationEmail?: boolean;
      } | null;
      if (!response.ok || !data?.success || !data.orderNumber) {
        setError(
          data?.error ||
            `We could not save that order. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
        );
        return;
      }
      if (depositCheckoutLive) {
        if (!data.invoiceId || !data.payToken) {
          setError(
            `We could not start the deposit checkout. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
          );
          return;
        }
        setReadyCheckout({ invoiceId: data.invoiceId, payToken: data.payToken });
        await redirectToDeposit(data.invoiceId, data.payToken);
        return;
      }
      setConfirmation({
        orderNumber: data.orderNumber,
        confirmationEmail: data.confirmationEmail === true,
      });
    } catch {
      setError(
        `We could not save that order. Please call ${BUSINESS_CONTACT.phoneDisplay}.`,
      );
    } finally {
      setPending(false);
    }
  }

  if (returnedOrder) {
    return (
      <div data-testid="senior-confirmation" className="mt-8 space-y-4">
        <h2 className="text-3xl font-semibold leading-tight">{SENIOR_LIVING_DEPOSIT_RECEIVED}</h2>
        <p className="text-lg leading-relaxed text-neutral-950">
          Order number{" "}
          <span data-testid="senior-order-number" className="font-semibold">
            {returnedOrder}
          </span>
        </p>
        <p className="text-lg leading-relaxed text-neutral-950">
          Call {BUSINESS_CONTACT.phoneDisplay} if you need to change the date.
        </p>
      </div>
    );
  }

  if (confirmation) {
    return (
      <div data-testid="senior-confirmation" className="mt-8 space-y-4">
        <h2 className="text-3xl font-semibold leading-tight">Order received</h2>
        {confirmation.orderNumber ? (
          <p className="text-lg leading-relaxed text-neutral-950">
            Order number{" "}
            <span data-testid="senior-order-number" className="font-semibold">
              {confirmation.orderNumber}
            </span>
          </p>
        ) : (
          <p className="text-lg leading-relaxed text-neutral-950">Request received.</p>
        )}
        <p className="text-lg leading-relaxed text-neutral-950">{depositCopy}</p>
        {confirmation.confirmationEmail ? (
          <p className="text-lg leading-relaxed text-neutral-950">
            We will email you a confirmation.
          </p>
        ) : null}
        <p className="text-lg leading-relaxed text-neutral-950">
          Call {BUSINESS_CONTACT.phoneDisplay} if you need to change the date.
        </p>
      </div>
    );
  }

  return (
    <form
      data-testid="senior-order"
      className="relative mt-8 space-y-5"
      onSubmit={onSubmit}
      noValidate
    >
      <div className="absolute h-px w-px overflow-hidden" aria-hidden="true">
        <label>
          Company website
          <input
            name="companyWebsite"
            tabIndex={-1}
            autoComplete="off"
            value={companyWebsite}
            onChange={(event) => setCompanyWebsite(event.target.value)}
          />
        </label>
      </div>
      <p className="text-lg font-semibold leading-snug" data-testid="senior-step-label">
        Step {step} of 4. {stepTitles[step - 1]}
      </p>
      <p data-testid="senior-summary" className="text-lg leading-relaxed text-neutral-950">
        {depositCopy}
      </p>

      {step === 1 ? (
        <div data-testid="senior-step-services" className="space-y-4">
          <label className="flex min-h-12 items-center gap-3 text-lg font-semibold leading-snug">
            <input
              type="checkbox"
              className="h-12 w-12 shrink-0"
              checked={tour}
              onChange={(event) => setTour(event.target.checked)}
            />
            3D tour
          </label>
          <label className="block text-lg font-semibold leading-snug" htmlFor="senior-rooms">
            Rooms or units (0 to {SENIOR_ROOM_RATES[SENIOR_ROOM_RATES.length - 1].maxCount})
            <input
              id="senior-rooms"
              inputMode="numeric"
              value={roomCount}
              onChange={(event) => setRoomCount(event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="block text-lg font-semibold leading-snug" htmlFor="senior-sqft">
            Whole-building facilities, square feet (0 to {SENIOR_FACILITY_SQFT_CAP.toLocaleString("en-US")})
            <input
              id="senior-sqft"
              inputMode="numeric"
              value={facilitySqft}
              onChange={(event) => setFacilitySqft(event.target.value)}
              className={fieldClass}
            />
          </label>
          <fieldset className="space-y-3" data-testid="senior-hosting-choice">
            <legend className="text-lg font-semibold leading-snug">Tour hosting</legend>
            {SENIOR_LIVING_HOSTING_OPTIONS.map((option) => (
              <label key={option.id} className="flex min-h-12 items-center gap-3 text-lg font-semibold leading-snug">
                <input
                  type="radio"
                  name="hosting"
                  value={option.id}
                  className="h-12 w-12 shrink-0"
                  checked={hosting === option.id}
                  onChange={() => setHosting(option.id)}
                />
                {option.label}
              </label>
            ))}
            <p className="text-lg leading-relaxed text-neutral-950">{SENIOR_LIVING_HOSTING_NOTE}</p>
          </fieldset>
          <p className="text-lg font-semibold leading-snug" data-testid="senior-subtotal">
            Subtotal{" "}
            {quoted.ok ? (
              <MoneyAmount className="min-w-0 text-left">
                {formatUsd(quoted.quote.serviceSubtotal)}
              </MoneyAmount>
            ) : (
              "Select a service"
            )}
          </p>
        </div>
      ) : null}

      {step === 2 ? (
        <div data-testid="senior-step-community" className="space-y-4">
          <label className="block text-lg font-semibold leading-snug" htmlFor="senior-community">
            Community name
            <input id="senior-community" value={community} onChange={(event) => setCommunity(event.target.value)} className={fieldClass} />
          </label>
          <label className="block text-lg font-semibold leading-snug" htmlFor="senior-address">
            Address
            <input id="senior-address" value={address} onChange={(event) => setAddress(event.target.value)} className={fieldClass} />
          </label>
          <label className="block text-lg font-semibold leading-snug" htmlFor="senior-name">
            Contact name
            <input id="senior-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
          </label>
          <label className="block text-lg font-semibold leading-snug" htmlFor="senior-title">
            Title
            <input id="senior-title" value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} />
          </label>
          <label className="block text-lg font-semibold leading-snug" htmlFor="senior-phone">
            Phone
            <input id="senior-phone" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className={fieldClass} />
          </label>
          <label className="block text-lg font-semibold leading-snug" htmlFor="senior-email">
            Email
            <input id="senior-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={fieldClass} />
          </label>
          <label className="block text-lg font-semibold leading-snug" htmlFor="senior-onsite">
            Onsite contact
            <input id="senior-onsite" value={onsiteContact} onChange={(event) => setOnsiteContact(event.target.value)} className={fieldClass} />
          </label>
          <label className="block text-lg font-semibold leading-snug" htmlFor="senior-notes">
            Notes
            <textarea id="senior-notes" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} className={fieldClass} />
          </label>
          <p className="text-lg leading-relaxed text-neutral-950" data-testid="senior-travel">
            Travel fee{" "}
            {quoted.ok && !quoted.quote.travel.travelQuoted ? (
              <MoneyAmount className="min-w-0 text-left">
                {formatUsd(quoted.quote.travelLine.price)}
              </MoneyAmount>
            ) : (
              "Travel quoted"
            )}
          </p>
        </div>
      ) : null}

      {step === 3 ? (
        <div data-testid="senior-step-schedule" className="space-y-4">
          <label className="block text-lg font-semibold leading-snug" htmlFor="senior-month">
            Month
            <select
              id="senior-month"
              value={monthKey}
              onChange={(event) => {
                const next = event.target.value;
                setMonthKey(next);
                const month = months.find((item) => format(item, "yyyy-MM") === next) || months[0];
                const today = startOfToday();
                const nextDays = eachDayOfInterval({
                  start: startOfMonth(month),
                  end: endOfMonth(month),
                }).filter((day) => day >= today);
                setScheduledDate(nextDays[0] ? format(nextDays[0], "yyyy-MM-dd") : "");
              }}
              className={fieldClass}
            >
              {months.map((month) => (
                <option key={format(month, "yyyy-MM")} value={format(month, "yyyy-MM")}>
                  {format(month, "MMMM yyyy")}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-lg font-semibold leading-snug" htmlFor="senior-date">
            Date
            <select
              id="senior-date"
              value={scheduledDate}
              onChange={(event) => setScheduledDate(event.target.value)}
              className={fieldClass}
            >
              {days.map((day) => (
                <option key={format(day, "yyyy-MM-dd")} value={format(day, "yyyy-MM-dd")}>
                  {format(day, "EEEE, MMMM d")}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-lg font-semibold leading-snug" htmlFor="senior-time">
            Time
            <select
              id="senior-time"
              value={scheduledTime}
              onChange={(event) => setScheduledTime(event.target.value)}
              className={fieldClass}
            >
              {SENIOR_LIVING_SCHEDULE_TIMES.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {step === 4 && quoted.ok ? (
        <div data-testid="senior-step-review" className="space-y-3">
          <ul className="space-y-2">
            {quoted.quote.lines.map((line) => (
              <li key={line.id} className="flex flex-wrap items-baseline justify-between gap-2 text-lg">
                <span>{line.name}{line.qty > 1 ? ` × ${line.qty}` : ""}</span>
                <MoneyAmount className="min-w-0 text-left">{formatUsd(line.price)}</MoneyAmount>
              </li>
            ))}
            <li className="flex flex-wrap items-baseline justify-between gap-2 text-lg">
              <span>{quoted.quote.travelLine.name}</span>
              <MoneyAmount className="min-w-0 text-left">{formatUsd(quoted.quote.travelLine.price)}</MoneyAmount>
            </li>
            <li className="flex flex-wrap items-baseline justify-between gap-2 text-lg">
              <span>{SENIOR_LIVING_PROCESSING_LABEL}</span>
              <MoneyAmount className="min-w-0 text-left">{formatUsd(quoted.quote.processing)}</MoneyAmount>
            </li>
          </ul>
          <p className="text-lg leading-relaxed" data-testid="senior-hosting">
            {seniorLivingHostingLabel(hosting)}. {SENIOR_LIVING_HOSTING_NOTE}
          </p>
          <p className="text-lg font-semibold">
            Total <MoneyAmount className="min-w-0 text-left">{formatUsd(quoted.quote.total)}</MoneyAmount>
          </p>
          <p className="text-lg font-semibold" data-testid="senior-deposit-due">
            Deposit due today (50%){" "}
            <MoneyAmount className="min-w-0 text-left">{formatUsd(quoted.quote.depositAmount)}</MoneyAmount>
          </p>
          <p className="text-lg font-semibold" data-testid="senior-balance-due">
            Balance due after the shoot{" "}
            <MoneyAmount className="min-w-0 text-left">{formatUsd(quoted.quote.balanceDue)}</MoneyAmount>
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-lg font-semibold leading-snug text-red-800">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {step > 1 ? (
          <button
            type="button"
            data-testid="senior-back"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-lg border border-neutral-950 bg-white px-6 py-3 text-lg font-semibold text-neutral-950"
            onClick={() => {
              setError("");
              setStep((current) => Math.max(1, current - 1));
            }}
          >
            Back
          </button>
        ) : null}
        {step < 4 ? (
          <button type="submit" data-testid="senior-next" className={buttonClass}>
            Continue
          </button>
        ) : (
          <button
            type="submit"
            data-testid={depositCheckoutLive ? "senior-pay-deposit" : "senior-request-booking"}
            disabled={pending}
            className={buttonClass}
          >
            {pending ? (depositCheckoutLive ? "Starting checkout" : "Sending") : finalStep}
          </button>
        )}
      </div>
    </form>
  );
}
