import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CLIENT_REVIEWS, reviewMonogram, type ClientReview } from "@/lib/clientReviews";
import { itemText, useSiteHref, useSiteItems, useSiteText } from "@/content/siteContent";

const AVATAR_COLORS = ["#0f766e", "#115e59", "#0d9488", "#134e4a", "#14b8a6", "#1f2937"];

export default function TestimonialsSection() {
  const badge = useSiteText("home", "reviews", "badge", "TESTIMONIALS");
  const title = useSiteText("home", "reviews", "title", "What our clients are saying");
  const body = useSiteText("home", "reviews", "body", "Agents and businesses trust Iconic Images for listing photography, video, and a fast, professional turnaround.");
  const cta = useSiteText("home", "reviews", "cta", "Book a shoot");
  const ctaHref = useSiteHref("home", "reviews", "cta", "/book");
  const saved = useSiteItems("home", "reviews");
  const reviews: Array<ClientReview & { id: string }> = saved?.length
    ? saved.map((item) => ({
      id: item.id,
      initials: itemText(item, "initials"),
      role: (itemText(item, "role", "Client") === "Google review" ? "Google review" : "Client") as ClientReview["role"],
      quote: itemText(item, "quote"),
      stars: 5,
    })).filter((review) => review.quote && review.initials)
    : CLIENT_REVIEWS.map((review, index) => ({ ...review, id: `review-${index + 1}`, stars: 5 as const }));

  const scroller = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const node = scroller.current;
    if (!node || paused || reviews.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      const card = node.querySelector<HTMLElement>("[data-review-card]");
      const width = card ? card.offsetWidth + 16 : node.clientWidth;
      const atEnd = node.scrollLeft + node.clientWidth >= node.scrollWidth - 8;
      node.scrollTo({ left: atEnd ? 0 : node.scrollLeft + width, behavior: "smooth" });
    }, 4800);
    return () => window.clearInterval(timer);
  }, [paused, reviews.length]);

  const nudge = (direction: -1 | 1) => {
    const node = scroller.current;
    if (!node) return;
    const card = node.querySelector<HTMLElement>("[data-review-card]");
    const width = card ? card.offsetWidth + 16 : node.clientWidth;
    node.scrollBy({ left: direction * width, behavior: "smooth" });
  };

  return (
    <section className="overflow-hidden bg-gray-50 py-20 md:py-24" aria-labelledby="client-reviews-heading">
      <div className="container mx-auto max-w-6xl px-4 text-center">
        <div className="mb-8 inline-flex items-center rounded-md border border-[#ccfbf1] bg-white px-4 py-1.5 shadow-sm">
          <span data-site-page="home" data-site-block="reviews" data-site-field="badge" data-site-kind="text" className="text-[12px] font-bold uppercase tracking-wider text-[#0d9488]">
            {badge}
          </span>
        </div>

        <h2 id="client-reviews-heading" data-site-page="home" data-site-block="reviews" data-site-field="title" data-site-kind="text" className="mx-auto mb-6 max-w-4xl text-balance text-3xl font-bold leading-[1.15] tracking-tight text-black md:text-4xl lg:text-5xl">
          {title}
        </h2>
        <p data-site-page="home" data-site-block="reviews" data-site-field="body" data-site-kind="text" className="mx-auto mb-10 max-w-3xl text-balance text-base leading-relaxed text-gray-500 md:text-lg">
          {body}
        </p>

        <div className="mb-12">
          <Button asChild className="rounded-xl bg-[#0f766e] px-12 py-7 text-lg font-bold text-white shadow-lg shadow-teal-100 transition-all hover:scale-105 hover:bg-[#0d9488]">
            <Link to={ctaHref} data-site-page="home" data-site-block="reviews" data-site-field="cta" data-site-kind="text">{cta} &rarr;</Link>
          </Button>
        </div>

        <div
          className="relative"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          onTouchStart={() => setPaused(true)}
          onTouchEnd={() => setPaused(false)}
        >
          <div
            ref={scroller}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Client reviews"
          >
            {reviews.map((review, index) => (
              <ReviewCard key={review.id} review={review} color={AVATAR_COLORS[index % AVATAR_COLORS.length]} />
            ))}
          </div>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button type="button" aria-label="Previous reviews" onClick={() => nudge(-1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-400 transition hover:border-black hover:text-black">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button type="button" aria-label="Next reviews" onClick={() => nudge(1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-400 transition hover:border-black hover:text-black">
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReviewCard({ review, color }: { review: ClientReview & { id: string }; color: string }) {
  const googleSourced = review.role === "Google review";
  return (
    <article
      data-review-card
      className="flex w-full shrink-0 snap-start flex-col rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.75rem)]"
    >
      <div className="mb-3 flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        >
          {reviewMonogram(review.initials)}
        </div>
        <div className="min-w-0">
          <h3
            data-site-page="home"
            data-site-block="reviews"
            data-site-item={review.id}
            data-site-field="initials"
            data-site-kind="text"
            className="font-bold text-black"
          >
            {review.initials}
          </h3>
          {googleSourced ? (
            <p
              data-site-page="home"
              data-site-block="reviews"
              data-site-item={review.id}
              data-site-field="role"
              data-site-kind="text"
              className="text-xs text-gray-500"
            >
              {review.role}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mb-3 flex gap-0.5" aria-label="5 stars">
        {Array.from({ length: 5 }, (_, index) => (
          <Star key={index} className="h-4 w-4 fill-[#fbbc04] text-[#fbbc04]" />
        ))}
      </div>
      <p
        data-site-page="home"
        data-site-block="reviews"
        data-site-item={review.id}
        data-site-field="quote"
        data-site-kind="text"
        className="text-sm leading-relaxed text-gray-700"
      >
        {review.quote}
      </p>
    </article>
  );
}
