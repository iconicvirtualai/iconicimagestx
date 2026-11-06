import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { useSiteText } from "@/content/siteContent";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AMENITY_STOCK_CARDS,
  AMENITY_STOCK_INTRO,
  amenityCoverUrl,
  amenityStockById,
  amenityStockIntro,
  isSquareCheckoutUrl,
  type AmenityStockCard,
} from "@shared/amenityStock";

function AmenityImage({
  src,
  alt,
  className,
  pictureClassName,
}: {
  src: string;
  alt: string;
  className?: string;
  pictureClassName?: string;
}) {
  return (
    <picture className={pictureClassName}>
      <source srcSet={src.replace(/\.jpe?g$/i, ".webp")} type="image/webp" />
      <img src={src} alt={alt} className={className} />
    </picture>
  );
}

function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function StockFootage() {
  const title = useSiteText("stock", "hero", "title", "Stock Footage Library");
  const storedIntro = useSiteText("stock", "hero", "body", AMENITY_STOCK_INTRO);
  const intro = amenityStockIntro(storedIntro);
  const [params] = useSearchParams();
  const paid = params.get("paid") === "1";
  const paidCard = paid ? amenityStockById(params.get("set") || "") : null;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function payNow(card: AmenityStockCard) {
    if (pendingId) return;
    setPendingId(card.id);
    setErrors((current) => ({ ...current, [card.id]: "" }));
    try {
      const response = await fetch("/api/stock-footage/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: card.id }),
      });
      const data = await response.json().catch(() => ({})) as { checkoutUrl?: unknown; error?: unknown };
      const checkoutUrl = typeof data.checkoutUrl === "string" ? data.checkoutUrl : "";
      if (!response.ok || !isSquareCheckoutUrl(checkoutUrl)) {
        const message = typeof data.error === "string" && data.error.trim()
          ? data.error
          : "Square checkout is not available right now.";
        setErrors((current) => ({ ...current, [card.id]: message }));
        setPendingId(null);
        return;
      }
      window.location.assign(checkoutUrl);
    } catch {
      setErrors((current) => ({
        ...current,
        [card.id]: "Square checkout is not available right now.",
      }));
      setPendingId(null);
    }
  }

  return (
    <Layout>
      <div className="bg-white">
        <main className="flex-1">
          <section className="pt-40 pb-12 bg-gradient-to-b from-black to-gray-900">
            <div className="container mx-auto px-4">
              <h1 data-site-page="stock" data-site-block="hero" data-site-field="title" data-site-kind="text" className="text-4xl md:text-5xl font-bold text-white mb-4">{title}</h1>
              <p data-site-page="stock" data-site-block="hero" data-site-field="body" data-site-kind="text" className="text-gray-400 text-lg max-w-2xl">{intro}</p>
            </div>
          </section>

          {paid ? (
            <section className="border-b border-teal-100 bg-teal-50" data-testid="amenity-paid-confirmation">
              <div className="container mx-auto px-4 py-8 max-w-3xl">
                <h2 className="text-2xl font-bold text-black">Payment received</h2>
                <p className="mt-3 text-gray-800 text-lg">
                  {paidCard
                    ? `Iconic Images will send the ${paidCard.neighborhood} photos to you.`
                    : "Iconic Images will send your amenity photos to you."}
                  {" "}
                  These files are delivered manually and are not available to download on this page.
                </p>
              </div>
            </section>
          ) : null}

          <section className="py-16">
            <div className="container mx-auto px-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {AMENITY_STOCK_CARDS.map((card) => (
                  <article key={card.id} data-testid="amenity-card" data-amenity={card.id} className="group">
                    <div className="relative aspect-square overflow-hidden rounded-2xl bg-gray-900 mb-4">
                      <AmenityImage
                        src={amenityCoverUrl(card)}
                        alt={card.coverAlt}
                        pictureClassName="absolute inset-0"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
                        <h3 className="text-2xl font-bold text-white text-center px-4">{card.neighborhood}</h3>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-lg font-bold text-black">{money(card.price)}</span>
                      <Button
                        type="button"
                        data-testid="amenity-pay-now"
                        className="bg-teal-500 hover:bg-teal-600 text-white font-semibold px-4 py-2 rounded-lg"
                        disabled={pendingId !== null}
                        onClick={() => void payNow(card)}
                      >
                        {pendingId === card.id ? "Opening checkout…" : "Pay Now"}
                      </Button>
                    </div>
                    {errors[card.id] ? (
                      <p role="alert" className="mt-3 text-sm text-red-700">{errors[card.id]}</p>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </Layout>
  );
}
