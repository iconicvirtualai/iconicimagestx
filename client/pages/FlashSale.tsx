import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import {
  FLASH_SALE_ADDONS,
  FLASH_SALE_BUNDLES,
  type FlashSaleAddon,
  flashSaleOpen,
  formatFlashCents,
  quoteFlashSale,
} from "@shared/flashSale";

const fieldClass =
  "mt-1 w-full rounded-2xl border border-[#e4dacb] bg-white px-4 py-3 text-base text-[#141414] outline-none focus:ring-2 focus:ring-[#0f8f80]/40";

export default function FlashSale() {
  const [params] = useSearchParams();
  const requested = Number(params.get("bundle"));
  const open = flashSaleOpen();
  const paid = params.get("paid") === "1";
  const [shoots, setShoots] = useState<5 | 10>(requested === 10 ? 10 : 5);
  const [addon, setAddon] = useState<FlashSaleAddon | "">("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const quote = useMemo(() => quoteFlashSale(shoots), [shoots]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!quote || !open) return;
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/flash-sale/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle: shoots, addon, name, email, phone }),
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
        <section className="mx-auto max-w-xl px-4 pb-20 pt-40 sm:px-6 sm:pt-36">
          <p className="inline-flex rounded-full bg-gradient-to-r from-[#0b0b0b] via-[#c9a227] to-[#e6c35c] px-4 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-sm [text-shadow:0_1px_1px_rgba(0,0,0,0.9)]">
            Black Friday Sale
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Stock up on shoots.</h1>
          <p className="mt-3 text-base leading-relaxed text-[#5b5249]">
            Each shoot is 50 photos, 3 aerials, and your choice of one add-on. Paid upfront. Use the shoots within 90 days.
          </p>
          {open && (
            <p className="mt-3 text-sm font-semibold text-[#141414]">Ends Friday, Nov 27 at 11:59pm CT.</p>
          )}
          {paid && (
            <p className="mt-6 rounded-3xl bg-[#fffdf9] px-5 py-4 text-sm leading-relaxed ring-1 ring-[#e4dacb]">
              If Square confirmed the payment, your bundle is recorded. We did not send a receipt from this page.
            </p>
          )}
          {!open && (
            <div className="mt-8 rounded-[1.75rem] bg-[#fffdf9] px-5 py-8 text-center ring-1 ring-[#e4dacb]">
              <h2 className="text-2xl font-black">This Black Friday sale has ended.</h2>
              <p className="mt-2 text-sm text-[#5b5249]">The offer closed Friday, Nov 27, 2026 at 11:59pm CT.</p>
              <Link to="/book" className="mt-5 inline-flex rounded-full bg-[#0f8f80] px-5 py-3 text-sm font-bold text-white">
                Book a shoot
              </Link>
            </div>
          )}
          {open && quote && !checkoutUrl && (
            <form onSubmit={(event) => void submit(event)} className="mt-8 space-y-5">
              <fieldset>
                <legend className="text-sm font-bold">Bundle</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  {FLASH_SALE_BUNDLES.map((bundle) => {
                    const selected = shoots === bundle.shoots;
                    return (
                      <label
                        key={bundle.shoots}
                        className={`cursor-pointer rounded-3xl bg-[#fffdf9] p-4 ring-1 ${selected ? "ring-2 ring-[#c9a227]" : "ring-[#e4dacb]"}`}
                      >
                        <input
                          type="radio"
                          name="bundle"
                          className="sr-only"
                          checked={selected}
                          onChange={() => setShoots(bundle.shoots)}
                        />
                        <span className={`block text-sm font-bold uppercase tracking-[0.14em] ${selected ? "text-[#6b5210]" : "text-[#8a7560]"}`}>{bundle.label}</span>
                        <span className="mt-1 block text-2xl font-black">{formatFlashCents(bundle.subtotalCents)}</span>
                        <span className="mt-1 block text-sm text-[#5b5249]">{formatFlashCents(bundle.perShootCents)} per shoot</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-sm font-bold">Each shoot includes one of these</legend>
                <div className="mt-2 grid gap-3">
                  {FLASH_SALE_ADDONS.map((item) => (
                    <label key={item.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl bg-[#fffdf9] px-4 py-3 ring-1 ${addon === item.id ? "ring-2 ring-[#c9a227]" : "ring-[#e4dacb]"}`}>
                      <input
                        type="radio"
                        name="addon"
                        checked={addon === item.id}
                        onChange={() => setAddon(item.id)}
                      />
                      <span className="font-semibold">{item.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block text-sm font-bold">
                Name
                <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
              </label>
              <label className="block text-sm font-bold">
                Email
                <input className={fieldClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
              </label>
              <label className="block text-sm font-bold">
                Phone
                <input className={fieldClass} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" required />
              </label>
              <div className="rounded-3xl bg-[#fffdf9] px-5 py-4 text-sm ring-1 ring-[#e4dacb]">
                <div className="flex justify-between gap-3"><span>Bundle</span><span>{formatFlashCents(quote.subtotalCents)}</span></div>
                <div className="mt-2 flex justify-between gap-3 text-[#5b5249]"><span>{quote.processingLabel}</span><span>{formatFlashCents(quote.processingCents)}</span></div>
                <div className="mt-3 flex justify-between gap-3 text-lg font-black"><span>Due today</span><span>{formatFlashCents(quote.totalCents)}</span></div>
              </div>
              {error && <p className="text-sm font-semibold text-[#e8432e]">{error}</p>}
              <button
                type="submit"
                disabled={busy || !addon}
                className="w-full rounded-full bg-gradient-to-r from-[#0b0b0b] via-[#c9a227] to-[#e6c35c] px-5 py-3 text-sm font-bold text-white shadow-sm [text-shadow:0_1px_1px_rgba(0,0,0,0.9)] disabled:opacity-50"
              >
                {busy ? "Starting checkout…" : `Continue to pay ${formatFlashCents(quote.totalCents)}`}
              </button>
              <p className="text-center text-sm text-[#5b5249]">
                Questions first? <Link to="/contact" className="font-bold text-[#0f8f80]">Message us</Link>
              </p>
            </form>
          )}
          {open && checkoutUrl && (
            <div className="mt-8 rounded-[1.75rem] bg-[#fffdf9] px-5 py-8 text-center ring-1 ring-[#e4dacb]">
              <h2 className="text-2xl font-black">Ready for Square</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#5b5249]">
                Your order is saved for the admin team. The next step is Square&apos;s secure payment page. Nothing is charged until you pay there.
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
        </section>
      </div>
    </Layout>
  );
}
