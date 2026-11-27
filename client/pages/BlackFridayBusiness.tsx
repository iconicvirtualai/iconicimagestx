import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check } from "lucide-react";
import Layout from "@/components/Layout";
import { PublicContactLine } from "@/components/PublicContactLine";
import {
  BLACK_FRIDAY_BUSINESS_ENDS_MS,
  BLACK_FRIDAY_BUSINESS_HEADLINE,
  BLACK_FRIDAY_BUSINESS_PACKAGES,
  BLACK_FRIDAY_BUSINESS_REFERRAL,
  BLACK_FRIDAY_BUSINESS_SHARED,
  type BlackFridayBusinessPackageId,
  blackFridayBusinessOpen,
  blackFridayBusinessPackage,
  formatBusinessCents,
  quoteBlackFridayBusiness,
} from "@shared/blackFridayBusiness";

const fieldClass =
  "mt-1 w-full rounded-2xl border border-[#e4dacb] bg-white px-4 py-3 text-base text-[#141414] outline-none focus:ring-2 focus:ring-[#0f8f80]/40";

function emphasizeHuman(text: string): ReactNode {
  const parts = text.split("HUMAN");
  if (parts.length === 1) return text;
  return parts.map((part, index) => (
    index === 0 ? part : (
      <span key={index}>
        <span className="font-black tracking-wide">HUMAN</span>
        {part}
      </span>
    )
  ));
}

function useSaleClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const open = blackFridayBusinessOpen(now);
  const remainMs = Math.max(0, BLACK_FRIDAY_BUSINESS_ENDS_MS + 1000 - now);
  const total = Math.floor(remainMs / 1000);
  return {
    open,
    parts: [
      { label: "Days", value: Math.floor(total / 86400) },
      { label: "Hours", value: Math.floor((total % 86400) / 3600) },
      { label: "Min", value: Math.floor((total % 3600) / 60) },
      { label: "Sec", value: total % 60 },
    ],
  };
}

export default function BlackFridayBusiness() {
  const [params, setParams] = useSearchParams();
  const requested = blackFridayBusinessPackage(params.get("package") || "");
  const paid = params.get("paid") === "1";
  const { open, parts } = useSaleClock();
  const [packageId, setPackageId] = useState<BlackFridayBusinessPackageId | "">(requested?.id ?? "");
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const quote = useMemo(() => (packageId ? quoteBlackFridayBusiness(packageId) : null), [packageId]);

  const packageKey = params.get("package") || "";

  useEffect(() => {
    const item = blackFridayBusinessPackage(packageKey);
    if (item) setPackageId(item.id);
  }, [packageKey]);

  useEffect(() => {
    const item = blackFridayBusinessPackage(packageKey);
    if (!item || paid || !blackFridayBusinessOpen()) return;
    const timer = window.setTimeout(() => {
      document.getElementById("business-checkout")?.scrollIntoView({ behavior: "auto", block: "start" });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [packageKey, paid]);

  function selectPackage(id: BlackFridayBusinessPackageId) {
    setPackageId(id);
    setCheckoutUrl("");
    setError("");
    const next = new URLSearchParams(params);
    next.delete("paid");
    next.delete("order");
    next.set("package", id);
    setParams(next, { replace: true });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!quote || !open) return;
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/black-friday-business/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: quote.id, name, business, email, phone }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; checkoutUrl?: string };
      if (!response.ok || !data.checkoutUrl) {
        setError(data.error || "Checkout could not be started.");
        return;
      }
      setCheckoutUrl(data.checkoutUrl);
    } catch {
      setError("Checkout could not be started.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout>
      <div className="min-h-screen bg-[#f4eee4] text-[#141414]">
        <section data-testid="bfb-hero" className="bg-[#0b0b0b] px-4 pb-14 pt-36 text-white sm:px-6 sm:pb-16 sm:pt-40">
          <div className="mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:gap-x-14">
            <div className="order-1">
              <p className="inline-flex rounded-full bg-gradient-to-r from-[#0b0b0b] via-[#c9a227] to-[#e6c35c] px-4 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-sm ring-1 ring-[#e6c35c]/40 [text-shadow:0_1px_1px_rgba(0,0,0,0.9)]">
                Black Friday · Business
              </p>
              <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight sm:text-6xl sm:leading-[1.02]">
                {BLACK_FRIDAY_BUSINESS_HEADLINE}
              </h1>
            </div>
            <figure
              data-testid="bfb-video"
              className="order-2 mx-auto w-[min(248px,72vw)] overflow-hidden rounded-xl bg-black shadow-[0_24px_60px_rgba(0,0,0,0.45)] ring-1 ring-[#e6c35c]/45 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mx-0 lg:w-full lg:justify-self-end lg:rounded-[1.25rem]"
            >
              <video
                className="aspect-[9/16] h-auto w-full bg-black object-contain"
                poster="/marketing/black-friday-business/black-friday-business-poster.jpg?v=2"
                playsInline
                muted
                autoPlay
                loop
                preload="metadata"
                width={1080}
                height={1920}
                aria-label="Black Friday Reel: Socials done for you. Now go back to work."
              >
                <source src="/marketing/black-friday-business/black-friday-business-ad.mp4?v=2" type="video/mp4" />
              </video>
            </figure>
            <div className="order-3 lg:col-start-1">
              <p className="max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg lg:mt-5">
                Three prepaid social packages. Paid in full today. The price on the card is the price Square charges.
              </p>
              {open ? (
                <div className="mt-8">
                  <p className="text-sm font-semibold text-[#e6c35c]">Ends Friday, Nov 27, 2026 at 11:59:59 PM CT</p>
                  <div data-testid="bfb-countdown" className="mt-3 grid max-w-xl grid-cols-4 gap-2 sm:gap-3" aria-hidden="true">
                    {parts.map((part) => (
                      <div key={part.label} className="rounded-2xl bg-white/10 px-2 py-3 text-center ring-1 ring-white/15">
                        <span className="block text-2xl font-black tabular-nums sm:text-4xl">{String(part.value).padStart(2, "0")}</span>
                        <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">{part.label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="sr-only">Offer ends Friday, November 27, 2026 at 11:59:59 PM Central Time.</p>
                </div>
              ) : (
                <p className="mt-6 text-sm font-semibold text-[#e6c35c]">Closed Friday, Nov 27, 2026 at 11:59:59 PM CT.</p>
              )}
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          {paid && (
            <p className="mb-8 rounded-3xl bg-[#fffdf9] px-5 py-4 text-sm leading-relaxed ring-1 ring-[#e4dacb]">
              If Square confirmed the payment, your package is recorded. We did not send a receipt from this page.
            </p>
          )}

          {!open && (
            <div data-testid="bfb-closed" className="mb-10 rounded-[1.75rem] bg-[#fffdf9] px-6 py-10 text-center ring-1 ring-[#e4dacb]">
              <h2 className="text-3xl font-black">This Black Friday offer has ended.</h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-[#5b5249]">
                New checkouts closed Friday, Nov 27, 2026 at 11:59:59 PM CT. Call or email us and we will help with the next opening.
              </p>
              <Link to="/contact" className="mt-6 inline-flex rounded-full bg-[#0f8f80] px-5 py-3 text-sm font-bold text-white">
                Contact Iconic
              </Link>
            </div>
          )}

          <section aria-labelledby="included-heading" className="rounded-[1.75rem] bg-[#fffdf9] px-5 py-6 ring-2 ring-[#c9a227] sm:px-8">
            <h2 id="included-heading" className="text-sm font-black uppercase tracking-[0.18em] text-[#6b5210]">
              Included with every package
            </h2>
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {BLACK_FRIDAY_BUSINESS_SHARED.map((line) => (
                <li key={line} className="flex gap-3 text-sm font-semibold leading-snug">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0f8f80]" aria-hidden="true" />
                  <span>{emphasizeHuman(line)}</span>
                </li>
              ))}
            </ul>
          </section>

          <aside data-testid="bfb-referral" className="mt-8 rounded-[1.75rem] bg-[#141414] px-5 py-6 text-white ring-2 ring-[#c9a227] sm:px-8">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#e6c35c]">Referral</p>
            <p className="mt-2 text-xl font-black leading-snug sm:text-2xl">{BLACK_FRIDAY_BUSINESS_REFERRAL}</p>
          </aside>

          <fieldset className="mt-10" disabled={!open}>
            <legend className="text-sm font-black uppercase tracking-[0.18em] text-[#6b5210]">Choose a package</legend>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              {BLACK_FRIDAY_BUSINESS_PACKAGES.map((item) => {
                const selected = packageId === item.id;
                return (
                  <label
                    key={item.id}
                    data-testid={`bfb-tier-${item.id}`}
                    className={`relative flex cursor-pointer flex-col rounded-[1.75rem] bg-[#fffdf9] p-5 ring-1 ${
                      selected ? "ring-2 ring-[#c9a227] shadow-[0_16px_40px_rgba(201,162,39,0.18)]" : "ring-[#e4dacb]"
                    } ${!open ? "cursor-default opacity-80" : ""}`}
                  >
                    <input
                      type="radio"
                      name="package"
                      className="sr-only"
                      value={item.id}
                      checked={selected}
                      disabled={!open}
                      onChange={() => selectPackage(item.id)}
                    />
                    {item.badge && (
                      <span className="absolute right-4 top-4 rounded-full bg-[#e6c35c] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#141414]">
                        {item.badge}
                      </span>
                    )}
                    <span className="pr-24 text-lg font-black leading-tight">{item.name}</span>
                    <span className="mt-3 text-4xl font-black tracking-tight">{formatBusinessCents(item.priceCents)}</span>
                    <span className="mt-1 text-sm text-[#5b5249]">
                      normally <span className="line-through">{formatBusinessCents(item.normalCents)}</span>
                    </span>
                    <span className="mt-3 text-sm leading-relaxed text-[#5b5249]">{item.summary}</span>
                    <ul className="mt-4 space-y-2 text-sm">
                      {item.features.map((feature) => (
                        <li key={feature} className="flex gap-2">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0f8f80]" aria-hidden="true" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-4 text-[11px] font-black uppercase tracking-[0.14em] text-[#6b5210]">Also on this card</p>
                    <ul className="mt-2 space-y-2 text-sm font-semibold">
                      {BLACK_FRIDAY_BUSINESS_SHARED.map((line) => (
                        <li key={line} className="flex gap-2">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#c9a227]" aria-hidden="true" />
                          <span>{emphasizeHuman(line)}</span>
                        </li>
                      ))}
                    </ul>
                    <span className={`mt-auto inline-flex justify-center rounded-full px-4 py-3 text-sm font-bold ${selected ? "bg-[#141414] text-white" : "bg-[#f4eee4] text-[#141414]"}`}>
                      {selected ? "Selected" : open ? "Select this package" : "Offer ended"}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {open && quote && !checkoutUrl && (
            <form
              id="business-checkout"
              data-testid="bfb-checkout"
              onSubmit={(event) => void submit(event)}
              className="scroll-mt-40 mt-10 rounded-[1.75rem] bg-[#fffdf9] p-5 ring-1 ring-[#e4dacb] sm:p-8"
            >
              <h2 className="text-2xl font-black">Checkout · {quote.name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#5b5249]">
                Full payment today. Square charges {formatBusinessCents(quote.totalCents)} and nothing more.
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold">
                  Name
                  <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
                </label>
                <label className="block text-sm font-bold">
                  Business
                  <input className={fieldClass} value={business} onChange={(event) => setBusiness(event.target.value)} autoComplete="organization" required />
                </label>
                <label className="block text-sm font-bold">
                  Email
                  <input className={fieldClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
                </label>
                <label className="block text-sm font-bold">
                  Phone
                  <input className={fieldClass} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" required />
                </label>
              </div>
              <div className="mt-5 rounded-3xl bg-[#f4eee4] px-5 py-4 text-sm">
                <div className="flex justify-between gap-3"><span>{quote.name}</span><span>{formatBusinessCents(quote.subtotalCents)}</span></div>
                <div className="mt-2 flex justify-between gap-3 text-[#5b5249]"><span>Processing fee (0%)</span><span>{formatBusinessCents(quote.processingCents)}</span></div>
                <div className="mt-3 flex justify-between gap-3 text-lg font-black"><span>Due today</span><span>{formatBusinessCents(quote.totalCents)}</span></div>
              </div>
              {error && <p className="mt-4 text-sm font-semibold text-[#e8432e]">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="mt-5 w-full rounded-full bg-gradient-to-r from-[#0b0b0b] via-[#c9a227] to-[#e6c35c] px-5 py-3 text-sm font-bold text-white shadow-sm [text-shadow:0_1px_1px_rgba(0,0,0,0.9)] disabled:opacity-50"
              >
                {busy ? "Starting checkout…" : `Continue to pay ${formatBusinessCents(quote.totalCents)}`}
              </button>
            </form>
          )}

          {open && !quote && (
            <p id="business-checkout" className="scroll-mt-40 mt-8 text-center text-sm text-[#5b5249]">
              Select a package to open checkout.
            </p>
          )}

          {open && checkoutUrl && (
            <div id="business-checkout" data-testid="bfb-checkout" className="scroll-mt-40 mt-10 rounded-[1.75rem] bg-[#fffdf9] px-5 py-8 text-center ring-1 ring-[#e4dacb]">
              <h2 className="text-2xl font-black">Ready for Square</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#5b5249]">
                Your order is saved for the team. The next step is Square&apos;s secure payment page. Nothing is charged until you pay there.
              </p>
              <a
                href={checkoutUrl}
                data-testid="square-checkout"
                className="mt-5 inline-flex rounded-full bg-[#0f8f80] px-5 py-3 text-sm font-bold text-white"
              >
                Pay with Square
              </a>
            </div>
          )}

          <PublicContactLine
            className="mt-12 text-center text-sm leading-relaxed text-[#5b5249]"
            linkClassName="font-semibold text-[#0f8f80] underline-offset-4 hover:underline"
          />
        </div>
      </div>
    </Layout>
  );
}
