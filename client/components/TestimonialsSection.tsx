import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CLIENT_REVIEWS, reviewMonogram, type ClientReview } from "@/lib/clientReviews";
import { useSiteHref, useSiteText } from "@/content/siteContent";

function cardsPerView() {
  if (typeof window === "undefined") return 3;
  if (window.matchMedia("(min-width: 1024px)").matches) return 3;
  if (window.matchMedia("(min-width: 768px)").matches) return 2;
  return 1;
}

function pageCount(total: number, perView: number) {
  return Math.max(1, Math.ceil(total / perView));
}

export default function TestimonialsSection() {
  const badge = useSiteText("home", "reviews", "badge", "TESTIMONIALS");
  const title = useSiteText("home", "reviews", "title", "What our clients are saying");
  const body = useSiteText("home", "reviews", "body", "Agents and businesses trust Iconic Images for listing photography, video, and a fast, professional turnaround.");
  const cta = useSiteText("home", "reviews", "cta", "Book a shoot");
  const ctaHref = useSiteHref("home", "reviews", "cta", "/book");
  const [perView, setPerView] = useState(cardsPerView);
  const [page, setPage] = useState(0);
  const pages = pageCount(CLIENT_REVIEWS.length, perView);
  const safePage = Math.min(page, pages - 1);
  const visible = CLIENT_REVIEWS.slice(safePage * perView, safePage * perView + perView);

  useEffect(() => {
    const update = () => {
      const next = cardsPerView();
      setPerView(next);
      setPage((current) => Math.min(current, pageCount(CLIENT_REVIEWS.length, next) - 1));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const go = (next: number) => {
    setPage((next + pages) % pages);
  };

  return (
    <section className="bg-gray-50 py-20 md:py-24 overflow-hidden" aria-labelledby="client-reviews-heading">
      <div className="container mx-auto px-4 text-center max-w-6xl">
        <div className="inline-flex items-center px-4 py-1.5 rounded-md bg-white border border-[#ccfbf1] mb-8 shadow-sm">
          <span data-site-page="home" data-site-block="reviews" data-site-field="badge" data-site-kind="text" className="text-[12px] font-bold tracking-wider text-[#0d9488] uppercase">
            {badge}
          </span>
        </div>

        <h2 id="client-reviews-heading" data-site-page="home" data-site-block="reviews" data-site-field="title" data-site-kind="text" className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 leading-[1.2] tracking-tight text-black max-w-4xl mx-auto">
          {title}
        </h2>
        <p data-site-page="home" data-site-block="reviews" data-site-field="body" data-site-kind="text" className="text-base md:text-lg text-gray-500 mb-10 max-w-3xl mx-auto leading-relaxed">
          {body}
        </p>

        <div className="mb-20">
          <Button asChild className="bg-[#0f766e] text-white hover:bg-[#0d9488] font-bold text-lg px-12 py-7 rounded-xl shadow-lg shadow-teal-100 transition-all hover:scale-105">
            <Link to={ctaHref} data-site-page="home" data-site-block="reviews" data-site-field="cta" data-site-kind="text">{cta} &rarr;</Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto mb-12" aria-live="polite">
          {visible.map((review) => (
            <ReviewCard key={review.initials} review={review} />
          ))}
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            aria-label="Previous reviews"
            onClick={() => go(safePage - 1)}
            className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-black hover:border-black transition-all"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex gap-2" role="tablist" aria-label="Review pages">
            {Array.from({ length: pages }, (_, index) => (
              <button
                key={index}
                type="button"
                role="tab"
                aria-label={`Review page ${index + 1}`}
                aria-selected={index === safePage}
                onClick={() => setPage(index)}
                className={`w-2.5 h-2.5 rounded-full ${index === safePage ? "bg-[#0d9488]" : "bg-gray-200"}`}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Next reviews"
            onClick={() => go(safePage + 1)}
            className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 hover:text-black hover:border-black transition-all"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </div>
    </section>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-7 w-7 shrink-0" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.5 7.1l6.2 5.2C37.4 38.3 44 33 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}

function ReviewCard({ review }: { review: ClientReview }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#dadce0] bg-white text-left shadow-sm">
      <div className="flex h-1" aria-hidden="true">
        <span className="flex-1 bg-[#4285F4]" />
        <span className="flex-1 bg-[#EA4335]" />
        <span className="flex-1 bg-[#FBBC04]" />
        <span className="flex-1 bg-[#34A853]" />
      </div>
      <div className="flex flex-1 flex-col p-8">
        <div className="mb-5 flex items-center gap-3">
          <GoogleMark />
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f1f3f4] text-sm font-bold text-[#3c4043]"
            aria-hidden="true"
          >
            {reviewMonogram(review.initials)}
          </div>
          <div>
            <h4 className="font-bold text-[#202124]">{review.initials}</h4>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#5f6368]">{review.role}</p>
          </div>
        </div>
        {review.stars ? (
          <div className="mb-4 flex gap-0.5" aria-label={`${review.stars} stars`}>
            {Array.from({ length: review.stars }, (_, index) => (
              <Star key={index} className="h-4 w-4 fill-[#FBBC04] text-[#FBBC04]" />
            ))}
          </div>
        ) : null}
        <p className="flex-1 leading-relaxed text-[#3c4043]">
          "{review.quote}"
        </p>
      </div>
    </article>
  );
}
