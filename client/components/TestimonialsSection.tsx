import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CLIENT_REVIEWS, reviewMonogram, type ClientReview } from "@/lib/clientReviews";

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
          <span className="text-[12px] font-bold tracking-wider text-[#0d9488] uppercase">
            TESTIMONIALS
          </span>
        </div>

        <h2 id="client-reviews-heading" className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6 leading-[1.2] tracking-tight text-black max-w-4xl mx-auto">
          What our clients are saying
        </h2>
        <p className="text-base md:text-lg text-gray-500 mb-10 max-w-3xl mx-auto leading-relaxed">
          Agents and businesses trust Iconic Images for listing photography, video, and a fast, professional turnaround.
        </p>

        <div className="mb-20">
          <Button asChild className="bg-[#0f766e] text-white hover:bg-[#0d9488] font-bold text-lg px-12 py-7 rounded-xl shadow-lg shadow-teal-100 transition-all hover:scale-105">
            <Link to="/book">Book a shoot &rarr;</Link>
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

function ReviewCard({ review }: { review: ClientReview }) {
  return (
    <div className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-sm text-left flex flex-col h-full hover:shadow-md transition-shadow">
      <div className="flex items-center gap-4 mb-8">
        <div
          className="w-16 h-16 rounded-full bg-[#0d9488] flex items-center justify-center font-bold text-white text-lg shadow-sm shrink-0"
          aria-hidden="true"
        >
          {reviewMonogram(review.initials)}
        </div>
        <div>
          <h4 className="font-bold text-black">{review.initials}</h4>
          <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold">{review.role}</p>
        </div>
      </div>
      <p className="text-gray-600 leading-relaxed italic mb-8 flex-1">
        "{review.quote}"
      </p>
      {review.stars ? (
        <div className="flex gap-1" aria-label={`${review.stars} stars`}>
          {Array.from({ length: review.stars }, (_, index) => (
            <Star key={index} className="w-4 h-4 text-[#22c55e] fill-[#22c55e]" />
          ))}
        </div>
      ) : null}
    </div>
  );
}
