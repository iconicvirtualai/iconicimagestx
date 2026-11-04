import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { itemText, useSiteItems } from "@/content/siteContent";

const FALLBACK_AUDIENCES = [
  {
    id: "realtors",
    title: "Realtors & Brokers",
    description: "Your listings deserve more than a photo dump. We help you show the house, the story, and the reason someone should call.",
    image: "/media/photos/lifestyle-kennedy-mtz01127.jpg",
    badge: "",
    cta: "",
    href: "",
  },
  {
    id: "developers",
    title: "Developers & Builders",
    description: "From the dirt lot to the model home, we help you show what you are building before a buyer ever walks the site.",
    image: "/media/photos/forest-heights-twilight-front.jpg",
    badge: "",
    cta: "",
    href: "",
  },
  {
    id: "business",
    title: "Small Business Owners",
    description: "You know your customers. We help you look like the business they already trust, online and in person.",
    image: "/media/photos/lifestyle-daughtery-mtz00636.jpg",
    badge: "",
    cta: "",
    href: "",
  },
  {
    id: "online",
    title: "Online Appearance",
    description: "Personal brands, headshots, and an on-camera presence. For the days you need to be seen, and seen well.",
    image: "/media/photos/headshot-gracepoint-1.jpg",
    badge: "",
    cta: "",
    href: "",
  },
  {
    id: "partners",
    title: "Photographers & Real Estate Media Companies",
    description: "If you already shoot for a living, come work on our platform. Bring your clients. We will help you deliver the rest.",
    image: "/media/photos/drone-hero.jpg",
    badge: "Partners",
    cta: "Learn more",
    href: "/partners",
  },
];

export default function AudienceDetails() {
  const items = useSiteItems("home", "audienceDetails");
  const audiences = items
    ? items.map((item) => ({
      id: item.id,
      title: itemText(item, "title"),
      description: itemText(item, "body"),
      image: itemText(item, "image"),
      badge: itemText(item, "badge"),
      cta: itemText(item, "cta"),
      href: itemText(item, "href"),
    }))
    : FALLBACK_AUDIENCES;

  return (
    <section className="bg-white pb-20 md:pb-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-6">
          {audiences.map((audience, index) => (
            <article
              key={audience.id}
              className={`group flex flex-col overflow-hidden rounded-[1.5rem] border border-gray-100 bg-white shadow-sm lg:col-span-2 ${
                audiences.length === 5 && index === 3 ? "lg:col-start-2" : ""
              }`}
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-teal-50">
                <img
                  src={audience.image}
                  alt=""
                  data-site-page="home"
                  data-site-block="audienceDetails"
                  data-site-item={audience.id}
                  data-site-field="image"
                  data-site-kind="image"
                  className="h-full w-full object-cover transition duration-500 motion-safe:group-hover:scale-105"
                />
                {audience.badge ? (
                  <span
                    data-site-page="home"
                    data-site-block="audienceDetails"
                    data-site-item={audience.id}
                    data-site-field="badge"
                    data-site-kind="text"
                    className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[#14b8a6] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-md"
                  >
                    <Star className="h-3 w-3 fill-white" aria-hidden="true" />
                    {audience.badge}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-1 flex-col p-5 text-left">
                <h3 data-site-page="home" data-site-block="audienceDetails" data-site-item={audience.id} data-site-field="title" data-site-kind="text" className="text-balance text-lg font-bold leading-snug text-black">
                  {audience.title}
                </h3>
                <p data-site-page="home" data-site-block="audienceDetails" data-site-item={audience.id} data-site-field="body" data-site-kind="text" className="mt-2 flex-1 text-[13px] leading-relaxed text-gray-500">
                  {audience.description}
                </p>
                {audience.cta && audience.href ? (
                  <Link
                    to={audience.href}
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#0f766e] px-4 text-sm font-bold text-white transition hover:bg-[#14b8a6]"
                  >
                    <span data-site-page="home" data-site-block="audienceDetails" data-site-item={audience.id} data-site-field="cta" data-site-kind="text">{audience.cta}</span>
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
