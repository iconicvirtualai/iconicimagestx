import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import type { PayAtClosePublicOffer } from "@shared/payAtClose";

interface PremiumPackage {
  id: string;
  name: string;
  description: string;
  price: number;
  features: string[];
}

interface PayAtCloseOfferResponse extends PayAtClosePublicOffer {
  packages: PremiumPackage[];
}

const EMPTY_OFFER: PayAtCloseOfferResponse = {
  live: false,
  enabledByOffice: false,
  offered: false,
  feeMode: "flat",
  feeRate: 0,
  chargeCardProcessing: false,
  packages: [],
};

function money(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  });
}

/**
 * Placeholder until the designed Pay at Close page is ready.
 * Prices come from the packages catalog. The CTA opens booking with Pay at Close selected.
 */
export default function PayAtClose() {
  const [searchParams] = useSearchParams();
  const devPreview = import.meta.env.DEV && searchParams.get("pacPreview") === "1";
  const [offer, setOffer] = useState<PayAtCloseOfferResponse>(EMPTY_OFFER);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/payments/pay-at-close")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.packages)) return;
        setOffer(data as PayAtCloseOfferResponse);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const bookable = offer.offered || devPreview;
  const feeLine = offer.feeRate > 0
    ? offer.feeMode === "percent"
      ? `Pay at Close fee on the invoice: ${offer.feeRate}%.`
      : `Pay at Close fee on the invoice: ${money(offer.feeRate)}.`
    : "No Pay at Close fee is added right now.";

  return (
    <Layout>
      <main data-testid="pay-at-close-landing" className="bg-white text-neutral-950">
        <div className="mx-auto max-w-3xl px-4 pb-12 pt-28 sm:px-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Pay at Close</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Book now. Pay when the home closes.</h1>
          <p className="mt-4 text-base leading-relaxed text-gray-600">
            Choose a top package, book the shoot, and select Pay at Close. Titus collects that payment. It is the same Iconic invoice a card payment would use.
          </p>
          <p className="mt-2 text-sm text-gray-500">This page is a placeholder. The designed version is still being made. The prices below are the live catalog.</p>

          <div className="mt-8">
            {!ready ? <p className="text-sm text-gray-500">Loading prices.</p> : null}
            {ready && offer.packages.length === 0 ? <p className="text-sm text-gray-500">No priced packages are on the list yet.</p> : null}
            <ul className="divide-y divide-gray-100 border-y border-gray-100">
              {offer.packages.map((item) => (
                <li key={item.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-black">{item.name}</h2>
                    <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                    <p data-testid={`pay-at-close-price-${item.id}`} className="mt-2 text-sm font-black">{money(item.price)}</p>
                  </div>
                  {bookable ? (
                    <Link
                      to={`/book?payment=pay-at-close&package=${encodeURIComponent(item.id)}`}
                      className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-black px-4 text-[11px] font-black uppercase tracking-widest text-white"
                    >
                      Book and pay at close
                    </Link>
                  ) : (
                    <Link
                      to="/contact"
                      className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 px-4 text-[11px] font-black uppercase tracking-widest text-black"
                    >
                      Coming soon — talk to us
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8">
            {bookable ? (
              <Link
                to="/book?payment=pay-at-close"
                data-testid="pay-at-close-cta"
                className="inline-flex min-h-12 items-center rounded-xl bg-black px-5 text-xs font-black uppercase tracking-widest text-white"
              >
                Book and pay at close
              </Link>
            ) : (
              <Link
                to="/contact"
                data-testid="pay-at-close-cta"
                className="inline-flex min-h-12 items-center rounded-xl bg-black px-5 text-xs font-black uppercase tracking-widest text-white"
              >
                Coming soon — talk to us
              </Link>
            )}
            <p className="mt-3 text-sm text-gray-500">{ready ? feeLine : ""}</p>
          </div>
        </div>
      </main>
    </Layout>
  );
}
